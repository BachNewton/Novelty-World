import { frogPasses } from "../logic";
import { rowOpening, type Row } from "../traffic";
import { TUNING } from "../tuning";
import type { Frog, HopHeight, Rotation } from "../types";

// A few fixed rows of traffic for the `?world` preview, independent of the
// course generator, each with an L-shaped frog pose that passes it.
export const PREVIEW_ROWS: readonly Row[] = [
  [
    { id: "O0", lane: 0 },
    { id: "T0", lane: 2 },
    { id: "I1", lane: 6 },
  ],
  [
    { id: "J0", lane: 0 },
    { id: "S0", lane: 4 },
  ],
  [
    { id: "I0", lane: 0 },
    { id: "L2", lane: 4 },
  ],
  [
    { id: "Z1", lane: 0 },
    { id: "T1", lane: 2 },
    { id: "O0", lane: 5 },
  ],
  [
    { id: "L0", lane: 0 },
    { id: "I1", lane: 3 },
    { id: "T3", lane: 5 },
  ],
];

const ROTATIONS: readonly Rotation[] = [0, 1, 2, 3];
const HOPS: readonly HopHeight[] = [0, 1];

// The first L pose, grounded before hopping, that passes the row.
export function passingPose(row: Row): Frog | null {
  const opening = rowOpening(row, TUNING.corridorCols, TUNING.wallRows);
  for (const hop of HOPS) {
    for (const rotation of ROTATIONS) {
      for (let col = 0; col < TUNING.corridorCols; col++) {
        const frog: Frog = { kind: "L", col, rotation, hop };
        if (frogPasses(frog, opening)) return frog;
      }
    }
  }
  return null;
}
