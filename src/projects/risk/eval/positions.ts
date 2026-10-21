import type { CardId, GameEvent, GameState, GameView, RiskEngine, Seat } from "../contract";
import { referenceEngine } from "../engine";
import type { Bot } from "../bots/bot";
import { riskBot } from "../bots";
import { fromView, type Board } from "../bots/rule-v1/board";
import { shapeOf } from "../bots/rule-v1/cards";
import { readRecord } from "../bots/rule-v4/beliefs";
import { tableParams } from "../bots/rule-v6";
import { breakdown, type Breakdown } from "../bots/rule-v6/evaluate";
import { forecast } from "../bots/rule-v6/opponents";
import { V6_PARAMS } from "../bots/rule-v6/params";
import { playGame, type RiskGameResult, type RiskGameSpec } from "./runner";

// The position recorder (`npm run risk:record`): the data for fitting an evaluation to game
// outcomes. It plays mixed-field games on the harness's runner and keeps, for every seat at the
// end of each of its turns, the board as that seat sees it and rule-v6's evaluation of it, with
// the game's outcome as the label. The board is the one v6's planner scores for the turn's end:
// after the fortify, with the turn's card still to come (its hand without the card it is about
// to draw, and the card-earned flag set).

/** The field a recording seats by default: v6, the rule bots before it, and GD's personas. */
export const DEFAULT_FIELD: readonly string[] = [
  "rule-v6",
  "rule-v5",
  "rule-v4",
  "gd-stacker",
  "gd-continental",
  "gd-aggressive",
  "gd-defensive",
];

/** v6's evaluation of a seat's position, term by term, with every seat's power and the chance
 *  it outlives the opponents' turns before mine, as v6's opponent model forecasts them. */
export interface V6Terms {
  value: number;
  share: number;
  killExposure: number;
  borderLoss: number;
  opportunity: number;
  idle: number;
  commonThreat: Seat | null;
  total: number;
  power: number[];
  spared: number[];
}

/** One seat's position at the end of one of its turns, built from its own view alone. */
export interface SeatPosition {
  /** The turn that ended, as the engine counts player-turns. */
  turn: number;
  seat: Seat;
  /** Every seat in turn order, starting with this one. */
  order: Seat[];
  /** Each territory's owner and armies, in the map's order (`map.ts`). */
  owner: number[];
  armies: number[];
  /** Every seat's hand size; this seat's without the card it is about to draw. */
  hands: number[];
  /** This seat's own cards, without the card it is about to draw. */
  cards: CardId[];
  alive: boolean[];
  /** Whether this turn captured a territory, so earns a card. */
  cardEarned: boolean;
  v6: V6Terms;
}

/** A position as it is written: the game it came from and the game's outcome beside it. */
export interface PositionRecord extends SeatPosition {
  game: number;
  seed: string;
  /** The bot at each seat. */
  labels: readonly string[];
  players: number;
  /** The winning seat, or null when the turn cap stopped the game. */
  winner: Seat | null;
  capped: boolean;
  places: number[];
  /** The game's length in player-turns. */
  turns: number;
}

export interface PositionsResult extends RiskGameResult {
  positions: SeatPosition[];
}

const round = (x: number) => Number(x.toPrecision(6));

/** The seat's position at the end of the turn it just ended, from what it sees: its view once
 *  the turn has passed, and its own redacted history through the move that ended it. */
export function seatPosition(view: GameView, history: readonly GameEvent[]): SeatPosition {
  const seat = view.viewer;
  if (seat === null) throw new Error("a position is recorded from a seat's view, not a spectator's");
  let next = history.length - 1;
  while (next >= 0 && history[next].kind !== "turn-started") next--;
  let mine = -1;
  let turn = 0;
  for (let i = next - 1; i >= 0; i--) {
    const e = history[i];
    if (e.kind === "turn-started" && e.seat === seat) {
      mine = i;
      turn = e.turn;
      break;
    }
  }
  if (mine < 0) throw new Error(`seat ${seat.toString()}'s history holds no turn of its that has ended`);

  let cardEarned = false;
  let drawn: CardId | null = null;
  for (let i = mine + 1; i < next; i++) {
    const e = history[i];
    if (e.kind === "captured" && e.seat === seat) cardEarned = true;
    if (e.kind === "card-drawn" && e.seat === seat) drawn = e.card ?? null;
  }
  const cards = [...(view.cards.hand ?? [])];
  if (drawn !== null) cards.splice(cards.indexOf(drawn), 1);
  const hands = view.seats.map((s) => s.handSize);
  hands[seat] = cards.length;

  const b = fromView(view);
  b.handSize[seat] = cards.length;
  b.known = shapeOf(cards);
  b.cardEarned = cardEarned;
  b.turn = turn;

  // v6's settings as it plays them at this table: the table's preferences for the seats still
  // alive, and its record of who took from whom, read from the history it would have read.
  const players = view.seats.length;
  const table = tableParams(V6_PARAMS, players, b.alive.filter(Boolean).length);
  const record = readRecord(history.slice(0, next), players, table.opponents.beliefs.historyDecay, seat);
  const params = { ...table, record };
  const bd = breakdown(b, seat, params);
  const alive: Seat[] = [];
  for (let s = 0; s < players; s++) if (b.alive[s]) alive.push(s);
  const fc = forecast(b, seat, params, alive, record);

  const at = view.turnOrder.indexOf(seat);
  return {
    turn,
    seat,
    order: view.turnOrder.map((_, k) => view.turnOrder[(at + k) % players]),
    owner: Array.from(b.owner),
    armies: Array.from(b.armies),
    hands,
    cards,
    alive: b.alive.slice(),
    cardEarned,
    v6: {
      value: round(bd.value),
      share: round(bd.share),
      killExposure: round(bd.killExposure),
      borderLoss: round(bd.borderLoss),
      opportunity: round(bd.opportunity),
      idle: bd.idle,
      commonThreat: bd.commonThreat,
      total: round(bd.total),
      power: fc.power.map(round),
      spared: fc.spared.map(round),
    },
  };
}

