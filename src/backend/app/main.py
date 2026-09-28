"""FastAPI application entrypoint: CORS + router mounting + startup.

Run:  uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
    ai_alerts,
    brief,
    brief_plan,
    chat,
    compare,
    email,
    feedback,
    field_alerts,
    health,
    hotspots,
    ingest,
    news,
    predict,
    spikes,
    validation,
    zones,
)
from app.config import get_settings
from app.store import db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("bob")

settings = get_settings()

app = FastAPI(
    title="Bob — Predictive Crime Hotspot Assistant",
    version="1.0",
    description="Decision-support for a district SHO. Bob recommends; the SHO decides.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.frontend_origin.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers (Ring 0 + Ring 1; later rings add brief/feedback/news)
app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(ingest.router, prefix="/api", tags=["ingest"])
app.include_router(hotspots.router, prefix="/api", tags=["hotspots"])
app.include_router(predict.router, prefix="/api", tags=["predict"])
app.include_router(spikes.router, prefix="/api", tags=["spikes"])
app.include_router(zones.router, prefix="/api", tags=["zones"])
app.include_router(validation.router, prefix="/api", tags=["validation"])
app.include_router(chat.router, prefix="/api", tags=["chat"])
app.include_router(news.router, prefix="/api", tags=["news"])
app.include_router(ai_alerts.router, prefix="/api", tags=["ai-alerts"])
app.include_router(field_alerts.router, prefix="/api", tags=["field-alerts"])
app.include_router(brief.router, prefix="/api", tags=["brief"])
app.include_router(brief_plan.router, prefix="/api", tags=["brief"])
app.include_router(feedback.router, prefix="/api", tags=["feedback"])
app.include_router(email.router, prefix="/api", tags=["email"])
app.include_router(compare.router, prefix="/api", tags=["compare"])


@app.on_event("startup")
def _startup() -> None:
    db.init_db()
    # The CSV dataset is the source of truth: sync it into SQLite on every boot.
    from app.config import INCIDENTS_CSV
    from app.data import loader

    if INCIDENTS_CSV.exists():
        loader.load_from_csv()
    n = db.incident_count()
    log.info("Startup: %d incidents from %s; gdelt_enabled=%s llm_available=%s",
             n, INCIDENTS_CSV, settings.gdelt_enabled, settings.llm_available)
    if n == 0:
        log.warning("No incidents loaded. Run `python -m app.data.build_dataset` "
                    "to create data/csv/, then restart.")


@app.get("/")
def root() -> dict:
    return {
        "name": "Bob",
        "status": "decision-support — for SHO review and approval; not an automated order",
        "docs": "/docs",
        "api": "/api",
    }
