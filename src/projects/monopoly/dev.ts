"use client";

import { useEffect } from "react";
import { SPACES } from "./data";
import { MOCK_STATE, sliceState } from "./mocks";
import { useMonopolyStore } from "./store";
import type { GameState } from "./types";

// Every board position whose ownership can be set (properties, railroads,
// utilities). Used by the debug ownership-shuffle keys.
const OWNABLE_POSITIONS = SPACES.flatMap((s, i) =>
  s.kind === "property" || s.kind === "railroad" || s.kind === "utility"
    ? [i]
    : [],
);

/** Install dev-only keyboard shortcuts that swap the visible state for
 *  visual development. Pressing any state-loading key flips the store
 *  into "demo" mode and freezes the auto-pacing loop so the loaded
 *  snapshot stays still for inspection; press `n` to start a new live
 *  game and resume play.
 *
 *    2 / 4 / 8 — load a sliced mock with that player count (demo)
 *    0         — give every ownable square to the first player (demo)
 *    1         — randomly assign every ownable square (demo)
 *    n         — new live game, drop online connection (auto-pacing resumes)
 *    r         — online host: overwrite the row with a fresh game seating me
 *    f         — online: re-fetch the row from Supabase and apply it locally
 *
 *  No-ops in production builds. */
export function useMonopolyDebugKeys() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const handler = (e: KeyboardEvent) => {
      const store = useMonopolyStore.getState();
      const current = store.state;
      if (e.key === "2") store.loadDemo(sliceState(MOCK_STATE, 2));
      else if (e.key === "4") store.loadDemo(sliceState(MOCK_STATE, 4));
      else if (e.key === "8") store.loadDemo(sliceState(MOCK_STATE, 8));
      else if (e.key === "0") store.loadDemo(withAllOwnedByFirst(current));
      else if (e.key === "1") store.loadDemo(withRandomOwnership(current));
      else if (e.key === "n") store.reset();
      else if (e.key === "r") void store.restart();
      else if (e.key === "f") void store.resume();
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, []);
}

function withAllOwnedByFirst(state: GameState): GameState {
  const firstId = state.players[0]?.id;
  if (!firstId) return state;
  const ownership: Record<number, string> = {};
  for (const pos of OWNABLE_POSITIONS) {
    ownership[pos] = firstId;
  }
  return {
    ...state,
    ownership,
    jailFreeCards: { chance: firstId, communityChest: firstId },
  };
}

function withRandomOwnership(state: GameState): GameState {
  const players = state.players;
  if (players.length === 0) return state;
  const pickId = () =>
    players[Math.floor(Math.random() * players.length)].id;
  const ownership: Record<number, string> = {};
  for (const pos of OWNABLE_POSITIONS) {
    ownership[pos] = pickId();
  }
  return {
    ...state,
    ownership,
    jailFreeCards: { chance: pickId(), communityChest: pickId() },
  };
}
