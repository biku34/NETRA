"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { FeedbackAction } from "@/lib/types";

const ACTIONS: { key: FeedbackAction; label: string; cls: string }[] = [
  { key: "accept", label: "Approve", cls: "border-ok/40 bg-ok/15 text-ok hover:bg-ok/25" },
  { key: "modify", label: "Modify", cls: "border-warn/40 bg-warn/15 text-warn hover:bg-warn/25" },
  { key: "reject", label: "Reject", cls: "border-risk-high/40 bg-risk-high/15 text-danger hover:bg-risk-high/25" },
];

export default function OverrideControls({ briefId, zone }: { briefId?: string; zone?: string }) {
  const [saved, setSaved] = useState<FeedbackAction | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(action: FeedbackAction) {
    setBusy(true);
    try {
      await api.feedback({ brief_id: briefId, zone, action, note: note || undefined });
      setSaved(action);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="no-print card p-4">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="section-label">Officer action{zone ? ` — ${zone}` : ""}</span>
        <span className="text-[10px] text-dim">Netra recommends; the SHO decides.</span>
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note (e.g. local intel, night patrol already assigned)…"
        className="mb-2.5 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink outline-none transition placeholder:text-dim focus:border-core"
      />
      <div className="flex flex-wrap items-center gap-2">
        {ACTIONS.map((a) => (
          <button
            key={a.key}
            disabled={busy}
            onClick={() => send(a.key)}
            className={`btn border transition ${a.cls} ${
              saved === a.key ? "ring-2 ring-accent/40" : ""
            }`}
          >
            {a.label}
          </button>
        ))}
        {saved && (
          <span className="text-xs text-muted">
            Recorded: <b className="capitalize text-ink">{saved}</b> — not auto-executed.
          </span>
        )}
      </div>
    </div>
  );
}
