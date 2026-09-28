"use client";

import { useEffect, useMemo, useState } from "react";
import { useCompare } from "@/store/compare";
import { usePredictions } from "@/hooks/usePredictions";
import { useLang, useT } from "@/lib/i18n";
import { api } from "@/lib/api";
import type { CompareResponse } from "@/lib/types";

export default function ComparePanel() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const open = useCompare((s) => s.open);
  const items = useCompare((s) => s.items);
  const add = useCompare((s) => s.add);
  const remove = useCompare((s) => s.remove);
  const clear = useCompare((s) => s.clear);
  const setOpen = useCompare((s) => s.setOpen);

  const { data } = usePredictions(5);
  const nameFor = useMemo(() => {
    const m = new Map<string, { name: string; prob: number; risk: number }>();
    for (const z of data?.zones ?? [])
      m.set(z.h3_r8, {
        name: z.name ?? z.h3_r8.slice(0, 10),
        prob: z.probability,
        risk: z.risk_score,
      });
    return m;
  }, [data]);

  const [result, setResult] = useState<CompareResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    setResult(null);
    setErr(null);
  }, [items, lang]);

  async function analyze() {
    setBusy(true);
    setErr(null);
    try {
      setResult(await api.compare(items, lang));
    } catch {
      setErr("Could not run the comparison. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const h3 = e.dataTransfer.getData("text/h3");
    if (h3) add(h3);
  }

  function riskColor(t: number) {
    if (t >= 0.66) return "var(--risk-high)";
    if (t >= 0.33) return "var(--risk-mid)";
    return "var(--risk-low)";
  }

  return (
    <aside
      className={`absolute right-0 top-[62px] z-40 flex h-[calc(100vh-62px)] w-[24rem] flex-col border-l border-line bg-surface transition-transform duration-300 ${
        open ? "translate-x-0 shadow-pop" : "pointer-events-none translate-x-full"
      }`}
      aria-hidden={!open}
    >
      {/* header */}
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-bold tracking-tight text-ink">
            {t("Compare zones")}
          </h2>
          <span className="badge border-core/30 bg-core/10 text-core">
            {t("AI comparison")}
          </span>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="rounded-md p-1 text-dim transition hover:bg-surface-2 hover:text-ink"
          aria-label="Close"
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {/* drop card */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`rounded-2xl border-2 border-dashed p-3 transition ${
            dragOver ? "border-core bg-core/[0.07]" : "border-line-strong bg-surface-2/60"
          }`}
        >
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-dashed border-line-strong text-dim">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </div>
              <div className="text-[13px] font-medium text-muted">
                {t("Drag zones here to compare")}
              </div>
              <div className="text-[11px] text-dim">
                {t("Drag a hex from the map, or an alert · 2+")}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {items.map((h3) => {
                const z = nameFor.get(h3);
                return (
                  <div
                    key={h3}
                    className="flex items-center gap-2.5 rounded-xl border border-line bg-surface p-2.5"
                  >
                    <span
                      className="h-8 w-1.5 shrink-0 rounded-full"
                      style={{ background: z ? riskColor(z.risk) : "var(--line)" }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold text-ink">
                        {z?.name ?? h3.slice(0, 10)}
                      </span>
                      <span className="font-mono text-[10px] text-dim">{h3}</span>
                    </span>
                    {z && (
                      <span className="shrink-0 text-[14px] font-bold text-ink tnum">
                        {Math.round(z.prob * 100)}%
                      </span>
                    )}
                    <button
                      onClick={() => remove(h3)}
                      className="shrink-0 rounded p-1 text-dim transition hover:bg-surface-3 hover:text-ink"
                      aria-label="Remove"
                    >
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* actions */}
        <div className="mt-3 flex items-center gap-2">
          <button onClick={analyze} disabled={items.length < 2 || busy} className="btn-primary flex-1">
            {busy ? t("Analysing…") : `${t("Analyze")} · ${items.length}`}
          </button>
          {items.length > 0 && (
            <button onClick={clear} className="btn-ghost">
              {t("Clear all")}
            </button>
          )}
        </div>
        <p className="mt-1.5 text-[11px] text-dim">
          {t("Predictive & outcome-driven")}
        </p>

        {err && <div className="mt-4 text-sm text-risk-high">{err}</div>}

        {/* result */}
        {result && (
          <div className="mt-5 flex flex-col gap-3 animate-fade-in">
            <div className="card p-4">
              <div className="section-label mb-1">{t("Headline")}</div>
              <p className="text-[15.5px] font-bold leading-snug tracking-tight text-ink">
                {result.headline}
              </p>
              {result.source !== "groq" && (
                <div className="mt-1 text-[11px] text-dim">offline analysis</div>
              )}
            </div>

            {result.zones.map((z, i) => (
              <div key={z.h3_r8} className="card flex flex-col gap-2 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-core/15 text-[12px] font-bold text-core tnum">
                      {i + 1}
                    </span>
                    <span className="truncate text-[14px] font-semibold text-ink">
                      {z.name ?? z.h3_r8.slice(0, 10)}
                    </span>
                  </div>
                  <span className="shrink-0 text-[15px] font-bold text-ink tnum">
                    {Math.round(z.probability * 100)}%
                  </span>
                </div>
                <p className="text-[12.5px] leading-relaxed text-muted">{z.outlook}</p>
                <div className="rounded-lg border border-risk-high/25 bg-risk-high/[0.06] p-2.5">
                  <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-danger">
                    {t("If left as-is")}
                  </div>
                  <p className="text-[12px] leading-snug text-muted">{z.if_ignored}</p>
                </div>
                <div className="rounded-lg border border-ok/25 bg-ok/[0.06] p-2.5">
                  <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-ok">
                    {t("If reinforced")}
                  </div>
                  <p className="text-[12px] leading-snug text-muted">{z.if_actioned}</p>
                </div>
              </div>
            ))}

            <div className="card border-core/30 bg-core/[0.05] p-4">
              <div className="section-label mb-1 text-core">{t("Recommendation")}</div>
              <p className="text-[13.5px] leading-relaxed text-ink/90">
                {result.recommendation}
              </p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
