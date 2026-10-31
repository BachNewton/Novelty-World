import { Model, seeded, type V3 } from "./mesh";
import type { RoadsideModel } from "./models";

/*
 * A Scots pine one unit tall, to be scaled by the tree's height. It stands as real
 * ones do: a long bare trunk leaning a little, grey low down and orange above, and
 * a flat-topped crown in the top third, of uneven lumps on limbs with a little
 * sky between them, rather than one round ball on a stick.
 */

/** Where the lumps stand: up the tree, out from the trunk, which way round, how wide, how tall. All shares of the tree's height. */
const CROWN: [up: number, out: number, turn: number, wide: number, tall: number][] = [
  [0.63, 0.07, 0.4, 0.08, 0.085],
  [0.69, 0.085, 3.3, 0.095, 0.095],
  [0.77, 0.06, 1.9, 0.1, 0.1],
  [0.79, 0.08, 5.1, 0.085, 0.09],
  [0.87, 0.03, 0.2, 0.125, 0.09],
];

const BARE_STUBS: [up: number, turn: number][] = [
  [0.44, 1.2],
  [0.52, 4.1],
  [0.58, 2.4],
];

const BEND: V3[] = [[0, -0.03, 0], [0.006, 0.34, 0.003], [-0.004, 0.62, -0.002], [0.008, 0.97, 0.004]];
const POD_SIDES = 5;

export function buildPine(seed = 7): RoadsideModel {
  const random = seeded(seed);
  const near = new Model()
    .tube(BEND[0], BEND[1], 0.017, 4, { radiusTo: 0.012, shadeFrom: 0.75, shadeTo: 1 }, "bark")
    .tube(BEND[1], BEND[2], 0.012, 4, { radiusTo: 0.009 }, "bark-upper")
    .tube(BEND[2], BEND[3], 0.009, 4, { radiusTo: 0.002 }, "bark-upper");
  const trunkAt = (up: number): V3 => {
    const place = up < BEND[1][1] ? 0 : up < BEND[2][1] ? 1 : 2;
    const share = (up - BEND[place][1]) / (BEND[place + 1][1] - BEND[place][1]);
    return [BEND[place][0] + (BEND[place + 1][0] - BEND[place][0]) * share, up, BEND[place][2] + (BEND[place + 1][2] - BEND[place][2]) * share];
  };
  for (const [up, turn] of BARE_STUBS) {
    const start = trunkAt(up);
    near.spike(start, [start[0] + Math.cos(turn) * 0.05, up + 0.018, start[2] + Math.sin(turn) * 0.05], 0.003, "bark");
  }
  for (const [up, out, turn, wide, tall] of CROWN) {
    const at: V3 = [Math.cos(turn) * out, up, Math.sin(turn) * out];
    if (out > 0.055) near.spike(trunkAt(up - 0.05), at, 0.0045, "bark-upper");
    near.lump(at, wide, tall, POD_SIDES, random, { top: "needles-lit", under: "needles" });
  }
  const far = new Model()
    .tube(BEND[0], [0, 0.7, 0], 0.02, 3, { radiusTo: 0.012 }, "bark-upper")
    .lump([0.01, 0.65, 0], 0.145, 0.31, 4, random, { top: "needles-lit", under: "needles" });
  return { near: near.build(), far: far.build(), swapM: 150, reachM: 1100 };
}
