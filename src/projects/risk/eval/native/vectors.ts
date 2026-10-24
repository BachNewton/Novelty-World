import { createHash } from "node:crypto";
import { createRng, type Rng } from "@/shared/lib/seeded-random";
import { shuffleArray } from "@/shared/lib/utils";
import type { CardId } from "../../contract";
import { balance, balancedFight, captureChance, estimatedWinChance, fairFight, resolveBlitz } from "../../blitz";
import { FULL_DECK, isValidSet, setsIn, setValue } from "../../cards";
import { ADJACENCY, CONTINENTS, TERRITORIES } from "../../map";
import {
  battleOutcome,
  blitzCommit,
  exchange,
  expectedLoss,
  pathRun,
  pathRunVia,
  rollOdds,
  winProb,
} from "../../bots/rule-v1/odds";
import { cardIndex, territoryIndex } from "../gpu-canonical";

// What the TypeScript computes for the numerical foundations, for the Rust port to match bit for
// bit (`ideas/native-port.md`, "Proving it"). A float is written as its IEEE-754 bits in hex, an
// array of floats as their hex run together, and a large array as a digest of its bits, so the
// JSON round trip is exact and the files stay small. Ids are indices: a territory its place in
// `TERRITORIES`, a card 0–41 its territory and 42, 43 the wilds.
//
// `**` is the platform C library's pow since Node 24 (`native/src/jsmath.rs`), so the pow vectors,
// and everything built on them, are the platform's: these were exported on Windows, and Linux's
// glibc would differ from them in the last bit now and then.

const scratch = new DataView(new ArrayBuffer(8));

/** A float's IEEE-754 bits as 16 hex digits, most significant first. */
export function hex(x: number): string {
  scratch.setFloat64(0, x);
  return scratch.getUint32(0).toString(16).padStart(8, "0") + scratch.getUint32(4).toString(16).padStart(8, "0");
}

/** The floats' bits run together. */
export function hexes(values: ArrayLike<number>): string {
  let out = "";
  for (let i = 0; i < values.length; i++) out += hex(values[i]);
  return out;
}

/** The float with these bits (the high and low 32-bit words). */
export function fromWords(high: number, low: number): number {
  scratch.setUint32(0, high >>> 0);
  scratch.setUint32(4, low >>> 0);
  return scratch.getFloat64(0);
}

/** The first 16 hex digits of the SHA-256 of the floats' bits, each little-endian. */
export function digest(values: ArrayLike<number>): string {
  const bytes = new DataView(new ArrayBuffer(values.length * 8));
  for (let i = 0; i < values.length; i++) bytes.setFloat64(i * 8, values[i], true);
  return createHash("sha256").update(new Uint8Array(bytes.buffer)).digest("hex").slice(0, 16);
}

function nextUp(x: number): number {
  scratch.setFloat64(0, x);
  const low = scratch.getUint32(4);
  return low === 0xffffffff ? fromWords(scratch.getUint32(0) + 1, 0) : fromWords(scratch.getUint32(0), low + 1);
}

function nextDown(x: number): number {
  scratch.setFloat64(0, x);
  const low = scratch.getUint32(4);
  return low === 0 ? fromWords(scratch.getUint32(0) - 1, 0xffffffff) : fromWords(scratch.getUint32(0), low - 1);
}

// ---------------------------------------------------------------------------
// rng
// ---------------------------------------------------------------------------

const DRAWS = 32;

function draws(rng: Rng): string {
  return hexes(Array.from({ length: DRAWS }, () => rng.next()));
}

