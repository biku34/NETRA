"""Geolocation for news articles (FR-8).

GDELT DOC articles carry no coordinates, so we resolve a location by scanning the
article title against a locality gazetteer of the Ahmedabad–Gandhinagar district
(offline, fast, deterministic). A Nominatim (OpenStreetMap) call is available as
a fallback for place names not in the gazetteer; it is wrapped so failure never
breaks the pipeline (CR-6).
"""
from __future__ import annotations

import logging
from functools import lru_cache

import httpx

log = logging.getLogger("bob.geocode")

# name (lowercase) -> (lat, lng). Longer, more specific names are matched first.
# Gandhinagar district localities / sectors.
LOCALITY_GAZETTEER: dict[str, tuple[float, float]] = {
    "sector 21": (23.2200, 72.6500),
    "sector 16": (23.2280, 72.6420),
    "sector 20": (23.2380, 72.6600),
    "sector 11": (23.2340, 72.6480),
    "sector 7": (23.2120, 72.6320),
    "akshardham": (23.2380, 72.6600),
    "infocity": (23.1880, 72.6290),
    "info city": (23.1880, 72.6290),
    "gift city": (23.1645, 72.6820),
    "kudasan": (23.1920, 72.6360),
    "sargasan": (23.1700, 72.6300),
    "raysan": (23.1760, 72.6560),
    "adalaj": (23.1660, 72.5810),
    "pethapur": (23.2450, 72.6650),
    "sughad": (23.1600, 72.6100),
    "vavol": (23.2350, 72.6250),
    # --- city / district fallbacks (checked last) ---
    "gandhinagar": (23.2100, 72.6400),
    "gujarat": (23.2100, 72.6400),
}

# match longer keys first so "gift city" wins over "city", "sector 21" over none
_SORTED_KEYS = sorted(LOCALITY_GAZETTEER, key=len, reverse=True)


def locate_from_text(text: str) -> tuple[float, float, str] | None:
    """Return (lat, lng, matched_name) from the first gazetteer hit in `text`."""
    t = (text or "").lower()
    for key in _SORTED_KEYS:
        if key in t:
            lat, lng = LOCALITY_GAZETTEER[key]
            return lat, lng, key
    return None


@lru_cache(maxsize=256)
def geocode_place(name: str, timeout: float = 8.0) -> tuple[float, float] | None:
    """Nominatim fallback for a place name. Returns None on any failure (CR-6)."""
    try:
        r = httpx.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": f"{name}, Gujarat, India", "format": "json", "limit": "1"},
            headers={"User-Agent": "bob-crime-assistant/1.0 (hackathon demo)"},
            timeout=timeout,
        )
        r.raise_for_status()
        hits = r.json()
        if hits:
            return float(hits[0]["lat"]), float(hits[0]["lon"])
    except Exception as e:
        log.warning("Nominatim geocode failed for %r: %s", name, e)
    return None
