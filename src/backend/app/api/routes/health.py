"""GET /health — liveness + augmentation status."""
from __future__ import annotations

from fastapi import APIRouter

from app.config import get_settings
from app.data import csv_store
from app.models.schemas import HealthResponse
from app.store import db

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    settings = get_settings()
    n = db.incident_count()
    return HealthResponse(
        status="ok" if n > 0 else "degraded",
        incidents=n,
        ref_date=db.latest_incident_date(),
        news_available=not csv_store.news_events().empty,
        llm_available=settings.llm_available,
    )
