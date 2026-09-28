"""FR-5 — Near-repeat signal.

Captures short-term space-time contagion: after a crime (esp. property crime),
the same and adjacent hexes face elevated short-term risk.

    near_repeat_signal(hex) = Σ over incidents in {hex ∪ kRing(hex,1)}
                              within last T days of  weight · exp(-δ · days_ago)

with T = 14 and δ tuned so a 14-day-old incident contributes ~0.1. Property
crime types are weighted higher.
"""
from __future__ import annotations

import math
from datetime import date, timedelta

import pandas as pd

from app.config import CRIME_PROFILES, PROPERTY_TYPES
from app.core import h3_utils

T_DAYS = 14
# exp(-δ·14) ≈ 0.1  ->  δ = ln(10)/14
DELTA = math.log(10) / T_DAYS


def _type_weight(ctype: str) -> float:
    base = 1.0 + (0.6 if ctype in PROPERTY_TYPES else 0.0)
    prof = CRIME_PROFILES.get(ctype)
    return base * (prof.near_repeat_strength + 0.5 if prof else 1.0)


def near_repeat_signals(
    df: pd.DataFrame, cells: list[str], ref: date, t_days: int = T_DAYS
) -> dict[str, float]:
    """Per-hex near-repeat scalar as of `ref` (uses only incidents <= ref)."""
    if "_ts_local" in df.columns:
        d = df["_ts_local"].dt.date
    else:
        d = pd.to_datetime(df["timestamp"]).dt.tz_localize(None).dt.date

    start = ref - timedelta(days=t_days)
    recent = df[(d > start) & (d <= ref)].copy()
    signals = {c: 0.0 for c in cells}
    if recent.empty:
        return signals

    recent = recent.assign(_date=d[recent.index])
    # Precompute each recent incident's decayed weight, then scatter to the
    # incident's own hex and its k-ring-1 neighbours. itertuples (not iterrows)
    # keeps this on the hot path fast.
    cell_set = set(cells)
    for origin, ctype, rdate in zip(recent["h3_r8"], recent["crime_type"], recent["_date"]):
        days_ago = (ref - rdate).days
        w = _type_weight(ctype) * math.exp(-DELTA * days_ago)
        for nb in h3_utils.k_ring(origin, 1):
            if nb in cell_set:
                # full weight at origin, slightly damped at neighbours
                signals[nb] += w if nb == origin else 0.6 * w
    return signals
