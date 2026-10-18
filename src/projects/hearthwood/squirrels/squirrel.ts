import { createRng } from "@/shared/lib/seeded-random";
import { spread, trait } from "../animals/genes";

/*
 * A generated red squirrel: how red it is (from a bright fox-red to a dark
 * brown one, as the north's red squirrels run), how long its ear tufts grow,
 * its size and its personality, from one seed. Its winter coat (greyer,
 * the tufts fuller) is the season's, not its own.
 */

export interface SquirrelCoat {
  /** 0 a bright fox-red to 1 a dark chocolate-brown red squirrel. */
  darkness: number;
  /** How long its ear tufts are, 0 to 1. */
  tufts: number;
  marks: readonly [number, number, number];
}

export interface SquirrelBuild {
  size: number;
  tail: number;
}

export interface SquirrelPersonality {
  boldness: number;
  energy: number;
  affection: number;
}

export interface Squirrel {
  seed: string;
  coat: SquirrelCoat;
  build: SquirrelBuild;
  personality: SquirrelPersonality;
}

const unit = (v: number) => Math.max(0, Math.min(1, v));

export function generateSquirrel(seed: string): Squirrel {
  const coat = createRng(`${seed}:coat`);
  const build = createRng(`${seed}:build`);
  const personality = createRng(`${seed}:personality`);
  return {
    seed,
    coat: { darkness: unit(0.3 + spread(coat) * 0.45), tufts: unit(0.6 + spread(coat) * 0.4), marks: [coat.next() * 50, coat.next() * 50, coat.next() * 50] },
    build: { size: 1.05 * (1 + spread(build) * 0.06), tail: 1 + spread(build) * 0.08 },
    // Busy above all: a squirrel is never still for long.
    personality: { boldness: trait(personality), energy: Math.min(1, trait(personality) + 0.4), affection: trait(personality) },
  };
}

export function squirrelCoatName(coat: SquirrelCoat): string {
  return coat.darkness > 0.6 ? "dark red squirrel" : "red squirrel";
}
