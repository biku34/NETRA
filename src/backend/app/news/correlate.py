"""FR-8 — News correlation → the `news_uplift` signal.

Combines GDELT articles (geolocated via the gazetteer) and the curated event
calendar into a per-hex `news_uplift` in [0,1], plus the specific items used per
hex so Bob and the UI can cite them.

    news_uplift(hex) = Σ over items in {hex ∪ kRing(hex,1)}
                       relevance · exp(-γ · days_ago) · tone_factor

Graceful degradation (CR-6): if GDELT is unreachable and the calendar is empty,
`available` is False and uplift is all-zero; the core pipeline is unaffected.
"""
from __future__ import annotations

import logging
import math
from datetime import date, datetime, timedelta, timezone

from app.config import get_settings
from app.core import h3_utils
from app.news import events as event_cal
from app.news import gdelt, geocode, live_calendar, livefeed

log = logging.getLogger("bob.correlate")

# exp(-γ·7) ≈ 0.3  ->  γ = ln(1/0.3)/7
GAMMA = math.log(1 / 0.3) / 7
STRONG_WORDS = ("robbery", "loot", "dacoity", "murder", "assault", "snatch")
# gazetteer keys that are district-wide, not a specific hex — a headline that
# only resolves to these carries no usable geography, so we don't scatter it.
_DISTRICT_WIDE = {"gandhinagar", "gujarat"}


def _days_ago(iso: str | None, ref: date) -> int:
    if not iso:
        return 3
    try:
        d = datetime.fromisoformat(iso.replace("Z", "+00:00")).date()
        return max(0, (ref - d).days)
    except Exception:
        return 3


def _in_bbox(lat: float, lng: float) -> bool:
    minlat, minlng, maxlat, maxlng = get_settings().bbox
    return minlat <= lat <= maxlat and minlng <= lng <= maxlng


def _tone_factor(title: str) -> float:
    t = title.lower()
    return 1.3 if any(w in t for w in STRONG_WORDS) else 1.0


def _scatter(uplift: dict[str, float], cell: str, cells: set[str], w: float,
             contributors: dict[str, list], item: dict) -> None:
    for nb in h3_utils.k_ring(cell, 1):
        if nb in cells:
            uplift[nb] += w if nb == cell else 0.5 * w
            if nb == cell:
                contributors.setdefault(nb, []).append(item)


def _dataset_articles(ref: date, timespan_days: int) -> list[dict]:
    """News rows of data/csv/news_events.csv visible as of `ref`, newest first."""
    from app.data import csv_store

    df = csv_store.news_events()
    if df.empty:
        return []
    df = df[df["type"] == "news"].sort_values("published_at", ascending=False)
    out = []
    for r in df.itertuples(index=False):
        days_ago = (ref - r.published_at.date()).days
        if 0 <= days_ago <= timespan_days:
            out.append({
                "title": str(r.title), "url": str(r.url), "domain": str(r.domain),
                "date": r.published_at.isoformat(), "location": str(r.location),
                "lat": float(r.latitude), "lng": float(r.longitude),
                "weight": float(r.weight), "days_ago": days_ago,
            })
    return out


