"use client";

import { useEffect } from "react";
import { useMonopolyStore } from "./store";

/** Install dev-only keyboard shortcuts for the `dev` game. Each key submits a
 *  debug command to the authoritative route, which applies it **only** for the
 *  reserved `dev` game id (any other game ignores it) — so these are safe to
 *  leave bound everywhere in dev builds. State changes round-trip through the
 *  route + subscription like any other move.
 *
 *    2 / 4 / 8 — restart with that many players (fresh game from the start)
 *    0         — give every ownable square to the first player
 *    1         — randomly assign every ownable square
 *    n         — new game (restart with 4 players)
 *
 *  No-ops in production builds. */
export function useMonopolyDebugKeys() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const handler = (e: KeyboardEvent) => {
      // A key some open control already claimed (the trade cash keypad types
      // digits) is not a hotkey.
      if (e.defaultPrevented) return;
      const { devCommand } = useMonopolyStore.getState();
      if (e.key === "2") devCommand({ kind: "restart", players: 2 });
      else if (e.key === "4") devCommand({ kind: "restart", players: 4 });
      else if (e.key === "8") devCommand({ kind: "restart", players: 8 });
      else if (e.key === "n") devCommand({ kind: "restart", players: 4 });
      else if (e.key === "0") devCommand({ kind: "own-all" });
      else if (e.key === "1") devCommand({ kind: "random-own" });
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, []);
}
