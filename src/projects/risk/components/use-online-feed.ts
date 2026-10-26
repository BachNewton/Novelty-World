"use client";

import { useEffect, useMemo } from "react";
import type { Move } from "../contract";
import { fullName, rankOf } from "../online/seat-bots";
import { settleGame, useEloLedger } from "../online/player-elo";
import { outcomeOf, seatElo } from "../online/rating";
import type { OnlineSnapshot } from "../online/store";
import type { GameFeed } from "./game-screen";

/*
 * An online game as the game screen plays it: the snapshot's view and options for this player's
 * seat, its events (each shown once, redacted for this seat), who sits at each seat, and what the
 * game did to this device's Elo once the seat's game is over. Moves go to the online store, which
 * shows them at once and sends them to the server.
 */
export function useOnlineFeed(snapshot: OnlineSnapshot, act: (move: Move) => void): GameFeed {
  const { id, view, options, events, problem, table, seat } = snapshot;
  const seats = table?.seats;
  const players = useMemo(
    () => (seats ?? []).map((controller) => (controller.kind === "human" ? { name: controller.profile.name } : { name: fullName(controller.bot), rank: rankOf(controller.bot) })),
    [seats],
  );

  // A seat's game is over once it is eliminated or has won: the device scores it then, once.
  const outcome = view && seat !== null ? outcomeOf(view, seat, table?.status === "over") : null;
  useEffect(() => {
    if (outcome && seats && seat !== null) settleGame(id, seats.map(seatElo), seat, outcome);
  }, [id, outcome, seats, seat]);
  const rating = useEloLedger().games[id] ?? null;

  if (!view) throw new Error("The game screen was shown before the game started");
  return { view, options, events, act, problem, players, rating };
}
