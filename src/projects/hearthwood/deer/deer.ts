import { createRng } from "@/shared/lib/seeded-random";
import { spread, trait } from "../animals/genes";

/*
 * A generated roe deer: a buck with his short antlers or a doe, how red its
 * summer coat is, its size and its personality, from one seed. Its winter
 * coat (grey-brown, the white rump grown big) is the season's, not its own.
 */

export interface DeerCoat {
  /** Its summer coat, 0 a sandy-red to 1 a deep fox-red. */
  red: number;
  marks: readonly [number, number, number];
}

export interface DeerBuild {
  /** The sculpture's scale in the world: about 2.3 (some 70 cm at the shoulder). */
  size: number;
  legs: number;
  /** How long a buck's antlers grow; 0 for a doe. */
  antlers: number;
}

export interface DeerPersonality {
  boldness: number;
  energy: number;
  affection: number;
}

export interface Deer {
  seed: string;
  sex: "male" | "female";
  coat: DeerCoat;
  build: DeerBuild;
  personality: DeerPersonality;
}

export function generateDeer(seed: string): Deer {
  const sex = createRng(`${seed}:sex`).next() < 0.45 ? "male" : "female";
  const coat = createRng(`${seed}:coat`);
  const build = createRng(`${seed}:build`);
  const personality = createRng(`${seed}:personality`);
  const male = sex === "male";
  return {
    seed,
    sex,
    coat: { red: Math.max(0, Math.min(1, 0.6 + spread(coat) * 0.4)), marks: [coat.next() * 50, coat.next() * 50, coat.next() * 50] },
    build: { size: 2.3 * (1 + spread(build) * 0.05) * (male ? 1.03 : 0.98), legs: 1 + spread(build) * 0.04, antlers: male ? 0.85 + 0.3 * build.next() : 0 },
    // Shy by nature: deer keep their distance until they know someone.
    personality: { boldness: trait(personality) - 0.4, energy: trait(personality), affection: trait(personality) },
  };
}

export const deerName = (deer: Deer) => (deer.sex === "male" ? "roe buck" : "roe doe");
