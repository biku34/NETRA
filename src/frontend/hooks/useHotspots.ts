// React Query wrapper for the hotspots endpoint.

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { TimeWindow } from "@/lib/types";

export function useHotspots(window: TimeWindow, refDate?: string | null) {
  return useQuery({
    queryKey: ["hotspots", window, refDate ?? "latest"],
    queryFn: () => api.hotspots(window, refDate ?? undefined),
    staleTime: 30_000,
  });
}

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => api.health(),
    refetchInterval: 15_000,
  });
}
