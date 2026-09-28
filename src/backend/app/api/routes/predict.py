"""GET /predict — top-N at-risk zones with drivers (FR-6).

Returns every populated hex with a risk_score (so the map can colour all of
them) and marks the top-N by probability with a rank.
"""
from __future__ import annotations

from fastapi import APIRouter, Query

from app.intelligence import service
from app.models.schemas import PredictResponse

router = APIRouter()


@router.get("/predict", response_model=PredictResponse)
def predict(
    top_n: int = Query(5, ge=1, le=20),
    ref_date: str | None = Query(None),
) -> PredictResponse:
    result = service.get_prediction(ref_date, top_n)
    return PredictResponse(**result)
