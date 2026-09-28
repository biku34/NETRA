// Typed fetchers for the Bob backend.

import type {
  AIAlertResponse,
  BriefPlanResponse,
  BriefResponse,
  ChatResponse,
  ChatTurn,
  CompareResponse,
  EmailResponse,
  PlanConstraints,
  FeedbackAction,
  FeedbackResponse,
  FieldAlertResponse,
  HealthResponse,
  HotspotResponse,
  IngestResponse,
  NewsResponse,
  PredictResponse,
  SpikeResponse,
  TimeWindow,
  ValidationReport,
  ZoneDetail,
} from "./types";

const BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000/api";

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  health: () => getJSON<HealthResponse>("/health"),
  hotspots: (window: TimeWindow, refDate?: string) =>
    getJSON<HotspotResponse>(
      `/hotspots?window=${window}${refDate ? `&ref_date=${refDate}` : ""}`
    ),
  ingest: (regenerate = false) =>
    postJSON<IngestResponse>("/ingest", { regenerate, refresh_news: false }),
  predict: (topN = 5, refDate?: string) =>
    getJSON<PredictResponse>(
      `/predict?top_n=${topN}${refDate ? `&ref_date=${refDate}` : ""}`
    ),
  spikes: (refDate?: string) =>
    getJSON<SpikeResponse>(`/spikes${refDate ? `?ref_date=${refDate}` : ""}`),
  zone: (h3: string) => getJSON<ZoneDetail>(`/zones/${h3}`),
  validation: (topK = 5) => getJSON<ValidationReport>(`/validation?top_k=${topK}`),
  zoneChat: (h3: string, messages: ChatTurn[]) =>
    postJSON<ChatResponse>(`/zones/${encodeURIComponent(h3)}/chat`, { messages }),
  news: (refDate?: string) =>
    getJSON<NewsResponse>(`/news${refDate ? `?ref_date=${refDate}` : ""}`),
  aiAlerts: (topN = 5, refresh = false, lang = "en") =>
    getJSON<AIAlertResponse>(
      `/ai-alerts?top_n=${topN}&lang=${lang}${refresh ? "&refresh=true" : ""}`
    ),
  fieldAlerts: (limit = 20) =>
    getJSON<FieldAlertResponse>(`/field-alerts?limit=${limit}`),
  brief: (topN = 5, includeNews = true, refDate?: string) =>
    postJSON<BriefResponse>("/brief", {
      top_n: topN,
      include_news: includeNews,
      ref_date: refDate ?? null,
    }),
  briefPlan: (body: {
    messages?: ChatTurn[];
    constraints?: PlanConstraints;
    brief_id?: string;
    decision?: "approve" | "reject";
    note?: string;
  }) => postJSON<BriefPlanResponse>("/brief/plan", body),
  feedback: (body: {
    brief_id?: string;
    zone?: string;
    action: FeedbackAction;
    note?: string;
  }) => postJSON<FeedbackResponse>("/feedback", body),
  emailStatus: () =>
    getJSON<{ configured: boolean; default_to: string | null }>("/email/status"),
  emailBrief: (body: { to: string; subject: string; html: string; text?: string }) =>
    postJSON<EmailResponse>("/email/brief", body),
  compare: (h3s: string[], lang = "en") =>
    postJSON<CompareResponse>("/compare", { h3s, lang }),
};