export function rngVectors(): Record<string, unknown> {
  const seeds: string[] = ["", "a", "train-1", "holdout-1", "bots|train-1", "bots|holdout-7", "distill-v7-3", "hybrid-data-12"];
  for (let i = 0; i < 12; i++) seeds.push(`train-${(i * 37 + 2).toString()}`);
  for (let i = 0; i < 10; i++) {
    const botSeed = createRng(`bots|train-${i.toString()}`).getState().toString(36);
    seeds.push(botSeed, `${botSeed}/${(i * 113).toString()}`, `${botSeed}/0|bots`);
  }
  const states = [0, 1, 2, 0x6d2b79f5, 0x7fffffff, 0x80000000, 0xffffffff, 0x92d68ca2];
  const stateRng = createRng("rng-states");
  while (states.length < 50) states.push(Math.floor(stateRng.next() * 4294967296));

  const checksumRng = createRng("checksum");
  let sum = 0;
  for (let i = 0; i < 1_000_000; i++) sum += checksumRng.next();

  const shuffles = ["train-1", "deal-2", "bots|train-3"].map((seed) => {
    const rng = createRng(seed);
    return { seed, out: shuffleArray([...Array(44).keys()], rng.next), state: rng.getState() };
  });
  return {
    seeds: seeds.map((seed) => {
      const rng = createRng(seed);
      return { seed, state: rng.getState(), draws: draws(rng) };
    }),
    states: states.map((state) => ({ state, draws: draws(createRng(state)) })),
    checksum: { seed: "checksum", count: 1_000_000, sum: hex(sum), state: checksumRng.getState() },
    shuffles,
    base36: [0, 1, 35, 36, 1295, 1296, 0x7fffffff, 0xffffffff].map((n) => ({ n, s: n.toString(36) })),
  };
}

// ---------------------------------------------------------------------------
// jsmath
// ---------------------------------------------------------------------------

const POW_EXPONENTS = [Math.fround(1.3), Math.fround(1.8), 1.3, 1.8];
const SWEEP_CHUNK = 1024;
const SWEEP_SAMPLE = 64;

/** A float of random bits with its biased exponent in [eLo, eHi]: the sweeps' way to cover every
 *  magnitude. The Rust tests build the same inputs from the same stream. */
function randomBits(rng: Rng, eLo: number, eHi: number): number {
  const high = Math.floor(rng.next() * 4294967296);
  const low = Math.floor(rng.next() * 4294967296);
  const exponent = eLo + Math.floor(rng.next() * (eHi - eLo + 1));
  return fromWords(exponent * 0x100000 + (high & 0xfffff), low);
}

/** The pow sweep's inputs: per exponent, `perExponent` bases of four kinds in turn. */
export function powSweepInputs(perExponent: number): { x: number; y: number }[] {
  const rng = createRng("pow-sweep");
  const out: { x: number; y: number }[] = [];
  for (const y of POW_EXPONENTS) {
    for (let i = 0; i < perExponent; i++) {
      switch (i % 4) {
        case 0:
          out.push({ x: rng.next(), y });
          break;
        case 1:
          out.push({ x: randomBits(rng, 23, 1022), y });
          break;
        case 2:
          out.push({ x: rng.next() * rng.next(), y });
          break;
        default:
          out.push({ x: randomBits(rng, 0, 1022), y });
      }
    }
  }
  return out;
}

export function expSweepInputs(count: number): number[] {
  const rng = createRng("exp-sweep");
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    switch (i % 3) {
      case 0:
        out.push(-50 + rng.next() * 100);
        break;
      case 1:
        out.push(-745 + rng.next() * 1455);
        break;
      default: {
        const negative = rng.next() < 0.5;
        const x = randomBits(rng, 900, 1030);
        out.push(negative ? -x : x);
      }
    }
  }
  return out;
}

export function logSweepInputs(count: number): number[] {
  const rng = createRng("log-sweep");
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    switch (i % 3) {
      case 0:
        out.push(rng.next() * 1000);
        break;
      case 1:
        out.push(randomBits(rng, 0, 1032));
        break;
      default:
        out.push(1 + (rng.next() - 0.5) * 1e-3);
    }
  }
  return out;
}

/** A sweep's outputs as chunk digests and every `SWEEP_SAMPLE`th output in full. */
function sweep(count: number, outputs: Float64Array): unknown {
  const chunks: string[] = [];
  for (let from = 0; from < count; from += SWEEP_CHUNK) chunks.push(digest(outputs.subarray(from, Math.min(count, from + SWEEP_CHUNK))));
  const samples: number[] = [];
  for (let i = 0; i < count; i += SWEEP_SAMPLE) samples.push(outputs[i]);
  return { count, chunk: SWEEP_CHUNK, chunks, every: SWEEP_SAMPLE, samples: hexes(samples) };
}

