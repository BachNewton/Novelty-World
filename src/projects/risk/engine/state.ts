import type { Rng } from "@/shared/lib/seeded-random";
import type { CardId, GameEvent, GameState, Phase, Seat } from "../contract";
import { ADJACENCY, CONTINENTS, TERRITORIES, type ContinentId, type TerritoryId } from "../map";

export interface Holding {
  owner: Seat;
  armies: number;
}

/** Bookkeeping for one reinforce phase: the turn's own (`REINF-*`, `CARDS-5`) or the mid-attack
 *  one after an elimination (`ELIM-3`). */
export interface ReinforceState {
  armiesToPlace: number;
  /** Hand size when the phase began: 5 or more must trade and may trade twice (`CARDS-5`). */
  handAtStart: number;
  tradesMade: number;
  /** Trades come before placing (`CARDS-5`): the first placement closes trading. */
  placedAny: boolean;
  afterElimination: boolean;
}

export interface Occupying {
  from: TerritoryId;
  to: TerritoryId;
  /** Total armies moving in; `min` of them are already in `to` (`COMBAT-6`, `INV-1`). */
  min: number;
  max: number;
  /** The seat whose last territory this was, if it was: the elimination waits for the move-in
   *  (`ELIM-3`, note `elimination-order`). */
  eliminating: Seat | null;
}

/** The engine's whole game. Plain JSON: it is stored and sent between server and engine. */
export interface EngineState {
  players: number;
  /** The seeded random source's state (`INV-10`). */
  rng: number;
  turnOrder: Seat[];
  board: Record<TerritoryId, Holding>;
  hands: CardId[][];
  /** `drawPile[0]` is the top card. */
  drawPile: CardId[];
  discardPile: CardId[];
  setsTraded: number;
  eliminated: boolean[];
  /** 0 during setup; the first turn is 1. */
  turn: number;
  active: Seat;
  phase: Phase;
  /** During setup, the starting armies each seat has not yet placed (`SETUP-5`); null after. */
  setupArmiesLeft: number[] | null;
  reinforce: ReinforceState | null;
  occupying: Occupying | null;
  /** Whether the active seat has captured a territory this turn (`CARDS-1`). */
  capturedThisTurn: boolean;
  winner: Seat | null;
}

export function wrap(s: EngineState): GameState {
  return { engineState: s };
}

export function unwrap(state: GameState): EngineState {
  return state.engineState as EngineState;
}

/** What a move handler works on: a private copy of the state, the random source, and the events
 *  so far. */
export interface Ctx {
  s: EngineState;
  rng: Rng;
  events: GameEvent[];
}

export const TERRITORY_IDS: readonly TerritoryId[] = TERRITORIES.map((t) => t.id);
const TERRITORY_ID_SET = new Set<string>(TERRITORY_IDS);

export function isTerritoryId(value: unknown): value is TerritoryId {
  return typeof value === "string" && TERRITORY_ID_SET.has(value);
}

export function continentTerritories(continent: ContinentId): TerritoryId[] {
  return TERRITORIES.filter((t) => t.continent === continent).map((t) => t.id);
}

export const CONTINENT_IDS: readonly ContinentId[] = CONTINENTS.map((c) => c.id);

export function holding(s: EngineState, territory: TerritoryId): Holding {
  return s.board[territory];
}

export function ownerOf(s: EngineState, territory: TerritoryId): Seat {
  return s.board[territory].owner;
}

export function ownedBy(s: EngineState, owner: Seat): TerritoryId[] {
  return TERRITORY_IDS.filter((t) => s.board[t].owner === owner);
}

export function areAdjacent(a: TerritoryId, b: TerritoryId): boolean {
  return ADJACENCY[a].includes(b);
}

/** The next seat after `seat` in seat order that `eligible` accepts (`SETUP-2`, `TURN-2`). */
export function nextSeat(s: EngineState, seat: Seat, eligible: (seat: Seat) => boolean): Seat | null {
  const at = s.turnOrder.indexOf(seat);
  for (let step = 1; step <= s.turnOrder.length; step++) {
    const candidate = s.turnOrder[(at + step) % s.turnOrder.length];
    if (eligible(candidate)) return candidate;
  }
  return null;
}

export function seatsInGame(s: EngineState): Seat[] {
  return s.turnOrder.filter((seat) => !s.eliminated[seat]);
}

export function setPhase(ctx: Ctx, phase: Phase, rule: string): void {
  ctx.s.phase = phase;
  ctx.events.push({ rule, kind: "phase", phase });
}

export function rollDie(rng: Rng): number {
  return 1 + Math.floor(rng.next() * 6);
}
