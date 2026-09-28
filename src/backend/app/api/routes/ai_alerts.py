"""GET /ai-alerts — AI-written alerts for the top-N at-risk zones.

Figures come from the prediction; Groq writes the wording. The result is cached
until the data changes or the TTL passes, so page loads don't each cost an LLM
call. `refresh=true` forces a new analysis.
"""
from __future__ import annotations

import threading
import time
from datetime import datetime

from fastapi import APIRouter, Query

from app.api.routes.chat import build_context
from app.config import get_settings
from app.data import csv_store
from app.intelligence import service
from app.llm import zone_alerts
from app.models.schemas import AIAlert, AIAlertResponse
from app.store import db

router = APIRouter()

TTL_S = 600
_cache: dict = {"key": None, "at": 0.0, "value": None}
_lock = threading.Lock()


def _zone_facts(z: dict, spikes: list[dict]) -> dict:
    ctx = build_context(z["h3_r8"])
    return {
        "h3": z["h3_r8"],
        "zone_name": ctx["zone_name"],
        "rank": z["rank"],
        "probability_pct": ctx["risk_next_7_days"]["probability_pct"],
        "expected_incidents": ctx["risk_next_7_days"]["expected_incidents"],
        "incidents_past_6_months": ctx["incidents_recorded_past_6_months"],
        "last_4_weeks": ctx["last_4_weeks"],
        "prior_4_weeks": ctx["prior_4_weeks"],
        "peak_window": ctx["peak_window"],
        "busiest_day": ctx["busiest_day"],
        "top_crime_types": ctx["crime_mix"][:3],
        "top_drivers": ctx["risk_drivers"][:3],
        "linked_news_and_events": ctx["linked_news_and_events"][:4],
        "spikes": [
            {"crime_type": s["crime_type"].replace("_", " "), "label": s["label"],
             "recent": s["recent"], "baseline": round(s["baseline"], 1)}
            for s in spikes if s["h3_r8"] == z["h3_r8"]
        ],
    }


@router.get("/ai-alerts", response_model=AIAlertResponse)
def ai_alerts(
    top_n: int = Query(5, ge=1, le=10),
    refresh: bool = Query(False),
    lang: str = Query("en", pattern="^(en|gu|hi)$"),
) -> AIAlertResponse:
    pred = service.get_prediction(None, top_n)
    ranked = sorted((z for z in pred["zones"] if z.get("rank") is not None),
                    key=lambda z: z["rank"])
    if not ranked:
        return AIAlertResponse(ref_date=pred.get("ref_date", ""), generated_at=None,
                               source="fallback", model=None, alerts=[])

    key = (db.incident_count(), csv_store.signature(), pred["ref_date"], top_n, lang)
    with _lock:
        hit = _cache["value"]
        if (not refresh and hit is not None and _cache["key"] == key
                and time.monotonic() - _cache["at"] < TTL_S):
            return hit

        spikes = service.get_spikes(None, top_n)
        facts = [_zone_facts(z, spikes) for z in ranked]
        written, source = zone_alerts.generate(facts, lang=lang)

        alerts = []
        for z, f in zip(ranked, facts):
            w = written[z["h3_r8"]]
            win = f["peak_window"]
            alerts.append(AIAlert(
                h3_r8=z["h3_r8"],
                name=z.get("name"),
                rank=z["rank"],
                probability=z["probability"],
                expected_count=z["expected_count"],
                peak_window=f"{win['from']}–{win['to']}" if win else None,
                severity=w["severity"],
                title=w["title"],
                detail=w["detail"],
            ))
        result = AIAlertResponse(
            ref_date=pred["ref_date"],
            generated_at=datetime.now().isoformat(timespec="seconds"),
            source=source,
            model=get_settings().groq_model if source == "groq" else None,
            alerts=alerts,
        )
        # a fallback result is retried on the next request rather than cached
        if source == "groq":
            _cache.update(key=key, at=time.monotonic(), value=result)
        return result
