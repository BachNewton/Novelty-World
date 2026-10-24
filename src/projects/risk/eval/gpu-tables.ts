import { createRng } from "@/shared/lib/seeded-random";
import { balancedFight, estimatedWinChance, resolveBlitz, type BlitzResult } from "../blitz";
import { balanceWinChance, idealAttackUnits, winChance } from "../bots/gd/odds";
import type { CardSymbol, GameEvent } from "../contract";
import { GD_LINKS, GD_ORDER } from "../bots/gd/board";
import { CONTINENTS, TERRITORIES, ADJACENCY } from "../map";
import { newGame, STARTING_ARMIES } from "../engine/setup";
import { beginReinforce } from "../engine/reinforce";
import { unwrap, type Ctx, type EngineState } from "../engine/state";
import { CARD_IDS, EDGES, territoryIndex } from "./gpu-canonical";

// What the GPU engine reads instead of computing (`ideas/gpu-engine.md`): the board as index
// arrays, and the blitz tables, exactly what `resolveBlitz` compares, so the GPU never computes an
// odd or sums a float of its own.

const SYMBOLS: Record<CardSymbol, number> = { infantry: 0, cavalry: 1, artillery: 2 };

/** `REINF-6`'s first-turn bonus by position in the turn order, read from the engine itself: each
 *  position's reinforcements begun on the first round of a fresh game. */
function firstTurnBonus(players: number): number[] {
  const base = unwrap(newGame({ players }, "first-turn-bonus").state);
  return base.turnOrder.map((seat) => {
    const s = JSON.parse(JSON.stringify(base)) as EngineState;
    const ctx: Ctx = { s, rng: createRng(0), events: [] };
    beginReinforce(ctx, seat);
    const event = ctx.events.find((e): e is Extract<GameEvent, { kind: "reinforcements" }> => e.kind === "reinforcements");
    if (!event) throw new Error("beginning reinforcements raised no reinforcements event");
    return event.firstTurnBonus;
  });
}

const PLAYER_COUNTS = [3, 4, 5, 6];

/** `board.json`: territories, continents, adjacency and the canonical edges by index, the cards
 *  by index, GD's territory and link orders, and the setup tables. */
export function boardData(): unknown {
  return {
    territories: TERRITORIES.map((t) => ({
      id: t.id,
      continent: CONTINENTS.findIndex((c) => c.id === t.continent),
      symbol: SYMBOLS[t.symbol],
    })),
    continents: CONTINENTS.map((c) => ({
      id: c.id,
      bonus: c.bonus,
      territories: TERRITORIES.flatMap((t, i) => (t.continent === c.id ? [i] : [])),
    })),
    adjacency: TERRITORIES.map((t) => ADJACENCY[t.id].map(territoryIndex)),
    edges: EDGES,
    cards: CARD_IDS,
    gdOrder: GD_ORDER.map(territoryIndex),
    gdLinks: TERRITORIES.map((t) => GD_LINKS[t.id].map(territoryIndex)),
    startingArmies: Object.fromEntries(PLAYER_COUNTS.map((n) => [String(n), STARTING_ARMIES[n]])),
    firstTurnBonus: Object.fromEntries(PLAYER_COUNTS.map((n) => [String(n), firstTurnBonus(n)])),
  };
}

export function boardJson(): string {
  return `${JSON.stringify(boardData(), null, 1)}\n`;
}

/** The blitz tables for every fight `a` against `d`, 1 ≤ a, d ≤ bound, in three flat arrays.
 *  Rows with a or d of 0 are no fight: capture 0, index −1. */
export interface BlitzTables {
  bound: number;
  /** `[a * (bound + 1) + d]`: the capture chance, `defenderLost[d]`. */
  capture: Float64Array;
  /** `[(a * (bound + 1) + d) * 4 + k]`: the offset in `values` of the attacker's running totals
   *  (a of them), of the defender's (d of them), then `likeliestA` and `likeliestD`. */
  index: Int32Array;
  /** Running totals as `pickOutcome` accumulates them, −1 where an outcome's chance is ≤ 0. */
  values: Float64Array;
}

/** `pickOutcome`'s running totals over `chances[0 … end − 1]` into `out` from `at`, and its
 *  likeliest outcome: the first index of the largest chance. */
