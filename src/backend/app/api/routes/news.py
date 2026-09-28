"""GET /news — the district news feed for the "Latest news" panel.

Merges a LIVE Google News feed for Gandhinagar (real-world, current articles)
with the dataset's news rows and the upcoming event/advisory calendar. Live
articles are display-only and are marked ``live: true``; the model's
``news_uplift`` is unaffected. If the live feed is unreachable the panel falls
back to the dataset items (graceful degradation, CR-6).
"""
from __future__ import annotations

from fastapi import APIRouter, Query

from app.intelligence import service
from app.models.schemas import NewsItem, NewsResponse
from app.news import livefeed
from app.store import db

router = APIRouter()


@router.get("/news", response_model=NewsResponse)
def news(ref_date: str | None = Query(None)) -> NewsResponse:
    # dataset / event items (also feed the model's citations)
    n = service.get_news(ref_date)
    dataset_items = list(n.get("items", []))

    # live Gandhinagar news (display-only), newest first
    live = livefeed.fetch_live_news()

    # merge: live first, then dataset events/advisories + any non-live news,
    # de-duplicated by normalized title.
    seen: set[str] = set()
    merged: list[dict] = []
    for it in live + dataset_items:
        key = (it.get("title") or "").strip().lower()[:80]
        if key in seen:
            continue
        seen.add(key)
        merged.append(it)

    items = [
        NewsItem(**{k: v for k, v in it.items() if k in NewsItem.model_fields})
        for it in merged
    ]
    return NewsResponse(
        available=bool(items),
        gdelt_ok=n.get("gdelt_ok", False),
        live=len(live) > 0,
        ref_date=ref_date or (db.latest_incident_date() or ""),
        items=items,
    )
