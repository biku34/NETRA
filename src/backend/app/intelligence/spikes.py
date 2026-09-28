"""FR-7 — Spike / anomaly detection.

Flags hexes where the recent week deviates from the seasonal baseline, and
labels each spike as ``seasonal`` (festival-linked), ``event_linked``, or
``emerging``.

Baseline: per-hex weekly counts over history (excluding the most recent week).
``z = (recent_count - baseline_mean) / baseline_std``; flag when ``z >
z_threshold`` (default 2.0).
"""
from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd

from app.config import get_settings
from app.core import temporal
from app.news import live_calendar


def detect_spikes(df: pd.DataFrame, ref: date | None = None,
                  z_threshold: float | None = None) -> list[dict]:
    if "_ts_local" not in df.columns:
        df = temporal.add_time_features(df)
    if ref is None:
        ref = df["_ts_local"].dt.date.max()
    if z_threshold is None:
        z_threshold = get_settings().z_spike_threshold

    d = df["_ts_local"].dt.date
    first = d.min()
    starts = temporal.week_starts(first, ref)
    if len(starts) < 3:
        return []

    # weekly count matrix: hex x week_start
    cells = sorted(df["h3_r8"].unique().tolist())
    weekly: dict[str, list[int]] = {c: [] for c in cells}
    for ws in starts:
        we = ws + timedelta(days=6)
        wk = df[(d >= ws) & (d <= we)].groupby("h3_r8").size()
        for c in cells:
            weekly[c].append(int(wk.get(c, 0)))

    recent_ws, recent_we = starts[-1], starts[-1] + timedelta(days=6)
    # festival/event labels from independent live sources (not generator config)
    fest_name = live_calendar.festival_in_window(recent_ws, recent_we)
    event_hexes = live_calendar.event_hexes()

    spikes = []
    for c in cells:
        series = np.array(weekly[c], dtype=float)
        recent = series[-1]
        baseline = series[:-1]
        if baseline.sum() == 0 and recent < 2:
            continue
        mean = float(baseline.mean())
        std = float(baseline.std(ddof=0))
        std_eff = std if std > 1e-6 else max(1.0, mean * 0.5)
        z = (recent - mean) / std_eff
        if z <= z_threshold or recent < 2:
            continue

        # dominant crime type in the recent week for this hex
        recent_rows = df[(d >= recent_ws) & (d <= recent_we) & (df["h3_r8"] == c)]
        ctype = (recent_rows["crime_type"].mode().iloc[0]
                 if not recent_rows.empty else "unknown")

        # label
        label, reason = "emerging", None
        if fest_name:
            label = "seasonal"
            reason = f"{fest_name} window"
        elif c in event_hexes:
            label, reason = "event_linked", "localized event"

        spikes.append({
            "h3_r8": c,
            "crime_type": ctype,
            "z": round(float(z), 2),
            "baseline": round(mean, 2),
            "recent": int(recent),
            "predicted": int(recent),
            "label": label,
            "linked_reason": reason,
        })

    spikes.sort(key=lambda s: s["z"], reverse=True)
    return spikes
