import { createRng, type Rng } from "@/shared/lib/seeded-random";

/** The randomness for one write. It derives only from the game seed and the
 *  write's key (the decision it answers, or setup), so applying an action
 *  locally computes the same rolls the server will, and another player's
 *  action can't change them. Draws within the write follow in order. */
export interface Random {
  /** One die per entry: each face is 0, 0, 1, 1, 2 or 2. */
  dice: (count: number) => number[];
  shuffle: <T>(items: readonly T[]) => T[];
}

export const SETUP_KEY = "setup";

const DIE_FACES = [0, 0, 1, 1, 2, 2];

export function randomFor(seed: string, key: string): Random {
  const rng = createRng(`${seed}/${key}`);
  return {
    dice: (count) =>
      Array.from(
        { length: count },
        () => DIE_FACES[below(rng, DIE_FACES.length)],
      ),
    shuffle: (items) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = below(rng, i + 1);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

function below(rng: Rng, n: number): number {
  return Math.floor(rng.next() * n);
}
