import * as THREE from "three";
import { chamberstick, cobweb, crate, lantern } from "../kit";
import { trunk } from "../kit/trunk";
import type { FloorOpening, RoomDefinition } from "../room";
import { batch, box, cylinder, flat, group, lathe, textured } from "../shapes";
import { pixelTexture, woodPlanks } from "../textures";

/** The bays where the floorboards are up, down to the bare joists: one
 *  either side of the boarded way in from the door, in room metres. */
const BAYS: { x: [number, number]; z: [number, number] }[] = [
  { x: [-2.75, -0.82], z: [-1.2, 2.05] },
  { x: [0.82, 2.75], z: [-0.4, 1.7] },
];
/** How deep the joists go, and where the lath-and-plaster ceiling of the
 *  room below lies between them. */
const JOIST_DEPTH = 0.18;
const JOIST_TOP = -0.025;
const LATH_Y = -0.27;
/** Joists every this many metres across a bay. */
const JOIST_PITCH = 0.4;

/** Lath and plaster seen from above: thin strips of wood with the plaster
 *  squeezed up between them. */
function lath(): THREE.Texture {
  return pixelTexture(["wwwwwwww", "pbpppbpp", "bbpbbbpb", "wwwwwwww", "pbbbpbbp", "bpbbbbpb"], { w: "woodLight", p: "bone", b: "boneLight" }, true);
}

/**
 * Under one bay: the bare joists running along z, their ends let into the
 * boards either side, and below them the lath ceiling of the room below,
 * broken through in one place to the dark.
 */
function bareJoists(bay: { x: [number, number]; z: [number, number] }, hole: [number, number] | null): THREE.Group {
  const [x0, x1] = bay.x;
  const [z0, z1] = bay.z;
  const b = batch();
  for (let x = x0 + JOIST_PITCH / 2; x < x1 - 0.1; x += JOIST_PITCH) {
    b.block([0.08, JOIST_DEPTH, z1 - z0 + 0.1], "woodMid", [x, JOIST_TOP - JOIST_DEPTH, (z0 + z1) / 2]);
  }
  const ceiling = box([x1 - x0, 0.02, z1 - z0], textured(lath()), [(x0 + x1) / 2, LATH_Y, (z0 + z1) / 2]);
  const result = group(b.mesh(), ceiling);
  if (hole) {
    const dark = flat("void");
    const patches = [[0, 0, 0.36, 0.5], [0.1, -0.2, 0.22, 0.3], [-0.12, 0.18, 0.2, 0.26]];
    patches.forEach(([dx, dz, w, d], i) => {
      result.add(box([w, 0.01, d], dark, [hole[0] + dx, LATH_Y + 0.02 + i * 0.002, hole[1] + dz]));
    });
  }
  return result;
}

/** A floorboard snapped in the bay, one end still on its joist, the broken
 *  end gone down through the lath. Lies along x. */
function snappedBoard(): THREE.Group {
  const board = box([1.0, 0.025, 0.22], flat("woodLight"), [-0.5, 0, 0]);
  const tilted = group(board);
  tilted.rotation.z = 0.32;
  tilted.position.set(0.3, JOIST_TOP + 0.005, 0);
  return group(tilted);
}

/** A dressmaker's dummy on its tripod stand, a pale torso in a scrap of
 *  dark cloth, faced to the door. Faces +z. */
function dressmakersDummy(): THREE.Group {
  const torso = lathe(
    [
      [0, 0],
      [0.15, 0],
      [0.17, 0.12],
      [0.13, 0.3],
      [0.19, 0.5],
      [0.18, 0.62],
      [0.09, 0.7],
      [0.05, 0.72],
      [0, 0.72],
    ],
    flat("boneLight"),
    10,
  );
  torso.scale.z = 0.7;
  torso.position.y = 0.95;
  const iron = flat("soot");
  const result = group(torso, cylinder(0.02, 0.97, flat("woodDark"), [0, 0, 0], { sides: 6 }), box([0.035, 0.08, 0.035], flat("woodMid"), [0, 1.67, 0]));
  for (let k = 0; k < 3; k++) {
    const leg = box([0.3, 0.025, 0.035], iron, [0.15, 0, 0]);
    leg.rotation.y = (k / 3) * Math.PI * 2 + 0.5;
    result.add(leg);
  }
  // A scrap of dark cloth pinned round the hips.
  const skirt = cylinder(0.2, 0.28, flat("bruiseDark"), [0, 0.93, 0], { top: 0.16, sides: 10 });
  skirt.scale.z = 0.75;
  result.add(skirt);
  return result;
}

