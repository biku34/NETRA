"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { ChatTurn } from "@/lib/types";
import Logo from "../Logo";

const MAX_CHARS = 500;
const MAX_TURNS = 10; // mirrors the backend cap; older turns are dropped

const SUGGESTIONS = [
  "Why is this zone's risk what it is?",
  "When should patrols focus here?",
  "What crimes are most common?",
  "Is activity rising or falling?",
];

type Msg = ChatTurn & { blocked?: boolean; error?: boolean };

export default function ZoneChat({ h3, zoneName }: { h3: string; zoneName: string }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function send(text: string) {
    const q = text.trim().slice(0, MAX_CHARS);
    if (!q || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs(next);
    setDraft("");
    setBusy(true);
    try {
      // only real exchanges go back as history — never error or refusal bubbles
      const history = next
        .filter((m) => !m.error && !m.blocked)
        .map(({ role, content }) => ({ role, content }))
        .slice(-MAX_TURNS);
      while (history.length && history[0].role !== "user") history.shift();
      const res = await api.zoneChat(h3, history);
      setMsgs((m) => [...m, { role: "assistant", content: res.reply, blocked: res.blocked }]);
    } catch (e) {
      const limited = e instanceof Error && e.message.includes("429");
      setMsgs((m) => [
        ...m,
        {
          role: "assistant",
          error: true,
          content: limited
            ? "Too many questions in a short time — please wait a few minutes."
            : "The assistant is unavailable right now. Please try again.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="no-print fixed bottom-20 right-5 z-40 lg:bottom-5 flex flex-col items-end gap-3">
      {open && (
        <section
          role="dialog"
          aria-label="Zone assistant"
          className="flex h-[min(540px,calc(100vh-7rem))] w-[min(380px,calc(100vw-2.5rem))] animate-pop-in flex-col overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-pop"
        >
          <header className="flex items-center justify-between gap-3 border-b border-line bg-surface-2 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <Logo size={24} />
              <div className="min-w-0 leading-tight">
                <div className="text-[13.5px] font-semibold text-ink">Ask Netra</div>
                <div className="truncate text-[11px] text-dim">
                  {zoneName} · this page&rsquo;s data only
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {msgs.length > 0 && (
                <button
                  onClick={() => setMsgs([])}
                  disabled={busy}
                  className="rounded-md px-2 py-1 text-[11px] text-muted transition hover:bg-surface-3 hover:text-ink disabled:opacity-50"
                >
                  Clear
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                aria-label="Close assistant"
                className="rounded-md p-1.5 text-dim transition hover:bg-surface-3 hover:text-ink"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
            {msgs.length === 0 && (
              <div>
                <p className="text-[12.5px] leading-relaxed text-muted">
                  Ask about this zone&rsquo;s risk, drivers, timing, incident history or crime mix.
                  I only know what is shown on this page.
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
                  {m.content.replace(/\*\*/g, "").replace(/[  ]/g, " ")}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1 rounded-xl border border-line bg-surface-2 px-3 py-2.5">
                  {[0, 1, 2].map((d) => (
                    <span
                      key={d}
                      className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted"
                      style={{ animationDelay: `${d * 160}ms` }}
                    />
                  ))}
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
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={draft}
                rows={1}
                maxLength={MAX_CHARS}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(draft);
                  }
                  if (e.key === "Escape") setOpen(false);
                }}
                placeholder="Ask about this zone…"
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
            <div className="mt-1.5 flex justify-between text-[10.5px] text-dim">
              <span>Decision support · verify before acting</span>
              <span className="tnum">
                {draft.length}/{MAX_CHARS}
              </span>
            </div>
          </form>
        </section>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="btn-primary h-11 gap-2 rounded-full px-4 shadow-pop"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M2.5 4.5a2 2 0 012-2h7a2 2 0 012 2v4.5a2 2 0 01-2 2H7l-3 2.5v-2.5a2 2 0 01-1.500-2z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
        {open ? "Close" : "Ask Netra"}
      </button>
    </div>
  );
}
