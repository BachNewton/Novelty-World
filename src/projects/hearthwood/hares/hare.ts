import { createRng } from "@/shared/lib/seeded-random";
import { spread, trait } from "../animals/genes";

/*
 * A generated mountain hare: how grey or brown its summer coat is, its size
 * and its personality, from one seed. How white it is turns with the
 * seasons, not with the hare: every mountain hare goes white for winter and
 * keeps the black tips of its ears and its white scut all year.
 */

export interface HareCoat {
  /** Its summer coat, 0 a grey-blue hare to 1 a warm brown one. */
  warmth: number;
  marks: readonly [number, number, number];
}

export interface HareBuild {
  size: number;
  ears: number;
}

export interface HarePersonality {
  boldness: number;
  energy: number;
  affection: number;
}

export interface Hare {
  seed: string;
  coat: HareCoat;
  build: HareBuild;
  personality: HarePersonality;
}

export function generateHare(seed: string): Hare {
  const coat = createRng(`${seed}:coat`);
  const build = createRng(`${seed}:build`);
  const personality = createRng(`${seed}:personality`);
  return {
    seed,
    coat: { warmth: Math.max(0, Math.min(1, 0.55 + spread(coat) * 0.45)), marks: [coat.next() * 50, coat.next() * 50, coat.next() * 50] },
    build: { size: 1.05 * (1 + spread(build) * 0.07), ears: 1 + spread(build) * 0.08 },
    personality: { boldness: trait(personality) - 0.2, energy: trait(personality), affection: trait(personality) },
  };
}

export const hareCoatName = (white: number) => (white > 0.8 ? "mountain hare, winter white" : white > 0.2 ? "mountain hare, turning" : "mountain hare");
