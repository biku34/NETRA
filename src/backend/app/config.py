"""Central configuration: settings, seeds, thresholds, bbox, and the
crime-type + generator profiles.

Everything the synthetic generator injects (attractors, hour curves, festival
window, near-repeat strength) lives here so it is reproducible (CR-5) and so
the intelligence engine can be validated against a single source of truth.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BACKEND_DIR = Path(__file__).resolve().parents[1]          # backend/
PROJECT_ROOT = BACKEND_DIR.parent                          # repo root
DATA_DIR = PROJECT_ROOT / "data"
DATA_DIR.mkdir(exist_ok=True)

INCIDENTS_PARQUET = DATA_DIR / "incidents.parquet"
MANIFEST_JSON = DATA_DIR / "generation_manifest.json"
PATROL_CONFIG_JSON = DATA_DIR / "patrol_config.json"
DB_PATH = DATA_DIR / "bob.db"

# Static CSV dataset — the single source of truth the API serves from. Built
# once by `python -m app.data.build_dataset`; runtime only reads these files.
CSV_DIR = DATA_DIR / "csv"
INCIDENTS_CSV = CSV_DIR / "incidents.csv"
NEWS_EVENTS_CSV = CSV_DIR / "news_events.csv"
FIELD_ALERTS_CSV = CSV_DIR / "field_alerts.csv"

load_dotenv(BACKEND_DIR / ".env")


# ---------------------------------------------------------------------------
# Runtime settings (env-overridable)
# ---------------------------------------------------------------------------
def _bbox_from_env() -> tuple[float, float, float, float]:
    # Default: Gandhinagar district (Gujarat).
    raw = os.getenv("DISTRICT_BBOX", "23.14,72.58,23.28,72.72")
    parts = [float(x) for x in raw.split(",")]
    if len(parts) != 4:
        raise ValueError(f"DISTRICT_BBOX must be minlat,minlng,maxlat,maxlng; got {raw!r}")
    return tuple(parts)  # type: ignore[return-value]


@dataclass(frozen=True)
class Settings:
    # geo
    bbox: tuple[float, float, float, float] = field(default_factory=_bbox_from_env)
    h3_res: int = int(os.getenv("H3_RES", "8"))
    # reproducibility
    random_seed: int = int(os.getenv("RANDOM_SEED", "42"))
    # generation window (~6 months ending "recently")
    gen_start: str = os.getenv("GEN_START", "2026-03-16")   # inclusive
    gen_end: str = os.getenv("GEN_END", "2026-09-20")        # inclusive
    # intelligence thresholds
    z_spike_threshold: float = float(os.getenv("Z_SPIKE_THRESHOLD", "2.0"))
    # augmentation toggles (off in core-only mode)
    gdelt_enabled: bool = os.getenv("GDELT_ENABLED", "false").lower() == "true"
    anthropic_api_key: str = os.getenv("ANTHROPIC_API_KEY", "")
    # zone chatbot (Groq, OpenAI-compatible). Key stays server-side.
    groq_api_key: str = os.getenv("GROQ_API_KEY", "").strip()
    groq_model: str = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
    groq_guard_model: str = os.getenv("GROQ_GUARD_MODEL", "meta-llama/llama-prompt-guard-2-86m")
    # email alerts (Resend). Key stays server-side; add RESEND_API_KEY later.
    resend_api_key: str = os.getenv("RESEND_API_KEY", "").strip()
    resend_from: str = os.getenv(
        "RESEND_FROM", "Netra Crime Intelligence <onboarding@resend.dev>")
    email_default_to: str = os.getenv("EMAIL_DEFAULT_TO", "").strip()
    # server
    frontend_origin: str = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")

    @property
    def bbox_dict(self) -> dict[str, float]:
        minlat, minlng, maxlat, maxlng = self.bbox
        return {"minlat": minlat, "minlng": minlng, "maxlat": maxlat, "maxlng": maxlng}

    @property
    def center(self) -> tuple[float, float]:
        minlat, minlng, maxlat, maxlng = self.bbox
        return ((minlat + maxlat) / 2, (minlng + maxlng) / 2)

    @property
    def llm_available(self) -> bool:
        return bool(self.anthropic_api_key)

    @property
    def email_available(self) -> bool:
        return bool(self.resend_api_key)



@lru_cache
def get_settings() -> Settings:
    return Settings()


# ---------------------------------------------------------------------------
# Crime-type taxonomy + profiles (DR-2 / DR-3)
# ---------------------------------------------------------------------------
# Hour curves are 24-length relative weights (peak hours weighted higher).
# They are the ground truth the temporal / prediction layers must rediscover.

def _curve(peaks: list[int], spread: float = 2.5, floor: float = 0.15) -> list[float]:
    """Build a 24-length hour-of-day weight curve peaking at the given hours."""
    import math

    w = [floor] * 24
    for h in range(24):
        val = floor
        for p in peaks:
            # circular distance on a 24h clock
            d = min(abs(h - p), 24 - abs(h - p))
            val += math.exp(-(d ** 2) / (2 * spread ** 2))
        w[h] = val
    s = sum(w)
    return [x / s for x in w]


@dataclass(frozen=True)
class CrimeProfile:
    name: str
    base_weight: float          # relative frequency
    severity: int               # 1-5
    hour_curve: list[float]     # len 24, sums to 1
    weekend_uplift: float       # multiplier on Fri/Sat
    near_repeat_strength: float # 0-1; probability weight for near-repeat chains


CRIME_PROFILES: dict[str, CrimeProfile] = {
    "theft":           CrimeProfile("theft",           1.00, 2, _curve([13, 19]),     1.15, 0.55),
    "burglary":        CrimeProfile("burglary",        0.55, 3, _curve([13]),         1.05, 0.65),
    "vehicle_theft":   CrimeProfile("vehicle_theft",   0.60, 3, _curve([2]),          1.20, 0.45),
    "chain_snatching": CrimeProfile("chain_snatching", 0.50, 3, _curve([20]),         1.25, 0.40),
    "robbery":         CrimeProfile("robbery",         0.30, 4, _curve([21]),         1.30, 0.35),
    "pickpocketing":   CrimeProfile("pickpocketing",   0.70, 1, _curve([13, 18]),     1.10, 0.30),
    "mobile_snatching":CrimeProfile("mobile_snatching",0.65, 2, _curve([20]),         1.25, 0.40),
    "assault":         CrimeProfile("assault",         0.45, 4, _curve([23]),         1.60, 0.20),
    "harassment":      CrimeProfile("harassment",      0.40, 3, _curve([19]),         1.35, 0.15),
    "vandalism":       CrimeProfile("vandalism",       0.35, 2, _curve([1]),          1.40, 0.20),
}

CRIME_TYPES: list[str] = list(CRIME_PROFILES.keys())
PROPERTY_TYPES: set[str] = {"theft", "burglary", "vehicle_theft", "chain_snatching",
                            "robbery", "pickpocketing", "mobile_snatching"}


# ---------------------------------------------------------------------------
# Generator scenario (attractors, festival, events, near-repeat) — DR-3
# ---------------------------------------------------------------------------
# Attractor centers are given as (name, lat, lng, amplitude, sigma_m). They are
# placed inside the default Delhi-ish bbox. If you change the bbox, re-center.

@dataclass(frozen=True)
class Attractor:
    name: str
    lat: float
    lng: float
    amplitude: float
    sigma_m: float          # spatial spread in metres


@dataclass(frozen=True)
class LocalizedEvent:
    name: str
    lat: float
    lng: float
    date: str               # ISO date, single-day spike
    multiplier: float       # applied to nearby hexes that day


@dataclass(frozen=True)
class GeneratorScenario:
    # global scaling: expected incidents per day across the whole district
    # (base; the near-repeat post-pass adds more). Two cities -> larger area.
    daily_incident_target: float = 6.5
    background_noise: float = 0.02          # uniform base intensity floor
    # Hexes below this base intensity generate no incidents — keeps the rural
    # gap between the two cities sparse and populated hexes ~ a couple hundred.
    min_intensity: float = 0.035
    # Attractor centres across Gandhinagar district.
    attractors: list[Attractor] = field(default_factory=lambda: [
        Attractor("Sector 21 Market",       23.2200, 72.6500, 1.00, 750),
        Attractor("Sector 16 Commercial",   23.2280, 72.6420, 0.80, 700),
        Attractor("Akshardham (Sector 20)", 23.2380, 72.6600, 0.85, 700),
        Attractor("Sector 7 Secretariat",   23.2120, 72.6320, 0.70, 700),
        Attractor("Infocity",               23.1880, 72.6290, 0.80, 750),
        Attractor("Kudasan",                23.1920, 72.6360, 0.70, 700),
        Attractor("GIFT City",              23.1645, 72.6820, 0.75, 700),
        Attractor("Sargasan Crossroads",    23.1700, 72.6300, 0.65, 650),
    ])
    # festival window: global property-crime uplift (Navratri — Gujarat's biggest,
    # crowds + empty homes). Straddles gen_end (2026-09-20) so it is both a
    # detectable historical spike and a live driver for the coming week.
    festival_name: str = "Navratri"
    festival_start: str = "2026-09-14"
    festival_end: str = "2026-09-24"
    festival_uplift: float = 1.8
    # one-off localized events (Gandhinagar venues)
    events: list[LocalizedEvent] = field(default_factory=lambda: [
        LocalizedEvent("GIFT City Tech Expo",     23.1645, 72.6820, "2026-08-15", 4.0),
        LocalizedEvent("Sector 21 Cultural Mela", 23.2200, 72.6500, "2026-07-19", 3.0),
    ])
    event_radius_m: float = 450.0
    # near-repeat injection
    p_near_repeat: float = 0.45             # per property incident
    near_repeat_min_followups: int = 1
    near_repeat_max_followups: int = 3
    near_repeat_min_days: int = 3
    near_repeat_max_days: int = 14


@lru_cache
def get_scenario() -> GeneratorScenario:
    return GeneratorScenario()
