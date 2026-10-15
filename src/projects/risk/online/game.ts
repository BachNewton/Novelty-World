import type { SyncRules } from "@/shared/lib/client-sync";
import type { Answer, DecisionId, GameEvent, GameState, Move, RiskEngine, Seat } from "../contract";

/*
 * A game as it is played online: the engine's state, the id of the decision
 * it waits on, the latest write's events and a ledger of recent answers. It
 * is the game row's `game` column, written only by the server route; a phone
 * applies its own answers to it ahead of the server, through the same code.
 */

/** An event with an id stable across the server and a phone's own apply: the
 *  decision whose answer caused it, and its place in that write. */
export interface LoggedEvent {
  id: string;
  event: GameEvent;
}

export interface OnlineGame {
  engine: GameState;
  /** The decision pending: the number of answers the game has taken. */
  decision: DecisionId;
  /** The latest write's events, unredacted (good faith); a screen redacts them for its seat. */
  lastEvents: readonly LoggedEvent[];
  /** The latest answers, newest last, so a repeated answer is recognised as one that landed. */
  answered: readonly Answer[];
}

/** How many answers the ledger keeps: plenty for a phone's queue to be recognised. */
export const ANSWERS_KEPT = 32;

export const STALE_DECISION = "That decision is no longer pending";

const logged = (decision: DecisionId, events: readonly GameEvent[]): LoggedEvent[] =>
  events.map((event, i) => ({ id: `${decision.toString()}:${i.toString()}`, event }));

export function newOnlineGame(engine: RiskEngine, players: number, seed: string): OnlineGame {
  const { state, events } = engine.newGame({ players }, seed);
  return { engine: state, decision: 0, lastEvents: logged(-1, events), answered: [] };
}

export function applyAnswer(engine: RiskEngine, game: OnlineGame, answer: Answer): { ok: true; game: OnlineGame } | { ok: false; reason: string } {
  if (answer.decision !== game.decision) return { ok: false, reason: STALE_DECISION };
  const result = engine.apply(game.engine, answer.seat, answer.move);
  if (!result.ok) return result;
  return {
    ok: true,
    game: {
      engine: result.state,
      decision: game.decision + 1,
      lastEvents: logged(game.decision, result.events),
      answered: [...game.answered, answer].slice(-ANSWERS_KEPT),
    },
  };
}

export const sameAnswer = (a: Answer, b: Answer) => a.decision === b.decision && a.seat === b.seat;

/** A move as text with its keys in order: the database's jsonb doesn't keep the order they were sent in. */
const canonical = (move: Move) => JSON.stringify(Object.fromEntries(Object.entries(move).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))));

/** Whether the game already took this exact answer: a repeat of one that landed. */
export const tookAnswer = (game: OnlineGame, answer: Answer) =>
  game.answered.some((a) => sameAnswer(a, answer) && canonical(a.move) === canonical(answer.move));

/** The seat the game waits on, or null once it is over. Risk has one seat acting at a time. */
export function pendingSeat(engine: RiskEngine, game: OnlineGame): Seat | null {
  const view = engine.view(game.engine, null);
  return view.phase === "game-over" ? null : view.active;
}

export function syncRules(engine: RiskEngine): SyncRules<OnlineGame, Answer, LoggedEvent> {
  return {
    apply: (game, answer) => {
      const result = applyAnswer(engine, game, answer);
      return result.ok ? { ok: true, state: result.game } : result;
    },
    sameAnswer,
    // Answered at all, whatever the answer: another device of the same seat may have answered it.
    included: (game, answer) => game.answered.some((a) => sameAnswer(a, answer)),
    lastEvents: (game) => game.lastEvents,
    eventId: (event) => event.id,
  };
}
