import * as THREE from "three";
import { animated } from "../animate";
import { candelabra, candle, cobweb, pictureFrame, pitShell, table } from "../kit";
import { crossLanes, INNER, TILE, onWall, type RoomDefinition } from "../room";
import { batch, group } from "../shapes";
import { shiny, SHINES } from "../shine";
import { woodPlanks } from "../textures";
import { newel, RAIL, runner, STAIR, SUITE } from "./starting-tile";

/** The stairwell along the top wall, where the grand staircase comes up from
 *  the ground floor: its head is at `HEAD`, and it falls away towards the
 *  right wall, the way the flight below falls towards its foot by the Foyer,
 *  so a climb arrives facing the way it went up. */
const WELL = { x: [0.85, INNER] as [number, number], z: [-INNER, -1.38] as [number, number] };
const HEAD = WELL.x[0];
const MID = (STAIR.back + STAIR.front) / 2;
/** The edge of the well on the landing side, where the balustrade stands. */
const EDGE = -1.41;
const WELL_DEPTH = 1.9;
/** The whole steps of the flight that show in the well. */
const WELL_STEPS = Math.floor((WELL.x[1] - HEAD) / STAIR.going);

/** The head of the grand staircase climbing up out of the well, in the
 *  ground floor's own measure and dress, with the lining of the well. */
function stairHead(): THREE.Group {
  const b = batch();
  const rods = batch();
  const depth = STAIR.front - STAIR.back;
  for (let k = 1; ; k++) {
    const x0 = HEAD + (k - 1) * STAIR.going;
    const x1 = Math.min(x0 + STAIR.going, WELL.x[1]);
    if (x1 - x0 < 0.02) break;
    const top = -k * STAIR.rise;
    const cx = (x0 + x1) / 2;
    b.block([x1 - x0, top - 0.04 + WELL_DEPTH, depth], "woodDark", [cx, -WELL_DEPTH, MID]);
    // This flight climbs towards −x, so each riser faces +x and the nosings overhang that way.
    b.block([x1 - x0, 0.04, depth + 0.03], "woodMid", [cx + 0.015, top - 0.04, MID + 0.015]);
    b.block([x1 - x0, 0.025, STAIR.carpet], "blood", [cx - 0.02, top, MID]);
    // The riser's carpet stands on the tread carpet, rather than beside it in the same planes.
    b.block([0.025, STAIR.rise - 0.065, STAIR.carpet], "blood", [x0 + 0.0125, top + 0.025, MID]);
    rods.block([0.03, 0.03, STAIR.carpet + 0.1], "brass", [x0 + 0.03, top, MID]);
  }
  b.block([0.08, 0.055, depth + 0.03], "woodMid", [HEAD - 0.01, -0.04, MID + 0.015]);
  // The dark of the well below the floor, which the flight falls into.
  const brass = rods.mesh();
  shiny(brass.material, SHINES.brass);
  return group(b.mesh(), brass, pitShell({ x: [HEAD - 0.07, TILE / 2], z: [-TILE / 2, EDGE + 0.04], bottom: -WELL_DEPTH - 0.05 }));
}

/** The balustrade along the landing edge of the well, its rail running into
 *  the right wall. */
function balustrade(): THREE.Group {
  const b = batch();
  const from = HEAD;
  const to = WELL.x[1];
  b.block([to - from, 0.08, 0.12], "woodMid", [(from + to) / 2, 0, EDGE]);
  for (let x = from + 0.2; x < to - 0.05; x += 0.18) b.block([0.04, RAIL + 0.1, 0.04], "woodMid", [x, 0.08, EDGE]);
  b.block([to - from, 0.08, 0.08], "woodDark", [(from + to) / 2, RAIL + 0.15, EDGE]);
  const rail = b.mesh();
  shiny(rail.material, SHINES.polishedWood);
  return group(rail);
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
  floor: () => woodPlanks({ seed: "upper-landing", glints: false }),
  floorOpenings: [WELL],
  props: [
    { build: stairHead, at: [0, 0], contacts: [{ with: "floor", because: "the landing's nosing is set into the edge of the floor" }] },
    { build: balustrade, at: [0, 0], contacts: [{ with: "newel", because: "its rail is jointed into the newel post" }] },
    { build: newel, at: [HEAD - 0.06, EDGE] },
    { build: () => runner({ from: -2.5, to: HEAD, z: MID, finished: ["from"] }), at: [0, 0] },
    { build: rockingChair, at: [-1.3, 1.3], turn: 135 },
    { build: () => candle({ height: 0.1, intensity: 1.6 }), at: [-1.85, 0.95] },
    { build: () => table({ length: 1.0, width: 0.4, height: 0.82 }), ...onWall("left", 1.7, { out: 0.25 }) },
    { build: () => candelabra({ arms: 3, intensity: 3 }), at: [-2.5, -1.7], y: 0.82 },
    { build: () => pictureFrame({ picture: "house on its hill", frame: "brass" }), ...onWall("left", 1.7, { y: 1.45 }) },
    { build: () => pictureFrame({ picture: "old woman in a bonnet", frame: "woodLight" }), ...onWall("bottom", -1.7, { y: 1.4 }) },
    { build: () => pictureFrame({ picture: "man in a top hat", frame: "brass" }), ...onWall("bottom", 1.7, { y: 1.4 }) },
    { build: () => cobweb({ form: "slung" }), at: [-(INNER - 0.29), INNER - 0.29], y: 3.05, turn: -45, walls: ["left", "bottom"] },
  ],
  focus: [0.8, 0.6, -1.8],
  prime: [-0.8, -0.9],
  // Doorway to doorway through the middle, below the stairwell's rail and wide of the table.
  lanes: crossLanes(),
  // Down the head of the flight, over the middle of each tread, to the last step showing in the well.
  stairs: {
    "grand-staircase": [
      [HEAD - 0.8, 0, MID],
      [HEAD - STAIR.going / 2, 0, MID],
      [HEAD + (WELL_STEPS - 0.5) * STAIR.going, -WELL_STEPS * STAIR.rise, MID],
    ],
  },
};
