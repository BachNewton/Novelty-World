import { createRng, pick, type Rng } from "@/shared/lib/seeded-random";
import type { CardId, GameEvent, GameState, GameView, Move, Options, RiskEngine, Seat } from "../contract";
import { ADJACENCY, type TerritoryId } from "../map";
import { FULL_DECK } from "./cards";
import { referenceEngine } from "./index";
import { InvariantChecker } from "./invariants";
import { rollDie, TERRITORY_IDS, unwrap, wrap, type Ctx, type EngineState } from "./state";
import { startTurn } from "./turn";

// Tools for the engine's tests: scripted positions, scripted dice, a model of what `options`
// allows, and a random-legal player.

export interface Position {
  players?: number;
  /** Owner and armies of named territories. */
  board?: Partial<Record<TerritoryId, [Seat, number]>>;
  /** Owner and armies of every other territory. */
  rest?: [Seat, number];
  hands?: CardId[][];
  setsTraded?: number;
  eliminated?: Seat[];
  /** Whose turn begins (its reinforce phase, `REINF-1`). */
  active?: Seat;
  /** The random source's state as the turn begins: see `rngForDice`. */
  rng?: number;
  /** The draw pile, top first; every card in no hand and not here is in the discard pile. By
   *  default every card in no hand, in deck order. */
  drawPile?: CardId[];
  /** Skips ahead in the turn: straight to its attack or fortify phase. */
  phase?: "reinforce" | "attack" | "fortify";
  capturedThisTurn?: boolean;
}

/** A mid-game state at the start of `active`'s turn, in seat order 0, 1, 2… */
export function position(p: Position): GameState {
  const players = p.players ?? 3;
  const seats = Array.from({ length: players }, (_, seat) => seat);
  const hands = p.hands ?? seats.map(() => []);
  const held = new Set(hands.flat());
  const s: EngineState = {
    players,
    rng: p.rng ?? 1,
    turnOrder: seats,
    board: {} as EngineState["board"],
    hands: seats.map((seat) => [...(hands[seat] ?? [])]),
    drawPile: p.drawPile ?? FULL_DECK.filter((c) => !held.has(c)),
    discardPile: FULL_DECK.filter((c) => !held.has(c) && p.drawPile !== undefined && !p.drawPile.includes(c)),
    setsTraded: p.setsTraded ?? 0,
    eliminated: seats.map((seat) => p.eliminated?.includes(seat) ?? false),
    turn: 0,
    active: p.active ?? 0,
    phase: "setup-place",
    setupArmiesLeft: null,
    reinforce: null,
    occupying: null,
    capturedThisTurn: false,
    winner: null,
  };
  const rest = p.rest ?? [players - 1, 1];
  for (const t of TERRITORY_IDS) {
    const [owner, armies] = p.board?.[t] ?? rest;
    s.board[t] = { owner, armies };
  }
  const ctx: Ctx = { s, rng: createRng(s.rng), events: [] };
  startTurn(ctx, s.active, "test");
  if (p.phase && p.phase !== "reinforce") {
    s.reinforce = null;
    s.phase = p.phase;
  }
  s.capturedThisTurn = p.capturedThisTurn ?? false;
  return wrap(s);
}

/** Reads the engine's state, for tests that check what a view or event cannot show. */
export function inside(state: GameState): EngineState {
  return unwrap(state);
}

/** A copy of `state` with its random source set so the next dice rolled are `dice`. */
export function withDice(state: GameState, dice: readonly number[]): GameState {
  const s = structuredClone(unwrap(state));
  s.rng = rngForDice(dice);
  return wrap(s);
}

/** The first random-source state whose next rolls are `dice` (found by search, so keep it to a
 *  handful of dice). */
export function rngForDice(dice: readonly number[]): number {
  for (let candidate = 0; candidate < 50_000_000; candidate++) {
    const rng = createRng(candidate);
    if (dice.every((d) => rollDie(rng) === d)) return candidate;
  }
  throw new Error(`no random state rolls ${dice.join(",")}`);
}

/** Applies a move that must be legal. */
export function play(engine: RiskEngine, state: GameState, seat: Seat, move: Move) {
  const result = engine.apply(state, seat, move);
  if (!result.ok) throw new Error(`${JSON.stringify(move)} was refused: ${result.reason}`);
  return result;
}

// ---------------------------------------------------------------------------
// What the options allow, worked out from the options alone
// ---------------------------------------------------------------------------

const isInt = (n: number) => Number.isInteger(n);

/** Whether `options` (with the board from `view`) allows `move`, read from the contract's
 *  description of the options rather than from the engine. */
