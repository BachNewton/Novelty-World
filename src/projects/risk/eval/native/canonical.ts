import { createHash } from "node:crypto";
import type { CardId, GameState, Options, Phase } from "../../contract";
import { FULL_DECK } from "../../cards";
import { ADJACENCY, type TerritoryId } from "../../map";
import { TERRITORY_IDS, unwrap } from "../../engine/state";

// The canonical byte layout of a state and of a seat's options, and their hashes: what the Rust
// port (`native/`) writes identically, so a game record's hashes prove the two engines move for
// move (`ideas/native-port.md`, "Proving it"). The layout is the GPU engine's
// (`ideas/gpu-engine.md`, "Canonical layout and hash"), so the two efforts' fixtures interchange.
// Every field is a 4-byte little-endian integer: unsigned for the random source, signed otherwise.

export const HAND_MAX = 12;
const SEATS = 6;
const TERRITORY_COUNT = TERRITORY_IDS.length;
const DECK_SIZE = FULL_DECK.length;

const TERRITORY_INDEX = new Map<TerritoryId, number>(TERRITORY_IDS.map((t, i) => [t, i]));
/** A territory's card is the territory's index; the wilds are 42 and 43 (`FULL_DECK`'s order). */
const CARD_INDEX = new Map<CardId, number>(FULL_DECK.map((c, i) => [c, i]));

export function territoryIndex(territory: TerritoryId): number {
  const i = TERRITORY_INDEX.get(territory);
  if (i === undefined) throw new Error(`no territory "${String(territory)}"`);
  return i;
}

export function cardIndex(card: CardId): number {
  const i = CARD_INDEX.get(card);
  if (i === undefined) throw new Error(`no card "${String(card)}"`);
  return i;
}

export function territoryAt(i: number): TerritoryId {
  if (!(Number.isInteger(i) && i >= 0 && i < TERRITORY_COUNT)) throw new Error(`no territory at index ${String(i)}`);
  return TERRITORY_IDS[i];
}

export function cardAt(i: number): CardId {
  if (!(Number.isInteger(i) && i >= 0 && i < DECK_SIZE)) throw new Error(`no card at index ${String(i)}`);
  return FULL_DECK[i];
}

/** The 166 directed borders: each territory in map order, each neighbour in its `ADJACENCY`
 *  order, the order the engine's `attacks` lists them in. */
export const EDGES: readonly (readonly [from: number, to: number])[] = TERRITORY_IDS.flatMap((from, i) =>
  ADJACENCY[from].map((to) => [i, territoryIndex(to)] as const),
);
if (EDGES.length !== 166) throw new Error(`the board has ${EDGES.length.toString()} directed borders, not 166`);

const EDGE_INDEX = new Map<number, number>(EDGES.map(([from, to], k) => [from * TERRITORY_COUNT + to, k]));

function edgeIndex(from: TerritoryId, to: TerritoryId): number {
  const k = EDGE_INDEX.get(territoryIndex(from) * TERRITORY_COUNT + territoryIndex(to));
  if (k === undefined) throw new Error(`${from} and ${to} don't border`);
  return k;
}

const PHASE_CODES: Record<Phase, number> = { reinforce: 0, attack: 1, fortify: 2, "game-over": 3 };

/** A layout being written: int32 fields, then bytes. */
class Layout {
  private readonly fields: number[] = [];

  int(n: number): void {
    if (!(Number.isInteger(n) && n >= -0x80000000 && n <= 0x7fffffff)) throw new Error(`${String(n)} is not an int32`);
    this.fields.push(n);
  }

  /** Written as the same four bytes as an int32 holding its bits. */
  uint(n: number): void {
    if (!(Number.isInteger(n) && n >= 0 && n <= 0xffffffff)) throw new Error(`${String(n)} is not a uint32`);
    this.fields.push(n | 0);
  }

  flag(b: boolean): void {
    this.fields.push(b ? 1 : 0);
  }

  /** `items`, then −1 up to `length`; more than `length` items is a layout the other side can't
   *  hold, so it fails. */
  padded(items: readonly number[], length: number, what: string): void {
    if (items.length > length) throw new Error(`${what} has ${items.length.toString()} entries, past its ${length.toString()}`);
    for (let i = 0; i < length; i++) this.int(i < items.length ? items[i] : -1);
  }

