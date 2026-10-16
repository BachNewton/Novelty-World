import type { Preferences } from "../bots/rule-v1/params";
import { candidateSeats, FORMATS, outcomeFor, tableSpecs, type Format } from "./parallel";
import type { RiskGameResult, RiskGameSpec } from "./runner";

// Tuning a rule bot's preferences (`risk:tune`): a vector of preferences is scored by
// the games its bot plays against a fixed opponent, at every table size in both
// mixtures, on seeds every candidate of a generation shares (common random numbers).
// The score is the candidate's Elo per seat, read from its side's win share through the
// Luce model the gauntlet's SPRT tests, so it measures the edge the crown gate asks for.

export type PrefKey = keyof Preferences;

/** The search box for each preference, in its own units. */
export const PREF_BOUNDS: Readonly<Record<PrefKey, readonly [number, number]>> = {
  incomeHorizon: [1.5, 5],
  myCardWeight: [0.3, 2],
  myContinentWeight: [0.3, 2.5],
  killCommitMargin: [-0.03, 0.05],
  vulnerabilityWeight: [0, 3],
  borderWeight: [0, 2],
  idleWeight: [0, 1.2],
  opportunityWeight: [0, 2],
  commonThreatWeight: [0, 3],
  leadPenaltyWeight: [0, 0.6],
};

export const PREF_KEYS = Object.keys(PREF_BOUNDS) as PrefKey[];

/** Preferences from a point of the unit cube (clamped into it). */
export function fromUnit(x: readonly number[], keys: readonly PrefKey[] = PREF_KEYS): Partial<Preferences> {
  const out: Partial<Preferences> = {};
  keys.forEach((key, i) => {
    const [lo, hi] = PREF_BOUNDS[key];
    const u = Math.min(1, Math.max(0, x[i]));
    out[key] = Math.round((lo + u * (hi - lo)) * 1e4) / 1e4;
  });
  return out;
}

/** A point of the unit cube from preferences. */
export function toUnit(prefs: Preferences, keys: readonly PrefKey[] = PREF_KEYS): number[] {
  return keys.map((key) => {
    const [lo, hi] = PREF_BOUNDS[key];
    return (prefs[key] - lo) / (hi - lo);
  });
}

export interface Cell {
  players: number;
  format: Format;
}

export function cellsFor(players: readonly number[]): Cell[] {
  return players.flatMap((n) => FORMATS.map((format) => ({ players: n, format })));
}

/** Every game a candidate plays: each cell's rotation groups on the generation's seeds. */
export function candidateSpecs(candidate: string, opponent: string, cells: readonly Cell[], groups: number, prefix: string, maxTurns: number): RiskGameSpec[] {
  return cells.flatMap((c) => tableSpecs(candidate, opponent, c.format, c.players, `${prefix}:${c.players.toString()}p`, 0, groups * c.players, maxTurns));
}

/** The Elo per seat a side's win share implies, by the Luce model: holding k of n seats
 *  at strength ratio r, a side wins k·r / (k·r + n − k). A share of 0 or 1 is pulled half
 *  a game in, so a sweep reads as a large finite edge. */
export function luceElo(wins: number, decisive: number, seats: number, players: number): number {
  if (decisive === 0) return 0;
  const eps = 0.5 / decisive;
  const s = Math.min(1 - eps, Math.max(eps, wins / decisive));
  const r = (s * (players - seats)) / (seats * (1 - s));
  return 400 * Math.log10(r);
}

export interface CellScore extends Cell {
  wins: number;
  decisive: number;
  elo: number;
}

/** A candidate's score in each cell, from its games' results. */
export function cellScores(candidate: string, cells: readonly Cell[], results: readonly RiskGameResult[]): CellScore[] {
  return cells.map((c) => {
    let wins = 0;
    let decisive = 0;
    for (const r of results) {
      if (r.labels.length !== c.players) continue;
      const mine = r.labels.filter((l) => l === candidate).length;
      if (mine !== candidateSeats(c.format, c.players)) continue;
      const o = outcomeFor(r, candidate);
      if (o === "error") throw new Error(`a tuning game threw (${r.seed}): ${r.error ?? ""}`);
      if (o === "draw") continue;
      decisive++;
      if (o === "win") wins++;
    }
    return { ...c, wins, decisive, elo: luceElo(wins, decisive, candidateSeats(c.format, c.players), c.players) };
  });
}

/** The fitness: the candidate's worst table, each table read as the mean of its two
 *  mixtures. The crown gate asks for an edge at every table size, so an edge earned at
 *  one size can't pay for a loss at another (Monopoly's opt-v1 scored 75% on an average
 *  padded by easy wins, and was even with its base). */
export function fitness(scores: readonly CellScore[]): number {
  const tables = new Map<number, number[]>();
  for (const c of scores) tables.set(c.players, [...(tables.get(c.players) ?? []), c.elo]);
  return Math.min(...[...tables.values()].map((elos) => elos.reduce((s, x) => s + x, 0) / elos.length));
}
