"""POST /brief — generate the weekly SHO redeployment brief (FR-11)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.intelligence import service
from app.models.schemas import BriefRequest, BriefResponse

router = APIRouter()


@router.post("/brief", response_model=BriefResponse)
def brief(req: BriefRequest) -> BriefResponse:
    try:
        result = service.build_brief(
            ref=req.ref_date, top_n=req.top_n, include_news=req.include_news)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return BriefResponse(**result)
