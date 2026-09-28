"""Live news feed for the district — Google News RSS (free, no API key).

Provides current, real-world Gandhinagar news for the "Latest news" panel. This
is display-only: it does NOT feed the model's `news_uplift` (which stays
deterministic on the static CSV dataset). Any failure degrades to [] and the CSV
feed takes over (graceful degradation, CR-6).

Results are cached in-process for a few minutes so the frontend's polling does
not hammer the RSS endpoint.
"""
from __future__ import annotations

import logging
import threading
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import httpx

log = logging.getLogger("bob.livefeed")

RSS_URL = "https://news.google.com/rss/search"
# District-focused, crime/safety-leaning query.
QUERY = (
    "Gandhinagar (police OR crime OR theft OR robbery OR snatching OR arrest "
    "OR accident OR safety OR patrol OR fraud)"
)
_HEADERS = {"User-Agent": "Mozilla/5.0 (bob-crime-assistant)"}

# Keep only headlines clearly about the district / its localities.
_FOCUS_TERMS = (
    "gandhinagar", "infocity", "kudasan", "sargasan", "raysan", "gift city",
    "adalaj", "pethapur", "akshardham", "sector 21", "sector 16", "pdeu",
)

_CACHE: dict = {"at": 0.0, "items": []}
_TTL_SECONDS = 300
_LOCK = threading.Lock()


def _parse_date(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        dt = parsedate_to_datetime(s)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _fetch(limit: int, days: int, timeout: float) -> list[dict]:
    params = {
        "q": f"{QUERY} when:{days}d",
        "hl": "en-IN",
        "gl": "IN",
        "ceid": "IN:en",
    }
    r = httpx.get(RSS_URL, params=params, headers=_HEADERS,
                  timeout=httpx.Timeout(timeout, connect=5.0))
    r.raise_for_status()
    root = ET.fromstring(r.content)

    out: list[dict] = []
    for item in root.findall(".//item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        pub = _parse_date(item.findtext("pubDate"))
        src = item.find("source")
        domain = (src.text.strip() if src is not None and src.text else "")
        if not domain and " - " in title:
            title, domain = title.rsplit(" - ", 1)
        if not title or not link:
            continue
        if not any(term in title.lower() for term in _FOCUS_TERMS):
            continue  # drop headlines not clearly about the district
        out.append({
            "type": "news",
            "title": title,
            "url": link,
            "domain": domain or "news",
            "date": (pub or datetime.now(timezone.utc)).isoformat(),
            "location": "Gandhinagar",
            "live": True,
        })
        if len(out) >= limit:
            break
    return out


def fetch_live_news(limit: int = 15, days: int = 14, timeout: float = 8.0) -> list[dict]:
    """Return recent Gandhinagar articles, cached ~5 min, or [] on any failure."""
    now = time.time()
    with _LOCK:
        if now - _CACHE["at"] < _TTL_SECONDS and _CACHE["items"]:
            return _CACHE["items"]
    try:
        items = _fetch(limit, days, timeout)
    except Exception as e:
        log.warning("Live news fetch failed (falling back to dataset): %s", e)
        return []
    with _LOCK:
        _CACHE["at"] = now
        _CACHE["items"] = items
    log.info("Live news: %d Gandhinagar articles", len(items))
    return items
