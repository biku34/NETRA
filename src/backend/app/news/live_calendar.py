"""Live festivals + events from free, open sources (no API keys).

* Festivals — India public-holiday / festival dates from Google's open iCal feed
  (real, independent of our data generator; this is what breaks the circular
  "the model reads the generator's own festival config" validation).
* Events — current Gandhinagar events (mela, rally, fair, summit, expo, garba)
  from Google News RSS, geolocated to hexes via the locality gazetteer.

Both are cached in-process and degrade to empty on any failure (CR-6). These are
the ONLY source of the festival/event signals the model uses — the generator's
scenario is no longer consulted for scoring.
"""
from __future__ import annotations

import logging
import re
import threading
import time
import xml.etree.ElementTree as ET
from datetime import date, datetime, timezone
from email.utils import parsedate_to_datetime

import httpx

from app.config import get_settings
from app.core import h3_utils
from app.news import geocode

log = logging.getLogger("bob.livecal")

# Google's public Indian-holidays iCal feed (festivals + national/religious days).
FESTIVAL_ICS = (
    "https://calendar.google.com/calendar/ical/"
    "en.indian%23holiday%40group.v.calendar.google.com/public/basic.ics"
)
EVENTS_RSS = "https://news.google.com/rss/search"
EVENT_QUERY = (
    "Gandhinagar (mela OR garba OR rally OR fair OR expo OR summit OR festival "
    "OR carnival OR procession OR convention)"
)
_HEADERS = {"User-Agent": "Mozilla/5.0 (bob-crime-assistant)"}

_FEST: dict = {"at": 0.0, "days": {}}
_EVENTS: dict = {"at": 0.0, "items": []}
_FEST_TTL = 6 * 3600
_EVENT_TTL = 900
_LOCK = threading.Lock()


# --------------------------------------------------------------- festivals
def _fetch_festivals() -> dict[date, str]:
    r = httpx.get(FESTIVAL_ICS, headers=_HEADERS, timeout=httpx.Timeout(12.0, connect=5.0),
                  follow_redirects=True)
    r.raise_for_status()
    out: dict[date, str] = {}
    for ev in re.findall(r"BEGIN:VEVENT.*?END:VEVENT", r.text, re.S):
        d = re.search(r"DTSTART[^:]*:(\d{8})", ev)
        s = re.search(r"SUMMARY:(.+)", ev)
        if d and s:
            g = d.group(1)
            try:
                out[date(int(g[:4]), int(g[4:6]), int(g[6:8]))] = s.group(1).strip()
            except ValueError:
                continue
    return out


def festival_days() -> dict[date, str]:
    """{date: festival name} for all known festivals/holidays, cached."""
    now = time.time()
    with _LOCK:
        if now - _FEST["at"] < _FEST_TTL and _FEST["days"]:
            return _FEST["days"]
    try:
        days = _fetch_festivals()
    except Exception as e:
        log.warning("festival calendar fetch failed: %s", e)
        return _FEST["days"]  # last good (may be empty)
    with _LOCK:
        _FEST.update(at=now, days=days)
    log.info("festival calendar: %d dated festivals", len(days))
    return days


def festival_in_window(start: date, end: date, pad_days: int = 1) -> str | None:
    """Name of a festival whose date falls in [start-pad, end+pad], else None.

    The crowd/empty-home effect of a festival spans a few days, so we pad.
    """
    from datetime import timedelta

    days = festival_days()
    lo, hi = start - timedelta(days=pad_days), end + timedelta(days=pad_days)
    for d, name in days.items():
        if lo <= d <= hi:
            return name
    return None


# ------------------------------------------------------------------ events
def _parse_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        dt = parsedate_to_datetime(s)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _fetch_events(days: int, limit: int) -> list[dict]:
    settings = get_settings()
    minlat, minlng, maxlat, maxlng = settings.bbox
    params = {"q": f"{EVENT_QUERY} when:{days}d", "hl": "en-IN", "gl": "IN",
              "ceid": "IN:en"}
    r = httpx.get(EVENTS_RSS, params=params, headers=_HEADERS,
                  timeout=httpx.Timeout(8.0, connect=5.0))
    r.raise_for_status()
    root = ET.fromstring(r.content)
    out: list[dict] = []
    for item in root.findall(".//item"):
        title = (item.findtext("title") or "").strip()
        if " - " in title:
            title = title.rsplit(" - ", 1)[0]
        loc = geocode.locate_from_text(title)
        if not loc:
            continue
        lat, lng, matched = loc
        if not (minlat <= lat <= maxlat and minlng <= lng <= maxlng):
            continue
        pub = _parse_dt(item.findtext("pubDate"))
        out.append({
            "type": "event",
            "title": title,
            "url": (item.findtext("link") or "").strip() or None,
            "domain": "news",
            "date": (pub or datetime.now(timezone.utc)).isoformat(),
            "location": matched,
            "lat": lat, "lng": lng,
            "h3_r8": h3_utils.latlng_to_cell(lat, lng, settings.h3_res),
        })
        if len(out) >= limit:
            break
    return out


def live_events(days: int = 21, limit: int = 15) -> list[dict]:
    """Current geolocated Gandhinagar events, cached ~15 min, [] on failure."""
    now = time.time()
    with _LOCK:
        if now - _EVENTS["at"] < _EVENT_TTL and _EVENTS["items"]:
            return _EVENTS["items"]
    try:
        items = _fetch_events(days, limit)
    except Exception as e:
        log.warning("live events fetch failed: %s", e)
        return []
    with _LOCK:
        _EVENTS.update(at=now, items=items)
    log.info("live events: %d in-district", len(items))
    return items


def event_hexes() -> set[str]:
    """Hexes with a current live event (used for the coming-week event_flag)."""
    return {e["h3_r8"] for e in live_events() if e.get("h3_r8")}
