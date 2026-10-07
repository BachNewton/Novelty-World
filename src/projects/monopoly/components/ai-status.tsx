"use client";

import { useEffect, useState } from "react";
import { Bot } from "lucide-react";
import { stalledAt } from "../bots/ai/review";
import type { AiDecision, GameState } from "../types";
import { TryAgainButton } from "./ai-retry";

/** How a decision reads in a sentence ("thinking about the auction"). */
export const DECISION_LABEL: Readonly<Record<AiDecision, string>> = {
  "turn-start": "its turn",
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
 *  with why, since the game is stalled on it; a seated player (`canRetry`) can
 *  ask it to try again. */
export function AiStatus({ state, canRetry }: { state: GameState; canRetry: boolean }) {
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
      const at = stalledAt(state, player.id);
      return [
        <StatusRow
          key={player.id}
          color="var(--mono-red)"
          action={
            canRetry && at !== null ? <TryAgainButton aiName={player.name} seat={player.id} refTo={at} /> : undefined
          }
        >
          {player.name} couldn&apos;t decide ({DECISION_LABEL[seat.failure.decision]}): {seat.failure.reason}. The
          game is stalled.
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

function StatusRow({
  color,
  action,
  children,
}: {
  color: string;
  /** A control at the row's end (a stalled seat's Try again). */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-center gap-2 px-3 text-xs font-semibold ${action ? "py-1" : "py-1.5"}`}
      style={{ color, backgroundColor: "var(--mono-card)" }}
    >
      <Bot className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span role="status" className={`min-w-0 flex-1 [overflow-wrap:anywhere] ${action ? "line-clamp-3" : ""}`}>
        {children}
      </span>
      {action}
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
