// ===========================================================================
// Monte Carlo engine for jane-v12.
//
// MC at two decision points: building (managing phase) and trade accept/deny
// (trade-pending phase). Everything else uses jane-v6's heuristics unchanged.
//
// PERFORMANCE DESIGN:
// The rollout policy is a LIGHTWEIGHT bot that uses jane-v6 for the cheap
// decisions (buy, jail, auction) but returns null for expensive ones (build,
// trade, pre-roll). This avoids the ~1900-line flow engine on every rollout
// step while still producing somewhat realistic game evolution.
//
// Budget: 5 rollouts/action, 20-turn depth. Build: 2 candidates (heuristic
// vs no-build). Trade: 2 candidates (accept vs decline).
// ===========================================================================

import { apply, autoStep, netWorth } from "../../../engine";
import { driveOp, type BotResolver } from "../../../pacing";
import { janeV6Bot } from "../jane-v6";
import type { BotDecision } from "../../decision";
import type { GameState, Intent } from "../../../types";

/** Rollouts per action. */
const ROLLOUTS_PER_ACTION = 5;
/** Max turns per rollout. */
const MAX_ROLLOUT_TURNS = 20;

// ---------------------------------------------------------------------------
// Lightweight rollout bot: jane-v6 for cheap decisions, null for expensive.
// ---------------------------------------------------------------------------

const LIGHT_PHASES = new Set([
  "buy-decision",
  "jail-decision",
  "auction",
]);

/** Lightweight bot for rollouts. Uses jane-v6 for buy/jail/auction (cheap),
 *  returns null for build/trade/pre-roll (expensive). The engine defaults
 *  handle the skipped phases: manage → no build, trade-pending → decline. */
