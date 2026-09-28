"use client";

import { useEffect, useRef, useState } from "react";
import type { Driver, PredictZone } from "@/lib/types";

// Chart palette — validated against the light --surface (#ffffff) for CVD separation + contrast.
// Text never wears these; marks only.
export const VIZ = {
  series: "#2f5597",
  seriesHover: "#4a6ea8",
  avg: "#c2410c",
  up: "#b42318",
  down: "#2f5597",
  mute: "#c3cad5",
  muteHover: "#9aa5b5",
};

// Light-weight risk ramp for the ranked distribution: soft red (high) →
// soft amber (mid) → soft blue-grey (low). Kept desaturated so the chart reads
// as a gentle gradient, not an alarm.
const RANK_RAMP: { t: number; fill: string; hover: string }[] = [
  { t: 0.66, fill: "#e79a92", hover: "#d98479" }, // high
  { t: 0.33, fill: "#edc78f", hover: "#e3b673" }, // mid
  { t: 0, fill: "#c4d2e4", hover: "#a7bad6" }, // low
];

function rankColor(frac: number, hover: boolean): string {
  const band = RANK_RAMP.find((b) => frac >= b.t) ?? RANK_RAMP[RANK_RAMP.length - 1];
  return hover ? band.hover : band.fill;
}

/* ------------------------------------------------------------ helpers */
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

function niceTicks(max: number, target = 4) {
  const raw = Math.max(max, 1) / target;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((k) => k * p).find((s) => s >= raw) ?? 10 * p;
  const top = Math.ceil(max / step) * step || step;
  const list: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) list.push(+v.toFixed(6));
  return { top, list };
}

