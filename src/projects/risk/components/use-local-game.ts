"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameEvent, GameState, Move } from "../contract";
import { LOCAL } from "../local-engine";
import type { GameFeed } from "./game-screen";

/*
 * One game on this device, hot-seat: the screen shows the view of the seat whose turn it is, and
 * that seat's options. Every move goes through the engine (`local-engine.ts`); the screen never
 * changes the game itself. The log keeps the events as they happened and is shown to the seat
 * holding the device as that seat may see it.
 */

interface Played {
  state: GameState;
  log: GameEvent[];
  latestFrom: number;
  dealKey: number;
}

export function useLocalGame(start: () => { state: GameState; events: readonly GameEvent[] }): GameFeed {
  const { engine } = LOCAL;
  const [played, setPlayed] = useState<Played>(() => {
    const { state, events } = start();
    return { state, log: [...events], latestFrom: 0, dealKey: 1 };
  });
  const [error, setError] = useState<string | null>(null);

  const view0 = engine.view(played.state, null);
  const viewer = view0.active;
  const view = useMemo(() => engine.view(played.state, viewer), [engine, played.state, viewer]);
  const options = useMemo(() => engine.options(played.state, viewer), [engine, played.state, viewer]);
  const log = useMemo(() => engine.redact(played.log, viewer), [engine, played.log, viewer]);

  const playedRef = useRef(played);
  useEffect(() => {
    playedRef.current = played;
  });

  const act = useCallback(
    (move: Move) => {
      const current = playedRef.current;
      const seat = engine.view(current.state, null).active;
      const result = engine.apply(current.state, seat, move);
      if (!result.ok) {
        // The screen offers only what the options allow, so a refusal is a bug to see, not hide.
        console.error("Risk: the engine refused a move the screen offered", move, result.reason);
        setError(result.reason);
        return;
      }
      setError(null);
      const dealt = result.events.some((event) => event.kind === "dealt");
      const next = { state: result.state, log: [...current.log, ...result.events], latestFrom: current.log.length, dealKey: current.dealKey + (dealt ? 1 : 0) };
      playedRef.current = next;
      setPlayed(next);
    },
    [engine],
  );

  return { view, options, events: log, latestFrom: played.latestFrom, dealKey: played.dealKey, act, problem: error };
}
