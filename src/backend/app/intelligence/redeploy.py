"""FR-9 — Patrol redeployment logic (structured, deterministic).

Turns risk into a concrete allocation suggestion *before* Bob narrates it, so the
numbers are deterministic (not hallucinated). Allocates the station's patrol
units across the top-N zones proportional to predicted risk, targets each zone's
peak hours, and reports the delta vs the current allocation.

Acceptance (FR-9): suggested totals never exceed available units; higher-risk
zones receive >= the units of lower-risk zones.
"""
from __future__ import annotations

import json
from datetime import date

import pandas as pd

from app.config import PATROL_CONFIG_JSON
from app.core import temporal


def _load_patrol_config() -> dict:
    try:
        return json.loads(PATROL_CONFIG_JSON.read_text(encoding="utf-8"))
    except Exception:
        return {"total_units": 12, "current_assignments": [], "shift_structure": []}


def _largest_remainder(weights: list[float], total: int) -> list[int]:
    """Apportion `total` integer units across weights (Hamilton method)."""
    s = sum(weights)
    if s <= 0:
        base = [total // len(weights)] * len(weights) if weights else []
        for i in range(total - sum(base)):
            base[i % len(base)] += 1
        return base
    raw = [w / s * total for w in weights]
    floors = [int(x) for x in raw]
    rem = total - sum(floors)
    # hand out the remaining units to the largest fractional parts
    order = sorted(range(len(weights)), key=lambda i: raw[i] - floors[i], reverse=True)
    for i in range(rem):
        floors[order[i]] += 1
    return floors


def default_total_units() -> int:
    return int(_load_patrol_config().get("total_units", 12))


def compute_redeployment(zones: list[dict], df: pd.DataFrame,
                         ref: date | None = None,
                         total_units: int | None = None,
                         pinned: dict[str, int] | None = None) -> list[dict]:
    """Return per-zone allocation deltas for the top-N zones (already ranked).

    `total_units` overrides the station's configured strength; `pinned` fixes
    the units of specific zones ({h3: units}) and the rest is shared out among
    the remaining zones by risk.
    """
    cfg = _load_patrol_config()
    if total_units is None:
        total_units = int(cfg.get("total_units", 12))
    current_by_name = {a["zone_name"]: int(a["units"])
                       for a in cfg.get("current_assignments", [])}

    ranked = [z for z in zones if z.get("rank") is not None]
    ranked.sort(key=lambda z: z["rank"])
    if not ranked:
        return []

    # pinned zones keep their units (capped so the total is never exceeded)
    pins: dict[str, int] = {}
    left = total_units
    for z in ranked:
        if pinned and z["h3_r8"] in pinned:
            pins[z["h3_r8"]] = max(0, min(int(pinned[z["h3_r8"]]), left))
            left -= pins[z["h3_r8"]]

    # the rest is allocated proportional to risk_score; handing the largest
    # shares to the highest ranks keeps it monotonic without dropping units
    free = [z for z in ranked if z["h3_r8"] not in pins]
    weights = [max(z["risk_score"], 0.01) for z in free]
    shares = sorted(_largest_remainder(weights, left), reverse=True) if free else []
    by_h3 = {**pins, **{z["h3_r8"]: u for z, u in zip(free, shares)}}
    suggested = [by_h3[z["h3_r8"]] for z in ranked]

    out = []
    for z, units in zip(ranked, suggested):
        hist = temporal.hour_histogram(df, z["h3_r8"]) if not df.empty else [0] * 24
        peak = temporal.peak_hour_window(hist)
        name = z.get("name") or z["h3_r8"][:10]
        current = current_by_name.get(name, 0)
        drivers = [d["label"] for d in z.get("drivers", [])[:2]]
        out.append({
            "zone": name,
            "h3_r8": z["h3_r8"],
            "rank": z["rank"],
            "probability": z["probability"],
            "current_units": current,
            "suggested_units": int(units),
            "delta": int(units) - current,
            "peak_window": list(peak),
            "rationale_signals": drivers,
            "pinned": z["h3_r8"] in pins,
        })
    return out