/** Old frames stacked face to the wall, leaning. Their backs at z = 0. */
function stackedFrames(): THREE.Group {
  const result = group();
  for (const [w, h, x, lean] of [[0.8, 0.95, 0, 0.14], [0.65, 0.75, 0.06, 0.2], [0.5, 0.6, -0.05, 0.27]] as const) {
    const frame = group(box([w, h, 0.04], flat("woodMid"), [0, 0, 0]), box([w - 0.1, h - 0.1, 0.02], flat("ash"), [0, 0.05, 0.03]));
    frame.rotation.x = -lean;
    frame.position.set(x, 0, Math.sin(lean) * h * 0.5 + (0.27 - lean) * 0.6);
    result.add(frame);
  }
  return result;
}

const OPENINGS: FloorOpening[] = BAYS;

/** The Attic: half its floorboards are up, so the floor is a boarded way in
 *  from the door and a landing at the back, either side of it bare joists
 *  over the lath of the ceiling below; one board has snapped through. A
 *  storm lantern stands on the boards and rakes its amber light across the
 *  joists. To get out you pick your way back over them. */
export const ATTIC: RoomDefinition = {
  id: "attic",
  floor: () => woodPlanks({ ramp: ["woodDark", "wood", "woodMid", "woodLight"], plankPx: 7, seed: "attic" }),
  wall: () => woodPlanks({ ramp: ["soot", "woodDark", "wood", "woodMid"], plankPx: 10, seed: "attic-wall" }),
  trim: "woodDark",
  floorOpenings: OPENINGS,
  props: [
    { build: () => bareJoists(BAYS[0], [-1.55, 0.55]), name: "bareJoists", at: [0, 0], contacts: [{ with: "floor", because: "the joists' ends run on under the boards" }] },
    { build: () => bareJoists(BAYS[1], null), name: "bareJoists", at: [0, 0], contacts: [{ with: "floor", because: "the joists' ends run on under the boards" }] },
    { build: snappedBoard, at: [-1.45, 0.55], contacts: [{ with: "bareJoists", because: "it rests on a joist and has gone through the lath" }] },
    { build: () => lantern({ width: 0.12, height: 0.2, intensity: 8, range: 9, flicker: 0.12 }), name: "lantern", at: [-0.62, -1.38], y: 0.3 },
    { build: dressmakersDummy, at: [-2.05, -2.15], turn: 25 },
    { build: () => trunk({ size: [0.95, 0.45, 0.52], body: "moonDark" }), name: "trunk", at: [1.35, -2.45] },
    { build: () => chamberstick({ height: 0.08, intensity: 2.4, range: 6 }), name: "chamberstick", at: [1.0, -2.45], y: 0.52 },
    { build: () => trunk({ size: [0.7, 0.36, 0.42], body: "blood", open: 0.5 }), name: "trunk", at: [2.35, -1.45], turn: -80 },
    { build: () => crate([0.5, 0.45, 0.5]), name: "crate", at: [2.4, -2.4], turn: 8 },
    { build: () => crate([0.4, 0.36, 0.4], "woodMid"), name: "crate", at: [2.38, -2.42], y: 0.45, turn: -14 },
    { build: stackedFrames, at: [-2.72, -1.65], turn: 90, contacts: [{ with: "left", because: "the frames lean back against the wall" }] },
    { build: () => cobweb({ form: "slung" }), name: "cobweb", at: [2.51, -2.51], y: 3.05, turn: -135, walls: ["right", "top"] },
  ],
  focus: [-0.8, 0.2, 0.2],
  pawn: [0.0, 0.3],
  spots: [[-0.3, 1.45], [0.3, -0.7], [-1.35, -1.85], [1.4, -1.0], [0.45, -1.9]],
  // Up the gap between the trunks, then along under the eaves.
  lanes: [
    [[0, 2.2], [0, -1.1], [-0.1, -1.6], [-0.5, -2.1], [-1.4, -2.1]],
    [[0, -1.1], [1.5, -1.1]],
  ],
};
