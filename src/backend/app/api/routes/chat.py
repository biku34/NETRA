"""POST /zones/{h3}/chat — small Q&A bot grounded in one zone's page data."""
from __future__ import annotations

import math
import re
import threading
import time
from collections import defaultdict, deque
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from app.api.routes.zones import zone_detail
from app.intelligence import service
from app.llm import zone_chat

router = APIRouter()

_H3_RE = re.compile(r"^[0-9a-f]{15}$")
_DOW = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

MAX_TURNS = 10
MAX_USER_CHARS = 500
MAX_ASSISTANT_CHARS = 2000

# sliding-window rate limits (in-memory; single-process demo server)
WINDOW_S = 300
PER_CLIENT = 20
GLOBAL = 200
_hits: dict[str, deque] = defaultdict(deque)
_lock = threading.Lock()


class ChatTurn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["user", "assistant"]          # "system" is never accepted from a client
    content: str = Field(min_length=1, max_length=MAX_ASSISTANT_CHARS)


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    messages: list[ChatTurn] = Field(min_length=1, max_length=MAX_TURNS)


class ChatResponse(BaseModel):
    reply: str
    blocked: bool = False


def _rate_limit(client: str) -> None:
    now = time.monotonic()
    with _lock:
        for key, cap in ((client, PER_CLIENT), ("*", GLOBAL)):
            q = _hits[key]
            while q and now - q[0] > WINDOW_S:
                q.popleft()
            if len(q) >= cap:
                raise HTTPException(status_code=429, detail="Too many questions — try again shortly.")
        _hits[client].append(now)
        _hits["*"].append(now)


def _pct(part: float, total: float) -> int | None:
    return round(100 * part / total) if total else None


def build_context(h3: str) -> dict:
    """Everything the zone page shows — and nothing else."""
    z = zone_detail(h3, None)                   # raises 404 for unknown hexes
    pred = service.get_prediction()
    zones = pred["zones"]
    idx = next((i for i, p in enumerate(zones) if p["h3_r8"] == h3), None)
    me = zones[idx] if idx is not None else None

    p = z.probability
    top_abs = max((abs(d.contribution) for d in z.drivers), default=0.0)
    confidence = None if p is None else (
        "high" if p >= 0.7 and top_abs >= 1.0 else "medium" if p >= 0.4 else "low")
    level = None if p is None else ("High" if p >= 0.66 else "Elevated" if p >= 0.33 else "Low")

    s, e = (z.peak_window or [None, None])[:2]
    in_peak = (lambda h: False) if s is None else (
        lambda h: (s <= h < e) if s <= e else (h >= s or h < e))
    hour_total = sum(z.hourly)
    counts = [h.count for h in z.history]
    mix_total = sum(z.crime_mix.values())
    dow_total = sum(z.dow)
    busiest = max(range(len(z.dow)), key=lambda i: z.dow[i]) if dow_total else None

    return {
        "h3_index": z.h3_r8,
        "zone_name": z.name or "Micro-zone (unnamed)",
        "centroid": {"lat": round(z.centroid.lat, 4), "lng": round(z.centroid.lng, 4)},
        "as_of_date": pred.get("ref_date"),
        "model": pred.get("model_used"),
        "risk_next_7_days": {
            "probability_pct": None if p is None else round(p * 100),
            "level": level,
            "confidence": confidence,
            "expected_incidents": None if me is None else round(me["expected_count"], 2),
            "risk_score_0_to_1": None if me is None else round(me["risk_score"], 2),
            "rank": None if idx is None else idx + 1,
            "zones_in_precinct": len(zones),
        },
        "incidents_recorded_past_6_months": z.total_incidents,
        "last_4_weeks": sum(counts[-4:]),
        "prior_4_weeks": sum(counts[-8:-4]),
        "weekly_history": [{"week_of": h.week_start, "incidents": h.count} for h in z.history],
        "peak_window": None if s is None else {
            "from": f"{s:02d}:00", "to": f"{e:02d}:00",
            "share_of_incidents_pct": _pct(sum(v for h, v in enumerate(z.hourly) if in_peak(h)),
                                           hour_total),
        },
        "incidents_by_hour": {f"{h:02d}:00": v for h, v in enumerate(z.hourly)},
        "incidents_by_weekday": dict(zip(_DOW, z.dow)),
        "busiest_day": None if busiest is None else {
            "day": _DOW[busiest], "share_of_incidents_pct": _pct(z.dow[busiest], dow_total)},
        "crime_mix": [
            {"type": k.replace("_", " "), "incidents": v, "share_pct": _pct(v, mix_total)}
            for k, v in sorted(z.crime_mix.items(), key=lambda kv: -kv[1])
        ],
        "risk_drivers": [
            {
                "driver": d.label,
                "effect": "raises risk" if d.contribution >= 0 else "lowers risk",
                "rate_multiplier": round(math.exp(d.contribution), 2),
                "log_rate_contribution": round(d.contribution, 3),
                "feature_value": d.value,
            }
            for d in sorted(z.drivers, key=lambda d: -abs(d.contribution))
        ],
        "rationale": z.rationale,
        "linked_news_and_events": [
            {"type": n.type, "title": zone_chat.clean(n.title, 200),
             "location": n.location, "date": (n.date or "")[:10] or None}
            for n in z.news_events[:8]
        ],
    }


@router.post("/zones/{h3}/chat", response_model=ChatResponse)
def chat(h3: str, body: ChatRequest, request: Request) -> ChatResponse:
    if not _H3_RE.match(h3):
        raise HTTPException(status_code=404, detail="Unknown zone")
    _rate_limit(request.client.host if request.client else "unknown")

    turns = []
    for m in body.messages:
        limit = MAX_USER_CHARS if m.role == "user" else MAX_ASSISTANT_CHARS
        if m.role == "user" and len(m.content) > MAX_USER_CHARS:
            raise HTTPException(status_code=422, detail=f"Questions are limited to {MAX_USER_CHARS} characters.")
        text = zone_chat.clean(m.content, limit)
        if text:
            turns.append({"role": m.role, "content": text})
    if not turns or turns[-1]["role"] != "user":
        raise HTTPException(status_code=422, detail="The last message must be a question from the user.")

    context = build_context(h3)
    try:
        reply, blocked = zone_chat.answer(context, turns)
    except zone_chat.ChatUnavailable:
        raise HTTPException(status_code=503, detail="The assistant is unavailable right now.") from None
    return ChatResponse(reply=reply, blocked=blocked)
