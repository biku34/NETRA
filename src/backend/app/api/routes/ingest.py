"""POST /ingest — reload the static CSV dataset into SQLite.

The data itself is never regenerated at runtime: `regenerate` is accepted for
backwards compatibility but both modes simply re-read data/csv/incidents.csv.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.data import csv_store, loader
from app.intelligence import service
from app.models.schemas import IngestRequest, IngestResponse
from app.store import db

router = APIRouter()


@router.post("/ingest", response_model=IngestResponse)
def ingest(req: IngestRequest) -> IngestResponse:
    try:
        n = loader.load_from_csv()
    except FileNotFoundError as e:
        raise HTTPException(status_code=409, detail=str(e))
    service.invalidate()

    by_source = {}
    frame = db.load_incidents()
    if not frame.empty:
        by_source = frame["source"].value_counts().to_dict()

    return IngestResponse(
        ingested=n,
        sources={str(k): int(v) for k, v in by_source.items()},
        news_available=not csv_store.news_events().empty,
        ref_date=db.latest_incident_date() or "",
    )
