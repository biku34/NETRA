"""POST /compare — a predictive, outcome-driven comparison of 2+ zones.

The client sends the h3 ids the officer dragged into the compare tray. We gather
the same facts the dashboard shows for each, ask Groq for a comparison, and
return it with each zone's name and risk attached.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.api.routes.ai_alerts import _zone_facts
from app.intelligence import service
from app.llm import compare as compare_llm
from app.models.schemas import CompareRequest, CompareResponse, CompareZone

router = APIRouter()

_MAX_ZONES = 6


@router.post("/compare", response_model=CompareResponse)
def compare(req: CompareRequest, lang: str = Query("en", pattern="^(en|gu|hi)$")) -> CompareResponse:
    pred = service.get_prediction(None, 5)
    by_h3 = {z["h3_r8"]: z for z in pred["zones"]}

    # de-dup, preserve order, cap
    seen: set[str] = set()
    picked = []
    for h in req.h3s:
        z = by_h3.get(h)
        if z and h not in seen:
            seen.add(h)
            picked.append(z)
        if len(picked) >= _MAX_ZONES:
            break
    if len(picked) < 2:
        raise HTTPException(status_code=422, detail="Drag at least two zones to compare.")

    spikes = service.get_spikes(None, 5)
    facts = [_zone_facts(z, spikes) for z in picked]
    lang_choice = req.lang if req.lang in ("en", "gu", "hi") else lang
    result, source = compare_llm.compare(facts, lang_choice)

    zmap = {z["h3"]: z for z in result["zones"]}
    zones = []
    for h in result["priority"]:
        z = by_h3.get(h)
        w = zmap.get(h)
        if not z or not w:
            continue
        zones.append(CompareZone(
            h3_r8=h, name=z.get("name"), rank=z.get("rank"),
            probability=z["probability"],
            outlook=w["outlook"], if_ignored=w["if_ignored"], if_actioned=w["if_actioned"],
        ))

    return CompareResponse(
        ref_date=pred["ref_date"],
        source=source,
        headline=result["headline"],
        priority=result["priority"],
        zones=zones,
        recommendation=result["recommendation"],
    )
