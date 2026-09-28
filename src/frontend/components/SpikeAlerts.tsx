"use client";

import type { Spike } from "@/lib/types";
import { useUI } from "@/store/ui";

const LABEL_STYLE: Record<Spike["label"], string> = {
  seasonal: "border-aug/30 bg-aug/10 text-aug",
  event_linked: "border-alert/30 bg-alert/10 text-alert",
  emerging: "border-risk-high/30 bg-risk-high/10 text-danger",
};

const LABEL_TEXT: Record<Spike["label"], string> = {
  seasonal: "seasonal",
  event_linked: "event-linked",
  emerging: "emerging",
};

export default function SpikeAlerts({ spikes = [] }: { spikes?: Spike[] }) {
  const setSelectedHex = useUI((s) => s.setSelectedHex);
  if (!spikes.length) return null;
  const shown = spikes.slice(0, 6);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="section-label">Spike alerts</h3>
        <span className="text-[11px] text-dim tnum">{spikes.length}</span>
      </div>
      {shown.map((s) => (
        <button
          key={`${s.h3_r8}-${s.crime_type}`}
          onClick={() => setSelectedHex(s.h3_r8)}
          className="card-interactive flex items-center gap-2.5 p-2.5 text-left"
        >
          <span className={`badge shrink-0 ${LABEL_STYLE[s.label]}`}>
            {LABEL_TEXT[s.label]}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium capitalize text-ink">
              {s.crime_type.replace(/_/g, " ")}
            </span>
            <span className="block text-[11px] text-dim">
              {s.name ?? s.h3_r8.slice(0, 10)} · z=<span className="tnum">{s.z.toFixed(1)}</span>{" "}
              · <span className="tnum">{s.recent}</span> vs{" "}
              <span className="tnum">{s.baseline.toFixed(1)}</span>
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
