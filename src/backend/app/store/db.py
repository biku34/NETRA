"""SQLite persistence via SQLModel.

Ring 0 uses the ``incidents`` table. Later rings add hex_features, predictions,
spikes, briefs, feedback, news_items — declared here so ``create_all`` builds
the full schema up front.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable, Optional


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)

import pandas as pd
from sqlalchemy import Index
from sqlmodel import Field, Session, SQLModel, create_engine, select

from app.config import DB_PATH

_ENGINE = create_engine(f"sqlite:///{DB_PATH}", echo=False)


# ---------------------------------------------------------------------------
# Tables
# ---------------------------------------------------------------------------
class IncidentRow(SQLModel, table=True):
    __tablename__ = "incidents"
    __table_args__ = (Index("ix_incidents_h3_ts", "h3_r8", "timestamp"),)

    incident_id: str = Field(primary_key=True)
    timestamp: datetime = Field(index=True)
    latitude: float
    longitude: float
    h3_r8: str = Field(index=True)
    crime_type: str = Field(index=True)
    severity: int
    reported_via: str = "synthetic"
    location_name: Optional[str] = None
    source: str = "synthetic"
    confidence: float = 1.0


class FeedbackRow(SQLModel, table=True):
    __tablename__ = "feedback"
    feedback_id: str = Field(primary_key=True)
    brief_id: Optional[str] = None
    zone: Optional[str] = None
    action: str = "accept"
    note: Optional[str] = None
    created_at: datetime = Field(default_factory=_utcnow)


class BriefRow(SQLModel, table=True):
    __tablename__ = "briefs"
    brief_id: str = Field(primary_key=True)
    ref_date: str
    markdown: str
    structured_json: str
    created_at: datetime = Field(default_factory=_utcnow)


# ---------------------------------------------------------------------------
# Engine lifecycle
# ---------------------------------------------------------------------------
def init_db() -> None:
    SQLModel.metadata.create_all(_ENGINE)


def get_session() -> Session:
    return Session(_ENGINE)


# ---------------------------------------------------------------------------
# Incident helpers
# ---------------------------------------------------------------------------
def replace_incidents(df: pd.DataFrame) -> int:
    """Truncate and reload the incidents table from a normalized DataFrame."""
    init_db()
    with _ENGINE.begin() as conn:
        conn.exec_driver_sql("DELETE FROM incidents")
    cols = [
        "incident_id", "timestamp", "latitude", "longitude", "h3_r8",
        "crime_type", "severity", "reported_via", "location_name",
        "source", "confidence",
    ]
    out = df[cols].copy()
    out["timestamp"] = pd.to_datetime(out["timestamp"])
    out.to_sql("incidents", _ENGINE, if_exists="append", index=False)
    return len(out)


def load_incidents() -> pd.DataFrame:
    """All incidents as a DataFrame (empty frame with schema if none)."""
    init_db()
    df = pd.read_sql("SELECT * FROM incidents", _ENGINE, parse_dates=["timestamp"])
    return df


def incident_count() -> int:
    init_db()
    with get_session() as s:
        return len(s.exec(select(IncidentRow.incident_id)).all())


def latest_incident_date() -> Optional[str]:
    init_db()
    with _ENGINE.begin() as conn:
        row = conn.exec_driver_sql("SELECT MAX(timestamp) FROM incidents").fetchone()
    if row and row[0]:
        return str(pd.to_datetime(row[0]).date())
    return None


# ---------------------------------------------------------------------------
# Brief + feedback helpers (FR-11 / FR-12)
# ---------------------------------------------------------------------------
def save_brief(brief_id: str, ref_date: str, markdown: str, structured: dict) -> str:
    import json

    init_db()
    with get_session() as s:
        s.merge(BriefRow(brief_id=brief_id, ref_date=ref_date, markdown=markdown,
                         structured_json=json.dumps(structured, default=str)))
        s.commit()
    return brief_id


def save_feedback(feedback_id: str, brief_id: Optional[str], zone: Optional[str],
                  action: str, note: Optional[str]) -> str:
    init_db()
    with get_session() as s:
        s.merge(FeedbackRow(feedback_id=feedback_id, brief_id=brief_id, zone=zone,
                            action=action, note=note))
        s.commit()
    return feedback_id


def list_feedback(brief_id: Optional[str] = None) -> list[dict]:
    init_db()
    with get_session() as s:
        rows = s.exec(select(FeedbackRow)).all()
    out = [r.model_dump() for r in rows]
    if brief_id:
        out = [r for r in out if r.get("brief_id") == brief_id]
    return out
