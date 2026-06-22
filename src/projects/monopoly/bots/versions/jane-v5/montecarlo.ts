// ===========================================================================
// Monte Carlo engine for jane-v5.
//
// At each key decision point (buy, jail, auction, trade vote), enumerate the
// legal actions, simulate N rollouts from each, and pick the action with the
// highest expected win rate. The rollout policy is jane-v3 (the current champion)
// for all players, which provides a realistic game continuation.
//
// This is the paradigm shift: instead of hand-coding "is this property worth
// buying?" via heuristic valuation, we ASK THE GAME by simulating the
// consequences. Forward-looking instead of reactive.
//
// Performance: ~7900 steps/sec, ~600 steps/game → ~76ms/full game.
// A shallow rollout (80 turns) ≈ ~45ms. With 20 rollouts × 2 actions,
// each buy decision ≈ ~1.8s. ~15 buy decisions/game ≈ ~27s/game.
// ===========================================================================

import { apply, autoStep, netWorth, BID_INCREMENT } from "../../../engine";
import { driveOp, type BotResolver } from "../../../pacing";
import { janeV3Bot } from "../jane-v3";
import type { BotDecision } from "../../decision";
import type { GameState, Intent } from "../../../types";

/** How many rollouts to run per action. More = more accurate but slower. */
const ROLLOUTS_PER_ACTION = 20;
/** Maximum turns to simulate per rollout. The game might not end within this
 *  window; if it doesn't, we evaluate by netWorth instead of win/loss. */
const MAX_ROLLOUT_TURNS = 80;

// ---------------------------------------------------------------------------
// Rollout: play forward from a state with jane-v3 as the policy for everyone.
// ---------------------------------------------------------------------------

/** Run a single forward simulation from `state` and score the outcome for
 *  `myId`. Returns a value in [0, 1]: 1.0 = win, 0.0 = loss, with
 *  netWorth-based fractional scores for games that hit the turn cap. */
function rollout(
  state: GameState,
  myId: string,
  maxTurns: number,
): number {
  let s = state;
  const botFor: BotResolver = () => janeV3Bot;
  const startTurn = s.turns[s.turns.length - 1].turn;
  let steps = 0;
  const maxSteps = maxTurns * 10; // safety valve (~10 ops/turn worst case)

  while (s.status === "active" && steps < maxSteps) {
    const turnNo = s.turns[s.turns.length - 1].turn;
    if (turnNo - startTurn > maxTurns) break;

    const op = driveOp(s, true, null, botFor);
    if (op === null) break;

    if (op.kind === "step") {
      const result = autoStep(s);
      if (result.state === s) break; // stalled — bail
      s = result.state;
    } else {
      // Skip bot-note application during rollouts (pure overhead — no state
      // change, just log events we don't need).
      const result = apply(s, op.intent);
      if (!result.ok) break;
      s = result.state;
    }
    steps++;
  }

  // --- Evaluate the outcome ---

  // Natural game end: check for a winner event.
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
    return 0.5; // finished without a winner event (shouldn't happen)
  }

  // Turn cap: estimate position by netWorth.
  const me = s.players.find((p) => p.id === myId);
  if (me?.bankrupt) return 0.0; // we went bust during the rollout

  const myWorth = netWorth(s, myId);
  let maxOpp = -Infinity;
  let oppAlive = false;
  for (const p of s.players) {
    if (p.id === myId || p.bankrupt) continue;
    oppAlive = true;
    const w = netWorth(s, p.id);
    if (w > maxOpp) maxOpp = w;
  }
  if (!oppAlive) return 1.0; // all opponents bankrupt
  if (myWorth > maxOpp * 1.15) return 0.85;
  if (myWorth > maxOpp) return 0.65;
  if (myWorth < maxOpp * 0.85) return 0.15;
  return 0.4;
}

// ---------------------------------------------------------------------------
// Monte Carlo search: try each action, run rollouts, pick the best.
// ---------------------------------------------------------------------------

/** One candidate action: an intent to apply before simulating (or null to let
 *  autoStep handle the current phase — used for jail "roll"). */
interface McAction {
  intent: Intent | null;
  label: string;
}

/** Run MC for a set of actions. Returns the best action by average rollout
 *  score, plus the score for logging. */
