import * as THREE from "three";
import { animated } from "../animate";
import { candelabra, candle, cobweb, pictureFrame, pitShell, table } from "../kit";
import { crossLanes, INNER, TILE, onWall, type RoomDefinition } from "../room";
import { batch, group } from "../shapes";
import { woodPlanks } from "../textures";
import { newel, RAIL, runner, STAIR, SUITE } from "./starting-tile";

/** The stairwell along the top wall, where the grand staircase comes up from
 *  the ground floor: its head is at `head`, and it falls away towards the
 *  left wall. */
const WELL = { x: [-INNER, -0.85] as [number, number], z: [-INNER, -1.38] as [number, number] };
const HEAD = WELL.x[1];
const MID = (STAIR.back + STAIR.front) / 2;
/** The edge of the well on the landing side, where the balustrade stands. */
const EDGE = -1.41;
const WELL_DEPTH = 1.9;
/** The whole steps of the flight that show in the well. */
const WELL_STEPS = Math.floor((HEAD - WELL.x[0]) / STAIR.going);

/** The head of the grand staircase climbing up out of the well, in the
 *  ground floor's own measure and dress, with the lining of the well. */
function stairHead(): THREE.Group {
  const b = batch();
  const depth = STAIR.front - STAIR.back;
  for (let k = 1; ; k++) {
    const x1 = HEAD - (k - 1) * STAIR.going;
    const x0 = Math.max(x1 - STAIR.going, WELL.x[0]);
    if (x1 - x0 < 0.02) break;
    const top = -k * STAIR.rise;
    const cx = (x0 + x1) / 2;
    b.block([x1 - x0, top - 0.04 + WELL_DEPTH, depth], "woodDark", [cx, -WELL_DEPTH, MID]);
    // This flight climbs towards +x, so each riser faces −x and the nosings overhang that way.
    b.block([x1 - x0, 0.04, depth + 0.03], "woodMid", [cx - 0.015, top - 0.04, MID + 0.015]);
    b.block([x1 - x0, 0.025, STAIR.carpet], "blood", [cx + 0.02, top, MID]);
    // The riser's carpet stands on the tread carpet, rather than beside it in the same planes.
    b.block([0.025, STAIR.rise - 0.065, STAIR.carpet], "blood", [x1 - 0.0125, top + 0.025, MID]);
    b.block([0.03, 0.03, STAIR.carpet + 0.1], "brass", [x1 - 0.03, top, MID]);
  }
  b.block([0.08, 0.055, depth + 0.03], "woodMid", [HEAD + 0.01, -0.04, MID + 0.015]);
  // The dark of the well below the floor, which the flight falls into.
  return group(b.mesh(), pitShell({ x: [-TILE / 2, HEAD + 0.07], z: [-TILE / 2, EDGE + 0.04], bottom: -WELL_DEPTH - 0.05 }));
}

/** The balustrade along the landing edge of the well, its rail running into
 *  the left wall. */
function balustrade(): THREE.Group {
  const b = batch();
  const from = WELL.x[0];
  const to = HEAD;
  b.block([to - from, 0.08, 0.12], "woodMid", [(from + to) / 2, 0, EDGE]);
  for (let x = to - 0.2; x > from + 0.05; x -= 0.18) b.block([0.04, RAIL + 0.1, 0.04], "woodMid", [x, 0.08, EDGE]);
  b.block([to - from, 0.08, 0.08], "woodDark", [(from + to) / 2, RAIL + 0.15, EDGE]);
  return group(b.mesh());
}

/** A rocking chair with a shawl over its back. It faces +z, and rocks slowly
 *  though no one sits in it. */
