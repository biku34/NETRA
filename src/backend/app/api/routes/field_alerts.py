"""GET /field-alerts — reports filed by on-site personnel, newest first.

Served from data/csv/field_alerts.csv. `as_of` is the end of the reference day
(the dataset's clock), so clients can render relative times against it.
"""
from __future__ import annotations

from datetime import datetime, time

import pandas as pd
from fastapi import APIRouter, Query

from app.data import csv_store
from app.models.schemas import FieldAlert, FieldAlertResponse
from app.store import db

router = APIRouter()


@router.get("/field-alerts", response_model=FieldAlertResponse)
def field_alerts(
    limit: int = Query(20, ge=1, le=200),
    ref_date: str | None = Query(None),
) -> FieldAlertResponse:
    df = csv_store.field_alerts()
    ref = ref_date or db.latest_incident_date()
    if df.empty or not ref:
        return FieldAlertResponse(ref_date=ref or "", as_of=None, total=0, alerts=[])

    as_of = datetime.combine(pd.to_datetime(ref).date(), time(23, 59))
    sub = df[df["timestamp"] <= as_of].sort_values("timestamp", ascending=False)
    alerts = [
        FieldAlert(
            alert_id=str(r.alert_id),
            timestamp=r.timestamp.isoformat(),
            priority=str(r.priority),
            category=str(r.category),
            title=str(r.title),
            detail=str(r.detail),
            officer=f"{r.officer_rank} {r.officer_name}",
            unit=str(r.unit),
            location=str(r.location),
            h3_r8=str(r.h3_r8) or None,
            status=str(r.status),
        )
        for r in sub.head(limit).itertuples(index=False)
    ]
    return FieldAlertResponse(
        ref_date=str(ref), as_of=as_of.isoformat(), total=int(len(sub)), alerts=alerts)
