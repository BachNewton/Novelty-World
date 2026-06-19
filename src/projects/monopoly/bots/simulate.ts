import { apply, autoStep } from "../engine";
import { freshGame } from "../mocks";
import { driveOp } from "../pacing";
import type {
  BotStrategy,
  GameEvent,
  GameState,
  Intent,
  PlayerCount,
} from "../types";
import { positionValue } from "./valuation";

/** A headless game driver: it plays a full Monopoly game in-process with no UI,
 *  driving every seat through the SAME pacer the browser uses (`driveOp`) and
 *  the SAME authoritative engine (`apply` / `autoStep`). With every seat set to
 *  a bot strategy, `driverRole` resolves to "proxy" for whoever is active, so a
 *  single in-process driver advances the whole game to its conclusion — a winner,
 *  or a safety cap if the table deadlocks.
 *
 *  This is the engine behind the `npm run sim` script (`simulate-cli.ts`): watch
 *  the bots actually play, and see how the policy behaves over a real game. Pure
 *  and deterministic — a seed fully determines the game — so it's reproducible
 *  and reusable (e.g. a future win-rate tournament across many seeds). */

const DEFAULT_STRATEGIES: readonly BotStrategy[] = [
  "claude",
  "claude",
  "claude",
  "claude",
];

/** A seat's final position in a finished (or capped) game. */
export interface Standing {
  id: string;
  name: string;
  strategy: BotStrategy | null;
  bankrupt: boolean;
  cash: number;
  /** `positionValue` at the final state — the bot's own yardstick for worth. */
  netWorth: number;
}

/** One bankruptcy, in the order it happened. `creditor` is null for a bust to
 *  the bank (no single creditor). */
export interface Elimination {
  debtor: string;
  creditor: string | null;
}

/** A noteworthy moment in the game — a bot's reasoning note or a structural move
 *  (buy / build / trade / mortgage / bankruptcy / win) — tagged with its turn.
 *  The rolls-and-rent noise is filtered out so the stream reads as "what the bots
 *  decided", not "what the dice did". Collected only when `includeLog` is set. */
export interface Highlight {
  turn: number;
  /** The seat whose turn it was — the actor for events like `buy` that don't
   *  carry their own player id. */
  actorId: string;
  event: GameEvent;
}

export interface SimResult {
  seed: string;
  /** True iff the game reached `game-over` (a winner was declared) rather than
   *  hitting a safety cap or stalling. */
  terminated: boolean;
  /** Why the loop stopped: "game-over", a cap message, or a stall diagnostic. */
  reason: string;
  /** Turn number of the last turn group (the game's length in turns). */
  turns: number;
  /** Number of driver ops applied (rolls, decisions, intermissions, end-turns). */
  steps: number;
  winnerId: string | null;
  winnerName: string | null;
  /** Seats best-to-worst: the survivor first, then the bankrupt seats in reverse
   *  elimination order (last to bust ranks higher). */
  standings: readonly Standing[];
  eliminations: readonly Elimination[];
  /** Tally of every emitted `GameEvent` by kind — how much buying, trading,
   *  building, and rent actually happened over the game. */
  eventCounts: Readonly<Record<string, number>>;
  /** The play-by-play of decisions and structural moves, in order. Empty unless
   *  `includeLog` was set. */
  highlights: readonly Highlight[];
}

export interface SimOptions {
  /** RNG seed — fully determines the game. Defaults to "sim-1". */
  seed?: string;
  /** Per-seat bot strategies; its length (2, 4, or 8) sets the player count.
   *  Defaults to four Claude bots. */
  strategies?: readonly BotStrategy[];
  /** Hard safety cap on driver ops, so a policy regression that fails to
   *  terminate aborts loudly instead of hanging. */
  maxSteps?: number;
  /** Hard safety cap on turn count — a game that never converges (no one ever
   *  busts) stops here and reports `terminated: false`. */
  maxTurns?: number;
  /** Collect the per-decision play-by-play into `result.highlights`. Off by
   *  default — it walks every event, so only pay for it when you'll show it. */
  includeLog?: boolean;
}

/** Event kinds worth surfacing in the play-by-play: the bots' reasoning and the
 *  moves that change the board, minus the dice/rent/card noise. */
const HIGHLIGHT_KINDS: ReadonlySet<GameEvent["kind"]> = new Set([
  "bot-note",
  "buy",
  "auction",
  "build",
  "sell-building",
  "mortgage",
  "unmortgage",
  "trade",
  "trade-declined",
  "bankrupt",
  "winner",
]);

function toPlayerCount(n: number): PlayerCount {
  if (n === 2 || n === 4 || n === 8) return n;
  throw new Error(`unsupported player count ${n} (use 2, 4, or 8)`);
}

/** A fresh game with every seat assigned a bot strategy (overriding freshGame's
 *  human slot 0), so the whole table is proxy-driven. */
function seatAllBots(seed: string, strategies: readonly BotStrategy[]): GameState {
  const count = toPlayerCount(strategies.length);
  const base = freshGame(seed, undefined, count);
  const players = base.players.map((p, i) => ({
    ...p,
    botStrategy: strategies[i],
  }));
  return { ...base, players };
}

function applyOrThrow(state: GameState, intent: Intent): GameState {
  const result = apply(state, intent);
  if (!result.ok) {
    throw new Error(`intent "${intent.kind}" rejected: ${result.reason}`);
  }
  return result.state;
}