function rockingChair(): THREE.Group {
  const b = batch();
  for (const x of [-0.24, 0.24]) {
    // Each rocker curves up at both ends.
    // The middle length is a hair narrower than the curved ends it overlaps, so their sides never share a plane.
    for (const [z, y, tilt] of [[-0.3, 0.075, 0.35], [0, 0.02, 0], [0.3, 0.075, -0.35]]) {
      b.add([tilt === 0 ? 0.036 : 0.04, 0.04, 0.32], "woodDark", new THREE.Matrix4().makeRotationX(tilt).setPosition(x, y, z));
    }
    // The legs are a hair narrower than the rockers and the seat, so their sides never share a plane with them.
    for (const z of [-0.18, 0.18]) b.block([0.036, 0.4, 0.04], "woodMid", [x, 0.04, z]);
    b.block([0.036, 0.24, 0.04], "woodMid", [x, 0.47, 0.18]);
    b.block([0.06, 0.03, 0.44], "woodMid", [x, 0.7, 0]);
  }
  b.block([0.52, 0.04, 0.44], "woodMid", [0, 0.44, 0]);
  const back = new THREE.Matrix4().makeRotationX(-0.18).setPosition(0, 0.48, -0.2);
  for (const x of [-0.24, -0.08, 0.08, 0.24]) b.add([0.04, 0.75, 0.03], "woodMid", back.clone().multiply(new THREE.Matrix4().makeTranslation(x, 0.375, 0)));
  b.add([0.56, 0.08, 0.04], "woodDark", back.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.78, 0)));
  b.add([0.5, 0.3, 0.03], "boneDark", back.clone().multiply(new THREE.Matrix4().makeTranslation(0.06, 0.62, -0.035)));
  b.add([0.22, 0.42, 0.03], "bone", back.clone().multiply(new THREE.Matrix4().makeTranslation(0.2, 0.5, 0.04)));
  b.add([0.16, 0.035, 0.36], "boneDark", new THREE.Matrix4().makeTranslation(-0.12, 0.475, 0.02));
  const chair = group(b.mesh());
  return group(
    animated(chair, (seconds) => {
      // It rolls on its rockers: a turn about the centre of their curve, which lies this far above the floor.
      const curve = 0.95;
      const turn = 0.09 * Math.sin(seconds * 1.1);
      chair.rotation.x = turn;
      chair.position.set(0, curve * (1 - Math.cos(turn)), -curve * Math.sin(turn));
    }),
  );
}

/** The Upper Landing: the head of the grand staircase climbing out of a
 *  balustraded stairwell, its newel lamp lit, with a door on every side. It
 *  carries the hall's paper and panels up the stair, on the upper floor's boards. */
export const UPPER_LANDING: RoomDefinition = {
  id: "upper-landing",
  ...SUITE,
  floor: () => woodPlanks({ seed: "upper-landing" }),
  floorOpenings: [WELL],
  props: [
    { build: stairHead, at: [0, 0], contacts: [{ with: "floor", because: "the landing's nosing is set into the edge of the floor" }] },
    { build: balustrade, at: [0, 0], contacts: [{ with: "newel", because: "its rail is jointed into the newel post" }] },
    { build: newel, at: [HEAD + 0.06, EDGE] },
    { build: () => runner({ from: HEAD, to: 2.5, z: MID, finished: ["to"] }), at: [0, 0] },
    { build: rockingChair, at: [1.3, 1.3], turn: -135 },
    { build: () => candle({ height: 0.1, intensity: 1.6 }), at: [1.85, 0.95] },
    { build: () => table({ length: 1.0, width: 0.4, height: 0.82 }), ...onWall("right", -1.7, { out: 0.25 }) },
    { build: () => candelabra({ arms: 3, intensity: 3 }), at: [2.5, -1.7], y: 0.82 },
    { build: () => pictureFrame({ frame: "brass" }), ...onWall("right", -1.7, { y: 1.45 }) },
    { build: () => pictureFrame({ frame: "woodLight" }), ...onWall("bottom", 1.7, { y: 1.4 }) },
    { build: () => pictureFrame({ frame: "brass" }), ...onWall("bottom", -1.7, { y: 1.4 }) },
    { build: () => cobweb({ form: "slung" }), at: [INNER - 0.29, INNER - 0.29], y: 3.05, turn: 45, walls: ["right", "bottom"] },
  ],
  focus: [-0.8, 0.6, -1.8],
  pawn: [0.8, -0.9],
  spots: [[-0.3, 0.4], [-1.55, -0.8], [-1.9, 1.0], [1.7, 0.55], [1.0, 2.15]],
  overflow: [[1.9, -2.0], [-1.2, 2.35], [2.3, 1.85], [-0.3, -1.0], [0.8, 0.1], [1.05, -2.1]],
  // Doorway to doorway through the middle, below the stairwell's rail and wide of the table.
  lanes: crossLanes(),
  // Down the head of the flight, over the middle of each tread, to the last step showing in the well.
  stairs: {
    "grand-staircase": [
      [HEAD + 0.8, 0, MID],
      [HEAD + STAIR.going / 2, 0, MID],
      [HEAD - (WELL_STEPS - 0.5) * STAIR.going, -WELL_STEPS * STAIR.rise, MID],
    ],
  },
};
