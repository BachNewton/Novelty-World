// ===========================================================================
// MATCH_VALUE — the single value ranking that drives BOTH the mortgage order and
// trade valuation for the KYLE lineage (replaces kyle-v2's two tables,
// GROUP_WEIGHT + COLORS_BY_WEIGHT). A "match" is a thing worth completing: a
// full color monopoly, or holding a given number of railroads. They're
// interleaved into one most-valuable-first list. Utilities sit dead last and are
// never a trade target (they're here only so the mortgage order can place them).
// See PHILOSOPHY.md.
// ===========================================================================
import { SPACES } from "../../../data";
import { colorAt } from "../../../development";
import type { GameState, PropertyColor } from "../../../types";

/** One rung of the value ladder: a color set, an N-railroad holding, or utils. */
export type MatchKey =
  | { readonly kind: "color"; readonly color: PropertyColor }
  | { readonly kind: "rail"; readonly count: number }
  | { readonly kind: "util" };

/** The ladder, most valuable (index 0) to least. Color sets count only at the
 *  full monopoly; every railroad rung is its own match because RR rent scales per
 *  railroad. Utilities are last and never a trade target. */
export const MATCH_VALUE: readonly MatchKey[] = [
  { kind: "color", color: "orange" },
  { kind: "color", color: "red" },
  { kind: "color", color: "light-blue" },
  { kind: "rail", count: 4 },
  { kind: "color", color: "pink" },
  { kind: "color", color: "yellow" },
  { kind: "rail", count: 3 },
  { kind: "color", color: "dark-blue" },
  { kind: "color", color: "green" },
  { kind: "rail", count: 2 },
  { kind: "color", color: "brown" },
  { kind: "rail", count: 1 },
  { kind: "util" },
];

/** Worst possible rank — what a non-match (a utility, or a bare unownable) sorts as. */
export const UTIL_RANK = MATCH_VALUE.length - 1;

const COLOR_RANK: Readonly<Record<PropertyColor, number>> = Object.fromEntries(
  MATCH_VALUE.flatMap((m, i) => (m.kind === "color" ? [[m.color, i]] : [])),
) as Record<PropertyColor, number>;

const RAIL_RANK: Readonly<Record<number, number>> = Object.fromEntries(
  MATCH_VALUE.flatMap((m, i) => (m.kind === "rail" ? [[m.count, i]] : [])),
);

/** Ladder position of a completed color monopoly (0 = orange, best). */
export function rankOfColor(color: PropertyColor): number {
  return COLOR_RANK[color];
}

/** Ladder position of holding `count` railroads (1–4); `UTIL_RANK` for 0. */
export function rankOfRail(count: number): number {
  return RAIL_RANK[count] ?? UTIL_RANK;
}

/** Positions a player owns, as board indices. */
export function myPositions(state: GameState, pid: string): number[] {
  const out: number[] = [];
  for (const posStr in state.ownership) {
    if (state.ownership[posStr] === pid) out.push(Number(posStr));
  }
  return out;
}

/** How many railroads a player holds. */
export function railroadCount(state: GameState, pid: string): number {
  return myPositions(state, pid).filter((p) => SPACES[p].kind === "railroad")
    .length;
}

/** The MATCH_VALUE rank that governs MORTGAGING this property — i.e. how much it
 *  would hurt to give up its rent. A color lot ranks at its color (whether or not
 *  the set is complete — a loose orange is still "an orange"); a railroad ranks at
 *  the owner's CURRENT railroad count (the rung it would drop from); a utility is
 *  last. Higher rank = less valuable = mortgaged sooner. */
export function mortgageRank(state: GameState, pid: string, pos: number): number {
  const space = SPACES[pos];
  if (space.kind === "railroad") return rankOfRail(railroadCount(state, pid));
  const color = colorAt(pos);
  return color === null ? UTIL_RANK : rankOfColor(color);
}
