"use client";

import Link from "next/link";
import type { BriefPlanResponse, PlanDecision, PlanZone } from "@/lib/types";
import EmailBriefButton from "./EmailBriefButton";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function day(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return m && d ? `${d} ${MONTHS[m - 1]}` : iso;
}

function units(n: number): string {
  return `${n} ${n === 1 ? "unit" : "units"}`;
}

const DECISION_LABEL: Record<string, string> = {
  accept: "Approved",
  modify: "Approved with changes",
  reject: "Rejected",
};

const DECISION_STYLE: Record<string, string> = {
  accept: "border-ok/30 bg-ok/10 text-ok",
  modify: "border-ok/30 bg-ok/10 text-ok",
  reject: "border-risk-high/30 bg-risk-high/10 text-danger",
  none: "border-line bg-surface-3 text-muted",
};

const SPIKE_STYLE: Record<string, string> = {
  seasonal: "border-aug/30 bg-aug/10 text-aug",
  event_linked: "border-alert/30 bg-alert/10 text-alert",
  emerging: "border-risk-high/30 bg-risk-high/10 text-danger",
};

/** A margin note: sits beside its section on wide screens, under it on narrow ones. */
function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <aside className="rounded-lg border border-warn/20 bg-warn/[0.06] p-3 text-[12px] leading-relaxed text-muted">
      <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-warn/90">
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
          <path d="M3 2.5h10v8l-3 3H3z M10 13.5v-3h3" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        {title}
      </div>
      {children}
    </aside>
  );
}

function Section({
  n,
  title,
  notes,
  children,
}: {
  n: number;
  title: string;
  notes: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="brief-section grid gap-4 lg:grid-cols-[minmax(0,1fr)_230px]">
      <div className="card p-5">
        <h2 className="mb-3 flex items-center gap-2.5 text-[15px] font-bold tracking-tight text-ink">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-core/15 text-[12px] font-bold text-core tnum">
            {n}
          </span>
          {title}
        </h2>
        {children}
      </div>
      <div className="flex flex-col gap-3">{notes}</div>
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-3.5 py-3">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="mt-0.5 text-[22px] font-bold leading-tight tracking-tight text-ink tnum">
        {value}
      </div>
      {sub && <div className="text-[11px] text-dim">{sub}</div>}
    </div>
  );
}

function UnitDots({ zone }: { zone: PlanZone }) {
  const max = Math.max(zone.current_units, zone.suggested_units);
  return (
    <div className="flex flex-wrap gap-1" aria-hidden>
      {Array.from({ length: max }).map((_, i) => {
        const kept = i < Math.min(zone.current_units, zone.suggested_units);
        const added = !kept && i < zone.suggested_units;
        return (
          <span
            key={i}
            className={`h-2.5 w-2.5 rounded-[3px] ${
              kept
                ? "bg-core"
                : added
                ? "bg-ok"
                : "border border-dashed border-line-strong bg-transparent"
            }`}
          />
        );
      })}
    </div>
  );
}

