"use client";

import Link from "next/link";
import { useAIAlerts, useNews } from "@/hooks/usePredictions";
import { useLang, useT } from "@/lib/i18n";
import { useCompare } from "@/store/compare";

// News comes from the CSV dataset (times relative to the dataset's clock).
// AI alerts are written live by Groq (in the app language) from the top-5 zones.

function relTime(iso: string | null, asOf: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  const now = asOf ? new Date(asOf).getTime() : Date.now();
  if (Number.isNaN(t) || Number.isNaN(now)) return iso.slice(0, 10);
  const min = Math.round((now - t) / 60000);
  if (min < 0) return `from ${iso.slice(0, 10)}`;
  if (min < 60) return `${Math.max(min, 1)} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "Yesterday" : `${d}d ago`;
}

const TAG_STYLE: Record<string, string> = {
  news: "border-alert/30 bg-alert/10 text-alert",
  festival: "border-aug/30 bg-aug/10 text-aug",
  event: "border-info/30 bg-info/10 text-info",
  advisory: "border-warn/30 bg-warn/10 text-warn",
};

const SEVERITY_STYLE: Record<string, string> = {
  critical: "border-risk-high/30 bg-risk-high/10 text-danger",
  high: "border-alert/30 bg-alert/10 text-alert",
  elevated: "border-warn/30 bg-warn/10 text-warn",
};

const ACCENT: Record<string, { bar: string; text: string; bg: string }> = {
  core: { bar: "bg-core", text: "text-core", bg: "bg-core/[0.06]" },
  info: { bar: "bg-info", text: "text-info", bg: "bg-info/[0.06]" },
};

function SectionHeader({
  title,
  count,
  live,
  busy,
  accent = "core",
}: {
  title: string;
  count: number | string;
  live?: boolean;
  busy?: boolean;
  accent?: keyof typeof ACCENT;
}) {
  const t = useT();
  const a = ACCENT[accent];
  return (
    <div
      className={`flex items-center justify-between border-b border-line px-4 py-2.5 ${a.bg}`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-3.5 w-1 shrink-0 rounded-full ${a.bar}`} />
        <h3 className={`section-label ${a.text}`}>{title}</h3>
        {live && (
          <span className="inline-flex items-center gap-1 rounded-full border border-ok/30 bg-ok/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-ok">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-ok" />
            </span>
            {t("Live")}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {busy && (
          <span className="h-3 w-3 animate-spin rounded-full border border-line border-t-core" />
        )}
        <span className="text-[11px] text-dim tnum">{count}</span>
      </div>
    </div>
  );
}

function Empty({ loading }: { loading: boolean }) {
  const t = useT();
  return (
    <p className="px-1 py-2 text-[12px] text-dim">
      {loading ? t("Loading…") : t("Nothing to show.")}
    </p>
  );
}

export default function AlertsPanel() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const addCompare = useCompare((s) => s.add);
  const { data: newsData, isLoading: newsLoading } = useNews();
  const { data: alertData, isLoading: alertsLoading, isFetching: alertsFetching } =
    useAIAlerts(5, lang);

  const newsAsOf = newsData?.ref_date ? `${newsData.ref_date}T23:59:00` : null;
  const news = [...(newsData?.items ?? [])]
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, 12);
  const alerts = alertData?.alerts ?? [];

  return (
    <aside className="absolute right-0 top-[62px] z-30 flex h-[calc(100vh-62px)] w-[22rem] flex-col border-l border-line bg-surface/95 backdrop-blur">
      {/* Top: AI alerts for the top-5 zones */}
      <section className="flex min-h-0 flex-1 flex-col">
        <SectionHeader
          title={t("AI alerts · top 5 zones")}
          busy={alertsFetching}
          count={
            alertData?.generated_at
              ? `${alertData.source === "groq" ? "AI" : "offline"} · ${alertData.generated_at.slice(11, 16)}`
              : ""
          }
        />
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
          {alerts.length === 0 && <Empty loading={alertsLoading} />}
          {alerts.map((a) => (
            <div
              key={a.h3_r8}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/h3", a.h3_r8);
                e.dataTransfer.effectAllowed = "copy";
              }}
              title="Drag into Compare, or use the + button"
              className="card cursor-grab p-2.5 transition active:cursor-grabbing hover:border-line-strong"
            >
              <div className="flex items-center gap-2">
                <span className={`badge shrink-0 ${SEVERITY_STYLE[a.severity] ?? SEVERITY_STYLE.high}`}>
                  {t(a.severity)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11px] text-dim">
                  #{a.rank} · {a.name ?? a.h3_r8.slice(0, 10)}
                </span>
                <span className="shrink-0 text-[12px] font-semibold text-ink tnum">
                  {Math.round(a.probability * 100)}%
                </span>
              </div>
              <div className="mt-1.5 text-[13px] font-medium leading-snug text-ink">{a.title}</div>
              <p className="mt-1 text-[12px] leading-snug text-muted">{a.detail}</p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="truncate text-[11px] text-dim">
                  {a.peak_window ? `${t("Peak")} ${a.peak_window}` : ""}
                </span>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => addCompare(a.h3_r8)}
                    title={t("Compare")}
                    className="btn-ghost px-2 py-1 text-[11.5px]"
                  >
                    + {t("Compare")}
                  </button>
                  <Link
                    href={`/zone/${a.h3_r8}`}
                    className="btn-ghost px-2.5 py-1 text-[11.5px]"
                  >
                    {t("View details →")}
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom: latest news */}
      <section className="flex min-h-0 flex-1 flex-col border-t border-line">
        <SectionHeader
          title={t("Latest news · Gandhinagar")}
          count={news.length}
          live={!!newsData?.live}
          accent="info"
        />
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
          {news.length === 0 && <Empty loading={newsLoading} />}
          {news.map((n, i) => {
            const meta = (
              <>
                {n.live ? (n.domain ?? "news") : (n.location ?? "—")} ·{" "}
                {relTime(n.date, n.live ? null : newsAsOf)}
              </>
            );
            const body = (
              <>
                <span
                  className={`badge mt-0.5 shrink-0 ${
                    n.live
                      ? "border-ok/30 bg-ok/10 text-ok"
                      : TAG_STYLE[n.type] ?? TAG_STYLE.news
                  }`}
                >
                  {n.live ? t("live") : t(n.type)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] leading-snug text-ink">{n.title}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-dim">{meta}</span>
                </span>
              </>
            );
            return n.url ? (
              <a
                key={i}
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                className="card-interactive flex items-start gap-2.5 p-2.5"
              >
                {body}
              </a>
            ) : (
              <div key={i} className="card flex items-start gap-2.5 p-2.5">
                {body}
              </div>
            );
          })}
        </div>
      </section>
    </aside>
  );
}
