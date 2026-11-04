import type { ArtModel } from "../catalogue";
import { bakeCrowd } from "./crowd";
import { POSES } from "./poses";

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

/** Everyone the gallery shows: each pose on the gallery's eight people, near and far. */
export const artModels = (): ArtModel[] =>
  POSES.flatMap((pose) =>
    SEEDS.map((seed) => {
      const { near, far } = bakeCrowd([{ x: 0, y: 0, z: 0, seed, pose }]);
      return { name: `${pose} ${seed}`, geometries: { near, far } };
    }),
  );
