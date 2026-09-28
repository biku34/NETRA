"""Pydantic request/response models (DR-6).

Ring 0 covers the canonical incident, hotspot cells, ingest, and health. Later
rings extend this module (predictions, spikes, zones, briefs, feedback).
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

CrimeType = str  # validated against config.CRIME_TYPES at ingest time
Source = Literal["synthetic", "domain", "news"]


# ---------------------------------------------------------------------------
# Canonical incident (DR-1)
# ---------------------------------------------------------------------------
class Incident(BaseModel):
    incident_id: str
    timestamp: datetime
    latitude: float
    longitude: float
    h3_r8: str
    crime_type: CrimeType
    severity: int = Field(ge=1, le=5)
    reported_via: str = "synthetic"
    location_name: Optional[str] = None
    source: Source = "synthetic"
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)


# ---------------------------------------------------------------------------
# Geo / hotspots
# ---------------------------------------------------------------------------
class Centroid(BaseModel):
    lat: float
    lng: float


class HotspotCell(BaseModel):
    h3_r8: str
    centroid: Centroid
    count: int
    intensity: float = Field(ge=0.0, le=1.0)  # normalised 0-1 (count-based in Ring 0)
    name: Optional[str] = None


class HotspotResponse(BaseModel):
    ref_date: str
    window: str
    total_incidents: int
    hexes: list[HotspotCell]
    bbox: dict[str, float]


# ---------------------------------------------------------------------------
# Ingest
# ---------------------------------------------------------------------------
class IngestRequest(BaseModel):
    regenerate: bool = False
    refresh_news: bool = False


class IngestResponse(BaseModel):
    ingested: int
    sources: dict[str, int]
    news_available: bool
    ref_date: str


# ---------------------------------------------------------------------------
# Prediction (FR-6)
# ---------------------------------------------------------------------------
class Driver(BaseModel):
    name: str
    label: str
    value: float
    contribution: float
    direction: Literal["up", "down"]


class NewsItem(BaseModel):
    type: str                 # news | festival | event | advisory
    title: str
    url: Optional[str] = None
    domain: Optional[str] = None
    date: Optional[str] = None
    h3_r8: Optional[str] = None
    location: Optional[str] = None
    weight: float = 0.0
    live: bool = False        # from the live Google News feed (real-world time)


class PredictZone(BaseModel):
    h3_r8: str
    name: Optional[str] = None
    centroid: Centroid
    rank: Optional[int] = None
    probability: float = Field(ge=0.0, le=1.0)
    expected_count: float
    risk_score: float = Field(ge=0.0, le=1.0)
    drivers: list[Driver]
    rationale: Optional[str] = None
    news_events: list[NewsItem] = []


class PredictResponse(BaseModel):
    ref_date: str
    model_used: str
    top_n: int
    news_available: bool = False
    zones: list[PredictZone]


class NewsResponse(BaseModel):
    available: bool
    gdelt_ok: bool
    live: bool = False        # live Google News feed active
    ref_date: str
    items: list[NewsItem]


# ---------------------------------------------------------------------------
# Field alerts (on-site personnel)
# ---------------------------------------------------------------------------
class FieldAlert(BaseModel):
    alert_id: str
    timestamp: str
    priority: str             # urgent | attention | info
    category: str
    title: str
    detail: str
    officer: str
    unit: str
    location: str
    h3_r8: Optional[str] = None
    status: str               # open | acknowledged | resolved


class FieldAlertResponse(BaseModel):
    ref_date: str
    as_of: Optional[str]
    total: int
    alerts: list[FieldAlert]


# ---------------------------------------------------------------------------
# AI alerts (top-N zones, wording by Groq)
# ---------------------------------------------------------------------------
class AIAlert(BaseModel):
    h3_r8: str
    name: Optional[str] = None
    rank: int
    probability: float
    expected_count: float
    peak_window: Optional[str] = None
    severity: Literal["critical", "high", "elevated"]
    title: str
    detail: str


class AIAlertResponse(BaseModel):
    ref_date: str
    generated_at: Optional[str]
    source: Literal["groq", "fallback"]
    model: Optional[str]
    alerts: list[AIAlert]


# ---------------------------------------------------------------------------
# Spikes (FR-7)
# ---------------------------------------------------------------------------
class Spike(BaseModel):
    h3_r8: str
    name: Optional[str] = None
    crime_type: str
    z: float
    baseline: float
    recent: int
    predicted: int
    label: Literal["seasonal", "event_linked", "emerging"]
    linked_reason: Optional[str] = None


class SpikeResponse(BaseModel):
    ref_date: str
    spikes: list[Spike]


# ---------------------------------------------------------------------------
# Zone detail (FR /zones/{h3})
# ---------------------------------------------------------------------------
class ZoneHistoryPoint(BaseModel):
    week_start: str
    count: int


class ZoneDetail(BaseModel):
    h3_r8: str
    name: Optional[str] = None
    centroid: Centroid
    total_incidents: int
    history: list[ZoneHistoryPoint]
    hourly: list[int]        # len 24
    dow: list[int]           # len 7
    crime_mix: dict[str, int]
    drivers: list[Driver]
    probability: Optional[float] = None
    peak_window: Optional[list[int]] = None
    rationale: Optional[str] = None
    news_events: list[NewsItem] = []


# ---------------------------------------------------------------------------
# Redeployment (FR-9)
# ---------------------------------------------------------------------------
class RedeploymentItem(BaseModel):
    zone: str
    h3_r8: str
    rank: Optional[int] = None
    probability: float
    current_units: int
    suggested_units: int
    delta: int
    peak_window: list[int]
    rationale_signals: list[str]


# ---------------------------------------------------------------------------
# Brief (FR-11) + Feedback (FR-12)
# ---------------------------------------------------------------------------
class BriefRequest(BaseModel):
    ref_date: Optional[str] = None
    top_n: int = Field(default=5, ge=1, le=10)
    include_news: bool = True


class BriefResponse(BaseModel):
    brief_id: str
    ref_date: str
    markdown: str
    source: Literal["claude", "fallback"]
    structured: dict


# --- adjustable plan (POST /brief/plan) ---
class PlanTurn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class PlanConstraints(BaseModel):
    model_config = ConfigDict(extra="forbid")
    total_units: Optional[int] = Field(default=None, ge=1, le=200)
    pinned: dict[str, int] = Field(default_factory=dict, max_length=10)  # {h3: units}


class BriefPlanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    messages: list[PlanTurn] = Field(default_factory=list, max_length=10)
    constraints: PlanConstraints = Field(default_factory=PlanConstraints)
    brief_id: Optional[str] = Field(default=None, max_length=64)
    top_n: int = Field(default=5, ge=1, le=10)
    # the officer's decision on the plan as it stands (buttons in the chat)
    decision: Optional[Literal["approve", "reject"]] = None
    note: Optional[str] = Field(default=None, max_length=500)


class PlanDecision(BaseModel):
    action: Literal["accept", "modify", "reject"]   # modify = approved with changes
    feedback_id: str
    recorded_at: str
    note: Optional[str] = None


class PlanZone(BaseModel):
    h3_r8: str
    name: Optional[str] = None
    rank: int
    probability: float
    expected_count: float
    peak_window: Optional[str] = None
    busiest_day: Optional[str] = None
    top_crimes: list[str]
    drivers: list[str]
    last_4_weeks: int
    prior_4_weeks: int
    current_units: int
    suggested_units: int
    delta: int
    pinned: bool
    note: str
    events: list[str]


class PlanSpike(BaseModel):
    h3_r8: str
    name: Optional[str] = None
    crime_type: str
    label: str
    recent: int
    baseline: float
    reason: Optional[str] = None


class BriefPlanResponse(BaseModel):
    brief_id: str
    ref_date: str
    district: str
    week_start: str
    week_end: str
    generated_at: str
    source: Literal["groq", "fallback"]
    total_units: int
    allocated_units: int
    reserve_units: int
    default_total_units: int
    constraints: PlanConstraints
    summary: str
    zones: list[PlanZone]
    spikes: list[PlanSpike]
    news_available: bool
    reply: Optional[str] = None
    blocked: bool = False
    warnings: list[str] = []
    decision: Optional[PlanDecision] = None


class FeedbackRequest(BaseModel):
    brief_id: Optional[str] = None
    zone: Optional[str] = None
    action: Literal["accept", "modify", "reject"]
    note: Optional[str] = None


class FeedbackResponse(BaseModel):
    ok: bool
    feedback_id: str


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    incidents: int
    ref_date: Optional[str]
    news_available: bool
    llm_available: bool


# ---------------------------------------------------------------------------
# Email alerts (Resend)
# ---------------------------------------------------------------------------
class EmailRequest(BaseModel):
    to: str
    subject: str
    html: str
    text: Optional[str] = None


class EmailResponse(BaseModel):
    ok: bool
    configured: bool
    id: Optional[str] = None
    error: Optional[str] = None


# ---------------------------------------------------------------------------
# Compare zones (predictive, outcome-driven)
# ---------------------------------------------------------------------------
class CompareRequest(BaseModel):
    h3s: list[str]
    lang: str = "en"


class CompareZone(BaseModel):
    h3_r8: str
    name: Optional[str] = None
    rank: Optional[int] = None
    probability: float
    outlook: str
    if_ignored: str
    if_actioned: str


class CompareResponse(BaseModel):
    ref_date: str
    source: Literal["groq", "fallback"]
    headline: str
    priority: list[str]
    zones: list[CompareZone]
    recommendation: str
