"use client";

import { useMemo } from "react";
import type { Move } from "../contract";
import { SEAT_BOTS } from "../online/seat-bots";
import { causedBy } from "../online/game";
import type { OnlineSnapshot } from "../online/store";
import type { GameFeed } from "./game-screen";

/*
 * An online game as the game screen plays it: the snapshot's view and options for this player's
 * seat, its events (each shown once, redacted for this seat), and who sits at each seat. Moves go
 * to the online store, which shows them at once and sends them to the server.
 */
export function useOnlineFeed(snapshot: OnlineSnapshot, act: (move: Move) => void): GameFeed {
  const { view, options, events, problem, table } = snapshot;
  const shown = useMemo(() => events.map((logged) => logged.event), [events]);
  // The latest move's events: those caused by the same decision as the last one shown.
  const latestFrom = useMemo(() => {
    const last = events.at(-1);
    return last ? events.findIndex((logged) => causedBy(logged) === causedBy(last)) : 0;
  }, [events]);
  const dealKey = useMemo(() => shown.filter((event) => event.kind === "dealt").length, [shown]);
  const seats = table?.seats;
  const players = useMemo(
    () => (seats ?? []).map((controller) => (controller.kind === "human" ? controller.profile.name : `${SEAT_BOTS[controller.bot].name} (bot)`)),
    [seats],
  );

  if (!view) throw new Error("The game screen was shown before the game started");
  return { view, options, events: shown, latestFrom, dealKey, act, problem, players };
}
