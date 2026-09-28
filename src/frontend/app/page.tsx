"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { useHealth } from "@/hooks/useHotspots";
import { usePredictions, useNews } from "@/hooks/usePredictions";
import { api } from "@/lib/api";
import Logo from "@/components/Logo";
import { MobileModules, ModuleTabs } from "@/components/PageChrome";
import { portalHref } from "@/lib/portal";
import AlertsPanel from "@/components/AlertsPanel";
import MapLegend from "@/components/MapLegend";
import LangSelector from "@/components/LangSelector";
import ComparePanel from "@/components/ComparePanel";
import { useT } from "@/lib/i18n";
import { useCompare } from "@/store/compare";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

// Temporarily hidden chrome — flip to true to restore.
const SHOW_BANNER = false;
const SHOW_HEADER_ACTIONS = false;

function MapSkeleton() {
  const t = useT();
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-dim">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-core" />
        <span className="text-sm">{t("Loading district map…")}</span>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="hidden items-baseline gap-1.5 lg:flex">
      <span className="text-[11px] uppercase tracking-wide text-dim">{label}</span>
      <span className="text-[13px] font-semibold text-ink tnum">{value}</span>
    </div>
  );
}

export default function Dashboard() {
  const t = useT();
  const compareOpen = useCompare((s) => s.open);
  const compareCount = useCompare((s) => s.items.length);
  const toggleCompare = useCompare((s) => s.toggle);
  const { data, isLoading, error, refetch } = usePredictions(5);
  const { data: newsData, refetch: refetchNews } = useNews();
  const { data: health } = useHealth();
  const [busy, setBusy] = useState(false);

  const zones = data?.zones ?? [];
  const newsLabel = data?.news_available
    ? newsData?.gdelt_ok
      ? "GDELT live"
      : "dataset"
    : "off";

  async function generate() {
    setBusy(true);
    try {
      await api.ingest(true);
      await Promise.all([refetch(), refetchNews()]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-bg">
      {/* Map — fills everything left of the alerts panel */}
      <div className="absolute inset-y-0 left-0 right-[22rem]">
        {isLoading ? <MapSkeleton /> : <MapView zones={zones} />}
        {zones.length > 0 && <MapLegend />}
      </div>

      {/* Top chrome */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20">
        {/* standing decision-support banner (CR-3) — hidden for now */}
        {SHOW_BANNER && (
          <div className="flex items-center justify-center gap-1.5 bg-warn/[0.07] py-[5px] text-[11px] font-medium text-warn/90 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-warn" />
            Decision support — for SHO review &amp; approval. Not an automated order.
          </div>
        )}

        <header className="pointer-events-auto flex items-center justify-between gap-4 border-b border-line bg-surface/95 px-4 py-2.5 backdrop-blur">
          <div className="flex items-center gap-5">
           <a href={portalHref("/")} className="flex items-center gap-3" title="Netra — Overview">
            <Logo size={30} />
            <div className="leading-none">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-extrabold tracking-tight text-ink">
                  Netra
                </span>
                <span className="hidden text-[13px] font-medium text-muted 2xl:inline">
                  {t("Unified Crime Intelligence Platform")}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-ok" />
                </span>
                <span className="text-[11px] text-dim">{t("Gandhinagar District")}</span>
              </div>
            </div>
           </a>
            {/* the platform's modules; this page is Hotspots */}
            <ModuleTabs />
          </div>

          {/* right side: compare + language selector (always) + optional actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleCompare}
              aria-pressed={compareOpen}
              className={`btn-ghost relative ${
                compareOpen ? "border-core/50 bg-core/10 text-core" : ""
              }`}
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M8 2v12M3 5h10M3 5l-1.5 3.5a2 2 0 003 0L3 5zm10 0l-1.5 3.5a2 2 0 003 0L13 5z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {t("Compare")}
              {compareCount > 0 && (
                <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-core px-1 text-[10px] font-bold text-white tnum">
                  {compareCount}
                </span>
              )}
            </button>
            {SHOW_HEADER_ACTIONS && (
              <>
                <div className="flex items-center gap-4 border-r border-line pr-4">
                  <Metric label={t("Incidents")} value={health ? String(health.incidents) : "…"} />
                  <Metric label={t("Model")} value={data?.model_used ?? "…"} />
                  <Metric label={t("News")} value={newsLabel} />
                </div>
                <Link href="/brief" className="btn-primary">
                  {t("Generate SHO brief")}
                </Link>
                <button onClick={generate} disabled={busy} className="btn-ghost">
                  {busy ? t("Generating…") : t("Regenerate")}
                </button>
              </>
            )}
            <Link href="/accuracy" className="btn-ghost hidden md:inline-flex">
              {t("Accuracy")}
            </Link>
            <Link href="/brief" className="btn-ghost hidden md:inline-flex">
              {t("Weekly SHO brief")}
            </Link>
            <LangSelector />
          </div>
        </header>
      </div>

      <MobileModules />

      {/* Always-on panel: news + field alerts */}
      <AlertsPanel />

      {/* Compare tool overlay (over the map area) */}
      <ComparePanel />

      {error && (
        <div className="absolute inset-y-0 left-0 right-[22rem] z-10 flex items-center justify-center p-6">
          <div className="card max-w-sm p-5 text-center text-sm text-risk-high">
            Cannot reach the backend at{" "}
            <code className="font-mono text-xs">{process.env.NEXT_PUBLIC_API_BASE}</code>.
            Start it, then reload the page.
          </div>
        </div>
      )}
    </div>
  );
}
