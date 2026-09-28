"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import PageChrome from "@/components/PageChrome";
import AccuracyReport from "@/components/AccuracyReport";

export default function AccuracyPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["validation", 5],
    queryFn: () => api.validation(5),
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });

  return (
    <div className="min-h-screen pb-16 lg:pb-0 lg:pl-60">
      <PageChrome crumb="Prediction accuracy" />
      <div className="mx-auto w-full max-w-[1200px] px-5 py-6">
        {isLoading && (
          <div className="flex flex-col items-center gap-3 py-24 text-muted">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
            <span className="text-sm">Backtesting the model against the last weeks of incidents…</span>
          </div>
        )}
        {error && (
          <div className="card p-5 text-sm text-risk-high">
            Could not run the backtest. Make sure the backend is running and the dataset is loaded.
          </div>
        )}
        {data && <AccuracyReport report={data} />}
      </div>
    </div>
  );
}
