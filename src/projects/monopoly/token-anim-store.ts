"use client";

import { create } from "zustand";

/** Transient UI state shared between `Squares` and its SquareRows.
 *
 *  While a token slides from its old square to its new one on the overlay layer
 *  (see `Squares`), the destination SquareRow must hide its static copy of that
 *  token so the two don't show at once. `hidePos` is stored alongside `hideId`
 *  so each SquareRow can subscribe with a position-keyed selector and only the
 *  destination row re-renders.
 *
 *  `lanePitch` is the horizontal distance between player lanes (px). `Squares`
 *  publishes it from the measured board width + roster size; every SquareRow's
 *  TokenStrip and the moving-token overlay read it so static and animated
 *  tokens share one lane layout. See `lanes.ts`. */
interface TokenAnimState {
  hideId: string | null;
  hidePos: number | null;
  lanePitch: number;
  hide: (id: string, position: number) => void;
  clear: () => void;
  setLanePitch: (pitch: number) => void;
}

export const useTokenAnim = create<TokenAnimState>((set) => ({
  hideId: null,
  hidePos: null,
  lanePitch: 0,
  hide: (id, position) => set({ hideId: id, hidePos: position }),
  clear: () => set({ hideId: null, hidePos: null }),
  setLanePitch: (pitch) => set({ lanePitch: pitch }),
}));
