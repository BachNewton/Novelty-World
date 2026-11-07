import { placeSeedOf, seedOfWhole, unitOfSeed } from "../art/hash-of";
import { oneByOne, type IN_SEASON } from "./season";

/*
 * Placed things out only in their season: café terraces, the cows and sheep at grass, boats afloat, bales in the
 * fields. Each kind follows one of the season's shares (`IN_SEASON`), and each thing leaves and comes back on its own
 * threshold, rolled from its place with a salt of its kind's, so a harbour empties boat by boat. The roll is the art's
 * hash, so a shader (`render/in-season.ts`) and the CPU (the simulation's walls, a sitter's seat) agree on every thing.
 *
 * A terrace goes whole, table, chairs, parasol and the people at it, on one roll from the square of ground it stands
 * on, so a sitter, placed apart from the table, rolls the same as their table.
 */

export type InSeasonDial = keyof typeof IN_SEASON;

/** How a kind of thing follows the season: the share it reads, the salt of its rolls, and whether it rolls by its terrace's square rather than its own place. */
export interface InSeason {
  dial: InSeasonDial;
  salt: number;
  byTerrace?: boolean;
}

/** A terrace's square of ground, metres: the tables of one terrace, a few metres apart, nearly always share one. */
export const TERRACE_SQUARE_M = 24;

export const TERRACES: InSeason = { dial: "terraces", salt: 7301, byTerrace: true };
export const GRAZING: InSeason = { dial: "grazing", salt: 7303 };
export const BOATS_AFLOAT: InSeason = { dial: "boatsAfloat", salt: 7307 };
export const BALES: InSeason = { dial: "bales", salt: 7309 };

/** A thing's threshold, from 0 to 1, from where it stands as the GPU reads it (32-bit floats): `render/in-season.ts`'s on the CPU. */
export function thresholdOf(x: number, z: number, { salt, byTerrace = false }: InSeason): number {
  const seed = byTerrace ? seedOfWhole(Math.fround(Math.fround(x) / TERRACE_SQUARE_M), Math.fround(Math.fround(z) / TERRACE_SQUARE_M)) : placeSeedOf(x, z);
  return unitOfSeed(seed, salt);
}

/** Whether a thing at a place is out, given the season's shares. */
export function isOutAt(shares: Readonly<Record<InSeasonDial, number>>, x: number, z: number, kind: InSeason): boolean {
  return oneByOne(shares[kind.dial], thresholdOf(x, z, kind)) > 0.5;
}