// column with a rounded data-end, square at the baseline
function columnPath(x: number, y: number, w: number, h: number, r = 4) {
  const k = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + k}Q${x},${y} ${x + k},${y}H${x + w - k}Q${x + w},${y} ${x + w},${y + k}V${y + h}Z`;
}

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));
const pct = (v: number, total: number) => (total ? `${Math.round((v / total) * 100)}%` : "—");

/* ------------------------------------------------------------ tooltip */
type TipRow = { label: string; value: string; color?: string };
type Tip = { x: number; y: number; title: string; rows: TipRow[] };

function TipBox({ tip, width }: { tip: Tip | null; width: number }) {
  if (!tip) return null;
  const flip = tip.x > width * 0.6;
  return (
    <div
      className="pointer-events-none absolute z-10 whitespace-nowrap rounded-md border border-line bg-surface px-2.5 py-2 shadow-pop"
      style={{
        left: tip.x,
        top: tip.y,
        transform: `translate(${flip ? "calc(-100% - 12px)" : "12px"}, -50%)`,
      }}
    >
      <div className="text-[10.5px] font-medium text-muted">{tip.title}</div>
      {tip.rows.map((r) => (
        <div key={r.label} className="mt-1 flex items-center gap-2 text-[11.5px]">
          {r.color && (
            <span className="h-[2px] w-3 rounded-full" style={{ background: r.color }} />
          )}
          <span className="font-semibold text-ink tnum">{r.value}</span>
          <span className="text-muted">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; line?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5 text-[11px] text-muted">
          <span
            className={it.line ? "h-[2px] w-3.5 rounded-full" : "h-2.5 w-2.5 rounded-[3px]"}
            style={{ background: it.color }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

function Axis({
  ticks,
  y,
  x1,
  x2,
}: {
  ticks: number[];
  y: (v: number) => number;
  x1: number;
  x2: number;
}) {
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={x1}
            x2={x2}
            y1={y(t)}
            y2={y(t)}
            stroke={t === 0 ? "var(--line-strong)" : "var(--line)"}
            strokeWidth={1}
          />
          <text
            x={x1 - 6}
            y={y(t) + 3}
            textAnchor="end"
            fontSize={10}
            fill="var(--dim)"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {t}
          </text>
        </g>
      ))}
    </g>
  );
}

/* ------------------------------------------------------------ column chart */
export function ColumnChart({
  values,
  tick,
  name,
  highlight,
  height = 200,
  unit = "incidents",
}: {
  values: number[];
  tick: (i: number) => string;
  name: (i: number) => string;
  highlight?: (i: number) => boolean;
  height?: number;
  unit?: string;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hi, setHi] = useState<number | null>(null);
  const m = { l: 28, r: 6, t: 18, b: 22 };
  const n = values.length;
  const total = values.reduce((a, b) => a + b, 0);
  const { top, list } = niceTicks(Math.max(1, ...values));
  const iw = Math.max(0, W - m.l - m.r);
  const ih = height - m.t - m.b;
  const band = iw / n;
  const bw = Math.min(24, Math.max(2, band - 2));
  const y = (v: number) => m.t + ih - (v / top) * ih;
  const maxI = values.indexOf(Math.max(...values));

  const tip: Tip | null =
    hi == null
      ? null
      : {
          x: m.l + (hi + 0.5) * band,
          y: Math.max(28, y(values[hi])),
          title: name(hi),
          rows: [
            { label: unit, value: fmt(values[hi]), color: VIZ.series },
            { label: "of total", value: pct(values[hi], total) },
          ],
        };

  return (
    <div ref={ref} className="relative" style={{ height }} onPointerLeave={() => setHi(null)}>
      {W > 0 && (
        <svg width={W} height={height} role="img" aria-label={`${unit} column chart`}>
          <Axis ticks={list} y={y} x1={m.l} x2={W - m.r} />
          {values.map((v, i) => {
            const on = highlight ? highlight(i) : true;
            const hov = hi === i;
            const x = m.l + i * band + (band - bw) / 2;
            const h = Math.max(v > 0 ? 2 : 0, m.t + ih - y(v));
            return (
              <g key={i}>
                {hov && (
                  <rect x={m.l + i * band} y={m.t} width={band} height={ih} fill="#17212f" opacity={0.04} />
                )}
                {h > 0 && (
                  <path
                    d={columnPath(x, m.t + ih - h, bw, h)}
                    fill={
                      on
                        ? hov
                          ? VIZ.seriesHover
                          : VIZ.series
                        : hov
                        ? VIZ.muteHover
                        : VIZ.mute
                    }
                    style={{ transition: "fill 120ms" }}
                  />
                )}
                {i === maxI && v > 0 && (
                  <text
                    x={x + bw / 2}
                    y={m.t + ih - h - 5}
                    textAnchor="middle"
                    fontSize={10.5}
                    fontWeight={600}
                    fill="var(--ink)"
                  >
                    {fmt(v)}
                  </text>
                )}
                {tick(i) && (
                  <text
                    x={m.l + (i + 0.5) * band}
                    y={height - 6}
                    textAnchor="middle"
                    fontSize={10}
                    fill={hov ? "var(--ink)" : "var(--dim)"}
                  >
                    {tick(i)}
                  </text>
                )}
                <rect
                  x={m.l + i * band}
                  y={m.t}
                  width={band}
                  height={ih + m.b}
                  fill="transparent"
                  onPointerEnter={() => setHi(i)}
                  onPointerMove={() => setHi(i)}
                />
              </g>
            );
          })}
        </svg>
      )}
      <TipBox tip={tip} width={W} />
    </div>
  );
}

/* ------------------------------------------------------------ weekly history */
const monthOf = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { month: "short" });
export const dayOf = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export function movingAverage(values: number[], k = 4) {
  return values.map((_, i) => {
    const s = values.slice(Math.max(0, i - k + 1), i + 1);
    return s.reduce((a, b) => a + b, 0) / s.length;
  });
}

export function HistoryChart({
  points,
  height = 250,
}: {
  points: { week_start: string; count: number }[];
  height?: number;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hi, setHi] = useState<number | null>(null);
  const m = { l: 28, r: 34, t: 14, b: 22 };
  const values = points.map((p) => p.count);
  const avg = movingAverage(values);
  const n = values.length;
  const { top, list } = niceTicks(Math.max(1, ...values));
  const iw = Math.max(0, W - m.l - m.r);
  const ih = height - m.t - m.b;
  const band = n ? iw / n : 0;
  const bw = Math.min(24, Math.max(2, band - 2));
  const cx = (i: number) => m.l + (i + 0.5) * band;
  const y = (v: number) => m.t + ih - (v / top) * ih;
  const line = avg.map((v, i) => `${i ? "L" : "M"}${cx(i).toFixed(1)},${y(v).toFixed(1)}`).join("");

  const tip: Tip | null =
    hi == null
      ? null
      : {
          x: cx(hi),
          y: m.t + 34,
          title: `Week of ${dayOf(points[hi].week_start)}`,
          rows: [
            { label: "incidents", value: fmt(values[hi]), color: VIZ.series },
            { label: "4-week average", value: avg[hi].toFixed(1), color: VIZ.avg },
          ],
        };

  return (
    <div ref={ref} className="relative" style={{ height }} onPointerLeave={() => setHi(null)}>
      {W > 0 && n > 0 && (
        <svg width={W} height={height} role="img" aria-label="Weekly incident history">
          <Axis ticks={list} y={y} x1={m.l} x2={W - m.r} />
          {hi != null && (
            <line
              x1={cx(hi)}
              x2={cx(hi)}
              y1={m.t}
              y2={m.t + ih}
              stroke="var(--line-strong)"
              strokeWidth={1}
            />
          )}
          {values.map((v, i) => {
            const h = Math.max(v > 0 ? 2 : 0, m.t + ih - y(v));
            return h > 0 ? (
              <path
                key={i}
                d={columnPath(cx(i) - bw / 2, m.t + ih - h, bw, h)}
                fill={hi === i ? VIZ.seriesHover : VIZ.series}
                opacity={hi == null || hi === i ? 1 : 0.55}
                style={{ transition: "opacity 120ms, fill 120ms" }}
              />
            ) : null;
          })}
          <path
            d={line}
            fill="none"
            stroke={VIZ.avg}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle
            cx={cx(hi ?? n - 1)}
            cy={y(avg[hi ?? n - 1])}
            r={4}
            fill={VIZ.avg}
            stroke="var(--surface)"
            strokeWidth={2}
          />
          {hi == null && (
            <text
              x={cx(n - 1) + 9}
              y={y(avg[n - 1]) + 3.5}
              fontSize={10.5}
              fontWeight={600}
              fill="var(--ink)"
            >
              {avg[n - 1].toFixed(1)}
            </text>
          )}
          {points.map((p, i) =>
            i === 0 || monthOf(p.week_start) !== monthOf(points[i - 1].week_start) ? (
              <text
                key={p.week_start}
                x={cx(i)}
                y={height - 6}
                textAnchor="middle"
                fontSize={10}
                fill="var(--dim)"
              >
                {monthOf(p.week_start)}
              </text>
            ) : null
          )}
          <rect
            x={m.l}
            y={m.t}
            width={iw}
            height={ih + m.b}
            fill="transparent"
            onPointerMove={(e) => {
              const box = e.currentTarget.getBoundingClientRect();
              const i = Math.floor((e.clientX - box.left) / band);
              setHi(Math.min(n - 1, Math.max(0, i)));
            }}
          />
        </svg>
      )}
      <TipBox tip={tip} width={W} />
    </div>
  );
}

/* ------------------------------------------------------------ precinct ranking */
export function RankStrip({
  zones,
  current,
  onSelect,
  height = 200,
}: {
  zones: PredictZone[];
  current: string;
  onSelect: (h3: string) => void;
  height?: number;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hi, setHi] = useState<number | null>(null);
  const m = { l: 28, r: 6, t: 26, b: 20 };
  const n = zones.length;
  const values = zones.map((z) => z.expected_count);
  const { top, list } = niceTicks(Math.max(1, ...values));
  const iw = Math.max(0, W - m.l - m.r);
  const ih = height - m.t - m.b;
  const band = n ? iw / n : 0;
  const bw = Math.min(24, Math.max(1.5, band - 2));
  const y = (v: number) => m.t + ih - (v / top) * ih;
  const cur = zones.findIndex((z) => z.h3_r8 === current);

  const z = hi != null ? zones[hi] : null;
  const tip: Tip | null =
    z && hi != null
      ? {
          x: m.l + (hi + 0.5) * band,
          y: Math.max(40, y(values[hi])),
          title: `#${hi + 1} · ${z.name ?? z.h3_r8.slice(0, 10)}`,
          rows: [
            { label: "expected / 7d", value: z.expected_count.toFixed(2) },
            { label: "risk", value: `${Math.round(z.probability * 100)}%` },
            ...(hi === cur ? [] : [{ label: "to open", value: "Click" }]),
          ],
        }
      : null;

  return (
    <div ref={ref} className="relative" style={{ height }} onPointerLeave={() => setHi(null)}>
      {W > 0 && n > 0 && (
        <svg width={W} height={height} role="img" aria-label="Zones ranked by expected incidents">
          <Axis ticks={list} y={y} x1={m.l} x2={W - m.r} />
          {zones.map((zn, i) => {
            const h = Math.max(1.5, m.t + ih - y(values[i]));
            const isCur = i === cur;
            const hov = i === hi;
            return (
              <g key={zn.h3_r8}>
                <path
                  d={columnPath(m.l + i * band + (band - bw) / 2, m.t + ih - h, bw, h, 2)}
                  fill={
                    isCur
                      ? hov
                        ? VIZ.seriesHover
                        : VIZ.series
                      : rankColor(values[i] / top, hov)
                  }
                />
                <rect
                  x={m.l + i * band}
                  y={m.t}
                  width={band}
                  height={ih + m.b}
                  fill="transparent"
                  style={{ cursor: isCur ? "default" : "pointer" }}
                  onPointerEnter={() => setHi(i)}
                  onPointerMove={() => setHi(i)}
                  onClick={() => !isCur && onSelect(zn.h3_r8)}
                />
              </g>
            );
          })}
          {cur >= 0 && (
            <g pointerEvents="none">
              <line
                x1={m.l + (cur + 0.5) * band}
                x2={m.l + (cur + 0.5) * band}
                y1={14}
                y2={Math.max(14, y(values[cur]) - 3)}
                stroke="var(--muted)"
                strokeWidth={1}
              />
              <text
                x={m.l + (cur + 0.5) * band}
                y={10}
                textAnchor={cur < n * 0.15 ? "start" : cur > n * 0.85 ? "end" : "middle"}
                fontSize={10.5}
                fontWeight={600}
                fill="var(--ink)"
              >
                This zone · #{cur + 1}
              </text>
            </g>
          )}
          <text x={m.l} y={height - 5} fontSize={10} fill="var(--dim)">
            #1 highest
          </text>
          <text x={W - m.r} y={height - 5} fontSize={10} fill="var(--dim)" textAnchor="end">
            #{n} lowest
          </text>
        </svg>
      )}
      <TipBox tip={tip} width={W} />
    </div>
  );
}

