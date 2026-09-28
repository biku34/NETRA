"""Event / intel calendar (FR-8, DR-5).

Festivals, events and advisories for the district with date ranges and
coordinates, read from data/csv/news_events.csv (rows whose type is not
"news"). It feeds the `news_uplift` signal independently of GDELT, so the
augmentation layer works fully offline (graceful degradation, CR-6).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from app.data import csv_store


@dataclass(frozen=True)
class CalendarEvent:
    name: str
    lat: float
    lng: float
    start: str          # ISO date
    end: str            # ISO date (inclusive)
    weight: float       # base relevance contributed to news_uplift
    kind: str           # "festival" | "event" | "advisory"
    location: str = ""  # locality name


def load_calendar() -> list[CalendarEvent]:
    df = csv_store.news_events()
    if df.empty:
        return []
    df = df[df["type"] != "news"]
    return [
        CalendarEvent(str(r.title), float(r.latitude), float(r.longitude),
                      str(r.start_date), str(r.end_date), float(r.weight), str(r.type),
                      str(r.location))
        for r in df.itertuples(index=False)
    ]


def active_events(ref: date, horizon_days: int = 7) -> list[CalendarEvent]:
    """Events overlapping the window [ref+1, ref+horizon]."""
    start, end = ref + timedelta(days=1), ref + timedelta(days=horizon_days)
    out = []
    for e in load_calendar():
        es, ee = date.fromisoformat(e.start), date.fromisoformat(e.end)
        if es <= end and start <= ee:
            out.append(e)
    return out
