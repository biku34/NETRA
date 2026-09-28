// React Query wrappers for the Ring 1 prediction endpoints.

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function usePredictions(topN = 5, refDate?: string | null) {
  return useQuery({
    queryKey: ["predict", topN, refDate ?? "latest"],
    queryFn: () => api.predict(topN, refDate ?? undefined),
    staleTime: 30_000,
  });
}

export function useSpikes(refDate?: string | null) {
  return useQuery({
    queryKey: ["spikes", refDate ?? "latest"],
    queryFn: () => api.spikes(refDate ?? undefined),
    staleTime: 30_000,
  });
}

export function useZone(h3: string | null) {
  return useQuery({
    queryKey: ["zone", h3],
    queryFn: () => api.zone(h3 as string),
    enabled: !!h3,
  });
}

export function useNews(refDate?: string | null) {
  return useQuery({
    queryKey: ["news", refDate ?? "latest"],
    queryFn: () => api.news(refDate ?? undefined),
    staleTime: 60_000,
  });
}

export function useFieldAlerts(limit = 20) {
  return useQuery({
    queryKey: ["field-alerts", limit],
    queryFn: () => api.fieldAlerts(limit),
    staleTime: 30_000,
  });
}

export function useAIAlerts(topN = 5, lang = "en") {
  return useQuery({
    queryKey: ["ai-alerts", topN, lang],
    queryFn: () => api.aiAlerts(topN, false, lang),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}
