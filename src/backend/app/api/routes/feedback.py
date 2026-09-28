"""POST /feedback — store SHO accept/modify/reject (FR-12, CR-3).

Nothing is auto-executed; the choice is simply persisted so the demo can show
the human-in-the-loop override.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter

from app.models.schemas import FeedbackRequest, FeedbackResponse
from app.store import db

router = APIRouter()


@router.post("/feedback", response_model=FeedbackResponse)
def feedback(req: FeedbackRequest) -> FeedbackResponse:
    fid = str(uuid.uuid4())
    db.save_feedback(fid, req.brief_id, req.zone, req.action, req.note)
    return FeedbackResponse(ok=True, feedback_id=fid)
