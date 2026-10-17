import type { Rng } from "@/shared/lib/seeded-random";

/*
 * Drawing an animal's genes and traits from seeded streams: an allele at its
 * population frequency, a pair of them for a locus, a weighted choice, and a
 * roughly normal spread for a trait. Every species' genetics is built on these.
 */

export type Pair<T extends string> = readonly [T, T];

/** A locus's alleles with their frequency in a population, summing to one. */
export type Frequencies<T extends string> = readonly (readonly [T, number])[];

export function allele<T extends string>(rng: Rng, table: Frequencies<T>): T {
  let roll = rng.next();
  for (const [value, frequency] of table) {
    roll -= frequency;
    if (roll < 0) return value;
  }
  return table[table.length - 1][0];
}

export function pair<T extends string>(rng: Rng, table: Frequencies<T>): Pair<T> {
  return [allele(rng, table), allele(rng, table)];
}

/** One of `table`'s values, each as likely as its weight. */
export function weighted<T>(rng: Rng, table: readonly (readonly [T, number])[]): T {
  const total = table.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng.next() * total;
  for (const [value, weight] of table) {
    roll -= weight;
    if (roll < 0) return value;
  }
  return table[table.length - 1][0];
}

export const has = <T extends string>(alleles: readonly T[], value: T) => alleles.includes(value);
export const both = <T extends string>(alleles: readonly T[], value: T) => alleles.every((a) => a === value);

/** Roughly normal, from −1 to 1, most draws near the middle. */
export function spread(rng: Rng): number {
  return (rng.next() + rng.next() + rng.next()) / 1.5 - 1;
}

/** A personality trait from −1 to 1. */
export function trait(rng: Rng): number {
  return Math.max(-1, Math.min(1, spread(rng) * 1.3));
}
