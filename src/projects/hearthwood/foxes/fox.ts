import { createRng, type Rng } from "@/shared/lib/seeded-random";
import { spread, trait, weighted } from "../animals/genes";

/*
 * A generated red fox: its coat (the common red, the darker cross fox, or
 * the rare silver, as a fox's own colour phases come in the north), its
 * build and its personality, all from one seed. A fox leans shy: it is a
 * wild animal that Elliott wins over slowly.
 */

/** A red fox's colour phase: red, a cross fox (red with a dark cross over the shoulders and dark legs and belly), or silver (black frosted with silver). */
export type FoxPhase = "red" | "cross" | "silver";

export interface FoxCoat {
  phase: FoxPhase;
  /** How deep its red is, 0 a pale ginger to 1 a deep russet. */
  depth: number;
  /** How far the white of the chest and throat reaches down the belly, 0 to 1. */
  bib: number;
  /** How high its dark socks reach up its legs, 0 to 1. */
  socks: number;
  /** Seeds for its markings. */
  marks: readonly [number, number, number];
}

/** Proportions against the sculpture's own, each 1 for an average fox except size. */
export interface FoxBuild {
  /** The sculpture's scale in the world: about 1.4 (some 38 cm at the shoulder). */
  size: number;
  legs: number;
  body: number;
  tail: number;
  ears: number;
  muzzle: number;
}

/** Three traits, each from −1 to 1. */
export interface FoxPersonality {
  /** Shy (−1) to bold (1); foxes lean shy. */
  boldness: number;
  /** Calm (−1) to playful (1): how often it pounces and looks about. */
  playfulness: number;
  /** Independent (−1) to cuddly (1). */
  affection: number;
}

export interface Fox {
  seed: string;
  sex: "male" | "female";
  coat: FoxCoat;
  build: FoxBuild;
  personality: FoxPersonality;
}

/** How common each colour phase is among the north's red foxes. */
const PHASES: readonly (readonly [FoxPhase, number])[] = [
  ["red", 0.86],
  ["cross", 0.1],
  ["silver", 0.04],
];

function coatOf(rng: Rng): FoxCoat {
  return {
    phase: weighted(rng, PHASES),
    depth: Math.max(0, Math.min(1, 0.55 + spread(rng) * 0.45)),
    bib: Math.max(0, Math.min(1, 0.5 + spread(rng) * 0.5)),
    socks: Math.max(0, Math.min(1, 0.55 + spread(rng) * 0.4)),
    marks: [rng.next() * 50, rng.next() * 50, rng.next() * 50],
  };
}

function buildOf(rng: Rng, male: boolean): FoxBuild {
  return {
    size: 1.38 * (1 + spread(rng) * 0.07) * (male ? 1.04 : 0.97),
    legs: 1 + spread(rng) * 0.05,
    body: 1 + spread(rng) * 0.05,
    tail: 1 + spread(rng) * 0.1,
    ears: 1 + spread(rng) * 0.08,
    muzzle: 1 + spread(rng) * 0.06,
  };
}

const clampTrait = (v: number) => Math.max(-1, Math.min(1, v));

export function generateFox(seed: string): Fox {
  // Each part draws from its own stream, so adding to one never changes another.
  const sex = createRng(`${seed}:sex`).next() < 0.5 ? "male" : "female";
  const personality = createRng(`${seed}:personality`);
  return {
    seed,
    sex,
    coat: coatOf(createRng(`${seed}:coat`)),
    build: buildOf(createRng(`${seed}:build`), sex === "male"),
    personality: { boldness: clampTrait(trait(personality) - 0.35), playfulness: trait(personality), affection: trait(personality) },
  };
}

/** A fox's coat in a few words: "red fox", "cross fox", "silver fox". */
export function foxCoatName(coat: FoxCoat): string {
  return `${coat.phase} fox`;
}