function runningTotals(chances: Float64Array, end: number, out: Float64Array, at: number): number {
  let sum = 0;
  let likeliest = 0;
  for (let i = 0; i < end; i++) {
    if (!Number.isFinite(chances[i])) throw new Error(`a chance of ${String(chances[i])}`);
    if (chances[i] > chances[likeliest]) likeliest = i;
    if (chances[i] <= 0) {
      out[at + i] = -1;
      continue;
    }
    sum += chances[i];
    out[at + i] = sum;
  }
  return likeliest;
}

export function blitzTables(bound: number): BlitzTables {
  if (!(Number.isInteger(bound) && bound >= 1)) throw new Error(`the bound must be a whole number of armies, not ${String(bound)}`);
  const width = bound + 1;
  const capture = new Float64Array(width * width);
  const index = new Int32Array(width * width * 4).fill(-1);
  // Every (a, d) holds a + d totals: 2 · bound · (1 + … + bound) in all.
  const values = new Float64Array(bound * bound * (bound + 1));
  let at = 0;
  for (let a = 1; a <= bound; a++) {
    for (let d = 1; d <= bound; d++) {
      const fight = balancedFight(a, d);
      if (!fight) throw new Error(`GD rolls ${a.toString()} against ${d.toString()} battle by battle: no table holds it`);
      const cell = a * width + d;
      capture[cell] = fight.defenderLost[d];
      index[cell * 4] = at;
      index[cell * 4 + 2] = runningTotals(fight.attackerLost, a, values, at);
      at += a;
      index[cell * 4 + 1] = at;
      index[cell * 4 + 3] = runningTotals(fight.defenderLost, d, values, at);
      at += d;
    }
  }
  if (at !== values.length) throw new Error(`the totals filled ${at.toString()} of ${values.length.toString()} entries`);
  return { bound, capture, index, values };
}

/** The first reachable outcome whose running total reaches `draw`, else the likeliest. */
function firstReaching(values: Float64Array, from: number, length: number, draw: number, likeliest: number): number {
  for (let i = 0; i < length; i++) {
    if (values[from + i] >= draw) return i;
  }
  return likeliest;
}

/** A blitz resolved from the tables alone, as the GPU resolves it. */
export function resolveFromTables(t: BlitzTables, a: number, d: number, r: number): BlitzResult {
  if (a < 1 || d < 1 || a > t.bound || d > t.bound) throw new Error(`${a.toString()} against ${d.toString()} is outside the tables`);
  const cell = a * (t.bound + 1) + d;
  const draw = r <= 0 ? Number.MIN_VALUE : r;
  const capture = t.capture[cell];
  if (capture >= draw) {
    return { attackerLosses: firstReaching(t.values, t.index[cell * 4], a, draw, t.index[cell * 4 + 2]), defenderLosses: d };
  }
  return { attackerLosses: a, defenderLosses: firstReaching(t.values, t.index[cell * 4 + 1], d, draw - capture, t.index[cell * 4 + 3]) };
}

/** The tables as one little-endian file, `capture`, `index` and `values` in turn, and the meta
 *  that says where each section is. */
export function blitzFiles(t: BlitzTables): { bin: Buffer; meta: unknown } {
  const sections = [
    { name: "capture", dtype: "float64", array: t.capture },
    { name: "index", dtype: "int32", array: t.index },
    { name: "values", dtype: "float64", array: t.values },
  ];
  const parts: Buffer[] = [];
  const layout: Record<string, { dtype: string; offset: number; bytes: number; count: number }> = {};
  let offset = 0;
  for (const { name, dtype, array } of sections) {
    const part = Buffer.alloc(array.byteLength);
    if (array instanceof Float64Array) array.forEach((v, i) => part.writeDoubleLE(v, i * 8));
    else array.forEach((v, i) => part.writeInt32LE(v, i * 4));
    layout[name] = { dtype, offset, bytes: part.length, count: array.length };
    parts.push(part);
    offset += part.length;
  }
  const meta = {
    bound: t.bound,
    endianness: "little",
    sections: layout,
    capture: "[a * (bound + 1) + d]: the capture chance of a blitz of a against d (defenderLost[d]); 0 where a or d is 0",
    index:
      "[(a * (bound + 1) + d) * 4 + k]: k = 0 the element offset in values of the attacker's running totals (a entries), 1 the defender's (d entries), 2 likeliestA, 3 likeliestD; -1 where a or d is 0",
    values: "running totals as pickOutcome accumulates them in float64, -1 where the outcome's chance is <= 0 (never picked)",
    resolve:
      "draw = r <= 0 ? MIN_VALUE : r; if capture >= draw: attackerLosses = first reachable i with valuesA[i] >= draw, else likeliestA; defenderLosses = d. Otherwise attackerLosses = a; defenderLosses = first reachable j with valuesD[j] >= draw - capture, else likeliestD",
  };
  return { bin: Buffer.concat(parts), meta };
}