function ZoneRow({ z }: { z: PlanZone }) {
  const trend = z.last_4_weeks - z.prior_4_weeks;
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-4">
      {/* header: who + how risky */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-[13px] font-bold text-ink tnum">
            #{z.rank}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-[15px] font-semibold text-ink">
                {z.name ?? "Micro-zone"}
              </span>
              {z.pinned && (
                <span className="badge border-info/30 bg-info/10 text-info">
                  fixed by you
                </span>
              )}
            </div>
            <div className="font-mono text-[10.5px] text-dim">{z.h3_r8}</div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[20px] font-bold leading-none text-ink tnum">
            {Math.round(z.probability * 100)}%
          </div>
          <div className="mt-0.5 text-[10.5px] text-dim">
            ~{z.expected_count.toFixed(1)} expected
          </div>
        </div>
      </div>

      {/* the action: how many units, and when to be there */}
      <div className="mt-3 flex flex-wrap items-stretch gap-2">
        <div className="flex flex-1 items-center gap-3 rounded-lg border border-line bg-surface/50 px-3.5 py-2.5">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-dim">
              Deploy
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="text-[16px] font-bold text-ink tnum">
                {z.current_units} <span className="text-dim">→</span> {z.suggested_units}
              </span>
              <span
                className={`text-[12px] font-bold tnum ${
                  z.delta > 0 ? "text-ok" : z.delta < 0 ? "text-warn" : "text-dim"
                }`}
              >
                {z.delta > 0 ? `+${z.delta}` : z.delta < 0 ? z.delta : "="}
              </span>
            </div>
          </div>
          <div className="ml-auto">
            <UnitDots zone={z} />
          </div>
        </div>

        <div className="flex items-center gap-2.5 rounded-lg border border-line bg-surface/50 px-3.5 py-2.5">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 text-core">
            <circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.4" />
            <path d="M8 4.8V8l2.2 1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-dim">
              Be there
            </div>
            <div className="text-[15px] font-bold text-ink tnum">{z.peak_window ?? "—"}</div>
          </div>
          {z.busiest_day && (
            <span className="chip ml-1 border-line bg-surface-3 text-muted">
              {z.busiest_day}s
            </span>
          )}
        </div>
      </div>

      {/* the note */}
      <p className="mt-3 text-[13px] leading-relaxed text-ink/90">{z.note}</p>

      {/* quiet context: trend + crime mix + event */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px]">
        <span className="text-dim">
          Last 4 wks{" "}
          <span className="font-semibold text-ink tnum">{z.last_4_weeks}</span>{" "}
          <span
            className={`font-semibold ${
              trend > 0 ? "text-danger" : trend < 0 ? "text-ok" : "text-dim"
            }`}
          >
            {trend > 0 ? `▲${trend}` : trend < 0 ? `▼${-trend}` : "steady"}
          </span>{" "}
          <span className="text-dim">vs {z.prior_4_weeks}</span>
        </span>
        <span className="text-line-strong">·</span>
        <div className="flex flex-wrap gap-1.5">
          {z.top_crimes.map((c) => (
            <span key={c} className="chip capitalize">
              {c}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap gap-1.5">
          {z.events.slice(0, 1).map((e) => (
            <span
              key={e}
              className="chip max-w-full truncate border-aug/30 text-aug"
              title={e}
            >
              {e}
            </span>
          ))}
        </div>
        <Link
          href={`/zone/${z.h3_r8}`}
          className="no-print btn-ghost shrink-0 px-2.5 py-1 text-[11.5px]"
        >
          View details →
        </Link>
      </div>
    </div>
  );
}

export default function BriefViewer({
  plan,
  updating = false,
  decision = null,
}: {
  plan: BriefPlanResponse;
  updating?: boolean;
  decision?: PlanDecision | null;
}) {
  const edited = plan.constraints.total_units !== null || Object.keys(plan.constraints.pinned).length > 0;
  const up = plan.zones.filter((z) => z.delta > 0);
  const down = plan.zones.filter((z) => z.delta < 0);

  return (
    <div className={`flex flex-col gap-4 transition-opacity ${updating ? "opacity-60" : ""}`}>
      {/* header */}
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="section-label">Weekly patrol brief</div>
            <h1 className="mt-1 text-[24px] font-extrabold leading-tight tracking-tight text-ink">
              {plan.district}
            </h1>
            <div className="mt-1 text-[13px] text-muted">
              Week of {day(plan.week_start)} – {day(plan.week_end)} · data up to{" "}
              {day(plan.ref_date)}
            </div>
            <div className="mt-2">
              <span className={`badge ${DECISION_STYLE[decision?.action ?? "none"]}`}>
                {decision
                  ? `${DECISION_LABEL[decision.action]} · ${decision.recorded_at.slice(11, 16)}`
                  : "Awaiting your decision"}
              </span>
            </div>
          </div>
          <div className="no-print flex items-center gap-2">
            <EmailBriefButton plan={plan} />
            <button onClick={() => window.print()} className="btn-ghost">
              Print / PDF
            </button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Units available"
            value={String(plan.total_units)}
            sub={
              plan.total_units === plan.default_total_units
                ? "station strength"
                : `station strength is ${plan.default_total_units}`
            }
          />
          <Stat
            label="Units placed"
            value={String(plan.allocated_units)}
            sub={plan.reserve_units ? `${units(plan.reserve_units)} in reserve` : "none in reserve"}
          />
          <Stat label="Priority zones" value={String(plan.zones.length)} sub="ranked by risk" />
          <Stat label="Spikes flagged" value={String(plan.spikes.length)} sub="unusual jumps" />
        </div>
        {plan.warnings.map((w) => (
          <div
            key={w}
            className="mt-3 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-[12.5px] text-warn"
          >
            {w}
          </div>
        ))}
      </div>

      <Section
        n={1}
        title="This week in short"
        notes={
          <Note title="How to use this">
            Read section 1, act on section 2. Every figure comes from the prediction model; only
            the sentences are written by AI.
          </Note>
        }
      >
        <p className="text-[14.5px] leading-relaxed text-ink/90">{plan.summary}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
          {up.length > 0 && (
            <span className="chip border-ok/30 text-ok">
              More units: {up.map((z) => `#${z.rank}`).join(", ")}
            </span>
          )}
          {down.length > 0 && (
            <span className="chip border-warn/30 text-warn">
              Fewer units: {down.map((z) => `#${z.rank}`).join(", ")}
            </span>
          )}
          {edited && (
            <span className="chip border-info/30 text-info">Plan edited by you</span>
          )}
        </div>
      </Section>

      <Section
        n={2}
        title="Where to put your units"
        notes={
          <>
            <Note title="Reading a card">
              <b className="text-ink">3 → 2</b> means 3 units there today, 2 suggested. The
              percentage is the chance of at least one incident in that zone this week.
            </Note>
            <Note title="How units are split">
              In proportion to risk, highest rank first. Zones you fix in the chat keep their
              number; the rest is re-split.
            </Note>
            <Note title="Same name twice?">
              Zones are 0.7 km² hexagons named after the nearest landmark, so neighbours can
              share a name. The code under the name tells them apart.
            </Note>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {plan.zones.map((z) => (
            <ZoneRow key={z.h3_r8} z={z} />
          ))}
        </div>
      </Section>

      <Section
        n={3}
        title="Unusual jumps to watch"
        notes={
          <Note title="What the labels mean">
            <b className="text-ink">Seasonal</b>: explained by a festival.{" "}
            <b className="text-ink">Event-linked</b>: near a known event.{" "}
            <b className="text-ink">Emerging</b>: no known cause — worth a closer look.
          </Note>
        }
      >
        {plan.spikes.length === 0 ? (
          <p className="text-[13px] text-muted">Nothing unusual above the threshold this week.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {plan.spikes.map((s, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <span className={`badge ${SPIKE_STYLE[s.label] ?? SPIKE_STYLE.emerging}`}>
                  {s.label.replace("_", "-")}
                </span>
                <span className="text-[13.5px] font-medium capitalize text-ink">
                  {s.crime_type}
                </span>
                <span className="text-[12.5px] text-muted">
                  {s.name ?? s.h3_r8.slice(0, 10)}
                </span>
                <span className="ml-auto text-[12.5px] text-muted tnum">
                  <b className="text-ink">{s.recent}</b> this week vs usual {s.baseline}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="text-center text-[11px] text-dim">
        Brief {plan.brief_id.slice(0, 8)} · generated {plan.generated_at.replace("T", " ")}
      </div>
    </div>
  );
}