function monteCarloSearch(
  state: GameState,
  myId: string,
  actions: McAction[],
  nRollouts: number,
  maxTurns: number,
): { best: McAction; score: number; allScores: Map<string, number> } | null {
  if (actions.length === 0) return null;

  const allScores = new Map<string, number>();
  let best: McAction = actions[0];
  let bestScore = -1;

  for (const action of actions) {
    let total = 0;
    let valid = 0;

    for (let i = 0; i < nRollouts; i++) {
      // Clone state for isolated rollout.
      const cloned: GameState = structuredClone(state);
      // Diversify RNG so rollouts explore different dice/card outcomes.
      // Without this, deterministic bots + same RNG = identical rollouts.
      cloned.rngState = (cloned.rngState ^ ((i + 1) * 0x9e3779b9)) >>> 0;

      // Apply the action (or autoStep for null intent like jail roll).
      let rolloutState: GameState;
      if (action.intent === null) {
        const result = autoStep(cloned);
        if (result.state === cloned) continue;
        rolloutState = result.state;
      } else {
        const result = apply(cloned, action.intent);
        if (!result.ok) continue;
        rolloutState = result.state;
      }

      // Simulate forward.
      const score = rollout(rolloutState, myId, maxTurns);
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

  return { best, score: bestScore, allScores };
}

// ---------------------------------------------------------------------------
// Decision-point wrappers
// ---------------------------------------------------------------------------

/** Has `pid` already logged this exact note in the current turn group? Dedup
 *  so a bot-note doesn't spin the phase. */
function alreadyNoted(state: GameState, pid: string, text: string): boolean {
  const turn = state.turns[state.turns.length - 1];
  return turn.events.some(
    (e) => e.kind === "bot-note" && e.playerId === pid && e.text === text,
  );
}

/** Monte Carlo buy decision: buy vs decline. Simulates both choices and picks
 *  the one with the higher expected outcome. Returns null to fall back to
 *  jane-v3's heuristic (e.g., when the player can't afford to buy outright). */
export function monteCarloBuy(
  state: GameState,
  pid: string,
): BotDecision | null {
  if (state.turn.playerId !== pid) return null;
  if (state.turn.phase !== "buy-decision") return null;
  if (state.turn.pendingBuy === undefined) return null;

  const actions: McAction[] = [
    { intent: { kind: "buy", playerId: pid }, label: "buy" },
    { intent: { kind: "decline-buy", playerId: pid }, label: "decline" },
  ];

  const result = monteCarloSearch(
    state,
    pid,
    actions,
    ROLLOUTS_PER_ACTION,
    MAX_ROLLOUT_TURNS,
  );
  if (!result) return null;

  return {
    intent: result.best.intent as Intent,
    note: `MC: ${result.best.label} (buy=${(result.allScores.get("buy")! * 100).toFixed(0)}% / decline=${(result.allScores.get("decline")! * 100).toFixed(0)}% over ${ROLLOUTS_PER_ACTION} rollouts)`,
  };
}

/** Monte Carlo jail decision: pay $50, use card, or roll for doubles.
 *  Simulates each option and picks the one with the best expected outcome. */
export function monteCarloJail(
  state: GameState,
  pid: string,
): BotDecision | null {
  if (state.turn.playerId !== pid) return null;
  if (state.turn.phase !== "jail-decision") return null;

  const player = state.players.find((p) => p.id === pid);
  if (!player || !player.inJail) return null;

  const hasCard =
    state.jailFreeCards.chance === pid ||
    state.jailFreeCards.communityChest === pid;

  const actions: McAction[] = [];
  if (hasCard) {
    actions.push({
      intent: { kind: "use-jail-card", playerId: pid },
      label: "card",
    });
  }
  actions.push({
    intent: { kind: "pay-to-leave-jail", playerId: pid },
    label: "pay",
  });
  actions.push({ intent: null, label: "roll" });

  const result = monteCarloSearch(
    state,
    pid,
    actions,
    ROLLOUTS_PER_ACTION,
    MAX_ROLLOUT_TURNS,
  );
  if (!result) return null;

  // "Roll" is a null intent — the pacer's autoStep handles it. Emit a one-time
  // bot-note for visibility, then return null so the pacer rolls.
  if (result.best.intent === null) {
    const note = `MC jail: roll (${(result.score * 100).toFixed(0)}% expectancy)`;
    if (alreadyNoted(state, pid, note)) return null;
    return { intent: { kind: "bot-note", playerId: pid, text: note } };
  }

  return {
    intent: result.best.intent,
    note: `MC jail: ${result.best.label} (${(result.score * 100).toFixed(0)}% expectancy)`,
  };
}

/** Monte Carlo auction decision: bid at the next increment vs pass. Simulates
 *  both choices and picks the one with the higher expected outcome. The bid
 *  amount is capped by what the player can afford. */
export function monteCarloAuction(
  state: GameState,
  pid: string,
): BotDecision | null {
  const auction = state.turn.auction;
  if (!auction || !auction.active.includes(pid) || auction.leaderId === pid)
    return null;
  if (state.turn.phase !== "auction") return null;

  const player = state.players.find((p) => p.id === pid);
  if (!player) return null;

  const nextBid = auction.highBid + BID_INCREMENT;

  // Can't afford the bid — must pass (no MC needed).
  if (player.cash < nextBid) return null;

  const actions: McAction[] = [
    { intent: { kind: "bid", playerId: pid, amount: nextBid }, label: "bid" },
    { intent: { kind: "pass-bid", playerId: pid }, label: "pass" },
  ];

  const result = monteCarloSearch(
    state,
    pid,
    actions,
    ROLLOUTS_PER_ACTION,
    MAX_ROLLOUT_TURNS,
  );
  if (!result) return null;

  return {
    intent: result.best.intent as Intent,
    note: `MC auction: ${result.best.label} $${nextBid} (bid=${(result.allScores.get("bid")! * 100).toFixed(0)}% / pass=${(result.allScores.get("pass")! * 100).toFixed(0)}%)`,
  };
}

/** Monte Carlo trade vote: accept vs decline an incoming trade proposal.
 *  Simulates both choices and picks the one with the higher expected outcome. */
export function monteCarloTradeVote(
  state: GameState,
  pid: string,
): BotDecision | null {
  const pending = state.turn.pendingTrade;
  if (!pending || !(pid in pending.approvals) || pending.approvals[pid])
    return null;
  if (state.turn.phase !== "trade-pending") return null;

  const actions: McAction[] = [
    {
      intent: { kind: "accept-trade", playerId: pid, tradeId: pending.id },
      label: "accept",
    },
    {
      intent: { kind: "decline-trade", playerId: pid, tradeId: pending.id },
      label: "decline",
    },
  ];

  const result = monteCarloSearch(
    state,
    pid,
    actions,
    ROLLOUTS_PER_ACTION,
    MAX_ROLLOUT_TURNS,
  );
  if (!result) return null;

  return {
    intent: result.best.intent as Intent,
    note: `MC trade: ${result.best.label} (accept=${(result.allScores.get("accept")! * 100).toFixed(0)}% / decline=${(result.allScores.get("decline")! * 100).toFixed(0)}%)`,
  };
}