const POW_PER_EXPONENT = 50_000;
const EXP_LOG_SWEEP = 60_000;

export function jsmathVectors(): Record<string, unknown> {
  const rounds = [
    0, -0, 0.5, -0.5, 1.5, 2.5, -1.5, -2.5, 0.49999999999999994, -0.49999999999999994, 0.3, -0.3, 1, -1,
    4503599627370495.5, 4503599627370496, -4503599627370495.5, 9007199254740993, 1e300, -1e300, Number.MIN_VALUE,
    -Number.MIN_VALUE, Infinity, -Infinity, NaN, 299.5, 150.49999999999997,
  ];
  const roundRng = createRng("round");
  for (let i = 0; i < 2000; i++) rounds.push((roundRng.next() - 0.5) * 2 ** Math.floor(roundRng.next() * 40));
  for (let i = 0; i < 500; i++) rounds.push(Math.floor((roundRng.next() - 0.5) * 2000) + 0.5);

  const specials = [0, -0, 1, -1, 0.5, -0.5, 2, -2, 3, Infinity, -Infinity, NaN, Number.MIN_VALUE, 2.2250738585072014e-308, 1e-300, 0.999999, 1.000001];
  const exps = [0, -0, 1, -1, 2, 0.5, -0.5, 3, -3, 1.3, ...POW_EXPONENTS, 0.1, 2 ** 31 + 0.5, 2 ** 64, Infinity, -Infinity, NaN];
  const powPairs: number[] = [];
  for (const x of specials) for (const y of exps) powPairs.push(x, y, x ** y);

  const powersOfTwo = POW_EXPONENTS.map((y) => {
    const out: number[] = [];
    for (let e = -1074; e <= 0; e++) out.push((2 ** e) ** y);
    return { y: hex(y), out: hexes(out) };
  });

  // The bases blitz's balancing raises: the fair chances of capture and of holding (to fround(1.3)),
  // and each fair outcome's chance (fround(1.8)), from the fights themselves.
  const tails: number[] = [];
  for (let a = 1; a <= 50; a++) {
    for (let d = 1; d <= 50; d++) {
      const fight = fairFight(a, d);
      tails.push(fight.defenderLost[d], fight.attackerLost[a]);
    }
  }
  const entries: number[] = [];
  for (let a = 1; a <= 12; a++) {
    for (let d = 1; d <= 12; d++) {
      const fight = fairFight(a, d);
      for (let i = 0; i < a; i++) entries.push(fight.attackerLost[i]);
      for (let j = 0; j < d; j++) entries.push(fight.defenderLost[j]);
    }
  }
  const fed = [
    { y: hex(POW_EXPONENTS[0]), x: hexes(tails), out: hexes(tails.map((x) => x ** POW_EXPONENTS[0])) },
    { y: hex(POW_EXPONENTS[1]), x: hexes(entries), out: hexes(entries.map((x) => x ** POW_EXPONENTS[1])) },
  ];

  const powInputs = powSweepInputs(POW_PER_EXPONENT);
  const expInputs = expSweepInputs(EXP_LOG_SWEEP);
  const logInputs = logSweepInputs(EXP_LOG_SWEEP);
  const expSpecials = [0, -0, 1, -1, 709.782712893384, 709.79, -745.1332191019411, -745.14, 1e-300, Infinity, -Infinity, NaN, 0.34657359027997264, 1.0397207708399179];
  const logSpecials = [0, -0, 1, -1, Number.MIN_VALUE, 2.2250738585072014e-308, 1e-300, 2, 0.5, Math.E, 1e300, Infinity, -Infinity, NaN, 1.0000009536743164, 0.9999990463256836];
  return {
    round: { x: hexes(rounds), out: hexes(rounds.map(Math.round)) },
    pow: {
      pairs: hexes(powPairs),
      powersOfTwo,
      fed,
      sweep: { perExponent: POW_PER_EXPONENT, ...(sweep(powInputs.length, Float64Array.from(powInputs, ({ x, y }) => x ** y)) as object) },
    },
    exp: {
      specials: { x: hexes(expSpecials), out: hexes(expSpecials.map(Math.exp)) },
      sweep: sweep(expInputs.length, Float64Array.from(expInputs, Math.exp)),
    },
    log: {
      specials: { x: hexes(logSpecials), out: hexes(logSpecials.map(Math.log)) },
      sweep: sweep(logInputs.length, Float64Array.from(logInputs, Math.log)),
    },
  };
}

