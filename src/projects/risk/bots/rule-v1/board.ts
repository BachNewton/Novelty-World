import type { GameView, Seat } from "../../contract";
import { ADJACENCY, CONTINENTS, TERRITORIES, type TerritoryId } from "../../map";
import { shapeOf, type Shape } from "./cards";

// The bot's own board: the map as indices, and a position as flat arrays it can
// copy and change cheaply while it weighs plans. Built only from a seat's view.

export const N = TERRITORIES.length;
export const IDS: readonly TerritoryId[] = TERRITORIES.map((t) => t.id);
const INDEX = new Map<TerritoryId, number>(IDS.map((id, i) => [id, i]));

export function idx(id: TerritoryId): number {
  const i = INDEX.get(id);
  if (i === undefined) throw new Error(`no territory "${id}"`);
  return i;
}

export const ADJ: readonly (readonly number[])[] = IDS.map((id) => ADJACENCY[id].map(idx));
export const CONTINENT_OF: readonly number[] = TERRITORIES.map((t) => CONTINENTS.findIndex((c) => c.id === t.continent));
export const CONTINENT_MEMBERS: readonly (readonly number[])[] = CONTINENTS.map((c) =>
  TERRITORIES.flatMap((t, i) => (t.continent === c.id ? [i] : [])),
);
export const CONTINENT_BONUS: readonly number[] = CONTINENTS.map((c) => c.bonus);

/** A position: who holds what, every hand's size, and what the seat itself knows. */
export interface Board {
  /** Seat order: `order[0]` played first. */
  readonly order: readonly Seat[];
  readonly players: number;
  owner: Int8Array;
  armies: Int32Array;
  alive: boolean[];
  handSize: number[];
  /** The symbols of the cards the bot knows are in its own hand: all of them, until a
   *  plan takes a victim's unseen cards. */
  known: Shape;
  /** Whether the seat to move has captured this turn, so draws a card as it ends (`CARDS-1`). */
  cardEarned: boolean;
  /** Turns begun in the game: a seat whose place in the order is at or past it has not had
   *  its first turn (`REINF-6`). */
  turn: number;
}

export function fromView(view: GameView): Board {
  const owner = new Int8Array(N);
  const armies = new Int32Array(N);
  for (let i = 0; i < N; i++) {
    const t = view.territories[IDS[i]];
    owner[i] = t.owner;
    armies[i] = t.armies;
  }
  const players = view.seats.length;
  const b: Board = {
    order: view.turnOrder,
    players,
    owner,
    armies,
    alive: view.seats.map((s) => !s.eliminated),
    handSize: view.seats.map((s) => s.handSize),
    known: shapeOf(view.cards.hand ?? []),
    cardEarned: view.cardEarned,
    turn: view.turn,
  };
  // A seat whose last territory was just taken is out once the move-in is made
  // (`ELIM-2`): its cards are the capturer's already.
  for (const s of view.seats) eliminateIfEmpty(b, s.seat, view.active);
  return b;
}

export function copyBoard(b: Board): Board {
  return {
    order: b.order,
    players: b.players,
    owner: b.owner.slice(),
    armies: b.armies.slice(),
    alive: b.alive.slice(),
    handSize: b.handSize.slice(),
    known: b.known,
    cardEarned: b.cardEarned,
    turn: b.turn,
  };
}

/** Everything a position holds, as a key: two boards with the same key are the same
 *  position, so a pure function of a board may remember its answer by it. */
export function boardKey(b: Board): string {
  return `${b.order.join("")}|${b.owner.join("")}|${b.armies.join(",")}|${b.alive.map(Number).join("")}|${b.handSize.join(",")}|${b.known.join(",")}|${String(b.cardEarned)}|${b.turn.toString()}`;
}

export function territoriesOf(b: Board, seat: Seat): number[] {
  const out: number[] = [];
  for (let i = 0; i < N; i++) if (b.owner[i] === seat) out.push(i);
  return out;
}

export function countOf(b: Board, seat: Seat): number {
  let n = 0;
  for (let i = 0; i < N; i++) if (b.owner[i] === seat) n++;
  return n;
}

export function armiesOf(b: Board, seat: Seat): number {
  let n = 0;
  for (let i = 0; i < N; i++) if (b.owner[i] === seat) n += b.armies[i];
  return n;
}

export function holdsContinent(b: Board, seat: Seat, c: number): boolean {
  return CONTINENT_MEMBERS[c].every((t) => b.owner[t] === seat);
}

/** `REINF-2` and `REINF-3`: the armies `seat` would get from the board at the start of a turn. */
export function boardIncome(b: Board, seat: Seat): number {
  let income = Math.max(3, Math.floor(countOf(b, seat) / 3));
  for (let c = 0; c < CONTINENT_BONUS.length; c++) if (holdsContinent(b, seat, c)) income += CONTINENT_BONUS[c];
  return income;
}

export function hasEnemyNeighbour(b: Board, t: number): boolean {
  const me = b.owner[t];
  return ADJ[t].some((n) => b.owner[n] !== me);
}

/** The seats still in the game that move after `seat` and before its next turn, in order. */
export function opponentsInOrder(b: Board, seat: Seat): Seat[] {
  const at = b.order.indexOf(seat);
  const out: Seat[] = [];
  for (let step = 1; step < b.order.length; step++) {
    const s = b.order[(at + step) % b.order.length];
    if (b.alive[s]) out.push(s);
  }
  return out;
}

/** Marks a seat out of the game once it holds nothing, handing its cards to `by` (`ELIM-2`). */
export function eliminateIfEmpty(b: Board, victim: Seat, by: Seat): boolean {
  if (!b.alive[victim] || countOf(b, victim) > 0) return false;
  b.alive[victim] = false;
  b.handSize[by] += b.handSize[victim];
  b.handSize[victim] = 0;
  return true;
}

/** `REINF-6`: the extra armies `seat` gets on its first turn, if it is still to come. */
export function firstTurnBonus(b: Board, seat: Seat): number {
  const at = b.order.indexOf(seat);
  if (at < b.turn) return 0;
  const table: Record<number, readonly number[]> = { 3: [0, 0, 1], 4: [0, 0, 0, 1], 5: [0, 0, 0, 1, 2], 6: [0, 0, 0, 1, 2, 3] };
  return table[b.order.length][at];
}
