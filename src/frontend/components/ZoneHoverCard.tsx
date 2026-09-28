"use client";

import Link from "next/link";
import type { PredictZone } from "@/lib/types";
import { confidenceFor } from "@/lib/confidence";
import { useT } from "@/lib/i18n";
import { useCompare } from "@/store/compare";
import ConfidenceBadge from "./ConfidenceBadge";
import RationaleBlock from "./RationaleBlock";

const CARD_W = 312;

function riskColor(t: number) {
  if (t >= 0.66) return "var(--risk-high)";
  if (t >= 0.33) return "var(--risk-mid)";
  return "var(--risk-low)";
}

export default function ZoneHoverCard({
  zone,
  pinned = false,
  compact = false,
  x = 0,
  y = 0,
  onEnter,
  onLeave,
  onClose,
}: {
  zone: PredictZone;
  pinned?: boolean;
  /** drop the rationale paragraph so two pinned cards fit one below the other */
  compact?: boolean;
  x?: number;
  y?: number;
  onEnter?: () => void;
  onLeave?: () => void;
  onClose?: () => void;
}) {
  const t = useT();
  const addCompare = useCompare((s) => s.add);
  const conf = confidenceFor(zone.probability, zone.drivers);
  const events = zone.news_events?.length ?? 0;
  const pct = Math.round(zone.probability * 100);

  // floating cards follow the cursor and flip to stay on-screen; pinned cards
  // sit in the map's docked stack so the "Go in" button is easy to click.
  let posStyle: React.CSSProperties;
  if (pinned) {
    posStyle = { width: CARD_W };
  } else {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const left = x + CARD_W + 24 > vw ? Math.max(8, x - CARD_W - 16) : x + 16;
    const top = Math.min(Math.max(84, y - 20), vh - 340);
    posStyle = { left, top, width: CARD_W };
  }

  return (
    <div
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      draggable={pinned}
      onDragStart={
        pinned
          ? (e) => {
              e.dataTransfer.setData("text/h3", zone.h3_r8);
              e.dataTransfer.effectAllowed = "copy";
            }
          : undefined
      }
      style={{
        ...posStyle,
        transition: pinned ? undefined : "left .07s ease-out, top .07s ease-out",
        background: "var(--surface-2)",
      }}
      className={`pointer-events-auto overflow-hidden rounded-2xl border shadow-pop ${
        pinned
          ? "relative shrink-0 animate-dock-in cursor-grab border-line-strong ring-1 ring-black/5 active:cursor-grabbing"
          : "absolute z-40 animate-pop-in border-line-strong"
      }`}
    >
      <div className="h-1 w-full" style={{ background: riskColor(zone.risk_score) }} />

      <div className="p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {zone.rank && (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-surface-3 text-[10px] font-bold text-muted tnum">
                  {zone.rank}
                </span>
              )}
              <span className="truncate text-[15px] font-bold tracking-tight text-ink">
                {zone.name ?? zone.h3_r8.slice(0, 12)}
              </span>
              {pinned && (
                <span className="ml-0.5 rounded bg-core/15 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-core">
                  {t("PINNED")}
                </span>
              )}
            </div>
            <div className="mt-0.5 font-mono text-[10px] text-dim">{zone.h3_r8}</div>
          </div>
          <div className="flex shrink-0 items-start gap-2">
            <div className="text-right">
              <div className="text-2xl font-extrabold leading-none tracking-tight text-ink tnum">
                {pct}
                <span className="text-base font-bold text-muted">%</span>
              </div>
              <div className="mt-0.5 text-[10px] uppercase tracking-wide text-dim">
                {t("risk · 7d")}
              </div>
            </div>
            {pinned && onClose && (
              <button
                onClick={onClose}
                aria-label="Close"
                className="-mr-1 -mt-1 rounded-md p-1 text-dim transition hover:bg-surface-2 hover:text-ink"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-muted">
          <ConfidenceBadge level={conf} />
          <span className="tnum">≈ {zone.expected_count.toFixed(2)} {t("expected")}</span>
          {events > 0 && (
            <span className="badge border-aug/30 bg-aug/10 text-aug">
              {events} {t("news/event")}
            </span>
          )}
        </div>

        {zone.rationale && !compact && (
          <p className="mt-2.5 line-clamp-3 text-[12px] leading-relaxed text-muted">
            {zone.rationale}
          </p>
        )}

        <div className="mt-2.5">
          <div className="section-label mb-1.5">{t("Top drivers")}</div>
          <RationaleBlock drivers={zone.drivers} max={3} />
        </div>

        <div className="mt-3.5 flex items-center gap-2">
          <Link href={`/zone/${zone.h3_r8}`} className="btn-primary flex-1">
            {t("Go in — full details")}
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <button
            onClick={() => addCompare(zone.h3_r8)}
            title={t("Add to compare")}
            aria-label={t("Add to compare")}
            className="btn-ghost shrink-0 px-2.5"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M8 2v12M3 5h10M3 5l-1.5 3.5a2 2 0 003 0L3 5zm10 0l-1.5 3.5a2 2 0 003 0L13 5z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
