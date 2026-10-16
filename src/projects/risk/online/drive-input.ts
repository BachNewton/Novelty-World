import type { DecisionId, GameEvent, RiskEngine, Seat } from "../contract";
import type { BotInput } from "../bots/bot";
import { applyAnswer, causedBy, newOnlineGame, type OnlineGame } from "./game";
import type { LoggedMove } from "./table";

/** A game's events from its start up to a decision, unredacted: what a drive keeps so a bot can
 *  be given the game's public history. */
export interface History {
  /** The decision the game waits on once these events have happened. */
  decision: DecisionId;
  events: readonly GameEvent[];
}

/** The history of `game`, replayed from its seed and the first `game.decision` answers of its move
 *  log. The replay must reach the game's own state: a log that doesn't is a broken game. */
export function replayHistory(engine: RiskEngine, game: OnlineGame, log: readonly LoggedMove[]): History {
  let replayed = newOnlineGame(engine, game.players, game.seed);
  const events = replayed.lastEvents.map((logged) => logged.event);
  for (const { decision, seat, move } of log.slice(0, game.decision)) {
    const result = applyAnswer(engine, replayed, { decision, seat, move });
    if (!result.ok) throw new Error(`Replaying decision ${decision.toString()}: ${result.reason}`);
    replayed = result.game;
    events.push(...replayed.lastEvents.map((logged) => logged.event));
  }
  if (replayed.decision !== game.decision || sorted(replayed.engine) !== sorted(game.engine)) {
    throw new Error(`The move log doesn't replay to the game at decision ${game.decision.toString()}`);
  }
  return { decision: game.decision, events };
}

/** JSON with every object's keys in order: the database's jsonb doesn't keep the order they were
 *  written in. */
const sorted = (value: unknown) =>
  JSON.stringify(value, (_, v: unknown) =>
    v !== null && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v,
  );

/** `known` brought up to `game` when the game has taken one answer since, from that answer's
 *  events; null when it can't be (another write landed in between), and the history is replayed. */
export function extendHistory(known: History, game: OnlineGame): History | null {
  if (game.decision === known.decision) return known;
  if (game.decision !== known.decision + 1 || !game.lastEvents.every((logged) => causedBy(logged) === known.decision)) return null;
  return { decision: game.decision, events: [...known.events, ...game.lastEvents.map((logged) => logged.event)] };
}

/** What a bot is given: its seat's view, options and the game's history redacted for it, and who
 *  is a person, and nothing else of the game. The driver holds the state; this is the only path
 *  from it to a bot. */
export function botInput(
  engine: RiskEngine,
  game: OnlineGame,
  history: History,
  humans: readonly boolean[],
  seat: Seat,
  seed: string,
): BotInput {
  if (history.decision !== game.decision) throw new Error(`The history is at decision ${history.decision.toString()}, the game at ${game.decision.toString()}`);
  const options = engine.options(game.engine, seat);
  if (!options) throw new Error(`Seat ${seat.toString()} has no decision to make`);
  return {
    seat,
    view: engine.view(game.engine, seat),
    options,
    events: engine.redact(
      game.lastEvents.map((logged) => logged.event),
      seat,
    ),
    history: engine.redact(history.events, seat),
    humans,
    seed,
  };
}