/** The reference engine, telling `onTurnEnd` whenever a seat's turn ends: the seat, the state
 *  it ended in, and the seat's own redacted history through it. A position is built from that
 *  state only through the seat's view. */
export function recordingEngine(
  players: number,
  onTurnEnd: (seat: Seat, state: GameState, history: readonly GameEvent[]) => void,
): RiskEngine {
  const histories: GameEvent[][] = Array.from({ length: players }, () => []);
  const see = (events: readonly GameEvent[]) => {
    histories.forEach((history, seat) => history.push(...referenceEngine.redact(events, seat)));
  };
  return {
    ...referenceEngine,
    newGame: (config, seed) => {
      const game = referenceEngine.newGame(config, seed);
      see(game.events);
      return game;
    },
    apply: (state, seat, move) => {
      const result = referenceEngine.apply(state, seat, move);
      if (result.ok) {
        see(result.events);
        // A turn passes only as the mover's turn ends, so a new turn's start is that end.
        if (result.events.some((e) => e.kind === "turn-started")) onTurnEnd(seat, result.state, histories[seat]);
      }
      return result;
    },
  };
}

/** Plays a spec on the harness's runner, recording every seat's position at the end of each
 *  of its turns. A game that throws comes back as an error with no positions, as `runSpec`'s do. */
export function recordGame(spec: RiskGameSpec, resolve: (label: string) => Bot = riskBot): PositionsResult {
  const base = { index: spec.index, seed: spec.seed, labels: spec.labels };
  const positions: SeatPosition[] = [];
  const engine = recordingEngine(spec.labels.length, (seat, state, history) => {
    positions.push(seatPosition(referenceEngine.view(state, seat), history));
  });
  try {
    const game = playGame({ seed: spec.seed, bots: spec.labels.map((l) => resolve(l)), maxTurns: spec.maxTurns, engine });
    return { ...base, ...game, positions };
  } catch (e) {
    return { ...base, winner: null, places: [], turns: 0, decisions: 0, positions: [], error: (e as Error).message };
  }
}

/** A game's positions as written, each with the game and its outcome. */
export function positionRecords(result: PositionsResult): PositionRecord[] {
  const game = {
    game: result.index,
    seed: result.seed,
    labels: result.labels,
    players: result.labels.length,
    winner: result.winner,
    capped: result.winner === null,
    places: result.places,
    turns: result.turns,
  };
  return result.positions.map((p) => ({ ...game, ...p }));
}

/** Games `from` to `from + count − 1` of a recording, each seeded `${prefix}-${index + 1}`. The
 *  field is seated in rotation, game i's seat s taking bot (i + s) mod F, so over any F games in
 *  a row every bot sits in every seat once. */
export function recordSpecs(
  field: readonly string[],
  players: number,
  prefix: string,
  from: number,
  count: number,
  maxTurns: number,
): RiskGameSpec[] {
  if (field.length === 0) throw new Error("a recording needs a field of at least one bot");
  return Array.from({ length: count }, (_, k) => {
    const index = from + k;
    return {
      index,
      seed: `${prefix}-${(index + 1).toString()}`,
      labels: Array.from({ length: players }, (_, seat) => field[(index + seat) % field.length]),
      maxTurns,
    };
  });
}

/** Shard `shard` of `shards` (0-based) of a recording of `games` games: a run of consecutive
 *  games, the shards together covering every game once. */
export function shardRange(games: number, shard: number, shards: number): { from: number; count: number } {
  if (!(Number.isInteger(shards) && shards >= 1 && Number.isInteger(shard) && shard >= 0 && shard < shards)) {
    throw new Error(`no shard ${shard.toString()} of ${shards.toString()}`);
  }
  const from = Math.floor((shard * games) / shards);
  return { from, count: Math.floor(((shard + 1) * games) / shards) - from };
}

/** A recorded position's board, as the seat built it from its view: the board v6 scored. Its
 *  turn order starts with the seat, which no bot reads apart from where each seat sits from
 *  another. */
export function positionBoard(p: SeatPosition): Board {
  return {
    order: p.order,
    players: p.order.length,
    owner: Int8Array.from(p.owner),
    armies: Int32Array.from(p.armies),
    alive: p.alive.slice(),
    handSize: p.hands.slice(),
    known: shapeOf(p.cards),
    cardEarned: p.cardEarned,
    turn: p.turn,
  };
}

/** A recorded position's v6 breakdown, as the record keeps it. */
export function positionBreakdown(p: SeatPosition): Breakdown {
  const { value, share, killExposure, borderLoss, opportunity, idle, commonThreat, total, power, spared } = p.v6;
  return { value, share, killExposure, borderLoss, opportunity, idle, commonThreat, total, power, spared };
}
