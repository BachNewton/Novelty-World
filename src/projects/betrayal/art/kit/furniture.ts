import * as THREE from "three";
import { RAMPS, type PaletteKey, type Ramp } from "../palette";
import { box, flat, group, textured } from "../shapes";
import { woodPlanks } from "../textures";

export interface TableOptions {
  /** Along x, in metres. */
  length?: number;
  /** Along z, in metres. */
  width?: number;
  height?: number;
  wood?: Ramp;
  /** A runner of cloth along the table, or none. */
  runner?: PaletteKey | null;
}

/** A plain four-legged table with an apron. */
export function table({
  length = 1.8,
  width = 0.9,
  height = 0.76,
  wood = RAMPS.wood,
  runner = null,
}: TableOptions = {}): THREE.Group {
  const top = textured(woodPlanks({ ramp: wood, plankPx: 6, seed: "table" }));
  const frame = flat(wood[1]);
  const leg = 0.07;
  const thickness = 0.05;
  const legHeight = height - thickness;
  const result = group(box([length, thickness, width], top, [0, legHeight, 0]));
  const lx = length / 2 - leg;
  const lz = width / 2 - leg;
  for (const [x, z] of [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]]) {
    result.add(box([leg, legHeight, leg], frame, [x, 0, z]));
  }
  result.add(
    box([length - leg * 2, 0.1, 0.03], frame, [0, legHeight - 0.1, lz]),
    box([length - leg * 2, 0.1, 0.03], frame, [0, legHeight - 0.1, -lz]),
    box([0.03, 0.1, width - leg * 2], frame, [lx, legHeight - 0.1, 0]),
    box([0.03, 0.1, width - leg * 2], frame, [-lx, legHeight - 0.1, 0]),
  );
  if (runner) {
    const cloth = flat(runner);
    result.add(
      box([length * 0.75, 0.005, width * 0.45], cloth, [0, height, 0]),
      box([0.01, 0.18, width * 0.45], cloth, [length * 0.375, height - 0.18, 0]),
      box([0.01, 0.18, width * 0.45], cloth, [-length * 0.375, height - 0.18, 0]),
    );
  }
  return result;
}

export interface ChairOptions {
  wood?: Ramp;
  /** Seat cushion colour, or none for a bare wooden seat. */
  cushion?: PaletteKey | null;
  /** Height of the back above the floor. */
  back?: number;
}

/** A high-backed dining chair. It faces +z: you sit facing the bottom edge. */
export function chair({ wood = RAMPS.wood, cushion = "blood", back = 1.15 }: ChairOptions = {}): THREE.Group {
  const frame = flat(wood[1]);
  const dark = flat(wood[0]);
  const seat = 0.46;
  const size = 0.46;
  const leg = 0.05;
  const half = size / 2 - leg / 2;
  const result = group(box([size, 0.04, size], frame, [0, seat - 0.04, 0]));
  for (const [x, z] of [[-half, half], [half, half]]) {
    result.add(box([leg, seat - 0.04, leg], frame, [x, 0, z]));
  }
  for (const x of [-half, half]) {
    result.add(box([leg, back, leg], frame, [x, 0, -half]));
  }
  // The top rail caps the back posts, standing proud of them; the lower rail sits between them, inset.
  result.add(
    box([size + 0.02, 0.08, leg + 0.02], frame, [0, back - 0.07, -half]),
    box([size - leg * 2 + 0.01, 0.05, leg - 0.016], dark, [0, seat + 0.12, -half]),
  );
  for (const x of [-0.09, 0, 0.09]) {
    result.add(box([0.04, back - seat - 0.28, 0.02], dark, [x, seat + 0.17, -half]));
  }
  if (cushion) result.add(box([size - 0.06, 0.05, size - 0.08], flat(cushion), [0, seat, 0.02]));
  return result;
}