/** `count` blitzes resolved by the reference `resolveBlitz`, with draws from a fixed seed: a
 *  golden for the GPU side's reading of the tables. */
export function blitzSamples(bound: number, count: number): (BlitzResult & { a: number; d: number; r: number })[] {
  const rng = createRng(`gpu-blitz-samples-${bound.toString()}`);
  const roll = () => {
    throw new Error("a fight within the tables is never rolled");
  };
  return Array.from({ length: count }, () => {
    const a = 1 + Math.floor(rng.next() * bound);
    const d = 1 + Math.floor(rng.next() * bound);
    const r = rng.next();
    return { a, d, r, ...resolveBlitz(a, d, r, roll) };
  });
}

/** The success thresholds GD's AI passes `idealAttackUnits`: its default, each persona's threshold
 *  as GD passes it (0 to 100, which the search clamps to 1), the same as chances, and 1. */
const IDEAL_THRESHOLDS = [Math.fround(0.9), 80, 55, 45, 99, 0.8, 0.55, 0.45, 0.99, 0.4, 0.25, 0.1, 1];

/** Goldens for the GPU side's port of the odds (`gpu/riskgpu/blitz_port.py`), from a fixed seed:
 *  `winChance` over every fight up to 40 against 40, a sample of larger exactly worked fights and
 *  of estimated ones (with `estimatedWinChance`), `balanceWinChance`, `idealAttackUnits` at every
 *  threshold GD passes, and estimated blitzes resolved by `resolveBlitz`. Each row is an array:
 *  its arguments, then its results. */
export function oddsSamples(): unknown {
  const rng = createRng("gpu-odds-samples");
  const between = (lo: number, hi: number) => lo + Math.floor(rng.next() * (hi - lo + 1));
  const fight = (lo: number, hi: number): [number, number] => {
    const total = between(lo, hi);
    const a = between(1, total - 1);
    return [a, total - a];
  };
  const roll = () => {
    throw new Error("an estimated fight is never rolled");
  };
  const small: number[][] = [];
  for (let a = 1; a <= 40; a++) {
    for (let d = 1; d <= 40; d++) small.push([a, d, winChance(a, d)]);
  }
  const balanceInputs = [0, 0.05, Math.fround(0.05), 0.95, 1 - 0.05, 0.5, 1, ...Array.from({ length: 43 }, () => rng.next())];
  return {
    winChance: small,
    worked: Array.from({ length: 120 }, () => fight(41, 2000)).map(([a, d]) => [a, d, winChance(a, d)]),
    estimated: Array.from({ length: 40 }, () => fight(2001, 60_000)).map(([a, d]) => [a, d, winChance(a, d), estimatedWinChance(a, d)]),
    balanceWinChance: balanceInputs.map((p) => [p, balanceWinChance(p)]),
    idealAttackUnits: IDEAL_THRESHOLDS.flatMap((threshold) =>
      Array.from({ length: 60 }, (_, i) => [i + 1, threshold, idealAttackUnits(i + 1, threshold)]),
    ),
    resolveBlitz: Array.from({ length: 25 }, () => fight(2001, 6000)).flatMap(([a, d]) =>
      [0, ...Array.from({ length: 5 }, () => rng.next())].map((r) => {
        const { attackerLosses, defenderLosses } = resolveBlitz(a, d, r, roll);
        return [a, d, r, attackerLosses, defenderLosses];
      }),
    ),
  };
}