/** Apply one driver op exactly as the authoritative route does: a `step` runs a
 *  single `autoStep` (no further drain); an intent op applies the bot's reasoning
 *  `note` as a `bot-note` and then the decision, as one atomic submit — mirroring
 *  the store's `[bot-note, intent]` batch so the log reads the same as live play. */
function applyOp(
  state: GameState,
  op: NonNullable<ReturnType<typeof driveOp>>,
): GameState {
  if (op.kind === "step") return autoStep(state).state;
  let next = state;
  if (op.note !== undefined) {
    next = applyOrThrow(next, {
      kind: "bot-note",
      playerId: op.intent.playerId,
      text: op.note,
    });
  }
  return applyOrThrow(next, op.intent);
}

function allEvents(state: GameState): readonly GameEvent[] {
  return state.turns.flatMap((t) => t.events);
}

function buildStandings(
  state: GameState,
  eliminations: readonly Elimination[],
): Standing[] {
  const elimOrder = new Map<string, number>();
  eliminations.forEach((e, i) => elimOrder.set(e.debtor, i));
  return state.players
    .map((p) => ({
      id: p.id,
      name: p.name,
      strategy: p.botStrategy,
      bankrupt: p.bankrupt,
      cash: p.cash,
      netWorth: positionValue(state, p.id),
    }))
    .sort((a, b) => {
      if (a.bankrupt !== b.bankrupt) return a.bankrupt ? 1 : -1;
      if (a.bankrupt && b.bankrupt) {
        return (elimOrder.get(b.id) ?? 0) - (elimOrder.get(a.id) ?? 0);
      }
      return b.netWorth - a.netWorth;
    });
}

/** Play one game to completion (or a safety cap) and report the outcome. */
export function simulateGame(opts: SimOptions = {}): SimResult {
  const seed = opts.seed ?? "sim-1";
  const strategies = opts.strategies ?? DEFAULT_STRATEGIES;
  const maxSteps = opts.maxSteps ?? 200_000;
  const maxTurns = opts.maxTurns ?? 5_000;

  let state = seatAllBots(seed, strategies);
  let steps = 0;
  let reason = "game-over";

  while (state.status === "active") {
    const turnNo = state.turns[state.turns.length - 1].turn;
    if (turnNo > maxTurns) {
      reason = `turn cap (${maxTurns}) exceeded`;
      break;
    }
    if (steps >= maxSteps) {
      reason = `step cap (${maxSteps}) exceeded`;
      break;
    }
    const op = driveOp(state, true, null);
    if (op === null) {
      reason = `stalled: no drive op at phase "${state.turn.phase}"`;
      break;
    }
    const next = applyOp(state, op);
    // `autoStep` returns the same reference when nothing progresses; a "step"
    // that the pacer should never have issued means we'd spin, so bail loudly.
    if (next === state) {
      reason = `stalled: no-op "${op.kind}" at phase "${state.turn.phase}"`;
      break;
    }
    state = next;
    steps++;
  }

  const events = allEvents(state);
  const eliminations: Elimination[] = [];
  const eventCounts: Record<string, number> = {};
  let winnerId: string | null = null;
  for (const e of events) {
    eventCounts[e.kind] = (eventCounts[e.kind] ?? 0) + 1;
    if (e.kind === "bankrupt") {
      eliminations.push({ debtor: e.debtorId, creditor: e.creditorId });
    }
    if (e.kind === "winner") winnerId = e.winnerId;
  }
  const winner = state.players.find((p) => p.id === winnerId);

  const highlights: Highlight[] = [];
  if (opts.includeLog) {
    for (const group of state.turns) {
      for (const e of group.events) {
        if (HIGHLIGHT_KINDS.has(e.kind)) {
          highlights.push({ turn: group.turn, actorId: group.playerId, event: e });
        }
      }
    }
  }

  return {
    seed,
    terminated: state.status === "finished",
    reason,
    turns: state.turns[state.turns.length - 1].turn,
    steps,
    winnerId,
    winnerName: winner?.name ?? null,
    standings: buildStandings(state, eliminations),
    eliminations,
    eventCounts,
    highlights,
  };
}

/** A compact, human-readable summary of a finished game, for the script's
 *  console output (the standings, the elimination order, and the event tally
 *  that exposes how much the bots actually did). */
export function formatResult(r: SimResult): string {
  const lines: string[] = [];
  const outcome = r.terminated
    ? `🏆 ${r.winnerName ?? r.winnerId ?? "?"} wins`
    : `⚠ no winner (${r.reason})`;
  lines.push(`Seed "${r.seed}" — ${outcome} in ${r.turns} turns (${r.steps} ops)`);
  r.standings.forEach((s, i) => {
    const tag = s.bankrupt ? "bankrupt" : `$${s.cash} cash`;
    lines.push(
      `  ${i + 1}. ${s.name} [${s.strategy ?? "human"}] — ` +
        `net worth $${s.netWorth}, ${tag}`,
    );
  });
  if (r.eliminations.length > 0) {
    const order = r.eliminations
      .map((e) => `${e.debtor}→${e.creditor ?? "bank"}`)
      .join(", ");
    lines.push(`  Eliminations (in order): ${order}`);
  }
  const counts = Object.entries(r.eventCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([kind, n]) => `${kind}=${n}`)
    .join(", ");
  lines.push(`  Events: ${counts}`);
  return lines.join("\n");
}
