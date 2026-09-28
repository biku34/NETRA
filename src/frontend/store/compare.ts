// Zustand store for the Compare tool (zones dragged in for AI comparison).

import { create } from "zustand";

const MAX = 6;

interface CompareState {
  open: boolean;
  items: string[]; // h3 ids
  setOpen: (o: boolean) => void;
  toggle: () => void;
  add: (h3: string) => void;
  remove: (h3: string) => void;
  clear: () => void;
}

export const useCompare = create<CompareState>((set) => ({
  open: false,
  items: [],
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
  add: (h3) =>
    set((s) =>
      s.items.includes(h3) || s.items.length >= MAX
        ? { open: true }
        : { items: [...s.items, h3], open: true }
    ),
  remove: (h3) => set((s) => ({ items: s.items.filter((x) => x !== h3) })),
  clear: () => set({ items: [] }),
}));
