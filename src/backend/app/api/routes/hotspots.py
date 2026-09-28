"""GET /hotspots — per-hex incident intensity for the map.

Ring 0: intensity is count-based (normalized 0-1 across populated hexes).
Ring 1 swaps in the KDE surface (FR-4) while keeping this response shape.
"""
from __future__ import annotations

from datetime import timedelta

import pandas as pd
from fastapi import APIRouter, Query

from app.config import get_scenario, get_settings
from app.core import h3_utils
from app.models.schemas import Centroid, HotspotCell, HotspotResponse
from app.store import db

router = APIRouter()

_WINDOW_DAYS = {"7d": 7, "28d": 28, "90d": 90, "all": None}


def _resolve_window(df: pd.DataFrame, window: str, ref_date: str | None):
    ref = pd.to_datetime(ref_date).date() if ref_date else (
        df["timestamp"].max().date() if not df.empty else None)
    if ref is None:
        return df.iloc[0:0], None
    days = _WINDOW_DAYS.get(window, 28)
    if days is None:
        sub = df[df["timestamp"].dt.date <= ref]
    else:
        start = ref - timedelta(days=days)
        sub = df[(df["timestamp"].dt.date > start) & (df["timestamp"].dt.date <= ref)]
    return sub, ref


def _name_for(cell: str) -> str | None:
    """Nearest attractor centre within ~600 m gives a hex a friendly name."""
    clat, clng = h3_utils.cell_centroid_cached(cell)
    best, best_d = None, 600.0
    for a in get_scenario().attractors:
        d = h3_utils.haversine_m(clat, clng, a.lat, a.lng)
        if d < best_d:
            best, best_d = a.name, d
    return best


@router.get("/hotspots", response_model=HotspotResponse)
def hotspots(
    window: str = Query("28d", pattern="^(7d|28d|90d|all)$"),
    ref_date: str | None = Query(None),
) -> HotspotResponse:
    settings = get_settings()
    df = db.load_incidents()
    sub, ref = _resolve_window(df, window, ref_date)

    counts = sub.groupby("h3_r8").size().to_dict() if not sub.empty else {}
    max_count = max(counts.values()) if counts else 1

    hexes = [
        HotspotCell(
            h3_r8=cell,
            centroid=Centroid(**h3_utils.centroid(cell)),
            count=int(c),
            intensity=round(c / max_count, 4),
            name=_name_for(cell),
        )
        for cell, c in sorted(counts.items(), key=lambda kv: kv[1], reverse=True)
    ]

    return HotspotResponse(
        ref_date=str(ref) if ref else "",
        window=window,
        total_incidents=int(len(sub)),
        hexes=hexes,
        bbox=settings.bbox_dict,
    )