def compute_news_uplift(cells: list[str], ref: date,
                        timespan_days: int = 30) -> dict:
    """Return {available, uplift{hex:0-1}, items[], by_hex{hex:[items]}}."""
    settings = get_settings()
    cell_set = set(cells)
    uplift = {c: 0.0 for c in cells}
    contributors: dict[str, list] = {}
    items: list[dict] = []
    now = datetime.now(timezone.utc)

    gdelt_ok = False
    if settings.gdelt_enabled:
        try:
            articles = gdelt.fetch_articles(timespan_days=timespan_days)
        except Exception as e:  # defense-in-depth; fetch already self-guards
            log.warning("GDELT call raised unexpectedly: %s", e)
            articles = []
        gdelt_ok = len(articles) > 0
        for a in articles:
            loc = geocode.locate_from_text(a["title"])
            if not loc:
                continue
            lat, lng, matched = loc
            if not _in_bbox(lat, lng):
                continue
            cell = h3_utils.latlng_to_cell(lat, lng, settings.h3_res)
            days_ago = (now - a["_seen_dt"]).days if a["_seen_dt"] else 3
            w = 1.0 * math.exp(-GAMMA * max(0, days_ago)) * _tone_factor(a["title"])
            item = {
                "type": "news", "title": a["title"], "url": a["url"],
                "domain": a["domain"], "date": a["seendate"],
                "h3_r8": cell, "location": matched, "weight": round(w, 3),
            }
            items.append(item)
            _scatter(uplift, cell, cell_set, w, contributors, item)

    # --- live Gandhinagar news (Google News RSS, free/no-key) ---
    # Geolocate each headline; only scatter uplift when it resolves to a specific
    # locality (a district-wide match carries no usable geography). Live news is
    # the primary path; the static CSV dataset is the offline fallback below.
    live_news = livefeed.fetch_live_news()
    live_ok = len(live_news) > 0
    for a in live_news:
        loc = geocode.locate_from_text(a["title"])
        if not loc:
            continue
        lat, lng, matched = loc
        if matched in _DISTRICT_WIDE or not _in_bbox(lat, lng):
            continue
        cell = h3_utils.latlng_to_cell(lat, lng, settings.h3_res)
        w = math.exp(-GAMMA * _days_ago(a.get("date"), ref)) * _tone_factor(a["title"])
        item = {
            "type": "news", "title": a["title"], "url": a.get("url"),
            "domain": a.get("domain", "news"), "date": a.get("date"),
            "h3_r8": cell, "location": matched, "weight": round(w, 3), "live": True,
        }
        items.append(item)
        _scatter(uplift, cell, cell_set, w, contributors, item)

    # static-dataset articles — offline fallback only when live news is empty
    if not live_ok:
        for a in _dataset_articles(ref, timespan_days):
            if not _in_bbox(a["lat"], a["lng"]):
                continue
            cell = h3_utils.latlng_to_cell(a["lat"], a["lng"], settings.h3_res)
            w = (a["weight"] * math.exp(-GAMMA * a["days_ago"])
                 * _tone_factor(a["title"]))
            item = {
                "type": "news", "title": a["title"], "url": a["url"] or None,
                "domain": a["domain"], "date": a["date"],
                "h3_r8": cell, "location": a["location"], "weight": round(w, 3),
            }
            items.append(item)
            _scatter(uplift, cell, cell_set, w, contributors, item)

    # --- live events (Google News, geolocated to hexes) ---
    live_events = live_calendar.live_events()
    for ev in live_events:
        cell = ev.get("h3_r8")
        if not cell or not _in_bbox(ev["lat"], ev["lng"]):
            continue
        w = math.exp(-GAMMA * _days_ago(ev.get("date"), ref))
        item = {
            "type": "event", "title": ev["title"], "url": ev.get("url"),
            "domain": ev.get("domain", "news"), "date": ev.get("date"),
            "h3_r8": cell, "location": ev.get("location"), "weight": round(w, 3),
            "live": True,
        }
        items.append(item)
        _scatter(uplift, cell, cell_set, w, contributors, item)

    # curated event calendar — offline fallback when no live events resolved
    if not live_events:
        for ev in event_cal.active_events(ref, horizon_days=7):
            if not _in_bbox(ev.lat, ev.lng):
                continue
            cell = h3_utils.latlng_to_cell(ev.lat, ev.lng, settings.h3_res)
            w = ev.weight  # upcoming -> full weight
            item = {
                "type": ev.kind, "title": ev.name, "url": None, "domain": "calendar",
                "date": ev.start, "h3_r8": cell, "location": ev.location or ev.name,
                "weight": round(w, 3),
            }
            items.append(item)
            _scatter(uplift, cell, cell_set, w, contributors, item)

    # --- active festival in the coming week (independent India-holidays calendar) ---
    # Its per-hex scoring effect is carried by the model's ``is_festival_week``
    # feature (see features.py); here we surface it so the UI/brief can cite the
    # festival and it is visible that festivals are part of the assessment.
    fest_name = live_calendar.festival_in_window(ref, ref + timedelta(days=7))
    festival_active = fest_name is not None
    if festival_active:
        items.append({
            "type": "festival", "title": fest_name, "url": None,
            "domain": "calendar", "date": ref.isoformat(), "h3_r8": None,
            "location": "Gandhinagar district", "weight": 0.0,
        })

    # normalize 0-1
    hi = max(uplift.values()) if uplift else 0.0
    if hi > 0:
        uplift = {c: round(v / hi, 4) for c, v in uplift.items()}

    available = (gdelt_ok or live_ok or bool(live_events) or festival_active
                 or any(i["type"] != "news" for i in items))
    log.info("news_uplift: available=%s gdelt_ok=%s live_ok=%s events=%d festival=%s items=%d",
             available, gdelt_ok, live_ok, len(live_events), festival_active, len(items))
    return {
        "available": available,
        "gdelt_ok": gdelt_ok,
        "live_ok": live_ok,
        "festival": fest_name,
        "uplift": uplift,
        "items": items,
        "by_hex": contributors,
    }
