import { createRng, type Rng } from "@/shared/lib/seeded-random";
import { coatOf, drawGenotype, type Coat, type Genotype, type Sex } from "./genetics";

/*
 * A generated cat: its genes and the coat they make, its build, and its
 * personality, all from one seed, so a cat is the same every time it is drawn.
 */

/** Proportions against the model's own, each 1 for an average cat. */
export interface Build {
  /** Overall size: a small queen to a big tom. */
  size: number;
  /** Width and girth: a slender cat to a cobby one. */
  stockiness: number;
  /** Leg length, with the leg's thickness. */
  legs: number;
  /** Length of the back from shoulder to hip. */
  body: number;
  tail: number;
  ears: number;
  head: number;
}

/** Three traits, each from −1 to 1. */
export interface Personality {
  /** Shy (−1) to bold (1): how high it holds its head and tail, how close it comes. */
  boldness: number;
  /** Lazy (−1) to busy (1): how much it fidgets, how fast it moves. */
  energy: number;
  /** Aloof (−1) to cuddly (1): how often it greets and slow-blinks. */
  affection: number;
}

export interface Cat {
  seed: string;
  sex: Sex;
  genotype: Genotype;
  coat: Coat;
  build: Build;
  personality: Personality;
}

/** Roughly normal, from −1 to 1, most cats near the middle. */
function spread(rng: Rng): number {
  return (rng.next() + rng.next() + rng.next()) / 1.5 - 1;
}

function buildOf(rng: Rng, sex: Sex): Build {
  const tom = sex === "male";
  const stockiness = 1 + spread(rng) * 0.13 + (tom ? 0.04 : 0);
  return {
    size: 1 + spread(rng) * 0.09 + (tom ? 0.05 : -0.03),
    stockiness,
    // A cobby cat runs to shorter legs, a slender one to longer.
    legs: 1 + spread(rng) * 0.06 - (stockiness - 1) * 0.3,
    body: 1 + spread(rng) * 0.08,
    tail: 1 + spread(rng) * 0.14,
    ears: 1 + spread(rng) * 0.16,
    // Toms grow broad jowled heads.
    head: 1 + spread(rng) * 0.06 + (tom ? 0.04 : 0),
  };
}

function personalityOf(rng: Rng): Personality {
  const trait = () => Math.max(-1, Math.min(1, spread(rng) * 1.3));
  return { boldness: trait(), energy: trait(), affection: trait() };
}

export function generateCat(seed: string): Cat {
  // Each part draws from its own stream, so adding to one never changes another.
  const genotype = drawGenotype(createRng(`${seed}:genes`));
  return {
    seed,
    sex: genotype.sex,
    genotype,
    coat: coatOf(genotype, createRng(`${seed}:coat`)),
    build: buildOf(createRng(`${seed}:build`), genotype.sex),
    personality: personalityOf(createRng(`${seed}:personality`)),
  };
}