  /** 0/1 per territory, 1 for each listed. */
  territories(listed: readonly TerritoryId[]): void {
    const flags = new Array<number>(TERRITORY_COUNT).fill(0);
    for (const t of listed) flags[territoryIndex(t)] = 1;
    for (const v of flags) this.int(v);
  }

  bytes(): Buffer {
    const out = Buffer.alloc(this.fields.length * 4);
    this.fields.forEach((v, i) => out.writeInt32LE(v, i * 4));
    return out;
  }
}

/** The state's layout: players; rng; turnOrder[6]; owner[42]; armies[42]; per seat handLen and
 *  hand[12]; deckLen; deck[44]; tradesCount; eliminated[6]; turn; round; active; phase; the
 *  reinforce record (present, armiesToPlace, placedAny, afterElimination); the occupying record
 *  (present, from, to, min, max, eliminating); capturedThisTurn; winner. */
export function stateBytes(state: GameState): Buffer {
  const s = unwrap(state);
  const f = new Layout();
  f.int(s.players);
  f.uint(s.rng);
  f.padded(s.turnOrder, SEATS, "the turn order");
  for (const t of TERRITORY_IDS) f.int(s.board[t].owner);
  for (const t of TERRITORY_IDS) f.int(s.board[t].armies);
  for (let seat = 0; seat < SEATS; seat++) {
    const hand = seat < s.players ? s.hands[seat] : [];
    f.int(hand.length);
    f.padded(hand.map(cardIndex), HAND_MAX, `seat ${seat.toString()}'s hand`);
  }
  f.int(s.deck.length);
  f.padded(s.deck.map(cardIndex), DECK_SIZE, "the deck");
  f.int(s.trades.length);
  for (let seat = 0; seat < SEATS; seat++) f.flag(seat < s.players && s.eliminated[seat]);
  f.int(s.turn);
  f.int(s.round);
  f.int(s.active);
  f.int(PHASE_CODES[s.phase]);
  const r = s.reinforce;
  f.flag(r !== null);
  f.int(r ? r.armiesToPlace : 0);
  f.flag(r ? r.placedAny : false);
  f.flag(r ? r.afterElimination : false);
  const o = s.occupying;
  f.flag(o !== null);
  f.int(o ? territoryIndex(o.from) : -1);
  f.int(o ? territoryIndex(o.to) : -1);
  f.int(o ? o.min : 0);
  f.int(o ? o.max : 0);
  f.int(o?.eliminating ?? -1);
  f.flag(s.capturedThisTurn);
  f.int(s.winner ?? -1);
  return f.bytes();
}

/** The options' layout: a kind (0 reinforce, 1 attack, 2 occupy, 3 fortify), then by kind.
 *  Reinforce: armiesToPlace, mayPlace, mustTrade, own[42], setCount and each set's three cards in
 *  `setsIn`'s order, bonus[42]. Attack: maxDice[166] over `EDGES`, 0 where not legal. Occupy:
 *  from, to, min, max. Fortify: maxArmies[42 × 42] by [from][to], 0 where not legal. */
export function optionsBytes(options: Options): Buffer {
  const f = new Layout();
  switch (options.kind) {
    case "reinforce":
      f.int(0);
      f.int(options.armiesToPlace);
      f.flag(options.mayPlace);
      f.flag(options.mustTrade);
      f.territories(options.ownTerritories);
      f.int(options.sets.length);
      for (const set of options.sets) for (const card of set) f.int(cardIndex(card));
      f.territories(options.bonusTerritories);
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
  return f.bytes();
}

/** SHA-256 of a layout, the first 16 hex characters. */
export function hashBytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

export function stateHash(state: GameState): string {
  return hashBytes(stateBytes(state));
}

export function optionsHash(options: Options): string {
  return hashBytes(optionsBytes(options));
}

/** A layout read back as its int32 fields, for a divergence report. */
export function fieldsOf(bytes: Buffer): number[] {
  return Array.from({ length: bytes.length / 4 }, (_, i) => bytes.readInt32LE(i * 4));
}
