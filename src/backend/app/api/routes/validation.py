"""GET /validation — backtest accuracy of the hotspot model (FR-14)."""
from __future__ import annotations

from fastapi import APIRouter, Query

from app.intelligence import validation

router = APIRouter()


@router.get("/validation")
def validation_report(top_k: int = Query(5, ge=1, le=30)) -> dict:
    return validation.backtest(top_k)
