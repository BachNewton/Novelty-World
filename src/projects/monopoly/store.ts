"use client";

import { create } from "zustand";
import { apply, autoStep, createRng } from "./engine";
import { MOCK_STATE } from "./mocks";
import type { ApplyResult, GameState, Intent } from "./types";

interface MonopolyActions {
  /** Set this client's player id (assigned during lobby join). */
  setMyPlayer: (playerId: string) => void;

  /** Host: validate and apply an intent, then drain mechanics via autoStep
   *  until the next decision point. Returns the full result including the
   *  combined event stream so callers can drive animations or replay. */
  submit: (intent: Intent) => ApplyResult;

  /** Guest: replace local state with authoritative state from the host. */
  applyStateUpdate: (state: GameState) => void;

  /** Reset back to the mock state — dev-only. */
  reset: () => void;
}

export type MonopolyStore = {
  myPlayerId: string | null;
  /** Authoritative game state. Seeded with MOCK_STATE for visual dev; will
   *  be replaced by a Supabase-backed row once the multiplayer wiring lands. */
  state: GameState;
} & MonopolyActions;

export const useMonopolyStore = create<MonopolyStore>((set, get) => ({
  myPlayerId: null,
  state: MOCK_STATE,

  setMyPlayer: (playerId) => set({ myPlayerId: playerId }),

  submit: (intent) => {
    const { state } = get();
    const rng = createRng(state.rngSeed);
    const result = apply(state, intent, rng);
    if (!result.ok) return result;
    const stepped = autoStep(result.state, rng);
    set({ state: stepped.state });
    return {
      ok: true,
      state: stepped.state,
      newEvents: [...result.newEvents, ...stepped.newEvents],
    };
  },

  applyStateUpdate: (next) => set({ state: next }),

  reset: () => set({ state: MOCK_STATE, myPlayerId: null }),
}));
