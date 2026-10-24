import { createHash } from "node:crypto";
import type { CardId, GameState, Move, Options, Phase } from "../contract";
import { FULL_DECK } from "../cards";
import { ADJACENCY, TERRITORIES, type TerritoryId } from "../map";
import { TERRITORY_IDS, unwrap } from "../engine/state";

// The canonical byte layout of a state and of a seat's options, and their hashes, which the GPU
// engine (`gpu/riskgpu/canonical.py`) writes identically: the contract between the two engines,
// specified in `ideas/gpu-engine.md`. Every field is a 4-byte little-endian integer.

export const HAND_MAX = 12;
const SEATS = 6;
const TERRITORY_COUNT = TERRITORIES.length;

const TERRITORY_INDEX = new Map<TerritoryId, number>(TERRITORY_IDS.map((t, i) => [t, i]));

/** A territory's card is the territory's own index; the wilds are 42 and 43. */
export const CARD_IDS: readonly CardId[] = FULL_DECK;
const CARD_INDEX = new Map<CardId, number>(CARD_IDS.map((c, i) => [c, i]));

export function territoryIndex(t: TerritoryId): number {
  const i = TERRITORY_INDEX.get(t);
  if (i === undefined) throw new Error(`no territory "${String(t)}"`);
  return i;
}

export function cardIndex(card: CardId): number {
  const i = CARD_INDEX.get(card);
  if (i === undefined) throw new Error(`no card "${String(card)}"`);
  return i;
}

function territoryAt(i: number): TerritoryId {
  if (!(Number.isInteger(i) && i >= 0 && i < TERRITORY_COUNT)) throw new Error(`no territory index ${i.toString()}`);
  return TERRITORY_IDS[i];
}

function cardAt(i: number): CardId {
  if (!(Number.isInteger(i) && i >= 0 && i < CARD_IDS.length)) throw new Error(`no card index ${i.toString()}`);
  return CARD_IDS[i];
}

/** The canonical directed border edges: each territory in map order, each neighbour in its
 *  `ADJACENCY` order, which is the order the engine's `attacks` lists them. */
export const EDGES: readonly (readonly [number, number])[] = TERRITORY_IDS.flatMap((from, i) =>
  ADJACENCY[from].map((to) => [i, territoryIndex(to)] as const),
);
if (EDGES.length !== 166) throw new Error(`the board has ${EDGES.length.toString()} directed edges, not 166`);

const EDGE_INDEX = new Map<number, number>(EDGES.map(([from, to], k) => [from * TERRITORY_COUNT + to, k]));

export function edgeIndex(from: TerritoryId, to: TerritoryId): number {
  const k = EDGE_INDEX.get(territoryIndex(from) * TERRITORY_COUNT + territoryIndex(to));
  if (k === undefined) throw new Error(`${from} and ${to} don't border`);
  return k;
}

const PHASES: Record<Phase, number> = { reinforce: 0, attack: 1, fortify: 2, "game-over": 3 };

/** Int32 fields, written little-endian, `rng` unsigned. */
class Fields {
  readonly values: number[] = [];

  int(n: number): void {
    if (!(Number.isInteger(n) && n >= -0x80000000 && n <= 0x7fffffff)) throw new Error(`${n.toString()} is not an int32`);
    this.values.push(n);
  }

  uint(n: number): void {
    if (!(Number.isInteger(n) && n >= 0 && n <= 0xffffffff)) throw new Error(`${n.toString()} is not a uint32`);
    this.values.push(n | 0);
  }

  bool(b: boolean): void {
    this.values.push(b ? 1 : 0);
  }

  padded(items: readonly number[], length: number): void {
    if (items.length > length) throw new Error(`${items.length.toString()} entries overflow a field of ${length.toString()}`);
    for (let i = 0; i < length; i++) this.int(i < items.length ? items[i] : -1);
  }

  buffer(): Buffer {
    const out = Buffer.alloc(this.values.length * 4);
    this.values.forEach((v, i) => out.writeInt32LE(v, i * 4));
    return out;
  }
}

export function canonicalState(state: GameState): Buffer {
  const s = unwrap(state);
  const f = new Fields();
  f.int(s.players);
  f.uint(s.rng);
  f.padded(s.turnOrder, SEATS);
  for (const t of TERRITORY_IDS) f.int(s.board[t].owner);
  for (const t of TERRITORY_IDS) f.int(s.board[t].armies);
  for (let seat = 0; seat < SEATS; seat++) {
    const hand = seat < s.players ? s.hands[seat] : [];
    if (hand.length > HAND_MAX) throw new Error(`seat ${seat.toString()} holds ${hand.length.toString()} cards, past HAND_MAX ${HAND_MAX.toString()}`);
    f.int(hand.length);
    f.padded(hand.map(cardIndex), HAND_MAX);
  }
  f.int(s.deck.length);
  f.padded(s.deck.map(cardIndex), CARD_IDS.length);
  f.int(s.trades.length);
  for (let seat = 0; seat < SEATS; seat++) f.bool(seat < s.players && s.eliminated[seat]);
  f.int(s.turn);
  f.int(s.round);
  f.int(s.active);
  f.int(PHASES[s.phase]);
  const r = s.reinforce;
  f.bool(r !== null);
  f.int(r?.armiesToPlace ?? 0);
  f.bool(r?.placedAny ?? false);
  f.bool(r?.afterElimination ?? false);
  const o = s.occupying;
  f.bool(o !== null);
  f.int(o ? territoryIndex(o.from) : -1);
  f.int(o ? territoryIndex(o.to) : -1);
  f.int(o?.min ?? 0);
  f.int(o?.max ?? 0);
  f.int(o?.eliminating ?? -1);
  f.bool(s.capturedThisTurn);
  f.int(s.winner ?? -1);
  return f.buffer();
}

