"""FR-8 — GDELT news fetch (augmentation).

Queries the GDELT 2.0 DOC API for recent crime-relevant articles about the
district's cities. The DOC API needs no key. Every network path is wrapped so a
failure degrades gracefully to "no news" (CR-6) — the core pipeline never sees
an exception.

The DOC API returns articles (title/url/domain/seendate) without coordinates, so
geolocation is done downstream (news.geocode) by matching the title against a
locality gazetteer, with a Nominatim fallback.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import httpx

log = logging.getLogger("bob.gdelt")

DOC_API = "https://api.gdeltproject.org/api/v2/doc/doc"

# City context + crime themes. GDELT treats space as AND, so we OR the cities and
# OR the crime terms and AND the two groups.
CITY_TERMS = ["Gandhinagar", "Gujarat"]
CRIME_TERMS = [
    "crime", "theft", "robbery", "burglary", "snatching", "chain snatching",
    "vehicle theft", "assault", "pickpocket", "loot", "dacoity",
]


def _build_query() -> str:
    cities = " OR ".join(CITY_TERMS)
    crimes = " OR ".join(f'"{t}"' if " " in t else t for t in CRIME_TERMS)
    return f"({cities}) ({crimes})"


def _parse_seendate(s: str) -> datetime | None:
    try:
        return datetime.strptime(s, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
    except Exception:
        return None


def fetch_articles(timespan_days: int = 30, max_records: int = 60,
                   timeout: float = 8.0) -> list[dict]:
    """Return recent crime-relevant articles, or [] on any failure (CR-6).

    The timeout is bounded (connect + read) so a slow/rate-limited GDELT can
    never stall the core prediction beyond a few seconds.
    """
    params = {
        "query": _build_query(),
        "mode": "artlist",
        "format": "json",
        "maxrecords": str(max_records),
        "timespan": f"{timespan_days}d",
        "sort": "datedesc",
    }
    try:
        r = httpx.get(DOC_API, params=params,
                      timeout=httpx.Timeout(timeout, connect=5.0),
                      headers={"User-Agent": "bob-crime-assistant/1.0"})
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        log.warning("GDELT fetch failed (degrading to no news): %s", e)
        return []

    out: list[dict] = []
    for a in data.get("articles", []):
        seen = _parse_seendate(a.get("seendate", ""))
        out.append({
            "title": (a.get("title") or "").strip(),
            "url": a.get("url") or "",
            "domain": a.get("domain") or "",
            "seendate": seen.isoformat() if seen else None,
            "_seen_dt": seen,
            "language": a.get("language"),
        })
    log.info("GDELT returned %d articles", len(out))
    return out
