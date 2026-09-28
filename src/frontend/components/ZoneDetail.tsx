"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ZoneDetail as ZoneDetailT } from "@/lib/types";
import { confidenceFor } from "@/lib/confidence";
import { usePredictions } from "@/hooks/usePredictions";
import ConfidenceBadge from "./ConfidenceBadge";
import OverrideControls from "./OverrideControls";
import Logo from "./Logo";
import ZoneChat from "./zone/ZoneChat";
import {
  ColumnChart,
  DriverChart,
  HistoryChart,
  Legend,
  MixBars,
  RankStrip,
  RiskGauge,
  Sparkline,
  VIZ,
  dayOf,
  movingAverage,
} from "./zone/charts";

const ZoneMiniMap = dynamic(() => import("./zone/ZoneMiniMap"), {
  ssr: false,
  loading: () => <div className="skeleton h-full w-full rounded-lg" />,
});

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DOW_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const share = (v: number, total: number) => (total ? `${Math.round((v / total) * 100)}%` : "—");

/* ------------------------------------------------------------ layout */
type TableData = { head: string[]; rows: (string | number)[][] };

function Panel({
  title,
  hint,
  table,
  className = "",
  children,
}: {
  title: string;
  hint?: string;
  table?: TableData;
  className?: string;
  children: React.ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className={`card flex min-w-0 flex-col p-5 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[13.5px] font-semibold text-ink">{title}</h2>
          {hint && <p className="mt-0.5 text-[11.5px] text-dim">{hint}</p>}
        </div>
        {table && (
          <button
            onClick={() => setAsTable((v) => !v)}
            aria-pressed={asTable}
            className="no-print shrink-0 rounded-md border border-line bg-surface-2 px-2 py-1 text-[11px] font-medium text-muted transition hover:border-line-strong hover:text-ink"
          >
            {asTable ? "Chart" : "Table"}
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1">
        {asTable && table ? <DataTable {...table} /> : children}
      </div>
    </section>
  );
}

function DataTable({ head, rows }: TableData) {
  return (
    <div className="max-h-[260px] overflow-y-auto rounded-lg border border-line">
      <table className="w-full text-[12px]">
        <thead className="sticky top-0 bg-surface-2">
          <tr>
            {head.map((h, i) => (
              <th
                key={h}
                className={`px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wide text-dim ${
                  i ? "text-right" : "text-left"
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line hover:bg-surface-2">
              {r.map((c, j) => (
                <td
                  key={j}
                  className={`px-3 py-1.5 ${
                    j ? "text-right text-ink tnum" : "text-left capitalize text-muted"
                  }`}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  delta,
  children,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: { text: string; bad: boolean } | null;
  children?: React.ReactNode;
}) {
  return (
    <div className="card-interactive flex items-end justify-between gap-2 p-4">
      <div className="min-w-0">
        <div className="text-[11.5px] text-muted">{label}</div>
        <div className="mt-1 truncate text-[22px] font-bold capitalize leading-tight tracking-tight text-ink">
          {value}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-dim">
          {delta && (
            <span className={`font-semibold ${delta.bad ? "text-danger" : "text-ok"}`}>
              {delta.text}
            </span>
          )}
          {sub}
        </div>
      </div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------ page */
export default function ZoneDetail({ zone }: { zone: ZoneDetailT }) {
  const router = useRouter();
  const { data: pred } = usePredictions(5);
  const [copied, setCopied] = useState(false);

  const zones = pred?.zones ?? [];
  const idx = zones.findIndex((z) => z.h3_r8 === zone.h3_r8);
  const me = idx >= 0 ? zones[idx] : null;
  const prev = idx > 0 ? zones[idx - 1] : null;
  const next = idx >= 0 && idx < zones.length - 1 ? zones[idx + 1] : null;
  const open = (h3: string) => router.push(`/zone/${h3}`);

  const p = zone.probability ?? 0;
  const level = p >= 0.66 ? "High" : p >= 0.33 ? "Elevated" : "Low";
  const levelColor =
    p >= 0.66 ? "var(--risk-high)" : p >= 0.33 ? "var(--risk-mid)" : "var(--risk-low)";
  const conf = zone.probability != null ? confidenceFor(zone.probability, zone.drivers) : null;

  const peak = zone.peak_window;
  const inPeak = (h: number) => {
    if (!peak) return false;
    const [s, e] = peak;
    return s <= e ? h >= s && h < e : h >= s || h < e;
  };
  const hourTotal = sum(zone.hourly);
  const peakCount = sum(zone.hourly.filter((_, h) => inPeak(h)));

  const mix = Object.entries(zone.crime_mix).sort((a, b) => b[1] - a[1]);
  const mixTotal = sum(mix.map((e) => e[1]));

  const dowTotal = sum(zone.dow);
  const busiest = zone.dow.indexOf(Math.max(...zone.dow));

  const counts = zone.history.map((h) => h.count);
  const last4 = sum(counts.slice(-4));
  const prior4 = sum(counts.slice(-8, -4));
  const diff = last4 - prior4;
  const avg = movingAverage(counts);

  const drivers = [...zone.drivers].sort(
    (a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)
  );

  return (
    <div className="mx-auto w-full max-w-[1920px] animate-fade-in px-5 py-5 pb-20">
      <ZoneChat key={zone.h3_r8} h3={zone.h3_r8} zoneName={zone.name ?? "Micro-zone"} />
      {/* title row */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="truncate text-[22px] font-extrabold tracking-tight text-ink">
              {zone.name ?? "Micro-zone"}
            </h1>
            <span
              className="badge gap-1.5 border-line-strong bg-surface-2 text-ink"
              title="7-day risk level"
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: levelColor }} />
              {level} risk
            </span>
            {idx >= 0 && (
              <span className="chip text-muted">
                Rank <b className="font-semibold text-ink tnum">#{idx + 1}</b> of {zones.length}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-dim">
            <button
              onClick={() => {
                navigator.clipboard?.writeText(zone.h3_r8);
                setCopied(true);
                setTimeout(() => setCopied(false), 1400);
              }}
              className="font-mono transition hover:text-ink"
              title="Copy H3 index"
            >
              {zone.h3_r8} {copied ? "· copied" : "⧉"}
            </button>
            <span className="tnum">
              {zone.centroid.lat.toFixed(4)}°N, {zone.centroid.lng.toFixed(4)}°E
            </span>
            {pred && (
              <span>
                as of {dayOf(pred.ref_date)} · model {pred.model_used}
              </span>
            )}
          </div>
        </div>
        <div className="no-print flex items-center gap-2">
          <button
            disabled={!prev}
            onClick={() => prev && open(prev.h3_r8)}
            className="btn-ghost"
            title={prev ? `#${idx} · ${prev.name ?? prev.h3_r8}` : undefined}
          >
            ← Higher risk
          </button>
          <button
            disabled={!next}
            onClick={() => next && open(next.h3_r8)}
            className="btn-ghost"
            title={next ? `#${idx + 2} · ${next.name ?? next.h3_r8}` : undefined}
          >
            Lower risk →
          </button>
          <Link href="/brief" className="btn-primary">
            SHO brief
          </Link>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        <Kpi
          label="Expected incidents"
          value={me ? me.expected_count.toFixed(1) : "—"}
          sub="forecast · next 7 days"
        />
        <Kpi label="Incidents recorded" value={String(zone.total_incidents)} sub="past 6 months">
          <Sparkline values={counts} />
        </Kpi>
        <Kpi
          label="Last 4 weeks"
          value={String(last4)}
          sub="vs prior 4 weeks"
          delta={
            diff === 0
              ? { text: "±0", bad: false }
              : { text: `${diff > 0 ? "▲ +" : "▼ −"}${Math.abs(diff)}`, bad: diff > 0 }
          }
        />
        <Kpi
          label="Peak window"
          value={peak ? `${hh(peak[0])}–${hh(peak[1])}` : "—"}
          sub={peak ? `${share(peakCount, hourTotal)} of incidents` : undefined}
        />
        <Kpi
          label="Top crime"
          value={mix[0]?.[0].replace(/_/g, " ") ?? "—"}
          sub={mix[0] ? `${share(mix[0][1], mixTotal)} of incidents` : undefined}
        />
        <Kpi
          label="Busiest day"
          value={dowTotal ? DOW_LONG[busiest] : "—"}
          sub={dowTotal ? `${share(zone.dow[busiest], dowTotal)} of incidents` : undefined}
        />
      </div>

      {/* risk · history · map */}
      <div className="mt-3 grid grid-cols-12 gap-3">
        <section className="card col-span-12 flex flex-col overflow-hidden lg:col-span-6 2xl:col-span-4">
          <div className="h-1 w-full" style={{ background: levelColor }} />
          <div className="flex flex-1 flex-col gap-4 p-5">
            <div className="flex flex-wrap items-center gap-5">
              {zone.probability != null ? (
                <RiskGauge value={zone.probability} color={levelColor} />
              ) : (
                <div className="text-sm text-dim">No forecast for this zone.</div>
              )}
              <dl className="flex min-w-[150px] flex-1 flex-col gap-2.5 text-[12.5px]">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted">Confidence</dt>
                  <dd>{conf ? <ConfidenceBadge level={conf} /> : "—"}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted">Primary driver</dt>
                  <dd className="truncate font-semibold text-ink">{drivers[0]?.label ?? "—"}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted">Risk score</dt>
                  <dd className="font-semibold text-ink tnum">
                    {me ? me.risk_score.toFixed(2) : "—"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted">Patrol focus</dt>
                  <dd className="font-semibold text-ink tnum">
                    {peak ? `${hh(peak[0])}–${hh(peak[1])}` : "—"}
                  </dd>
                </div>
              </dl>
            </div>
            {zone.rationale && (
              <div className="rounded-lg border border-line bg-surface-2 p-3.5">
                <div className="mb-1.5 flex items-center gap-2">
                  <Logo size={18} />
                  <span className="section-label">Netra&rsquo;s rationale</span>
                </div>
                <p className="text-[13px] leading-relaxed text-ink/90">{zone.rationale}</p>
              </div>
            )}
          </div>
        </section>

        <Panel
          className="col-span-12 lg:col-span-6 2xl:col-span-5"
          title="Weekly incident history"
          hint={
            zone.history.length
              ? `${dayOf(zone.history[0].week_start)} – ${dayOf(
                  zone.history[zone.history.length - 1].week_start
                )} · hover for a week`
              : undefined
          }
          table={{
            head: ["Week of", "Incidents", "4-wk avg"],
            rows: zone.history.map((h, i) => [dayOf(h.week_start), h.count, avg[i].toFixed(1)]),
          }}
        >
          <div className="mb-2">
            <Legend
              items={[
                { label: "Weekly incidents", color: VIZ.series },
                { label: "4-week average", color: VIZ.avg, line: true },
              ]}
            />
          </div>
          <HistoryChart points={zone.history} height={262} />
        </Panel>

        <Panel
          className="col-span-12 2xl:col-span-3"
          title="Location & neighbours"
          hint="Click a neighbouring hex to open it"
        >
          <div className="h-[290px] 2xl:h-full 2xl:min-h-[290px]">
            <ZoneMiniMap
              zones={zones}
              current={zone.h3_r8}
              centroid={zone.centroid}
              onSelect={open}
            />
          </div>
        </Panel>
      </div>

      {/* drivers · hour · day */}
      <div className="mt-3 grid grid-cols-12 gap-3">
        <Panel
          className="col-span-12 xl:col-span-5"
          title="Why this zone — ranked drivers"
          hint="× = multiplier on the expected incident rate · hover for detail"
          table={{
            head: ["Driver", "Value", "Log-rate", "Multiplier"],
            rows: drivers.map((d) => [
              d.label,
              d.value,
              d.contribution.toFixed(3),
              `×${Math.exp(d.contribution).toFixed(2)}`,
            ]),
          }}
        >
          <DriverChart drivers={drivers} />
        </Panel>

        <Panel
          className="col-span-12 md:col-span-7 xl:col-span-4"
          title="Hour-of-day profile"
          hint={peak ? `Highlighted = peak window ${hh(peak[0])}–${hh(peak[1])}` : undefined}
          table={{
            head: ["Hour", "Incidents", "Share"],
            rows: zone.hourly.map((v, h) => [`${hh(h)}–${hh((h + 1) % 24)}`, v, share(v, hourTotal)]),
          }}
        >
          <ColumnChart
            values={zone.hourly}
            height={248}
            highlight={peak ? inPeak : undefined}
            tick={(i) => (i % 3 === 0 ? String(i).padStart(2, "0") : "")}
            name={(i) => `${hh(i)}–${hh((i + 1) % 24)}${inPeak(i) ? " · peak window" : ""}`}
          />
        </Panel>

        <Panel
          className="col-span-12 md:col-span-5 xl:col-span-3"
          title="Day-of-week profile"
          hint="Highlighted = busiest day"
          table={{
            head: ["Day", "Incidents", "Share"],
            rows: zone.dow.map((v, i) => [DOW_LONG[i], v, share(v, dowTotal)]),
          }}
        >
          <ColumnChart
            values={zone.dow}
            height={248}
            highlight={(i) => i === busiest}
            tick={(i) => DOW[i]}
            name={(i) => DOW_LONG[i]}
          />
        </Panel>
      </div>

      {/* mix · ranking · action */}
      <div className="mt-3 grid grid-cols-12 gap-3">
        <Panel
          className="col-span-12 lg:col-span-6 xl:col-span-4"
          title="Crime mix"
          hint={`${mixTotal} incidents across ${mix.length} categories`}
          table={{
            head: ["Category", "Incidents", "Share"],
            rows: mix.map(([k, v]) => [k.replace(/_/g, " "), v, share(v, mixTotal)]),
          }}
        >
          <MixBars entries={mix} />
        </Panel>

        <Panel
          className="col-span-12 lg:col-span-6 xl:col-span-5"
          title="Where this zone sits in the precinct"
          hint="Expected incidents next 7 days, all zones by rank · click a bar to open that zone"
          table={{
            head: ["Zone", "Expected / 7d", "Risk"],
            rows: zones.map((z, i) => [
              `#${i + 1} ${z.name ?? z.h3_r8}`,
              z.expected_count.toFixed(2),
              `${Math.round(z.probability * 100)}%`,
            ]),
          }}
        >
          {zones.length ? (
            <RankStrip zones={zones} current={zone.h3_r8} onSelect={open} height={270} />
          ) : (
            <div className="skeleton h-[270px] rounded-lg" />
          )}
        </Panel>

        <div className="col-span-12 flex flex-col gap-3 xl:col-span-3">
          <OverrideControls zone={zone.name ?? zone.h3_r8} />
          <Panel
            className="flex-1"
            title="Correlated news & events"
            hint="Augmentation layer"
          >
            {zone.news_events && zone.news_events.length > 0 ? (
              <div className="flex flex-col gap-2">
                {zone.news_events.map((it, i) => {
                  const body = (
                    <>
                      <span className="badge shrink-0 border-aug/30 bg-aug/10 text-aug">
                        {it.type}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-ink">{it.title}</span>
                        <span className="block text-[11px] text-dim">
                          {it.location ?? "—"}
                          {it.date ? ` · ${it.date.slice(0, 10)}` : ""}
                        </span>
                      </span>
                    </>
                  );
                  const cls = "card-interactive flex items-center gap-2.5 p-2.5";
                  return it.url ? (
                    <a key={i} href={it.url} target="_blank" rel="noopener noreferrer" className={cls}>
                      {body}
                    </a>
                  ) : (
                    <div key={i} className={cls}>
                      {body}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[12.5px] leading-relaxed text-dim">
                No news or events are geo-linked to this hex. Precinct-wide signals are already
                folded into the drivers above.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
