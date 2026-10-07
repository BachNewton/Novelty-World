"use client";

import { useEffect, useState } from "react";
import { Bot } from "lucide-react";
import type { AiDecision, GameState } from "../types";

const DECISION_LABEL: Readonly<Record<AiDecision, string>> = {
  buy: "buying",
  auction: "the auction",
  "settle-debt": "paying its debt",
  jail: "getting out of jail",
  "trade-vote": "the trade",
  "raise-to-buy": "raising cash to buy",
  manage: "its properties",
  "trade-build": "a trade",
};

/** Shown to everyone while an AI seat's model is working on a decision, so the
 *  table knows what it is waiting for. A failed seat stays flagged here too,
 *  since the game is stalled on it. */
export function AiStatus({ state }: { state: GameState }) {
  const rows = state.players.flatMap((player) => {
    const seat = state.ai[player.id];
    if (!seat) return [];
    if (seat.thinking !== null) {
      return [
        <ThinkingRow
          // Keyed by the decision, so a new decision restarts the counter.
          key={`${player.id}:${seat.thinking}`}
          name={player.name}
          decision={seat.thinking}
        />,
      ];
    }
    if (seat.failure !== null) {
      return [
        <StatusRow key={player.id} color="var(--mono-red)">
          {player.name} couldn&apos;t decide ({DECISION_LABEL[seat.failure.decision]}). The game is stalled.
        </StatusRow>,
      ];
    }
    return [];
  });
  if (rows.length === 0) return null;
  return <div className="flex flex-col">{rows}</div>;
}

function ThinkingRow({ name, decision }: { name: string; decision: AiDecision }) {
  const seconds = useElapsedSeconds();
  return (
    <StatusRow color="var(--mono-orange)">
      {name} is thinking about {DECISION_LABEL[decision]}… {seconds}s
    </StatusRow>
  );
}

function StatusRow({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold"
      style={{ color, backgroundColor: "var(--mono-card)" }}
      role="status"
    >
      <Bot className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/** Whole seconds since the component mounted, ticking once a second. Display
 *  only: nothing waits on it. */
function useElapsedSeconds(): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, []);
  return seconds;
}
