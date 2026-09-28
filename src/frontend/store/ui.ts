// Zustand UI state: pinned hexes + time window.

import { create } from "zustand";
import type { TimeWindow } from "@/lib/types";

export const MAX_PINNED = 2;

interface UIState {
  /** hexes pinned on the map, oldest first (at most MAX_PINNED) */
  pinnedHexes: string[];
  /** the most recently pinned hex, or null */
  selectedHex: string | null;
  window: TimeWindow;
  refDate: string | null;
  /** pin a hex (or unpin it if already pinned); null clears every pin */
  setSelectedHex: (h: string | null) => void;
  unpinHex: (h: string) => void;
  setWindow: (w: TimeWindow) => void;
  setRefDate: (d: string | null) => void;
}

const withPins = (pins: string[]) => ({
  pinnedHexes: pins,
  selectedHex: pins.length ? pins[pins.length - 1] : null,
});

export const useUI = create<UIState>((set) => ({
  pinnedHexes: [],
  selectedHex: null,
  window: "28d",
  refDate: null,
  setSelectedHex: (h) =>
    set((s) => {
      if (h === null) return withPins([]);
      if (s.pinnedHexes.includes(h)) return withPins(s.pinnedHexes.filter((p) => p !== h));
      // a third pin replaces the oldest one
      return withPins([...s.pinnedHexes, h].slice(-MAX_PINNED));
    }),
  unpinHex: (h) => set((s) => withPins(s.pinnedHexes.filter((p) => p !== h))),
  setWindow: (w) => set({ window: w }),
  setRefDate: (d) => set({ refDate: d }),
}));
