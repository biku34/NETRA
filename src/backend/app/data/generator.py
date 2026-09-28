"""FR-1 / DR-3 — Synthetic crime-data generator.

Produces ~6 months of realistic, seeded incidents whose baked-in patterns the
intelligence engine must later rediscover:

  1. Spatial base intensity from Gaussian attractor centres
  2. Per-crime-type hour-of-day curves
  3. Day-of-week weekend uplift
  4. A festival window with global property-crime uplift
  5. One-off localized single-day event spikes
  6. Near-repeat injection (space-time contagion after property crime)
  7. Poisson count sampling for realism

Outputs: data/incidents.parquet, loads into SQLite, and writes
data/generation_manifest.json recording the injected ground truth so the demo
can show that Bob rediscovered it.

Run directly:  python -m app.data.generator
"""
from __future__ import annotations

import json
import uuid
from dataclasses import asdict
from datetime import datetime, timedelta

import numpy as np
import pandas as pd

from app.config import (
    CRIME_PROFILES,
    CRIME_TYPES,
    INCIDENTS_PARQUET,
    MANIFEST_JSON,
    PROPERTY_TYPES,
    Attractor,
    GeneratorScenario,
    get_scenario,
    get_settings,
)
from app.core import h3_utils

IST = "Asia/Kolkata"


# ---------------------------------------------------------------------------
# Spatial base intensity
# ---------------------------------------------------------------------------
def _base_intensity(cells: list[str], attractors: list[Attractor], noise: float,
                    rng: np.random.Generator) -> dict[str, float]:
    """Per-hex base rate = sum of attractor Gaussians + uniform noise."""
    intensity: dict[str, float] = {}
    for cell in cells:
        clat, clng = h3_utils.cell_centroid_cached(cell)
        val = noise
        for a in attractors:
            d = h3_utils.haversine_m(clat, clng, a.lat, a.lng)
            val += a.amplitude * np.exp(-(d ** 2) / (2 * a.sigma_m ** 2))
        # small per-hex jitter so identical-distance hexes differ slightly
        val *= 1.0 + 0.05 * rng.standard_normal()
        intensity[cell] = max(val, 0.0)
    return intensity


def _event_hexes(scenario: GeneratorScenario, cells: list[str]) -> dict[str, list[str]]:
    """Map each localized event to the hexes within its radius."""
    out: dict[str, list[str]] = {}
    for ev in scenario.events:
        hit = [
            c for c in cells
            if h3_utils.haversine_m(*h3_utils.cell_centroid_cached(c), ev.lat, ev.lng)
            <= scenario.event_radius_m
        ]
        if not hit:  # ensure at least the containing hex
            hit = [h3_utils.latlng_to_cell(ev.lat, ev.lng, get_settings().h3_res)]
        out[ev.date] = list(set(out.get(ev.date, [])) | set(hit))
    return out


# ---------------------------------------------------------------------------
# Core generation
# ---------------------------------------------------------------------------
def _sample_incident(cell: str, ctype: str, day: datetime, rng: np.random.Generator,
                     source_tag: str = "synthetic") -> dict:
    prof = CRIME_PROFILES[ctype]
    hour = int(rng.choice(24, p=prof.hour_curve))
    minute = int(rng.integers(0, 60))
    ts = day.replace(hour=hour, minute=minute, second=0, microsecond=0)
    clat, clng = h3_utils.cell_centroid_cached(cell)
    # jitter within the hex (~150 m) so points don't stack on the centroid
    jlat = clat + rng.normal(0, 0.0012)
    jlng = clng + rng.normal(0, 0.0012)
    return {
        # incident_id assigned deterministically after sorting (CR-5)
        "timestamp": ts,
        "latitude": round(jlat, 6),
        "longitude": round(jlng, 6),
        "h3_r8": cell,
        "crime_type": ctype,
        "severity": prof.severity,
        "reported_via": rng.choice(["helpline", "walk_in", "patrol", "online"]),
        "location_name": None,
        "source": source_tag,
        "confidence": 1.0,
        "_near_repeat": source_tag == "synthetic_nr",
    }


