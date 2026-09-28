"""GET /spikes — flagged anomalies (FR-7)."""
from __future__ import annotations

from fastapi import APIRouter, Query

from app.intelligence import service
from app.models.schemas import SpikeResponse
from app.store import db

router = APIRouter()


@router.get("/spikes", response_model=SpikeResponse)
def spikes(ref_date: str | None = Query(None)) -> SpikeResponse:
    sp = service.get_spikes(ref_date)
    return SpikeResponse(
        ref_date=ref_date or (db.latest_incident_date() or ""),
        spikes=sp,
    )
