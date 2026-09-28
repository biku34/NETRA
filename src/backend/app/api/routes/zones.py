"""GET /zones/{h3} — one zone: history, hour/dow profiles, drivers (FR-3/FR-6)."""
from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, HTTPException, Query

from app.core import h3_utils, temporal
from app.intelligence import service
from app.models.schemas import (
    Centroid,
    Driver,
    NewsItem,
    ZoneDetail,
    ZoneHistoryPoint,
)

router = APIRouter()


@router.get("/zones/{h3}", response_model=ZoneDetail)
def zone_detail(h3: str, ref_date: str | None = Query(None)) -> ZoneDetail:
    df = service.cached_df()
    sub = df[df["h3_r8"] == h3] if not df.empty else df
    if df.empty or sub.empty:
        raise HTTPException(status_code=404, detail=f"No incidents for hex {h3}")

    d = df["_ts_local"].dt.date
    ref = d.max()
    first = d.min()

    # weekly history for this hex
    history = []
    for ws in temporal.week_starts(first, ref):
        we = ws + timedelta(days=6)
        n = int(sub[(sub["_ts_local"].dt.date >= ws) & (sub["_ts_local"].dt.date <= we)].shape[0])
        history.append(ZoneHistoryPoint(week_start=ws.isoformat(), count=n))

    hourly = temporal.hour_histogram(df, h3)
    dow = temporal.dow_histogram(df, h3)
    crime_mix = {k: int(v) for k, v in sub["crime_type"].value_counts().items()}
    peak = temporal.peak_hour_window(hourly)

    zone_pred = service.get_zone_prediction(h3, ref_date)
    drivers = [Driver(**dv) for dv in zone_pred["drivers"]] if zone_pred else []
    prob = zone_pred["probability"] if zone_pred else None
    name = zone_pred["name"] if zone_pred else None
    news_events = [
        NewsItem(**{k: v for k, v in it.items() if k in NewsItem.model_fields})
        for it in (zone_pred.get("news_events", []) if zone_pred else [])
    ]

    return ZoneDetail(
        h3_r8=h3,
        name=name,
        centroid=Centroid(**h3_utils.centroid(h3)),
        total_incidents=int(sub.shape[0]),
        history=history,
        hourly=hourly,
        dow=dow,
        crime_mix=crime_mix,
        drivers=drivers,
        probability=prob,
        peak_window=list(peak),
        rationale=zone_pred.get("rationale") if zone_pred else None,
        news_events=news_events,
    )
