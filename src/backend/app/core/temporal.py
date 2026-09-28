"""FR-3 — Temporal feature extraction.

Derives the time features every downstream module reuses: per-incident
(hour, dow, is_weekend, week_of_year, date) and per-hex rolling counts /
histograms computed *as of* a reference date (no look-ahead).

Weekend is defined as Fri/Sat (dow 4/5) to match the generator's injected
weekend-uplift pattern, so the model rediscovers the same signal.
"""
from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd

WEEKEND_DOW = (4, 5)  # Fri, Sat


def add_time_features(df: pd.DataFrame) -> pd.DataFrame:
    """Attach hour / dow / is_weekend / week_of_year / date columns."""
    out = df.copy()
    ts = pd.to_datetime(out["timestamp"])
    # drop tz for local-clock features (data is already IST)
    ts_local = ts.dt.tz_localize(None) if ts.dt.tz is not None else ts
    out["hour"] = ts_local.dt.hour
    out["dow"] = ts_local.dt.weekday
    out["is_weekend"] = out["dow"].isin(WEEKEND_DOW).astype(int)
    out["week_of_year"] = ts_local.dt.isocalendar().week.astype(int)
    out["date"] = ts_local.dt.date
    out["_ts_local"] = ts_local
    return out


def as_of(df: pd.DataFrame, ref: date) -> pd.DataFrame:
    """Rows with local date <= ref."""
    if "_ts_local" not in df.columns:
        df = add_time_features(df)
    return df[df["_ts_local"].dt.date <= ref]


def window_counts(df: pd.DataFrame, ref: date, days: int) -> pd.Series:
    """Per-hex incident count in (ref-days, ref]."""
    start = ref - timedelta(days=days)
    sub = df[(df["_ts_local"].dt.date > start) & (df["_ts_local"].dt.date <= ref)]
    return sub.groupby("h3_r8").size()


def hour_histogram(df: pd.DataFrame, cell: str) -> list[int]:
    sub = df[df["h3_r8"] == cell]
    hist = sub.groupby("hour").size().reindex(range(24), fill_value=0)
    return [int(x) for x in hist.values]


def dow_histogram(df: pd.DataFrame, cell: str) -> list[int]:
    sub = df[df["h3_r8"] == cell]
    hist = sub.groupby("dow").size().reindex(range(7), fill_value=0)
    return [int(x) for x in hist.values]


def peak_hour_window(hour_hist: list[int]) -> tuple[int, int]:
    """Return the (start, end) of the 4-hour window with the most incidents."""
    if not any(hour_hist):
        return (18, 22)
    best_start, best_sum = 0, -1
    for h in range(24):
        s = sum(hour_hist[(h + i) % 24] for i in range(4))
        if s > best_sum:
            best_sum, best_start = s, h
    return (best_start, (best_start + 4) % 24)


def weekend_share(dow_hist: list[int]) -> float:
    total = sum(dow_hist)
    if total == 0:
        return 0.0
    wk = sum(dow_hist[d] for d in WEEKEND_DOW)
    return wk / total


def week_starts(first: date, ref: date, step: int = 7) -> list[date]:
    """Aligned week-start dates from `first` up to (but not incl.) the week of ref."""
    starts: list[date] = []
    d = first
    while d + timedelta(days=step) <= ref + timedelta(days=1):
        starts.append(d)
        d += timedelta(days=step)
    return starts