def generate() -> pd.DataFrame:
    settings = get_settings()
    scenario = get_scenario()
    rng = np.random.default_rng(settings.random_seed)

    cells = h3_utils.cells_in_bbox(settings.bbox, settings.h3_res)
    if not cells:
        raise RuntimeError("No H3 cells produced for the configured bbox.")

    base = _base_intensity(cells, scenario.attractors, scenario.background_noise, rng)
    # Keep only hexes with meaningful intensity (rural gap stays empty).
    cells = [c for c in cells if base[c] >= scenario.min_intensity]
    if not cells:
        raise RuntimeError("min_intensity too high — no active hexes.")
    base = {c: base[c] for c in cells}
    total_base = sum(base.values())

    # scale so expected incidents/day ≈ scenario.daily_incident_target
    type_weight_sum = sum(CRIME_PROFILES[t].base_weight for t in CRIME_TYPES)
    global_scale = scenario.daily_incident_target / (total_base * type_weight_sum)

    start = datetime.fromisoformat(settings.gen_start)
    end = datetime.fromisoformat(settings.gen_end)
    fest_start = datetime.fromisoformat(scenario.festival_start)
    fest_end = datetime.fromisoformat(scenario.festival_end)
    event_hexes = _event_hexes(scenario, cells)

    rows: list[dict] = []
    day = start
    while day <= end:
        dow = day.weekday()                     # 0=Mon .. 6=Sun
        is_weekend = dow in (4, 5)              # Fri/Sat uplift per SRS
        in_festival = fest_start <= day <= fest_end
        day_key = day.date().isoformat()
        ev_cells = set(event_hexes.get(day_key, []))

        for cell in cells:
            for ctype in CRIME_TYPES:
                prof = CRIME_PROFILES[ctype]
                rate = base[cell] * prof.base_weight * global_scale
                if is_weekend:
                    rate *= prof.weekend_uplift
                if in_festival and ctype in PROPERTY_TYPES:
                    rate *= scenario.festival_uplift
                if cell in ev_cells:
                    # find the event multiplier for this date/cell
                    for ev in scenario.events:
                        if ev.date == day_key:
                            rate *= ev.multiplier
                            break
                n = rng.poisson(rate)
                for _ in range(int(n)):
                    rows.append(_sample_incident(cell, ctype, day, rng))
        day += timedelta(days=1)

    # ---- Near-repeat injection (post-pass over property incidents) ----
    nr_count = 0
    property_rows = [r for r in rows if r["crime_type"] in PROPERTY_TYPES]
    for r in property_rows:
        prof = CRIME_PROFILES[r["crime_type"]]
        if rng.random() < scenario.p_near_repeat * prof.near_repeat_strength * 1.3:
            k_followups = int(rng.integers(
                scenario.near_repeat_min_followups,
                scenario.near_repeat_max_followups + 1))
            neighbourhood = h3_utils.k_ring(r["h3_r8"], 1)
            for _ in range(k_followups):
                delay = int(rng.integers(scenario.near_repeat_min_days,
                                         scenario.near_repeat_max_days + 1))
                target_cell = str(rng.choice(neighbourhood))
                nr_day = r["timestamp"] + timedelta(days=delay)
                if nr_day > end:
                    continue
                nr = _sample_incident(target_cell, r["crime_type"], nr_day, rng,
                                      source_tag="synthetic_nr")
                rows.append(nr)
                nr_count += 1

    df = pd.DataFrame(rows)
    # normalise source tags: near-repeat rows are still "synthetic" for the API,
    # but we keep a boolean column so tests/manifest can verify the chains.
    df["source"] = "synthetic"
    # Deterministic ordering + ids so the same seed yields byte-identical data
    # (CR-5). uuid4 would break this, so ids are derived from seed + position.
    df = df.sort_values(
        ["timestamp", "h3_r8", "crime_type", "latitude", "longitude"],
        kind="mergesort",
    ).reset_index(drop=True)
    ns = uuid.uuid5(uuid.NAMESPACE_URL, f"bob-incidents-seed-{settings.random_seed}")
    df["incident_id"] = [str(uuid.uuid5(ns, str(i))) for i in range(len(df))]

    # ---- manifest (ground truth for the demo / tests) ----
    manifest = {
        "seed": settings.random_seed,
        "generated_at": datetime.now().isoformat(),
        "bbox": settings.bbox_dict,
        "h3_res": settings.h3_res,
        "date_range": {"start": settings.gen_start, "end": settings.gen_end},
        "populated_hexes": int(df["h3_r8"].nunique()),
        "total_incidents": int(len(df)),
        "attractors": [asdict(a) for a in scenario.attractors],
        "festival": {
            "name": scenario.festival_name,
            "start": scenario.festival_start,
            "end": scenario.festival_end,
            "uplift": scenario.festival_uplift,
        },
        "events": [asdict(e) for e in scenario.events],
        "event_hexes": {k: sorted(v) for k, v in event_hexes.items()},
        "near_repeat": {
            "injected_followups": int(nr_count),
            "p_near_repeat": scenario.p_near_repeat,
        },
        "crime_type_counts": df["crime_type"].value_counts().to_dict(),
        "incidents_per_week_mean": round(
            len(df) / max(1, ((end - start).days / 7)), 1),
    }

    INCIDENTS_PARQUET.parent.mkdir(exist_ok=True)
    df.drop(columns=["_near_repeat"]).to_parquet(INCIDENTS_PARQUET, index=False)
    # keep the near-repeat flag in a sidecar for tests/demos
    df[["incident_id", "_near_repeat"]].to_parquet(
        INCIDENTS_PARQUET.with_name("near_repeat_flags.parquet"), index=False)
    MANIFEST_JSON.write_text(json.dumps(manifest, indent=2, default=str))

    return df.drop(columns=["_near_repeat"])


def main() -> None:
    df = generate()
    # load into SQLite via the loader (FR-2 normalisation path)
    from app.data.loader import load_dataframe

    n = load_dataframe(df)
    print(f"[generator] wrote {len(df)} incidents -> {INCIDENTS_PARQUET}")
    print(f"[generator] loaded {n} rows into SQLite")
    print(f"[generator] manifest -> {MANIFEST_JSON}")


if __name__ == "__main__":
    main()