// ---------------------------------------------------------------------------
// blitz
// ---------------------------------------------------------------------------

/** Fights beyond the full 1–40 grid: up to 300 exactly, and past 2,000 armies, estimated. */
const SPARSE_FIGHTS: [number, number][] = [
  [50, 50], [77, 13], [13, 77], [100, 100], [150, 20], [20, 150], [199, 101], [250, 50], [50, 250], [300, 300],
  [280, 7], [3, 297],
];
const LARGE_FIGHTS: [number, number][] = [
  [1500, 600], [2500, 100], [100, 2500], [3000, 3000], [1200, 900], [1000, 1001], [4000, 1000], [700, 1400],
];

function blitzCase(a: number, d: number, full: boolean, rollRng: Rng): unknown {
  const fight = balancedFight(a, d);
  if (!fight) throw new Error(`${a.toString()} against ${d.toString()} is rolled, not balanced`);
  const capture = fight.defenderLost[d];
  const rs = [0, 1e-300, capture, nextUp(capture), nextDown(capture), 0.5, rollRng.next(), 1 - 2 ** -53];
  const resolved = rs.map((r) => {
    const result = resolveBlitz(a, d, r, rollRng.next);
    return [result.attackerLosses, result.defenderLosses];
  });
  return {
    a,
    d,
    digest: digest([...fight.attackerLost, ...fight.defenderLost]),
    ...(full ? { attackerLost: hexes(fight.attackerLost), defenderLost: hexes(fight.defenderLost) } : {}),
    capture: hex(captureChance(a, d)),
    r: hexes(rs),
    resolved,
  };
}

export function blitzVectors(): Record<string, unknown> {
  const fair: unknown[] = [];
  for (let a = 1; a <= 12; a++) {
    for (let d = 1; d <= 12; d++) {
      const fight = fairFight(a, d);
      const balanced = balance(fight);
      fair.push({
        a,
        d,
        attackerLost: hexes(fight.attackerLost),
        defenderLost: hexes(fight.defenderLost),
        balanced: hexes([...balanced.attackerLost, ...balanced.defenderLost]),
      });
    }
  }
  const rollRng = createRng("blitz-roll");
  const balanced: unknown[] = [];
  for (let a = 1; a <= 40; a++) for (let d = 1; d <= 40; d++) balanced.push(blitzCase(a, d, a <= 15 && d <= 15, rollRng));
  for (const [a, d] of [...SPARSE_FIGHTS, ...LARGE_FIGHTS]) balanced.push(blitzCase(a, d, false, rollRng));

  const rolledRng = createRng("blitz-rolled");
  const rolled = [
    [60_000, 50_000],
    [99_000, 1_001],
  ].map(([a, d]) => {
    const result = resolveBlitz(a, d, 0.5, rolledRng.next);
    return { a, d, seed: "blitz-rolled", attackerLosses: result.attackerLosses, defenderLosses: result.defenderLosses };
  });
  return {
    fair,
    balancedRollSeed: "blitz-roll",
    balanced,
    rolled,
    rolledState: rolledRng.getState(),
    estimated: LARGE_FIGHTS.map(([a, d]) => ({ a, d, chance: hex(estimatedWinChance(a, d)) })),
  };
}

// ---------------------------------------------------------------------------
// odds
// ---------------------------------------------------------------------------

const SPARSE_BATTLES: [number, number][] = [
  [31, 45], [45, 31], [60, 60], [61, 59], [59, 61], [80, 5], [5, 80], [100, 99], [150, 150], [151, 150],
  [200, 40], [40, 200], [299, 1], [1, 299], [250, 51], [301, 2], [400, 100], [100, 400], [399, 399], [380, 20],
];

