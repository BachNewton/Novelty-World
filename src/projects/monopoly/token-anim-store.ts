"use client";

import { create } from "zustand";

/** Transient UI state for the moving-token animation. While a token slides
 *  from its old square to its new one on the overlay layer (see `Squares`),
 *  the destination SquareRow must hide its static copy of that token so the
 *  two don't show at once. `hidePos` is stored alongside `hideId` so each
 *  SquareRow can subscribe with a position-keyed selector and only the
 *  destination row re-renders. */
interface TokenAnimState {
  hideId: string | null;
  hidePos: number | null;
  hide: (id: string, position: number) => void;
  clear: () => void;
}

export const useTokenAnim = create<TokenAnimState>((set) => ({
  hideId: null,
  hidePos: null,
  hide: (id, position) => set({ hideId: id, hidePos: position }),
  clear: () => set({ hideId: null, hidePos: null }),
}));
