"""Netra API.

Every response is already limited to the caller's jurisdiction: a FIR outside it is
returned by reference only (see roles.redact), and only when it is linked to one inside.
"""
import logging
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from . import assistant, auth, db, pipeline, settings
from .persons import build_persons
from .roles import ROLES, can, can_open, redact
from .trends import station_trend

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
state = pipeline.state

REVIEW_PERMISSION = {
    "confirmed": "reviewMatch",
    "rejected": "reviewMatch",
    "escalated": "escalate",
    "linkage_approved": "approveLinkage",
    "task_force_approved": "approveTaskForce",
}
REVIEW_LABEL = {
    "confirmed": "Match confirmed",
    "rejected": "Match rejected",
    "escalated": "Escalated to district",
    "linkage_approved": "Cross-station linkage approved",
    "task_force_approved": "Task force alert approved",
}


@asynccontextmanager
async def lifespan(_: FastAPI):
    pipeline.startup()
    yield


app = FastAPI(title="Netra API", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])


# ---------- what a role may see ----------


def visible(role: dict) -> list[dict]:
    return sorted((f for f in state.firs if can_open(role, f)), key=lambda f: f["date_of_fir"], reverse=True)


def view(role: dict) -> dict:
    mine = visible(role)
    ids = {f["fir_reg_no"] for f in mine}
    networks = [n for n in state.networks if ids & set(n["firs"])]
    matches = [m for m in state.matches if m["a"] in ids or m["b"] in ids]
    referenced = ({m["a"] for m in matches} | {m["b"] for m in matches} | {i for n in networks for i in n["firs"]}) - ids
    references = [redact(state.by_id[i]) for i in sorted(referenced)]
    persons = build_persons([*mine, *references], matches, state.config["nameGate"])
    return {"firs": mine, "references": references, "matches": matches, "networks": networks, "persons": persons, "ids": ids}


def engine_info() -> dict:
    return {
        "extraction": "watsonx-granite" if settings.granite_configured() else "local-rules",
        "graniteConnected": settings.granite_configured(),
        "graniteModel": settings.WATSONX_MODEL_ID,
        "textSimilarity": state.text.method if state.text else "tfidf",
        "textSimilarityLabel": state.text.label if state.text else "",
    }


# ---------- auth ----------


class Login(BaseModel):
    user_id: str
    password: str


class RoleSwitch(BaseModel):
    role: str


def session_payload(role_id: str) -> dict:
    return {"token": auth.issue(role_id), "role": role_id}


@app.post("/auth/login")
def login(body: Login):
    if not auth.check_credentials(body.user_id, body.password):
        raise HTTPException(401, "User ID or password is incorrect")
    with db.connect() as con:
        db.log(con, ROLES[auth.DEFAULT_ROLE], "Signed in", "Session")
    return session_payload(auth.DEFAULT_ROLE)


@app.post("/auth/role")
def switch_role(body: RoleSwitch, role: dict = Depends(auth.current_role)):
    # Development convenience: any signed-in user may take any role. With real accounts
    # the role comes from the user record and this endpoint is removed.
    if body.role not in ROLES:
        raise HTTPException(400, "Unknown role")
    with db.connect() as con:
        db.log(con, ROLES[body.role], "Switched role", f"{role['title']} to {ROLES[body.role]['title']}")
    return session_payload(body.role)


# ---------- intelligence ----------


@app.get("/health")
def health():
    return {"status": "ok", "firs": len(state.firs), "updatedAt": state.updated_at, **engine_info()}


@app.get("/snapshot")
def snapshot(role: dict = Depends(auth.current_role)):
    """Everything the dashboard needs for the signed-in role, in one call."""
    v = view(role)
    keys = {m["key"] for m in v["matches"]} | {f"net:{n['firs'][0]}" for n in v["networks"]}
    with db.connect() as con:
        steps = {k: s for k, s in db.steps(con).items() if k in keys}
        notes = {k: n for k, n in db.notes(con).items() if k in v["ids"]}
        audit = db.audit(con) if can(role, "viewAudit") else []
    return {
        "role": role["id"],
        "firs": v["firs"] + v["references"],
        "matches": v["matches"],
        "networks": v["networks"],
        "persons": v["persons"],
        "config": state.config,
        # latest decision per flag, and the full chain behind it
        "reviews": {k: s[-1] for k, s in steps.items()},
        "steps": steps,
        "notes": notes,
        "audit": audit,
        "asOf": state.as_of,
        "updatedAt": state.updated_at,
        "engine": engine_info(),
    }


@app.get("/fir")
def list_firs(role: dict = Depends(auth.require("firDetails"))):
    return visible(role)


@app.get("/fir/{reg_no}")
def get_fir(reg_no: str, role: dict = Depends(auth.require("firDetails"))):
    fir = state.by_id.get(reg_no)
    if fir is None:
        raise HTTPException(404, "FIR not found")
    if not can_open(role, fir):
        raise HTTPException(403, "This FIR is outside your jurisdiction")
    return fir


