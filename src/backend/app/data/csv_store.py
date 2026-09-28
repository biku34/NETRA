"""Read-only access to the static CSV dataset (news/events + field alerts).

Frames are cached per file and re-read when the file's mtime changes, so
editing a CSV is picked up without restarting the server.
"""
from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd

from app.config import FIELD_ALERTS_CSV, INCIDENTS_CSV, NEWS_EVENTS_CSV

log = logging.getLogger("bob.csv_store")

_cache: dict[Path, tuple[float, pd.DataFrame]] = {}


def _read(path: Path, parse_dates: list[str]) -> pd.DataFrame:
    if not path.exists():
        log.warning("%s not found. Run `python -m app.data.build_dataset`.", path)
        return pd.DataFrame()
    mtime = path.stat().st_mtime
    hit = _cache.get(path)
    if hit and hit[0] == mtime:
        return hit[1]
    df = pd.read_csv(path, encoding="utf-8", keep_default_na=False)
    for col in parse_dates:
        df[col] = pd.to_datetime(df[col], errors="coerce")
    df = df.dropna(subset=parse_dates)
    _cache[path] = (mtime, df)
    return df


def incidents() -> pd.DataFrame:
    if not INCIDENTS_CSV.exists():
        raise FileNotFoundError(
            f"{INCIDENTS_CSV} not found. Run `python -m app.data.build_dataset` first.")
    return pd.read_csv(INCIDENTS_CSV, encoding="utf-8")


def news_events() -> pd.DataFrame:
    return _read(NEWS_EVENTS_CSV, ["published_at"])


def field_alerts() -> pd.DataFrame:
    return _read(FIELD_ALERTS_CSV, ["timestamp"])


def signature() -> tuple:
    """Changes whenever any CSV is edited — used to invalidate computed caches."""
    return tuple(
        p.stat().st_mtime if p.exists() else 0.0
        for p in (INCIDENTS_CSV, NEWS_EVENTS_CSV, FIELD_ALERTS_CSV)
    )