function lightRolloutBot(state: GameState, pid: string): BotDecision | null {
  if (LIGHT_PHASES.has(state.turn.phase)) {
    return janeV6Bot(state, pid);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Rollout: play forward from a state with the lightweight policy.
// ---------------------------------------------------------------------------

function rollout(state: GameState, myId: string, maxTurns: number): number {
  let s = state;
  const botFor: BotResolver = () => lightRolloutBot;
  const startTurn = s.turns[s.turns.length - 1].turn;
  let steps = 0;
  const maxSteps = maxTurns * 12; // safety valve

  while (s.status === "active" && steps < maxSteps) {
    const turnNo = s.turns[s.turns.length - 1].turn;
    if (turnNo - startTurn > maxTurns) break;

    const op = driveOp(s, true, null, botFor);
    if (op === null) {
      // No bot decision and no step — try autoStep to advance.
      const result = autoStep(s);
      if (result.state === s) break;
      s = result.state;
      steps++;
      continue;
    }

    if (op.kind === "step") {
      const result = autoStep(s);
      if (result.state === s) break;
      s = result.state;
    } else {
      const result = apply(s, op.intent);
      if (!result.ok) {
        const stepResult = autoStep(s);
        if (stepResult.state === s) break;
        s = stepResult.state;
      } else {
        s = result.state;
      }
    }
    steps++;
  }

  // --- Evaluate the outcome ---

  if (s.status === "finished") {
    for (let i = s.turns.length - 1; i >= 0; i--) {
      const events = s.turns[i].events;
      for (let j = events.length - 1; j >= 0; j--) {
        const e = events[j];
        if (e.kind === "winner" && "winnerId" in e) {
          return e.winnerId === myId ? 1.0 : 0.0;
        }
      }
    }
    return 0.5;
  }

  // Turn cap: estimate position by netWorth.
  const me = s.players.find((p) => p.id === myId);
  if (me?.bankrupt) return 0.0;

  const myWorth = netWorth(s, myId);
  let maxOpp = -Infinity;
  let oppAlive = false;
  for (const p of s.players) {
    if (p.id === myId || p.bankrupt) continue;
    oppAlive = true;
    const w = netWorth(s, p.id);
    if (w > maxOpp) maxOpp = w;
  }
  if (!oppAlive) return 1.0;
  if (myWorth > maxOpp * 1.15) return 0.85;
  if (myWorth > maxOpp) return 0.65;
  if (myWorth < maxOpp * 0.85) return 0.15;
  return 0.4;
}

// ---------------------------------------------------------------------------
// Monte Carlo search
// ---------------------------------------------------------------------------

interface McAction {
  intent: Intent;
  label: string;
}

function monteCarloSearch(
  state: GameState,
  myId: string,
  actions: McAction[],
  nRollouts: number,
  maxTurns: number,
): { best: McAction; score: number; allScores: Map<string, number> } | null {
  if (actions.length === 0) return null;

  const allScores = new Map<string, number>();
  let best: McAction | null = null;
  let bestScore = -1;

  for (const action of actions) {
    let total = 0;
    let valid = 0;

    for (let i = 0; i < nRollouts; i++) {
      const cloned: GameState = structuredClone(state);
      cloned.rngState = (cloned.rngState ^ ((i + 1) * 0x9e3779b9)) >>> 0;

      const result = apply(cloned, action.intent);
      if (!result.ok) continue;

      const score = rollout(result.state, myId, maxTurns);
      total += score;
      valid++;
    }

    if (valid === 0) {
      allScores.set(action.label, -1);
      continue;
    }
    const avg = total / valid;
    allScores.set(action.label, avg);

    if (avg > bestScore) {
      bestScore = avg;
      best = action;
    }
  }

  if (best === null) return null;
  return { best, score: bestScore, allScores };
}

// ---------------------------------------------------------------------------
// Decision-point: BUILD (managing phase)
// ---------------------------------------------------------------------------

/** MC build decision: compare jane-v6's heuristic build plan vs no-build.
 *  Only 2 candidates to keep the search fast.
 *  Returns null if MC fails (caller falls back to heuristic). */
export function mcBuild(
  state: GameState,
  pid: string,
  heuristic: BotDecision,
): BotDecision | null {
  if (heuristic.intent.kind !== "manage") return null;
  const hBuild = heuristic.intent.build as Record<number, number>;
  const hMortgage = heuristic.intent.mortgage as Record<number, boolean>;
  if (Object.keys(hBuild).length === 0) return null;

  const candidates: McAction[] = [
    {
      intent: { kind: "manage" as const, playerId: pid, build: { ...hBuild }, mortgage: { ...hMortgage } },
      label: "build",
    },
    {
      intent: { kind: "manage" as const, playerId: pid, build: {}, mortgage: {} },
      label: "skip",
    },
  ];

  const result = monteCarloSearch(state, pid, candidates, ROLLOUTS_PER_ACTION, MAX_ROLLOUT_TURNS);
  if (result === null) return null;

  const scoreStr = [...result.allScores.entries()]
    .map(([k, v]) => `${k}=${(v * 100).toFixed(0)}%`)
    .join(" / ");

  return {
    intent: result.best.intent,
    note: `MC build: ${result.best.label} (${scoreStr})`,
  };
}

// ---------------------------------------------------------------------------
// Decision-point: TRADE VOTE (trade-pending phase)
// ---------------------------------------------------------------------------

/** MC trade vote: accept vs decline. Returns null if MC fails. */
export function mcTradeVote(state: GameState, pid: string): BotDecision | null {
  const pending = state.turn.pendingTrade;
  if (!pending || !(pid in pending.approvals) || pending.approvals[pid]) return null;

  const actions: McAction[] = [
    {
      intent: { kind: "accept-trade" as const, playerId: pid, tradeId: pending.id },
      label: "accept",
    },
    {
      intent: { kind: "decline-trade" as const, playerId: pid, tradeId: pending.id },
      label: "decline",
    },
  ];

  const result = monteCarloSearch(state, pid, actions, ROLLOUTS_PER_ACTION, MAX_ROLLOUT_TURNS);
  if (result === null) return null;

  const scoreStr = [...result.allScores.entries()]
    .map(([k, v]) => `${k}=${(v * 100).toFixed(0)}%`)
    .join(" / ");

  return {
    intent: result.best.intent,
    note: `MC trade: ${result.best.label} (${scoreStr})`,
  };
}
