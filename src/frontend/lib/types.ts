// TS types mirroring the backend Pydantic schemas (kept in sync by hand).

export interface Centroid {
  lat: number;
  lng: number;
}

export interface HotspotCell {
  h3_r8: string;
  centroid: Centroid;
  count: number;
  intensity: number; // 0-1
  name: string | null;
}

export interface HotspotResponse {
  ref_date: string;
  window: string;
  total_incidents: number;
  hexes: HotspotCell[];
  bbox: { minlat: number; minlng: number; maxlat: number; maxlng: number };
}

export interface HealthResponse {
  status: "ok" | "degraded";
  incidents: number;
  ref_date: string | null;
  news_available: boolean;
  llm_available: boolean;
}

export interface IngestResponse {
  ingested: number;
  sources: Record<string, number>;
  news_available: boolean;
  ref_date: string;
}

export type TimeWindow = "7d" | "28d" | "90d" | "all";

// --- Ring 1: prediction / spikes / zone detail ---
export interface Driver {
  name: string;
  label: string;
  value: number;
  contribution: number;
  direction: "up" | "down";
}

export interface NewsItem {
  type: string; // news | festival | event | advisory
  title: string;
  url: string | null;
  domain: string | null;
  date: string | null;
  h3_r8: string | null;
  location: string | null;
  weight: number;
  live?: boolean; // from the live Google News feed (real-world time)
}

export interface PredictZone {
  h3_r8: string;
  name: string | null;
  centroid: Centroid;
  rank: number | null;
  probability: number;
  expected_count: number;
  risk_score: number;
  drivers: Driver[];
  rationale: string | null;
  news_events: NewsItem[];
}

export interface PredictResponse {
  ref_date: string;
  model_used: string;
  top_n: number;
  news_available: boolean;
  zones: PredictZone[];
}

export interface NewsResponse {
  available: boolean;
  gdelt_ok: boolean;
  live?: boolean;
  ref_date: string;
  items: NewsItem[];
}

export interface Spike {
  h3_r8: string;
  name: string | null;
  crime_type: string;
  z: number;
  baseline: number;
  recent: number;
  predicted: number;
  label: "seasonal" | "event_linked" | "emerging";
  linked_reason: string | null;
}

export interface SpikeResponse {
  ref_date: string;
  spikes: Spike[];
}

export interface ZoneHistoryPoint {
  week_start: string;
  count: number;
}

export interface ZoneDetail {
  h3_r8: string;
  name: string | null;
  centroid: Centroid;
  total_incidents: number;
  history: ZoneHistoryPoint[];
  hourly: number[];
  dow: number[];
  crime_mix: Record<string, number>;
  drivers: Driver[];
  probability: number | null;
  peak_window: number[] | null;
  rationale: string | null;
  news_events: NewsItem[];
}

export interface BriefResponse {
  brief_id: string;
  ref_date: string;
  markdown: string;
  source: "claude" | "fallback";
  structured: Record<string, unknown>;
}

// --- compare zones (predictive, outcome-driven) ---
export interface CompareZone {
  h3_r8: string;
  name: string | null;
  rank: number | null;
  probability: number;
  outlook: string;
  if_ignored: string;
  if_actioned: string;
}

export interface CompareResponse {
  ref_date: string;
  source: "groq" | "fallback";
  headline: string;
  priority: string[];
  zones: CompareZone[];
  recommendation: string;
}

export interface EmailResponse {
  ok: boolean;
  configured: boolean;
  id?: string | null;
  error?: string | null;
}

export type FeedbackAction = "accept" | "modify" | "reject";

export interface FeedbackResponse {
  ok: boolean;
  feedback_id: string;
}

// --- zone chatbot ---
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  reply: string;
  blocked: boolean;
}

// --- field alerts (on-site personnel) ---
export interface FieldAlert {
  alert_id: string;
  timestamp: string;
  priority: string; // urgent | attention | info
  category: string;
  title: string;
  detail: string;
  officer: string;
  unit: string;
  location: string;
  h3_r8: string | null;
  status: string; // open | acknowledged | resolved
}

export interface FieldAlertResponse {
  ref_date: string;
  as_of: string | null;
  total: number;
  alerts: FieldAlert[];
}

// --- AI alerts (top zones, wording by Groq) ---
export interface AIAlert {
  h3_r8: string;
  name: string | null;
  rank: number;
  probability: number;
  expected_count: number;
  peak_window: string | null;
  severity: "critical" | "high" | "elevated";
  title: string;
  detail: string;
}

export interface AIAlertResponse {
  ref_date: string;
  generated_at: string | null;
  source: "groq" | "fallback";
  model: string | null;
  alerts: AIAlert[];
}

// --- adjustable weekly plan (POST /brief/plan) ---
export interface PlanConstraints {
  total_units: number | null;
  pinned: Record<string, number>; // { h3: units }
}

export interface PlanZone {
  h3_r8: string;
  name: string | null;
  rank: number;
  probability: number;
  expected_count: number;
  peak_window: string | null;
  busiest_day: string | null;
  top_crimes: string[];
  drivers: string[];
  last_4_weeks: number;
  prior_4_weeks: number;
  current_units: number;
  suggested_units: number;
  delta: number;
  pinned: boolean;
  note: string;
  events: string[];
}

export interface PlanSpike {
  h3_r8: string;
  name: string | null;
  crime_type: string;
  label: string;
  recent: number;
  baseline: number;
  reason: string | null;
}

export interface BriefPlanResponse {
  brief_id: string;
  ref_date: string;
  district: string;
  week_start: string;
  week_end: string;
  generated_at: string;
  source: "groq" | "fallback";
  total_units: number;
  allocated_units: number;
  reserve_units: number;
  default_total_units: number;
  constraints: PlanConstraints;
  summary: string;
  zones: PlanZone[];
  spikes: PlanSpike[];
  news_available: boolean;
  reply: string | null;
  blocked: boolean;
  warnings: string[];
  decision: PlanDecision | null;
}

export interface PlanDecision {
  action: FeedbackAction; // modify = approved with changes
  feedback_id: string;
  recorded_at: string;
  note: string | null;
}

// --- prediction backtest (GET /validation) ---
export interface ValidationWeek {
  week_start: string;
  incidents: number;
  model_hits: number;
  persistence_hits: number;
  best_possible: number;
  model_hit_rate: number;
  persistence_hit_rate: number;
}

export interface CoveragePoint {
  k: number;
  area_pct: number;
  model: number;
  persistence: number;
  random: number;
}

export interface ValidationReport {
  available: boolean;
  reason?: string;
  ref_date?: string;
  weeks_tested?: number;
  top_k?: number;
  total_zones?: number;
  area_pct?: number;
  total_incidents?: number;
  model?: { hit_rate: number; captured: number; pai: number; pei: number };
  persistence?: { hit_rate: number; captured: number; pai: number };
  best_possible?: { hit_rate: number; captured: number; pai: number };
  uplift_vs_persistence?: number | null;
  coverage_curve?: CoveragePoint[];
  weeks?: ValidationWeek[];
}