/* ------------------------------------------------------------ drivers (diverging) */
export function DriverChart({ drivers }: { drivers: Driver[] }) {
  const [hi, setHi] = useState<string | null>(null);
  const pos = Math.max(0, ...drivers.map((d) => d.contribution));
  const neg = Math.max(0, ...drivers.map((d) => -d.contribution));
  const span = pos + neg || 1;
  // keep the zero line off the very edge so the axis reads as diverging
  const zero = Math.min(0.5, Math.max(neg / span, 0.08)) * 100;
  const scale = (100 - zero) / (pos || span);
  const nscale = neg ? zero / neg : 0;

  return (
    <div onPointerLeave={() => setHi(null)}>
      <div className="mb-3">
        <Legend
          items={[
            { label: "▲ raises risk", color: VIZ.up },
            { label: "▼ lowers risk", color: VIZ.down },
          ]}
        />
      </div>
      <div className="flex flex-col">
        {drivers.map((d) => {
          const up = d.contribution >= 0;
          const w = Math.max(0.8, Math.abs(d.contribution) * (up ? scale : nscale));
          const on = hi === d.name;
          return (
            <div
              key={d.name}
              tabIndex={0}
              onPointerEnter={() => setHi(d.name)}
              onFocus={() => setHi(d.name)}
              onBlur={() => setHi(null)}
              className={`-mx-2 rounded-lg px-2 py-[7px] outline-none transition-colors ${
                on ? "bg-surface-2" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-[190px] shrink-0 truncate text-[12.5px] text-muted">
                  <span className="mr-1.5 text-[9px] text-dim">{up ? "▲" : "▼"}</span>
                  <span className={on ? "text-ink" : ""}>{d.label}</span>
                </div>
                <div className="relative h-3.5 flex-1">
                  <div
                    className="absolute inset-y-[-5px] w-px bg-line-strong"
                    style={{ left: `${zero}%` }}
                  />
                  <div
                    className="absolute inset-y-0"
                    style={{
                      background: up ? VIZ.up : VIZ.down,
                      width: `${w}%`,
                      borderRadius: up ? "0 4px 4px 0" : "4px 0 0 4px",
                      ...(up ? { left: `${zero}%` } : { right: `${100 - zero}%` }),
                      opacity: hi == null || on ? 1 : 0.5,
                      transition: "opacity 120ms",
                    }}
                  />
                </div>
                <div className="w-14 shrink-0 text-right text-[12px] font-semibold text-ink tnum">
                  ×{Math.exp(d.contribution).toFixed(2)}
                </div>
              </div>
              {on && (
                <div className="mt-1.5 flex gap-4 pl-[202px] text-[11px] text-muted animate-fade-in">
                  <span>
                    feature value <b className="font-semibold text-ink tnum">{d.value}</b>
                  </span>
                  <span>
                    log-rate{" "}
                    <b className="font-semibold text-ink tnum">
                      {d.contribution >= 0 ? "+" : "−"}
                      {Math.abs(d.contribution).toFixed(3)}
                    </b>
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ crime mix */
export function MixBars({ entries }: { entries: [string, number][] }) {
  const [hi, setHi] = useState<string | null>(null);
  const max = Math.max(1, ...entries.map((e) => e[1]));
  const total = entries.reduce((a, e) => a + e[1], 0);
  return (
    <div className="flex flex-col" onPointerLeave={() => setHi(null)}>
      {entries.map(([k, v]) => {
        const on = hi === k;
        return (
          <div
            key={k}
            tabIndex={0}
            onPointerEnter={() => setHi(k)}
            onFocus={() => setHi(k)}
            onBlur={() => setHi(null)}
            className={`-mx-2 flex items-center gap-3 rounded-lg px-2 py-[5px] outline-none transition-colors ${
              on ? "bg-surface-2" : ""
            }`}
          >
            <div
              className={`w-[120px] shrink-0 truncate text-[12.5px] capitalize ${
                on ? "text-ink" : "text-muted"
              }`}
            >
              {k.replace(/_/g, " ")}
            </div>
            <div className="h-3 flex-1">
              <div
                className="h-full"
                style={{
                  width: `${(v / max) * 100}%`,
                  minWidth: 3,
                  borderRadius: "0 4px 4px 0",
                  background: on ? VIZ.seriesHover : VIZ.series,
                  opacity: hi == null || on ? 1 : 0.5,
                  transition: "opacity 120ms, background 120ms",
                }}
              />
            </div>
            <div className="w-[72px] shrink-0 text-right text-[12px] tnum">
              <span className="font-semibold text-ink">{v}</span>
              <span className="ml-1.5 text-dim">{pct(v, total)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------ figures */
export function RiskGauge({ value, color, size = 184 }: { value: number; color: string; size?: number }) {
  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;
  const arc = 0.75 * c;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(value));
    return () => cancelAnimationFrame(id);
  }, [value]);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label={`Risk ${Math.round(value * 100)} percent`}>
        <g transform={`rotate(135 ${size / 2} ${size / 2})`} fill="none" strokeLinecap="round" strokeWidth={10}>
          <circle cx={size / 2} cy={size / 2} r={r} stroke={color} opacity={0.16} strokeDasharray={`${arc} ${c}`} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeDasharray={`${Math.max(0.001, arc * shown)} ${c}`}
            style={{ transition: "stroke-dasharray 900ms cubic-bezier(0.16,1,0.3,1)" }}
          />
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-[52px] font-extrabold leading-none tracking-tight text-ink">
          {Math.round(value * 100)}
          <span className="text-2xl font-bold text-muted">%</span>
        </div>
        <div className="mt-1.5 text-[10.5px] uppercase tracking-[0.08em] text-dim">
          risk · next 7 days
        </div>
      </div>
    </div>
  );
}

export function Sparkline({ values, w = 92, h = 30 }: { values: number[]; w?: number; h?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => [
    4 + (i / (values.length - 1)) * (w - 8),
    h - 4 - (v / max) * (h - 8),
  ]);
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} aria-hidden>
      <path
        d={pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("")}
        fill="none"
        stroke="var(--dim)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last[0]} cy={last[1]} r={3} fill={VIZ.seriesHover} />
    </svg>
  );
}