@app.get("/fir/{reg_no}/matches")
def get_matches(reg_no: str, role: dict = Depends(auth.require("firDetails"))):
    """Repeat-offender matches for one FIR, each with its full score breakdown."""
    fir = get_fir(reg_no, role)
    out = []
    for m in state.matches:
        if reg_no not in (m["a"], m["b"]):
            continue
        other = state.by_id[m["b"] if m["a"] == reg_no else m["a"]]
        out.append({**m, "weights": state.config["weights"], "threshold": state.config["threshold"], "nameGate": state.config["nameGate"], "other": other if can_open(role, other) else redact(other)})
    return {"fir_reg_no": fir["fir_reg_no"], "matches": out}


@app.get("/networks")
def get_networks(role: dict = Depends(auth.require("firDetails"))):
    return view(role)["networks"]


@app.get("/station/{station}/trend")
def get_trend(station: str, role: dict = Depends(auth.require("firDetails"))):
    v = view(role)
    if not any(f["police_station"] == station for f in v["firs"]):
        raise HTTPException(404, "No FIRs for this station in your jurisdiction")
    return station_trend(station, v["firs"], v["networks"], state.as_of)


class Ingest(BaseModel):
    firs: list[dict] = Field(min_length=1, max_length=500)


@app.post("/fir/ingest")
def ingest(body: Ingest, role: dict = Depends(auth.require("ingest"))):
    outside = [f.get("fir_reg_no") for f in body.firs if isinstance(f, dict) and not pipeline.validate(f) and not can_open(role, {**f, "investigating_officer": f.get("investigating_officer", {"name": ""})})]
    if outside:
        raise HTTPException(403, f"These FIRs are outside your jurisdiction: {', '.join(map(str, outside))}")
    result = pipeline.store(body.firs)
    if result["added"] or result["updated"]:
        state.rebuild()
        with db.connect() as con:
            db.log(con, role, "Ingested FIRs", f"{result['added']} added, {result['updated']} updated, {len(result['errors'])} rejected")
    return result


# ---------- officer actions ----------


class ReviewBody(BaseModel):
    target: str
    action: Literal["confirmed", "rejected", "escalated", "linkage_approved", "task_force_approved"]
    label: str = ""


@app.post("/reviews")
def review(body: ReviewBody, role: dict = Depends(auth.current_role)):
    if not can(role, REVIEW_PERMISSION[body.action]):
        raise HTTPException(403, f"The {role['short']} role cannot do this")
    v = view(role)
    targets = {m["key"] for m in v["matches"] if m["verdict"] == "linked"} | {f"net:{n['firs'][0]}" for n in v["networks"]}
    if body.target not in targets:
        raise HTTPException(404, "Nothing to review with this reference in your jurisdiction")
    with db.connect() as con:
        db.put_review(con, body.target, body.action, role)
        db.log(con, role, REVIEW_LABEL[body.action], body.label or body.target)
    return {"ok": True}


class NoteBody(BaseModel):
    text: str = Field(min_length=1, max_length=4000)


@app.post("/fir/{reg_no}/notes")
def add_note(reg_no: str, body: NoteBody, role: dict = Depends(auth.require("addNotes"))):
    get_fir(reg_no, role)
    with db.connect() as con:
        db.add_note(con, reg_no, role, body.text.strip())
        db.log(con, role, "Added case note", reg_no)
    return {"ok": True}


class Question(BaseModel):
    question: str = Field(min_length=1, max_length=500)


@app.post("/assistant/ask")
def ask(body: Question, role: dict = Depends(auth.require("assistant"))):
    """Answers from the records the caller may see. Questions are kept in the audit trail."""
    v = view(role)
    with db.connect() as con:
        steps = db.steps(con)
        notes = {k: n for k, n in db.notes(con).items() if k in v["ids"]}
        db.log(con, role, "Asked the assistant", body.question.strip())
    ctx = assistant.Context(v["firs"], v["references"], v["persons"], v["networks"], steps, notes, state.as_of)
    return assistant.answer(body.question, ctx)


# ---------- administration ----------


class Weights(BaseModel):
    name: float = Field(ge=0, le=1)
    moTags: float = Field(ge=0, le=1)
    moText: float = Field(ge=0, le=1)
    temporal: float = Field(ge=0, le=1)


class Config(BaseModel):
    weights: Weights
    nameGate: float = Field(ge=0, le=1)
    threshold: float = Field(ge=0, le=1)
    decayDays: float = Field(gt=0, le=3650)


@app.get("/config")
def get_config(_: dict = Depends(auth.current_role)):
    return state.config


@app.put("/config")
def put_config(body: Config, role: dict = Depends(auth.require("editScoring"))):
    total = sum(body.weights.model_dump().values())
    if abs(total - 1) > 0.001:
        raise HTTPException(422, f"The four weights add up to {total:.2f}. They must add up to 1.00")
    with db.connect() as con:
        db.put_setting(con, "scoring", body.model_dump())
        db.log(con, role, "Updated scoring configuration", str(body.weights.model_dump()))
    state.rebuild()
    return state.config


@app.get("/audit")
def get_audit(_: dict = Depends(auth.require("viewAudit"))):
    with db.connect() as con:
        return db.audit(con)
