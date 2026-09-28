"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { BriefPlanResponse, PlanDecision } from "@/lib/types";
import BriefViewer from "@/components/BriefViewer";
import BriefChat, { type BriefMsg } from "@/components/brief/BriefChat";
import PageChrome from "@/components/PageChrome";

const MAX_TURNS = 10; // mirrors the backend cap; older turns are dropped

export default function BriefPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["brief-plan"],
    queryFn: () => api.briefPlan({}),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  // the plan as last adjusted in the chat; falls back to the baseline
  const [adjusted, setAdjusted] = useState<BriefPlanResponse | null>(null);
  const [msgs, setMsgs] = useState<BriefMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState<PlanDecision | null>(null);
  const plan = adjusted ?? data;

  function fail(e: unknown) {
    const limited = e instanceof Error && e.message.includes("429");
    setMsgs((m) => [
      ...m,
      {
        role: "assistant",
        error: true,
        content: limited
          ? "Too many requests in a short time — please wait a few minutes."
          : "I could not reach the server just now. Please try again.",
      },
    ]);
  }

  // Approve / Reject buttons: records the decision on the plan as it stands
  async function decide(choice: "approve" | "reject", note: string) {
    if (!plan || busy) return;
    const label = choice === "approve" ? "Approve this plan" : "Reject this plan";
    setMsgs((m) => [...m, { role: "user", content: note ? `${label} — ${note}` : label }]);
    setBusy(true);
    try {
      const res = await api.briefPlan({
        constraints: plan.constraints,
        brief_id: plan.brief_id,
        decision: choice,
        note: note || undefined,
      });
      setDecision(res.decision);
      setMsgs((m) => [...m, { role: "assistant", content: res.reply ?? "Recorded." }]);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function send(text: string) {
    if (!plan || busy) return;
    const next: BriefMsg[] = [...msgs, { role: "user", content: text }];
    setMsgs(next);
    setBusy(true);
    try {
      // only real exchanges go back as history — never error or refusal bubbles
      const history = next
        .filter((m) => !m.error && !m.blocked)
        .map(({ role, content }) => ({ role, content }))
        .slice(-MAX_TURNS);
      while (history.length && history[0].role !== "user") history.shift();
      const res = await api.briefPlan({
        messages: history,
        constraints: plan.constraints,
        brief_id: plan.brief_id,
      });
      if (res.decision) {
        // a typed approve/reject: keep the plan and its wording as they are
        setDecision(res.decision);
      } else if (!res.blocked) {
        const same = JSON.stringify(res.constraints) === JSON.stringify(plan.constraints);
        if (!same) setDecision(null); // a changed plan needs a fresh decision
        setAdjusted(res);
      }
      setMsgs((m) => [
        ...m,
        { role: "assistant", content: res.reply ?? "Done.", blocked: res.blocked },
      ]);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen pb-16 lg:pb-0 lg:pl-60">
      <PageChrome crumb="Weekly SHO brief" />
      {isLoading && (
        <div className="flex flex-col items-center gap-3 py-24 text-dim">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-core" />
          <span className="text-sm">Netra is drafting the weekly brief…</span>
        </div>
      )}
      {error && (
        <div className="mx-auto max-w-3xl px-5 py-10">
          <div className="card p-5 text-sm text-risk-high">
            Could not build the brief. Make sure the backend is running and the dataset is loaded.
          </div>
        </div>
      )}
      {plan && (
        <div className="brief-layout mx-auto grid w-full max-w-[1500px] gap-5 px-5 py-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="order-2 min-w-0 xl:order-1">
            <BriefViewer plan={plan} updating={busy} decision={decision} />
          </div>
          <div className="order-1 h-[560px] xl:sticky xl:top-[70px] xl:order-2 xl:h-[calc(100vh-90px)]">
            <BriefChat
              msgs={msgs}
              busy={busy}
              totalUnits={plan.total_units}
              edited={
                plan.constraints.total_units !== null ||
                Object.keys(plan.constraints.pinned).length > 0
              }
              newsAvailable={plan.news_available}
              decision={decision}
              onSend={send}
              onDecide={decide}
              onClear={() => setMsgs([])}
            />
          </div>
        </div>
      )}
    </div>
  );
}