function territoryFlags(territories: readonly TerritoryId[]): number[] {
  const flags = new Array<number>(TERRITORY_COUNT).fill(0);
  for (const t of territories) flags[territoryIndex(t)] = 1;
  return flags;
}

export function canonicalOptions(options: Options): Buffer {
  const f = new Fields();
  switch (options.kind) {
    case "reinforce":
      f.int(0);
      f.int(options.armiesToPlace);
      f.bool(options.mayPlace);
      f.bool(options.mustTrade);
      for (const v of territoryFlags(options.ownTerritories)) f.int(v);
      f.int(options.sets.length);
      for (const set of options.sets) for (const card of set) f.int(cardIndex(card));
      for (const v of territoryFlags(options.bonusTerritories)) f.int(v);
      break;
    case "attack": {
      f.int(1);
      const dice = new Array<number>(EDGES.length).fill(0);
      for (const a of options.attacks) dice[edgeIndex(a.from, a.to)] = a.maxDice;
      for (const v of dice) f.int(v);
      break;
    }
    case "occupy":
      f.int(2);
      f.int(territoryIndex(options.from));
      f.int(territoryIndex(options.to));
      f.int(options.min);
      f.int(options.max);
      break;
    case "fortify": {
      f.int(3);
      const armies = new Array<number>(TERRITORY_COUNT * TERRITORY_COUNT).fill(0);
      for (const m of options.moves) armies[territoryIndex(m.from) * TERRITORY_COUNT + territoryIndex(m.to)] = m.maxArmies;
      for (const v of armies) f.int(v);
      break;
    }
  }
  return f.buffer();
}

/** SHA-256, hex, its first 16 characters. */
export function hashOf(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex").slice(0, 16);
}

/** A canonical layout as the int32 values it holds, for a debugging dump. */
export function int32s(buffer: Buffer): number[] {
  return Array.from({ length: buffer.length / 4 }, (_, i) => buffer.readInt32LE(i * 4));
}

/** A move as five int32s: its kind, then up to four fields, unused fields 0. */
export type EncodedMove = [kind: number, x: number, y: number, z: number, w: number];

export function encodeMove(move: Move): EncodedMove {
  switch (move.kind) {
    case "place":
      return [0, territoryIndex(move.territory), move.armies, 0, 0];
    case "trade": {
      const [c1, c2, c3] = move.cards.map(cardIndex);
      return [1, c1, c2, c3, move.bonusTerritory === undefined ? -1 : territoryIndex(move.bonusTerritory)];
    }
    case "attack":
      return [2, territoryIndex(move.from), territoryIndex(move.to), move.dice, 0];
    case "blitz":
      return [3, territoryIndex(move.from), territoryIndex(move.to), move.keepAtLeast, 0];
    case "occupy":
      return [4, move.armies, 0, 0, 0];
    case "end-attack":
      return [5, 0, 0, 0, 0];
    case "fortify":
      return [6, territoryIndex(move.from), territoryIndex(move.to), move.armies, 0];
    case "end-turn":
      return [7, 0, 0, 0, 0];
  }
}

export function decodeMove([kind, x, y, z, w]: readonly number[]): Move {
  switch (kind) {
    case 0:
      return { kind: "place", territory: territoryAt(x), armies: y };
    case 1: {
      const cards = [cardAt(x), cardAt(y), cardAt(z)] as const;
      return w === -1 ? { kind: "trade", cards } : { kind: "trade", cards, bonusTerritory: territoryAt(w) };
    }
    case 2:
      if (z !== 1 && z !== 2 && z !== 3) throw new Error(`an attack rolls 1 to 3 dice, not ${z.toString()}`);
      return { kind: "attack", from: territoryAt(x), to: territoryAt(y), dice: z };
    case 3:
      return { kind: "blitz", from: territoryAt(x), to: territoryAt(y), keepAtLeast: z };
    case 4:
      return { kind: "occupy", armies: x };
    case 5:
      return { kind: "end-attack" };
    case 6:
      return { kind: "fortify", from: territoryAt(x), to: territoryAt(y), armies: z };
    case 7:
      return { kind: "end-turn" };
    default:
      throw new Error(`no move kind ${String(kind)}`);
  }
}