function outcomeCase(a: number, d: number, full: boolean): unknown {
  const o = battleOutcome(a, d);
  return {
    a,
    d,
    digest: digest([...o.win, ...o.fail]),
    ...(full ? { win: hexes(o.win), fail: hexes(o.fail) } : {}),
    pWin: hex(o.pWin),
    winFrom: o.winFrom,
    roll: o.roll,
    survivors: hex(o.survivors),
    winProb: hex(winProb(a, d)),
    blitzCommit: blitzCommit(a, d),
    exchange: hex(exchange(a, d)),
    expectedLoss: hex(expectedLoss(a, d)),
  };
}

export function oddsVectors(): Record<string, unknown> {
  const roll: unknown[] = [];
  for (let a = 1; a <= 3; a++) for (let d = 1; d <= 2; d++) roll.push({ a, d, odds: hexes(rollOdds(a, d)) });
  const outcomes: unknown[] = [];
  for (let a = 1; a <= 30; a++) for (let d = 1; d <= 30; d++) outcomes.push(outcomeCase(a, d, a <= 12 && d <= 12));
  for (const [a, d] of SPARSE_BATTLES) outcomes.push(outcomeCase(a, d, false));

  const rng = createRng("path-runs");
  const runs: unknown[] = [];
  for (let i = 0; i < 200; i++) {
    const length = 1 + (i % 6);
    const armies = i % 10 === 0 ? 1 + Math.floor(rng.next() * 150) : 1 + Math.floor(rng.next() * 40);
    const defenders = Array.from({ length }, () => (rng.next() < 0.1 ? 1 + Math.floor(rng.next() * 60) : 1 + Math.floor(rng.next() * 8)));
    const via = i % 3 === 0 && length > 1;
    const run = via ? pathRunVia(armies, defenders[0], defenders.slice(1)) : pathRun(armies, defenders);
    runs.push({ armies, defenders, via, pSuccess: hex(run.pSuccess), arrive: hex(run.arrive), stopAt: hexes(run.stopAt) });
  }
  return { roll, outcomes, runs };
}

// ---------------------------------------------------------------------------
// cards and map
// ---------------------------------------------------------------------------


export function cardsVectors(): Record<string, unknown> {
  const rng = createRng("hands");
  const hands: CardId[][] = [];
  for (let i = 0; i < 100; i++) {
    const size = [3, 3, 4, 5, 5, 6, 9][i % 7];
    const deck = shuffleArray(FULL_DECK, rng.next);
    hands.push(i % 5 === 0 ? [...deck.slice(0, size - 1), "wild-1"] : deck.slice(0, size));
  }
  hands.push(["wild-1", "wild-2", "alaska"], ["alaska", "wild-1", "wild-2", "peru", "japan"]);
  const triples: CardId[][] = [];
  for (let i = 0; i < 200; i++) triples.push(shuffleArray(FULL_DECK, rng.next).slice(0, 3));
  triples.push(["alaska", "peru"], ["alaska", "peru", "japan", "siam"]);
  return {
    fullDeck: FULL_DECK.map(cardIndex),
    hands: hands.map((hand) => {
      const sets = setsIn(hand);
      return { hand: hand.map(cardIndex), sets: sets.map((set) => set.map(cardIndex)), values: sets.map(setValue) };
    }),
    isValidSet: triples.map((cards) => ({ cards: cards.map(cardIndex), valid: isValidSet(cards) })),
  };
}

export function mapVectors(): Record<string, unknown> {
  const continentIndex = new Map<string, number>(CONTINENTS.map((c, i) => [c.id, i]));
  return {
    continents: CONTINENTS.map((c) => ({ id: c.id, bonus: c.bonus })),
    territories: TERRITORIES.map((t, index) => ({ id: t.id, index, continent: continentIndex.get(t.continent), symbol: t.symbol })),
    adjacency: TERRITORIES.map((t) => ADJACENCY[t.id].map(territoryIndex)),
  };
}
