"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatTurn, PlanDecision } from "@/lib/types";
import Logo from "../Logo";

const MAX_CHARS = 500;

const SUGGESTIONS = [
  "I only have 8 units this week",
  "Keep 3 units at the top zone",
  "Why does zone 2 get more than zone 5?",
  "Reset to the original plan",
];
// To change the plan, say what to change; Approve / Reject record the decision.

const DECISION_LABEL: Record<string, string> = {
  accept: "Approved",
  modify: "Approved with changes",
  reject: "Rejected",
};

export type BriefMsg = ChatTurn & { blocked?: boolean; error?: boolean };

export default function BriefChat({
  msgs,
  busy,
  totalUnits,
  edited,
  newsAvailable,
  decision,
  onSend,
  onDecide,
  onClear,
}: {
  msgs: BriefMsg[];
  busy: boolean;
  totalUnits: number;
  edited: boolean;
  newsAvailable: boolean;
  decision: PlanDecision | null;
  onSend: (text: string) => void;
  /** records the decision; whatever is typed in the box goes along as the note */
  onDecide: (choice: "approve" | "reject", note: string) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  function decide(choice: "approve" | "reject") {
    if (busy) return;
    const note = draft.trim().slice(0, MAX_CHARS);
    setDraft("");
    onDecide(choice, note);
  }

  function send(text: string) {
    const q = text.trim().slice(0, MAX_CHARS);
    if (!q || busy) return;
    setDraft("");
    onSend(q);
  }

  return (
    <section
      aria-label="Adjust the plan with Netra"
      className="no-print flex h-full flex-col overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-pop"
    >
      <header className="flex items-center justify-between gap-3 border-b border-line bg-surface-2 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Logo size={24} />
          <div className="min-w-0 leading-tight">
            <div className="text-[13.5px] font-semibold text-ink">Adjust with Netra</div>
            <div className="truncate text-[11px] text-dim">
              Planning for <span className="font-semibold text-ink tnum">{totalUnits}</span> units
              {edited ? " · edited by you" : ""}
            </div>
          </div>
        </div>
        {msgs.length > 0 && (
          <button
            onClick={onClear}
            disabled={busy}
            className="rounded-md px-2 py-1 text-[11px] text-muted transition hover:bg-surface-3 hover:text-ink disabled:opacity-50"
          >
            Clear chat
          </button>
        )}
      </header>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
        <div className="rounded-lg border border-warn/20 bg-warn/[0.06] p-3">
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-warn/90">
            Before you decide
          </div>
          <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4 text-[12px] leading-relaxed text-muted">
            <li>Six months of one district is a small dataset — treat the ranking as a guide.</li>
            <li>Only place, time and crime type are used. No personal or demographic data.</li>
            <li>
              News and event signals are{" "}
              <b className="text-ink">{newsAvailable ? "included" : "unavailable"}</b>
              {newsAvailable ? "." : " — the core prediction is unaffected."}
            </li>
          </ul>
        </div>
        {msgs.length === 0 && (
          <div>
            <p className="text-[12.5px] leading-relaxed text-muted">
              Tell me how many units you can dispatch, or where you want some fixed. I will
              re-split the rest by risk and rewrite the brief.
            </p>
            <div className="mt-3 flex flex-col gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="card-interactive px-3 py-2 text-left text-[12.5px] text-ink"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {/* rendered as plain text — model output is never treated as HTML */}
            <div
              className={`max-w-[88%] whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-[12.5px] leading-relaxed ${
                m.role === "user"
                  ? "bg-core-dim text-white"
                  : m.error
                  ? "border border-risk-high/30 bg-risk-high/10 text-ink"
                  : m.blocked
                  ? "border border-warn/30 bg-warn/10 text-ink"
                  : "border border-line bg-surface-2 text-ink"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-[12px] text-muted">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-line border-t-core" />
              Re-planning…
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="border-t border-line bg-surface-2 p-3"
      >
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => decide("approve")}
            className="btn border border-ok/40 bg-ok/15 px-3 py-1.5 text-[12.5px] text-ok transition hover:bg-ok/25 disabled:opacity-50"
          >
            {edited ? "Approve with changes" : "Approve plan"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => decide("reject")}
            className="btn border border-risk-high/40 bg-risk-high/15 px-3 py-1.5 text-[12.5px] text-danger transition hover:bg-risk-high/25 disabled:opacity-50"
          >
            Reject
          </button>
          <span className="text-[11px] text-dim">
            {decision
              ? `${DECISION_LABEL[decision.action]} at ${decision.recorded_at.slice(11, 16)}`
              : "No decision recorded yet"}
          </span>
        </div>
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            rows={1}
            maxLength={MAX_CHARS}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(draft);
              }
            }}
            placeholder="Change the plan, ask, or add a note to your decision…"
            className="max-h-24 min-h-[38px] flex-1 resize-none rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none transition placeholder:text-dim focus:border-core"
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            className="btn-primary h-[38px] px-3"
            aria-label="Send"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M2.5 8h10M8.5 3.5L13 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <div className="mt-1.5 text-[10.5px] text-dim">
          Netra recommends; you decide. Approving only records your decision — nothing is
          dispatched.
        </div>
      </form>
    </section>
  );
}
