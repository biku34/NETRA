"""POST /brief/plan — the weekly brief as structured data, adjustable by chat.

With no messages it returns the baseline plan. With messages, the newest one is
interpreted (Groq) into changes — units available, zones fixed by the officer —
the allocation is recomputed, and the summary/notes/reply are rewritten.

The officer's decision goes through here too: `decision` (the chat's buttons) or
an approve/reject message records the choice against the plan as it stands
(FR-12). Nothing is ever dispatched — the decision is only stored.

The server keeps no conversation state: the client sends back the `constraints`
it was last given, and they are re-validated here on every call.
"""
from __future__ import annotations

import json
import uuid
from datetime import date, datetime, timedelta

from fastapi import APIRouter, HTTPException, Request

from app.api.routes.ai_alerts import _zone_facts
from app.api.routes.chat import MAX_USER_CHARS, _rate_limit
from app.config import PATROL_CONFIG_JSON
from app.intelligence import redeploy, service
from app.llm import brief_chat, fallback, zone_chat
from app.models.schemas import (
    BriefPlanRequest,
    BriefPlanResponse,
    PlanConstraints,
    PlanDecision,
    PlanSpike,
    PlanZone,
)
from app.store import db

router = APIRouter()


def _district() -> str:
    try:
        return json.loads(
            PATROL_CONFIG_JSON.read_text(encoding="utf-8")).get("station", "District")
    except Exception:
        return "District"


def _build_plan(pred: dict, spikes: list[dict], total: int,
                pinned: dict[str, int]) -> dict:
    """Everything the narrator may talk about — figures only, no prose."""
    ref = date.fromisoformat(pred["ref_date"])
    rd = redeploy.compute_redeployment(
        pred["zones"], service.cached_df(), ref, total_units=total, pinned=pinned)
    ranked = {z["h3_r8"]: z for z in pred["zones"] if z.get("rank") is not None}
    zones = []
    for r in rd:
        facts = _zone_facts(ranked[r["h3_r8"]], spikes)
        facts.update(current_units=r["current_units"],
                     suggested_units=r["suggested_units"],
                     delta=r["delta"], pinned=r["pinned"])
        zones.append(facts)
    allocated = sum(z["suggested_units"] for z in zones)
    return {
        "district": _district(),
        "week": {"start": (ref + timedelta(days=1)).isoformat(),
                 "end": (ref + timedelta(days=7)).isoformat()},
        "total_units": total,
        "allocated_units": allocated,
        "reserve_units": total - allocated,
        "zones": zones,
    }


def _describe_changes(before: tuple, after: tuple, plan: dict) -> list[str]:
    """What the officer's message changed, in plain words (no model involved)."""
    (t0, p0), (t1, p1) = before, after
    label = {z["h3"]: f"zone #{z['rank']} ({z['zone_name']})" for z in plan["zones"]}
    placed = {z["h3"]: z["suggested_units"] for z in plan["zones"]}
    out = []
    if t1 != t0:
        out.append(f"Units available changed from {t0} to {t1}")
    for h in p1:
        if p0.get(h) != p1[h]:
            out.append(f"{label[h]} is now fixed at {placed[h]} units")
    for h in p0:
        if h not in p1:
            out.append(f"{label[h]} is no longer fixed")
    return out