export function optionsAllow(options: Options | null, view: GameView, move: Move): boolean {
  if (!options) return false;
  switch (options.kind) {
    case "setup-place":
      return (
        move.kind === "place" &&
        options.ownTerritories.includes(move.territory) &&
        isInt(move.armies) &&
        move.armies >= 1 &&
        move.armies <= options.ownArmiesLeft
      );
    case "reinforce":
      if (move.kind === "place") {
        return (
          options.mayPlace &&
          options.ownTerritories.includes(move.territory) &&
          isInt(move.armies) &&
          move.armies >= 1 &&
          move.armies <= options.armiesToPlace
        );
      }
      if (move.kind === "trade") {
        const cards: readonly string[] = move.cards;
        const listed = options.sets.some(
          (set) => cards.length === 3 && new Set(cards).size === 3 && set.every((c) => cards.includes(c)),
        );
        if (!listed) return false;
        const choices = options.bonusTerritories.filter((t) => cards.includes(t));
        return move.bonusTerritory === undefined ? choices.length <= 1 : choices.includes(move.bonusTerritory);
      }
      return false;
    case "attack": {
      if (move.kind === "end-attack") return true;
      if (move.kind !== "attack" && move.kind !== "blitz") return false;
      const entry = options.attacks.find((a) => a.from === move.from && a.to === move.to);
      if (!entry) return false;
      if (move.kind === "attack") return isInt(move.dice) && move.dice >= 1 && move.dice <= entry.maxDice;
      const armies = view.territories[move.from].armies;
      return isInt(move.keepAtLeast) && move.keepAtLeast >= 1 && move.keepAtLeast < armies;
    }
    case "occupy":
      return move.kind === "occupy" && isInt(move.armies) && move.armies >= options.min && move.armies <= options.max;
    case "fortify": {
      if (move.kind === "end-turn") return true;
      if (move.kind !== "fortify") return false;
      const entry = options.moves.find((m) => m.from === move.from && m.to === move.to);
      return !!entry && isInt(move.armies) && move.armies >= 1 && move.armies <= entry.maxArmies;
    }
  }
}

const between = (rng: Rng, low: number, high: number) => low + Math.floor(rng.next() * (high - low + 1));

/** A random move the options allow. It leans on a simple plan (stack armies on one front,
 *  attack only where stronger, move everything in) so that random games finish; otherwise
 *  armies spread thin and a game can run for ever. */
export function randomLegalMove(options: Options, view: GameView, rng: Rng): Move {
  const armies = (t: TerritoryId) => view.territories[t].armies;
  const planned = rng.next() < 0.85;
  switch (options.kind) {
    case "setup-place":
      return { kind: "place", territory: pick(rng, options.ownTerritories), armies: between(rng, 1, options.ownArmiesLeft) };
    case "reinforce": {
      if (options.sets.length > 0 && (options.mustTrade || rng.next() < 0.6)) {
        const cards = pick(rng, options.sets);
        const choices = options.bonusTerritories.filter((t) => (cards as readonly string[]).includes(t));
        return choices.length > 1
          ? { kind: "trade", cards, bonusTerritory: pick(rng, choices) }
          : { kind: "trade", cards };
      }
      const front = options.ownTerritories.filter((t) =>
        ADJACENCY[t].some((n) => view.territories[n].owner !== view.active),
      );
      const stack = front.reduce<TerritoryId | null>((best, t) => (best === null || armies(t) > armies(best) ? t : best), null);
      return {
        kind: "place",
        territory: planned && stack !== null ? stack : pick(rng, options.ownTerritories),
        armies: planned ? options.armiesToPlace : between(rng, 1, options.armiesToPlace),
      };
    }
    case "attack": {
      const strong = options.attacks.filter((a) => armies(a.from) > armies(a.to));
      if (strong.length === 0 && (planned || rng.next() < 0.5)) return { kind: "end-attack" };
      if (rng.next() < 0.03) return { kind: "end-attack" };
      const a = pick(rng, planned ? strong : options.attacks);
      if (!planned && rng.next() < 0.5) {
        return { kind: "attack", from: a.from, to: a.to, dice: between(rng, 1, a.maxDice) as 1 | 2 | 3 };
      }
      return { kind: "blitz", from: a.from, to: a.to, keepAtLeast: planned ? 1 : between(rng, 1, armies(a.from) - 1) };
    }
    case "occupy":
      return { kind: "occupy", armies: planned ? options.max : between(rng, options.min, options.max) };
    case "fortify": {
      if (rng.next() < 0.5) return { kind: "end-turn" };
      const m = pick(rng, options.moves);
      return { kind: "fortify", from: m.from, to: m.to, armies: between(rng, 1, m.maxArmies) };
    }
  }
}

/** A move of any kind built to sit near the edge of legality: real or unreal territories, army
 *  counts just inside and just outside the limits, cards in or out of the hand. */
