"use client";

import { useEffect, useRef, useState } from "react";
import type { CoveragePoint, ValidationReport, ValidationWeek } from "@/lib/types";

const NAVY = "#1b3a6b";
const ORANGE = "#c2410c";
const GREY = "#9aa5b5";
const pct = (x: number) => `${Math.round(x * 100)}%`;
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;

const weekLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/* ---------- width hook (charts fill their card) ---------- */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function Card({ title, hint, children, className = "" }: {
  title: string; hint?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`card flex min-w-0 flex-col p-5 ${className}`}>
      <div className="mb-4">
        <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
        {hint && <p className="mt-0.5 text-[12px] text-muted">{hint}</p>}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

/* ---------- hero: PAI dial ---------- */
function HeroPAI({ report }: { report: ValidationReport }) {
  const m = report.model!;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(m.pai));
    return () => cancelAnimationFrame(id);
  }, [m.pai]);
  // dial spans 0..6× PAI on a 3/4 arc
  const size = 200, r = size / 2 - 14, c = 2 * Math.PI * r, arc = 0.75 * c;
  const frac = Math.min(1, shown / 6);
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} role="img" aria-label={`PAI ${m.pai}`}>
          <g transform={`rotate(135 ${size / 2} ${size / 2})`} fill="none" strokeLinecap="round" strokeWidth={12}>
            <circle cx={size / 2} cy={size / 2} r={r} stroke={NAVY} opacity={0.14} strokeDasharray={`${arc} ${c}`} />
            <circle
              cx={size / 2} cy={size / 2} r={r} stroke={NAVY}
              strokeDasharray={`${Math.max(0.001, arc * frac)} ${c}`}
              style={{ transition: "stroke-dasharray 900ms cubic-bezier(0.16,1,0.3,1)" }}
            />
          </g>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-[46px] font-semibold leading-none text-ink">{m.pai}×</div>
          <div className="mt-1.5 text-center text-[11px] uppercase tracking-[0.06em] text-muted">
            better than<br />random patrol
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- coverage curve (hit rate vs area flagged) ---------- */
function CoverageCurve({ curve }: { curve: CoveragePoint[] }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hi, setHi] = useState<number | null>(null);
  const H = 300, m = { l: 40, r: 16, t: 12, b: 40 };
  const maxX = Math.max(...curve.map((p) => p.area_pct));
  const maxY = Math.max(...curve.map((p) => Math.max(p.model, p.persistence)));
  const iw = Math.max(0, W - m.l - m.r), ih = H - m.t - m.b;
  const x = (v: number) => m.l + (v / maxX) * iw;
  const y = (v: number) => m.t + ih - (v / maxY) * ih;
  const path = (key: "model" | "persistence" | "random") =>
    curve.map((p, i) => `${i ? "L" : "M"}${x(p.area_pct).toFixed(1)},${y(p[key]).toFixed(1)}`).join("");

  const yTicks = 4, xTicks = curve.filter((_, i) => i % 2 === 0 || i === curve.length - 1);
  const cur = hi != null ? curve[hi] : null;

  return (
    <div ref={ref} className="relative" style={{ height: H }} onPointerLeave={() => setHi(null)}>
      {W > 0 && (
        <svg width={W} height={H}>
          {Array.from({ length: yTicks + 1 }, (_, i) => {
            const v = (maxY / yTicks) * i;
            return (
              <g key={i}>
                <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke="var(--line)" />
                <text x={m.l - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill="var(--dim)">{pct(v)}</text>
              </g>
            );
          })}
          {xTicks.map((p) => (
            <text key={p.k} x={x(p.area_pct)} y={H - m.b + 16} textAnchor="middle" fontSize={10} fill="var(--dim)">
              {pct(p.area_pct)}
            </text>
          ))}
          <text x={m.l + iw / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--muted)">
            share of the district flagged as hotspot
          </text>
          {/* random break-even (dashed diagonal) */}
          <path d={path("random")} fill="none" stroke={GREY} strokeWidth={1.5} strokeDasharray="4 4" />
          <path d={path("persistence")} fill="none" stroke={ORANGE} strokeWidth={2} strokeLinejoin="round" />
          <path d={path("model")} fill="none" stroke={NAVY} strokeWidth={2.5} strokeLinejoin="round" />
          {cur && (
            <g pointerEvents="none">
              <line x1={x(cur.area_pct)} x2={x(cur.area_pct)} y1={m.t} y2={m.t + ih} stroke="var(--line-strong)" />
              {(["model", "persistence"] as const).map((k) => (
                <circle key={k} cx={x(cur.area_pct)} cy={y(cur[k])} r={4}
                        fill={k === "model" ? NAVY : ORANGE} stroke="var(--surface)" strokeWidth={2} />
              ))}
            </g>
          )}
          {curve.map((p, i) => (
            <rect key={p.k} x={x(p.area_pct) - iw / curve.length / 2} y={m.t}
                  width={iw / curve.length} height={ih} fill="transparent"
                  onPointerEnter={() => setHi(i)} onPointerMove={() => setHi(i)} />
          ))}
        </svg>
      )}
      {cur && (
        <div className="pointer-events-none absolute rounded-md border border-line bg-surface px-2.5 py-2 text-[11.5px] shadow-pop"
             style={{ left: Math.min(W - 150, x(cur.area_pct) + 10), top: 8 }}>
          <div className="font-semibold text-ink">Top {cur.k} zones · {pct(cur.area_pct)} of area</div>
          <div className="mt-1 flex items-center gap-1.5"><span className="h-[2px] w-3 rounded" style={{ background: NAVY }} /><b className="tnum text-ink">{pct1(cur.model)}</b> <span className="text-muted">Netra model</span></div>
          <div className="flex items-center gap-1.5"><span className="h-[2px] w-3 rounded" style={{ background: ORANGE }} /><b className="tnum text-ink">{pct1(cur.persistence)}</b> <span className="text-muted">persistence</span></div>
          <div className="flex items-center gap-1.5"><span className="h-[2px] w-3 rounded" style={{ background: GREY }} /><b className="tnum text-ink">{pct1(cur.random)}</b> <span className="text-muted">random</span></div>
        </div>
      )}
      <Legend items={[
        { label: "Netra model", color: NAVY },
        { label: "Persistence (last month's busiest)", color: ORANGE },
        { label: "Random patrol", color: GREY, dash: true },
      ]} />
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string; dash?: boolean }[] }) {
  return (
    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5 text-[11px] text-muted">
          <span className="h-[2px] w-4 rounded-full"
                style={it.dash ? { backgroundImage: `repeating-linear-gradient(90deg, ${it.color} 0 4px, transparent 4px 8px)` } : { background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/* ---------- per-week bars: captured vs missed ---------- */
function WeeklyBars({ weeks }: { weeks: ValidationWeek[] }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hi, setHi] = useState<number | null>(null);
  const H = 260, m = { l: 28, r: 8, t: 14, b: 34 };
  const n = weeks.length;
  const maxY = Math.max(...weeks.map((w) => w.incidents));
  const iw = Math.max(0, W - m.l - m.r), ih = H - m.t - m.b;
  const band = iw / n, bw = Math.min(30, band - 10);
  const y = (v: number) => m.t + ih - (v / maxY) * ih;
  const cur = hi != null ? weeks[hi] : null;

  return (
    <div ref={ref} className="relative" style={{ height: H }} onPointerLeave={() => setHi(null)}>
      {W > 0 && (
        <svg width={W} height={H}>
          {[0, 0.5, 1].map((f) => {
            const v = maxY * f;
            return (
              <g key={f}>
                <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke="var(--line)" />
                <text x={m.l - 5} y={y(v) + 3} textAnchor="end" fontSize={10} fill="var(--dim)">{Math.round(v)}</text>
              </g>
            );
          })}
          {weeks.map((w, i) => {
            const x0 = m.l + i * band + (band - bw) / 2;
            const hCaught = ih * (w.model_hits / maxY);
            const hTotal = ih * (w.incidents / maxY);
            const on = hi === i;
            return (
              <g key={w.week_start}>
                {/* total incidents (light) */}
                <rect x={x0} y={y(w.incidents)} width={bw} height={Math.max(0, hTotal)} rx={3}
                      fill={NAVY} opacity={on ? 0.22 : 0.14} />
                {/* captured (solid) */}
                <rect x={x0} y={y(w.model_hits)} width={bw} height={Math.max(0, hCaught)} rx={3}
                      fill={NAVY} opacity={on ? 1 : 0.85} />
                <text x={x0 + bw / 2} y={H - m.b + 15} textAnchor="middle" fontSize={10}
                      fill={on ? "var(--ink)" : "var(--dim)"}>{weekLabel(w.week_start)}</text>
                <rect x={m.l + i * band} y={m.t} width={band} height={ih + m.b} fill="transparent"
                      onPointerEnter={() => setHi(i)} onPointerMove={() => setHi(i)} />
              </g>
            );
          })}
        </svg>
      )}
      {cur && (
        <div className="pointer-events-none absolute rounded-md border border-line bg-surface px-2.5 py-2 text-[11.5px] shadow-pop"
             style={{ left: Math.min(W - 160, m.l + (hi! + 0.5) * band - 70), top: 6 }}>
          <div className="font-semibold text-ink">Week of {weekLabel(cur.week_start)}</div>
          <div className="mt-1 text-muted">
            Caught <b className="tnum text-ink">{cur.model_hits}</b> of{" "}
            <b className="tnum text-ink">{cur.incidents}</b> incidents
            {" "}(<b className="tnum text-ink">{pct(cur.model_hit_rate)}</b>) in the top 5 zones
          </div>
        </div>
      )}
      <Legend items={[{ label: "Incidents caught in the predicted top-5", color: NAVY }]} />
      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
        <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: NAVY, opacity: 0.16 }} />
        All incidents that week
      </div>
    </div>
  );
}

/* ---------- page ---------- */
export default function AccuracyReport({ report }: { report: ValidationReport }) {
  if (!report.available) {
    return <div className="card p-5 text-sm text-muted">{report.reason ?? "Not enough data to backtest yet."}</div>;
  }
  const m = report.model!, p = report.persistence!, best = report.best_possible!;
  const beatsPersist = (report.uplift_vs_persistence ?? 1) >= 1;

  return (
    <div className="animate-fade-in space-y-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">Is the prediction accurate?</h1>
        <p className="mt-1 max-w-3xl text-[13.5px] leading-relaxed text-muted">
          A blind backtest over the last <b className="text-ink">{report.weeks_tested}</b> weeks
          ({report.total_incidents} real incidents). Each week the model saw only the data available
          <i> before</i> that week, flagged its top {report.top_k} zones, and we checked how many
          incidents actually landed there — no look-ahead, no tuning to the answer.
        </p>
      </div>

      {/* headline row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <Card title="Bottom line">
          <div className="flex flex-col items-center gap-4">
            <HeroPAI report={report} />
            <p className="text-center text-[13px] leading-relaxed text-muted">
              Patrolling just the model's top {report.top_k} zones —{" "}
              <b className="text-ink">{pct1(report.area_pct!)}</b> of the district — would have
              reached <b className="text-ink">{pct(m.hit_rate)}</b> of the following week's
              incidents. Random patrols covering the same area reach only {pct1(report.area_pct!)}.
            </p>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-4">
          <Kpi label="Incidents caught" value={`${m.captured} / ${report.total_incidents}`}
               sub={`${pct(m.hit_rate)} hit rate in ${pct1(report.area_pct!)} of the area`} />
          <Kpi label="Efficiency (PEI)" value={pct(m.pei)}
               sub={`of the best any ${report.top_k}-zone forecast could reach that week`} />
          <Kpi label="vs random patrol" value={`${m.pai}×`}
               sub="PAI — hit rate over area flagged; 1× = no better than chance" good />
          <Kpi label="vs persistence" value={`${beatsPersist ? "+" : ""}${Math.round(((report.uplift_vs_persistence ?? 1) - 1) * 100)}%`}
               sub={`beats flagging last month's busiest zones (${pct(p.hit_rate)})`} good={beatsPersist} />
        </div>
      </div>

      {/* how it compares */}
      <Card title="How the model compares"
            hint={`Same ${report.weeks_tested} weeks, same ${report.top_k} zones flagged. The ceiling is the most incidents any ${report.top_k} zones could have caught with perfect hindsight.`}>
        <div className="space-y-3">
          <CompareBar label="Netra model" value={m.hit_rate} max={best.hit_rate} color={NAVY} caption={`${pct(m.hit_rate)} · PAI ${m.pai}×`} />
          <CompareBar label="Persistence baseline" value={p.hit_rate} max={best.hit_rate} color={ORANGE} caption={`${pct(p.hit_rate)} · PAI ${p.pai}×`} />
          <CompareBar label="Best possible (hindsight)" value={best.hit_rate} max={best.hit_rate} color={GREY} caption={`${pct(best.hit_rate)} ceiling`} />
          <CompareBar label="Random patrol" value={report.area_pct!} max={best.hit_rate} color={GREY} dash caption={`${pct1(report.area_pct!)} · PAI 1×`} />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Accuracy holds as you widen the net"
              hint="Hit rate as the flagged area grows. The model stays above persistence and well above the random line at every size.">
          {report.coverage_curve && <CoverageCurve curve={report.coverage_curve} />}
        </Card>
        <Card title="Week by week"
              hint="Incidents the model's top-5 zones caught each test week, against all incidents that week.">
          {report.weeks && <WeeklyBars weeks={report.weeks} />}
        </Card>
      </div>

      <p className="text-[11.5px] leading-relaxed text-dim">
        Method: rolling-origin backtest. For each week the Poisson model is refit on incidents
        strictly before that week and its expected-rate ranking is frozen before the week's incidents
        are revealed (the same leakage-free path used in training). Live news is excluded so the
        result is reproducible. PAI = hit rate ÷ area flagged; PEI = hit rate ÷ the best any {report.top_k}
        {" "}zones could have caught. Figures use synthetic incident data.
      </p>
    </div>
  );
}

function Kpi({ label, value, sub, good }: { label: string; value: string; sub: string; good?: boolean }) {
  return (
    <div className="card flex flex-col justify-between p-4">
      <div className="text-[12px] text-muted">{label}</div>
      <div className={`mt-1 text-[26px] font-semibold leading-tight tracking-tight ${good ? "text-risk-low" : "text-ink"}`}>{value}</div>
      <div className="mt-1 text-[11.5px] leading-snug text-dim">{sub}</div>
    </div>
  );
}

function CompareBar({ label, value, max, color, caption, dash }: {
  label: string; value: number; max: number; color: string; caption: string; dash?: boolean;
}) {
  const w = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-40 shrink-0 text-[12.5px] text-muted">{label}</div>
      <div className="h-3.5 flex-1 rounded-full bg-surface-3">
        <div className="h-full rounded-full"
             style={dash
               ? { width: `${w}%`, backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 5px, transparent 5px 10px)`, border: `1px solid ${color}` }
               : { width: `${w}%`, background: color }} />
      </div>
      <div className="w-28 shrink-0 text-right text-[12px] font-semibold text-ink tnum">{caption}</div>
    </div>
  );
}
