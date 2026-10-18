import { createRng } from "@/shared/lib/seeded-random";
import { spread, trait } from "../animals/genes";

/*
 * A generated hedgehog: how dark its spines are and how pale their tips, its
 * face's shade, its size and its personality, all from one seed. A wild
 * hedgehog curls up when startled and comes round with patience.
 */

export interface HedgehogCoat {
  /** How dark the spines' bands are, 0 a sandy hedgehog to 1 a dark one. */
  darkness: number;
  /** How much of each spine is its pale tip, 0 to 1. */
  tips: number;
  /** How pale the fur of its face and belly is, 0 brown to 1 cream. */
  face: number;
  marks: readonly [number, number, number];
}

export interface HedgehogBuild {
  /** The sculpture's scale in the world: about 0.9 (some 22 cm long). */
  size: number;
  /** Rounder (above 1) or slimmer. */
  plump: number;
  snout: number;
}

export interface HedgehogPersonality {
  /** Shy (−1) to bold (1): how soon it curls up, and how long it stays curled. */
  boldness: number;
  /** Sleepy (−1) to busy (1): how much it snuffles about. */
  energy: number;
  /** Aloof (−1) to cuddly (1). */
  affection: number;
}

export interface Hedgehog {
  seed: string;
  coat: HedgehogCoat;
  build: HedgehogBuild;
  personality: HedgehogPersonality;
}

const unit = (v: number) => Math.max(0, Math.min(1, v));

export function generateHedgehog(seed: string): Hedgehog {
  // Each part draws from its own stream, so adding to one never changes another.
  const coat = createRng(`${seed}:coat`);
  const build = createRng(`${seed}:build`);
  const personality = createRng(`${seed}:personality`);
  return {
    seed,
    coat: { darkness: unit(0.5 + spread(coat) * 0.5), tips: unit(0.5 + spread(coat) * 0.35), face: unit(0.5 + spread(coat) * 0.5), marks: [coat.next() * 50, coat.next() * 50, coat.next() * 50] },
    build: { size: 0.9 * (1 + spread(build) * 0.08), plump: 1 + spread(build) * 0.06, snout: 1 + spread(build) * 0.08 },
    personality: { boldness: Math.max(-1, trait(personality) - 0.15), energy: trait(personality), affection: trait(personality) },
  };
}

/** A hedgehog's coat in a few words. */
export function hedgehogCoatName(coat: HedgehogCoat): string {
  return coat.darkness > 0.66 ? "dark hedgehog" : coat.darkness < 0.33 ? "sandy hedgehog" : "brown hedgehog";
}