export function plausibleMove(options: Options | null, view: GameView, rng: Rng): Move {
  const territory = (): TerritoryId => {
    const near: TerritoryId[] = [];
    if (options?.kind === "setup-place") near.push(...options.ownTerritories);
    if (options?.kind === "reinforce") near.push(...options.ownTerritories, ...options.bonusTerritories);
    if (options?.kind === "attack") for (const a of options.attacks) near.push(a.from, a.to);
    if (options?.kind === "fortify") for (const m of options.moves) near.push(m.from, m.to);
    if (rng.next() < 0.03) return "atlantis" as TerritoryId;
    return near.length > 0 && rng.next() < 0.7 ? pick(rng, near) : pick(rng, TERRITORY_IDS);
  };
  const count = (): number => {
    const r = rng.next();
    if (r < 0.05) return 1.5;
    if (r < 0.1) return -1;
    return between(rng, 0, 8);
  };
  const card = (): CardId => {
    const hand = view.cards.hand ?? [];
    return hand.length > 0 && rng.next() < 0.8 ? pick(rng, hand) : pick(rng, FULL_DECK);
  };
  switch (between(rng, 1, 10)) {
    case 1:
    case 2:
      return { kind: "place", territory: territory(), armies: count() };
    case 3: {
      const cards: [CardId, CardId, CardId] = [card(), card(), card()];
      return rng.next() < 0.5 ? { kind: "trade", cards } : { kind: "trade", cards, bonusTerritory: territory() };
    }
    case 4:
      return { kind: "attack", from: territory(), to: territory(), dice: between(rng, 0, 4) as 1 | 2 | 3 };
    case 5:
      return { kind: "blitz", from: territory(), to: territory(), keepAtLeast: count() };
    case 6:
      return { kind: "occupy", armies: count() };
    case 7:
      return { kind: "end-attack" };
    case 8:
      return { kind: "fortify", from: territory(), to: territory(), armies: count() };
    default:
      return { kind: "end-turn" };
  }
}

// ---------------------------------------------------------------------------
// Random-legal games
// ---------------------------------------------------------------------------

export interface PlayedGame {
  steps: number;
  turns: number;
  winner: Seat | null;
  final: GameState;
  moves: { seat: Seat; move: Move }[];
  events: GameEvent[];
}

export interface PlayOptions {
  players: number;
  seed: string;
  engine: RiskEngine;
  maxSteps: number;
  /** Called on every step with the state it starts from, before the move is applied. */
  onStep?: (state: GameState, seat: Seat, options: Options, view: GameView, rng: Rng) => void;
}

/** Plays a whole game with random legal moves, checking every invariant on every step. */
export function playRandomGame(p: PlayOptions): PlayedGame {
  const checker = new InvariantChecker();
  const started = p.engine.newGame({ players: p.players }, p.seed);
  checker.start(started.state, started.events);
  const rng = createRng(`player:${p.seed}`);
  let state = started.state;
  const moves: { seat: Seat; move: Move }[] = [];
  const events: GameEvent[] = [...started.events];
  for (let step = 0; step < p.maxSteps; step++) {
    const v = p.engine.view(state, null);
    if (v.phase === "game-over") {
      return { steps: step, turns: v.turn, winner: v.winner, final: state, moves, events };
    }
    const seat = v.active;
    const options = p.engine.options(state, seat);
    if (!options) throw new Error(`the active seat ${seat} has no options in ${v.phase}`);
    const seatView = p.engine.view(state, seat);
    p.onStep?.(state, seat, options, seatView, rng);
    const move = randomLegalMove(options, seatView, rng);
    const result = play(p.engine, state, seat, move);
    checker.step(state, result.state, result.events);
    moves.push({ seat, move });
    events.push(...result.events);
    state = result.state;
  }
  throw new Error(`game ${p.seed} (${p.players} players) did not end in ${p.maxSteps} steps`);
}

/** Several times the longest random game measured (about 7,300 steps), so only a game that
 *  stalls hits it. */
export const MAX_STEPS = 50_000;

/** On every step: random legal moves from the options are accepted, moves of every kind near the
 *  edge of legality are accepted exactly when the options allow them, and no other seat can move. */
export function checkOptionsMatchApply(state: GameState, seat: Seat, options: Options, view: GameView, rng: Rng) {
  const move = randomLegalMove(options, view, rng);
  const result = referenceEngine.apply(state, seat, move);
  if (!result.ok) throw new Error(`options allowed ${JSON.stringify(move)}, apply refused: ${result.reason}`);
  for (let i = 0; i < 3; i++) {
    const edge = plausibleMove(options, view, rng);
    const allowed = optionsAllow(options, view, edge);
    const accepted = referenceEngine.apply(state, seat, edge).ok;
    if (allowed !== accepted) {
      throw new Error(
        `${JSON.stringify(edge)} in ${options.kind}: options ${allowed ? "allow" : "forbid"} it, apply ${accepted ? "accepts" : "refuses"} it`,
      );
    }
  }
  const other = pick(rng, view.seats.filter((s) => s.seat !== seat)).seat;
  if (referenceEngine.options(state, other) !== null) throw new Error(`seat ${other} has options on seat ${seat}'s turn`);
  if (referenceEngine.apply(state, other, move).ok) throw new Error(`seat ${other} moved on seat ${seat}'s turn`);
}
