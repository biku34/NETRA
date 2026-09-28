"use client";

import { useT } from "@/lib/i18n";

export default function MapLegend() {
  const t = useT();
  return (
    <div className="pointer-events-none absolute bottom-6 left-4 z-10 animate-fade-in rounded-xl border border-line bg-surface/95 p-3 shadow-card backdrop-blur">
      <div className="section-label mb-1.5">{t("Risk · next 7 days")}</div>
      <div
        className="h-2 w-44 rounded-full"
        style={{
          background:
            "linear-gradient(90deg, #c4e2d0, #268c5a 35%, #e09e14 65%, #b42318)",
        }}
      />
      <div className="mt-1 flex w-44 justify-between text-[10px] text-dim">
        <span>{t("lower")}</span>
        <span>{t("higher")}</span>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
        <span className="inline-block h-3 w-3 rounded-[3px] border-2 border-ink/80" />
        {t("top-5 priority zone")}
      </div>
    </div>
  );
}