@router.post("/brief/plan", response_model=BriefPlanResponse)
def brief_plan(body: BriefPlanRequest, request: Request) -> BriefPlanResponse:
    pred = service.get_prediction(None, body.top_n)
    ranked = sorted((z for z in pred["zones"] if z.get("rank") is not None),
                    key=lambda z: z["rank"])
    if not ranked:
        raise HTTPException(status_code=409, detail="No data — load the dataset first.")
    spikes = service.get_spikes(None, body.top_n)
    news = service.get_news(None, body.top_n)
    default_total = redeploy.default_total_units()

    # re-validate what the client sent back
    known = {z["h3_r8"] for z in ranked}
    total = body.constraints.total_units or default_total
    pinned = {h: u for h, u in body.constraints.pinned.items() if h in known}

    message, reply, blocked, warnings = None, None, False, []
    decision, note = body.decision, zone_chat.clean(body.note or "", 500) or None
    before = (total, dict(pinned))
    if decision:
        _rate_limit(request.client.host if request.client else "unknown")
    elif body.messages:
        if body.messages[-1].role != "user":
            raise HTTPException(status_code=422,
                                detail="The last message must be from the user.")
        if len(body.messages[-1].content) > MAX_USER_CHARS:
            raise HTTPException(
                status_code=422,
                detail=f"Messages are limited to {MAX_USER_CHARS} characters.")
        _rate_limit(request.client.host if request.client else "unknown")
        message = zone_chat.clean(body.messages[-1].content, MAX_USER_CHARS)

    if message:
        if zone_chat.injection_score(message) >= zone_chat._GUARD_THRESHOLD:
            message, reply, blocked = None, brief_chat.REFUSAL, True
        else:
            current = _build_plan(pred, spikes, total, pinned)
            change, _ = brief_chat.interpret(message, current)
            if change["intent"] == "out_of_scope":
                message, reply, blocked = None, brief_chat.REFUSAL, True
            elif change["intent"] in ("approve", "reject"):
                decision, note = change["intent"], message
            elif change["intent"] == "reset":
                total, pinned = default_total, {}
            elif change["intent"] == "update":
                by_rank = {z["rank"]: z["h3_r8"] for z in ranked}
                if change["total_units"] is not None:
                    total = change["total_units"]
                for r in change["unpin"]:
                    pinned.pop(by_rank[r], None)
                for r, u in change["pin"].items():
                    pinned[by_rank[r]] = u

    if sum(pinned.values()) > total:
        warnings.append(
            f"The fixed zones ask for {sum(pinned.values())} units but only {total} "
            "are available, so lower-ranked fixed zones were reduced.")

    plan = _build_plan(pred, spikes, total, pinned)
    changes = _describe_changes(before, (total, pinned), plan)
    if blocked or decision:
        # no wording is needed from the model: the client keeps the text it has
        text, source = brief_chat.narrate_offline(plan, None, warnings), "fallback"
    else:
        text, source = brief_chat.narrate(plan, message, warnings, changes)

    brief_id = body.brief_id
    if not brief_id or decision:
        # a decision re-saves the brief so the record shows the plan decided on
        brief_id = brief_id or str(uuid.uuid4())
        payload = {
            "district": plan["district"], "window": plan["week"],
            "zones": [service._brief_zone(z) for z in ranked], "spikes": spikes,
            "redeployment": redeploy.compute_redeployment(
                pred["zones"], service.cached_df(), total_units=total, pinned=pinned),
            "news": news.get("items", [])[:10],
            "augmentation_available": bool(news.get("available")),
        }
        db.save_brief(brief_id, pred["ref_date"], fallback.render_brief(payload), payload)

    recorded = None
    if decision:
        edited = total != default_total or bool(pinned)
        action = "reject" if decision == "reject" else "modify" if edited else "accept"
        fid = str(uuid.uuid4())
        db.save_feedback(fid, brief_id, None, action, note)
        recorded = PlanDecision(
            action=action, feedback_id=fid, note=note,
            recorded_at=datetime.now().isoformat(timespec="minutes"))
        split = (f"{plan['allocated_units']} of {plan['total_units']} units across "
                 f"{len(plan['zones'])} zones")
        reply = {
            "accept": f"Recorded: plan approved as suggested — {split}.",
            "modify": f"Recorded: plan approved with your changes — {split}.",
            "reject": "Recorded: plan rejected. Tell me what to change and I will re-plan.",
        }[action] + " Nothing is dispatched automatically."

    by_h3 = {z["h3_r8"]: z for z in ranked}
    zones = []
    for f in plan["zones"]:
        z = by_h3[f["h3"]]
        win = f["peak_window"]
        zones.append(PlanZone(
            h3_r8=f["h3"], name=z.get("name"), rank=f["rank"],
            probability=z["probability"], expected_count=z["expected_count"],
            peak_window=f"{win['from']}–{win['to']}" if win else None,
            busiest_day=(f["busiest_day"] or {}).get("day"),
            top_crimes=[c["type"] for c in f["top_crime_types"]],
            drivers=[d["driver"] for d in f["top_drivers"]],
            last_4_weeks=f["last_4_weeks"], prior_4_weeks=f["prior_4_weeks"],
            current_units=f["current_units"], suggested_units=f["suggested_units"],
            delta=f["delta"], pinned=f["pinned"],
            note=text["zone_notes"].get(f["h3"], ""),
            events=[n["title"] for n in f["linked_news_and_events"]],
        ))

    return BriefPlanResponse(
        brief_id=brief_id,
        ref_date=pred["ref_date"],
        district=plan["district"],
        week_start=plan["week"]["start"],
        week_end=plan["week"]["end"],
        generated_at=datetime.now().isoformat(timespec="minutes"),
        source=source,
        total_units=plan["total_units"],
        allocated_units=plan["allocated_units"],
        reserve_units=plan["reserve_units"],
        default_total_units=default_total,
        constraints=PlanConstraints(
            total_units=None if total == default_total else total,
            pinned={z.h3_r8: z.suggested_units for z in zones if z.pinned}),
        summary=text["summary"],
        zones=zones,
        spikes=[PlanSpike(
            h3_r8=s["h3_r8"], name=s.get("name"),
            crime_type=s["crime_type"].replace("_", " "), label=s["label"],
            recent=s["recent"], baseline=round(float(s["baseline"]), 1),
            reason=s.get("linked_reason")) for s in spikes[:8]],
        news_available=bool(news.get("available")),
        reply=reply if (blocked or decision) else (text["reply"] or None),
        blocked=blocked,
        warnings=warnings,
        decision=recorded,
    )
