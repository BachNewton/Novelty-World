import type { RoadsideModel } from "../roadside/index";
import type { V3 } from "../roadside/mesh";
import { finished, RuralMesh, type RuralPart } from "./mesh";

/*
 * The wooden buildings of the countryside. Boards are the material's; everything here
 * is shape. Doors face +z, as a road-facing thing in the roadside kit does.
 */

interface Gable {
  /** Half widths across x and along z. */
  x: number;
  z: number;
  floor: number;
  eaves: number;
  ridge: number;
  overhang: number;
  wall: RuralPart;
}

/** Four walls and a ridge along z, with a roof, fascia and white corners. */
function gabled(mesh: RuralMesh, { x, z, floor, eaves, ridge, overhang, wall }: Gable): RuralMesh {
  mesh
    .face([[-x, floor, z], [x, floor, z], [x, eaves, z], [0, ridge, z], [-x, eaves, z]], wall)
    .face([[x, floor, -z], [-x, floor, -z], [-x, eaves, -z], [0, ridge, -z], [x, eaves, -z]], wall, 0.92)
    .face([[x, floor, z], [x, floor, -z], [x, eaves, -z], [x, eaves, z]], wall, 0.96)
    .face([[-x, floor, -z], [-x, floor, z], [-x, eaves, z], [-x, eaves, -z]], wall, 0.96);
  const [xOut, zOut] = [x + overhang, z + overhang];
  const low = eaves - (overhang * (ridge - eaves)) / x;
  for (const side of [-1, 1]) {
    mesh.face([[0, ridge, -zOut], [0, ridge, zOut], [side * xOut, low, zOut], [side * xOut, low, -zOut]], "roof-dark", 1.02);
    mesh.face([[side * x, eaves - 0.14, -zOut], [side * x, eaves - 0.14, zOut], [side * xOut, low - 0.1, zOut], [side * xOut, low - 0.1, -zOut]], "roof-under");
    // The fascia at the eaves, and the white barge boards up each gable.
    mesh.face([[side * xOut, low, -zOut], [side * xOut, low, zOut], [side * xOut, low - 0.13, zOut], [side * xOut, low - 0.13, -zOut]], "trim", 0.95);
    for (const end of [-zOut, zOut]) mesh.face([[0, ridge + 0.02, end], [side * xOut, low + 0.02, end], [side * xOut, low - 0.15, end], [0, ridge - 0.17, end]], "trim");
    // Corner boards.
    for (const end of [-z, z]) {
      mesh.face([[side * (x + 0.012), floor, end], [side * (x + 0.012), eaves, end], [side * (x + 0.012), eaves, end - Math.sign(end) * 0.13], [side * (x + 0.012), floor, end - Math.sign(end) * 0.13]], "trim");
      const way = Math.sign(end) * 0.012;
      mesh.face([[side * x, floor, end + way], [side * x, eaves, end + way], [side * (x - 0.13), eaves, end + way], [side * (x - 0.13), floor, end + way]], "trim");
    }
  }
  return mesh;
}

function gableFar(mesh: RuralMesh, { x, z, floor, eaves, ridge, overhang, wall }: Gable): RuralMesh {
  const [xOut, zOut] = [x + overhang, z + overhang];
  mesh
    .face([[-x, floor, z], [x, floor, z], [x, eaves, z], [0, ridge, z], [-x, eaves, z]], wall)
    .face([[x, floor, -z], [-x, floor, -z], [-x, eaves, -z], [0, ridge, -z], [x, eaves, -z]], wall, 0.92)
    .face([[x, floor, z], [x, floor, -z], [x, eaves, -z], [x, eaves, z]], wall, 0.96)
    .face([[-x, floor, -z], [-x, floor, z], [-x, eaves, z], [-x, eaves, -z]], wall, 0.96);
  for (const side of [-1, 1]) mesh.face([[0, ridge, -zOut], [0, ridge, zOut], [side * xOut, eaves - 0.15, zOut], [side * xOut, eaves - 0.15, -zOut]], "roof-dark");
  return mesh;
}

/** A framed opening on a wall facing +z or -z, centred on x. */
function doorway(mesh: RuralMesh, centre: number, floor: number, wide: number, tall: number, z: number, door: RuralPart, leaves: 1 | 2): RuralMesh {
  const way = Math.sign(z);
  const [left, right, top] = [centre - wide / 2, centre + wide / 2, floor + tall];
  const skin = z + way * 0.02;
  const frame = 0.1;
  mesh.face([[left, floor, skin], [right, floor, skin], [right, top, skin], [left, top, skin]], door);
  if (leaves === 2) mesh.face([[centre - 0.025, floor, skin + way * 0.01], [centre + 0.025, floor, skin + way * 0.01], [centre + 0.025, top, skin + way * 0.01], [centre - 0.025, top, skin + way * 0.01]], "trim");
  const out = skin + way * 0.012;
  mesh
    .face([[left - frame, floor, out], [left, floor, out], [left, top + frame, out], [left - frame, top + frame, out]], "trim")
    .face([[right, floor, out], [right + frame, floor, out], [right + frame, top + frame, out], [right, top + frame, out]], "trim")
    .face([[left - frame, top, out], [right + frame, top, out], [right + frame, top + frame, out], [left - frame, top + frame, out]], "trim");
  return mesh;
}

/** A small square window with a white frame and a bar, on a wall facing +x or -x. */
function windowOnSide(mesh: RuralMesh, x: number, y: number, z: number, size: number): RuralMesh {
  const way = Math.sign(x);
  const half = size / 2;
  const frame = 0.055;
  const out = x + way * 0.02;
  return mesh
    .face([[out, y - half - frame, z - half - frame], [out, y - half - frame, z + half + frame], [out, y + half + frame, z + half + frame], [out, y + half + frame, z - half - frame]], "trim")
    .face([[out + way * 0.01, y - half, z - half], [out + way * 0.01, y - half, z + half], [out + way * 0.01, y + half, z + half], [out + way * 0.01, y + half, z - half]], "glass")
    .face([[out + way * 0.02, y - 0.02, z - half], [out + way * 0.02, y - 0.02, z + half], [out + way * 0.02, y + 0.02, z + half], [out + way * 0.02, y + 0.02, z - half]], "trim");
}

export type ShedKind = "red" | "grey" | "woodshed";

/** A farm or garden shed, 3.4 × 2.8 m. `woodshed` is open along its front, with split logs stacked to the eaves. */
export function buildShed(kind: ShedKind = "red"): RoadsideModel {
  const wall: RuralPart = kind === "red" ? "red-boards" : "grey-boards";
  const gable: Gable = { x: 1.7, z: 1.4, floor: -0.5, eaves: 2, ridge: 2.85, overhang: 0.24, wall };
  const near = new RuralMesh();
  if (kind === "woodshed") {
    const [x, z, eaves, ridge] = [gable.x, gable.z, 2, 2.5];
    near
      .face([[x, -0.5, -z], [-x, -0.5, -z], [-x, eaves - 0.3, -z], [x, eaves + 0.5, -z]], wall, 0.92)
      .face([[x, -0.5, z], [x, -0.5, -z], [x, eaves + 0.5, -z], [x, eaves + 0.5, z]], wall, 0.96)
      .face([[-x, -0.5, -z], [-x, -0.5, z], [-x, eaves - 0.3, z], [-x, eaves - 0.3, -z]], wall, 0.96)
      .face([[-x - 0.3, ridge - 0.9, z + 0.45], [x + 0.3, ridge + 0.14, z + 0.45], [x + 0.3, ridge + 0.14, -z - 0.3], [-x - 0.3, ridge - 0.9, -z - 0.3]], "roof-dark", 1.02);
    for (const post of [-x + 0.06, 0, x - 0.06]) near.box([post - 0.06, -0.5, z - 0.1], [post + 0.06, eaves + (post / x) * 0.75, z + 0.02], "mill-timber");
    near.box([-x + 0.12, 0, -z + 0.1], [x - 0.12, 1.6, z - 0.32], "log", { open: true });
    for (let row = 0; row < 2; row++) near.face([[-x + 0.12, 0.05 + row * 0.8, z - 0.31], [x - 0.12, 0.05 + row * 0.8, z - 0.31], [x - 0.12, 0.8 + row * 0.8, z - 0.31], [-x + 0.12, 0.8 + row * 0.8, z - 0.31]], "log-end", row === 0 ? 0.95 : 1.05);
    const far = new RuralMesh().box([-x, -0.5, -z], [x, eaves, z], wall, { open: true }).face([[-x - 0.3, ridge - 0.9, z + 0.45], [x + 0.3, ridge + 0.14, z + 0.45], [x + 0.3, ridge + 0.14, -z - 0.3], [-x - 0.3, ridge - 0.9, -z - 0.3]], "roof-dark");
    return finished(near, far, 110, 700);
  }
  gabled(near, gable);
  doorway(near, 0, 0, 1.05, 1.85, gable.z, "door", 1);
  windowOnSide(near, gable.x, 1.25, 0.2, 0.5);
  return finished(near, gableFar(new RuralMesh(), gable), 110, 700);
}

export type BoathouseKind = "red" | "tarred";

const BOATHOUSE = { x: 2.2, z: 3.8, floor: 0.45, eaves: 2.6, ridge: 4.1, overhang: 0.32 };

/**
 * A boathouse with its gable and double doors to the water. Its origin is where the
 * shore meets the water, y 0 is the water, its front half on piles over +z and its
 * back on a stone footing on the land, and a slip of rails runs out from the doors.
 */
export function buildBoathouse(kind: BoathouseKind = "red"): RoadsideModel {
  const wall: RuralPart = kind === "red" ? "red-boards" : "tar-boards";
  const gable: Gable = { ...BOATHOUSE, wall };
  const { x, z, floor } = gable;
  const near = new RuralMesh({ grounded: false });
  const atSea = z * 0.4;
  gabled(near, gable);
  doorway(near, 0, floor + 0.02, 2.3, 1.95, z, "door", 2);
  // The door's Z braces.
  for (const side of [-1, 1]) {
    near.face([[side * 0.08, floor + 0.3, z + 0.04], [side * 1.08, floor + 0.3, z + 0.04], [side * 1.08, floor + 0.42, z + 0.04], [side * 0.08, floor + 0.42, z + 0.04]], "trim", 0.9);
    near.face([[side * 0.08, floor + 1.6, z + 0.04], [side * 1.08, floor + 1.6, z + 0.04], [side * 1.08, floor + 1.72, z + 0.04], [side * 0.08, floor + 1.72, z + 0.04]], "trim", 0.9);
  }
  windowOnSide(near, x, 1.9, -0.6, 0.5);
  windowOnSide(near, -x, 1.9, -0.6, 0.5);
  near.face([[-0.28, 3.05, z + 0.03], [0.28, 3.05, z + 0.03], [0.28, 3.5, z + 0.03], [-0.28, 3.5, z + 0.03]], "door");
  // Under the floor: dark, then stone at the back, piles at the front.
  near.box([-x + 0.04, -1, -z], [x - 0.04, floor + 0.02, atSea], "stone", { open: true, shade: 0.9, shadeTop: 0.8 });
  near.face([[-x, floor, atSea], [x, floor, atSea], [x, floor, z + 1.7], [-x, floor, z + 1.7]], "deck", 0.82);
  for (const pileZ of [atSea + 0.1, (atSea + z) / 2, z, z + 1.6]) {
    near.beam([-x, floor - 0.1, pileZ], [x, floor - 0.1, pileZ], 0.16, 0.16, "pile", 0.7);
    for (const side of [-x + 0.08, x - 0.08]) near.tube([side, -1.2, pileZ], [side, floor - 0.04, pileZ], 0.1, 4, { shadeFrom: 0.5, shadeTo: 0.9 }, "pile");
  }
  // The landing in front of the doors, and a slip going down into the water.
  const planks = 5;
  for (let plank = 0; plank < planks; plank++) {
    const [from, to] = [z + 0.02 + (plank / planks) * 1.68, z + 0.02 + ((plank + 1) / planks) * 1.68];
    near.face([[-x, floor + 0.04, to], [x, floor + 0.04, to], [x, floor + 0.04, from], [-x, floor + 0.04, from]], plank % 2 === 0 ? "deck-pale" : "deck", 0.98);
  }
  for (const side of [-0.7, 0.7]) near.beam([side, floor + 0.08, z + 1.7], [side, -0.5, z + 5], 0.12, 0.12, "pile", 0.8, 0.95);
  for (let sleeper = 1; sleeper < 4; sleeper++) {
    const share = sleeper / 4;
    near.beam([-0.95, floor - share * (floor + 0.5), z + 1.7 + share * 3.3], [0.95, floor - share * (floor + 0.5), z + 1.7 + share * 3.3], 0.14, 0.08, "pile", 0.85);
  }
  const far = gableFar(new RuralMesh({ grounded: false }), gable).face([[-0.9, floor, z + 0.03], [0.9, floor, z + 0.03], [0.9, 2.3, z + 0.03], [-0.9, 2.3, z + 0.03]], "door").face([[-x, floor, z], [x, floor, z], [x, -1, z], [-x, -1, z]], "pile", 0.6).face([[-x, floor, atSea], [x, floor, atSea], [x, floor, z + 1.7], [-x, floor, z + 1.7]], "deck");
  return finished(near, far, 180, 1400);
}

const MILL = {
  /** The cross-trees, the post through them, and the body's underside, its eaves and its ridge. */
  trees: 0.62,
  postTop: 4.3,
  bodyLow: 4.1,
  eaves: 8,
  ridge: 9.45,
  /** The body's half widths: across, and front to back. */
  x: 1.85,
  z: 2.25,
  /** The sails' shaft, where it leaves the front, and an arm's length. */
  shaftY: 7.65,
  shaftZ: 2.95,
  armM: 7,
};

const STOCK_M = 0.2;
const SAIL_WIDE_M = 1.35;
const SAIL_BARS = 8;
const SHAFT_TILT = 0.07;

/** One arm of four: the stock, and on its trailing side a lattice of white bars between two rails. */
function sailArm(mesh: RuralMesh, angle: number, centre: V3, bars: number): void {
  const out = (reach: number, side: number): V3 => {
    const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
    const [x, y] = [cos * reach - sin * side, sin * reach + cos * side];
    return [centre[0] + x, centre[1] + y, centre[2] - y * SHAFT_TILT];
  };
  const tip = MILL.armM;
  mesh.beam(out(0, 0), out(tip, 0), STOCK_M, STOCK_M * 0.8, "trim", 0.98);
  const start = 1.1;
  const rail = (side: number) => {
    const [a, b] = [out(start, side - 0.045), out(tip, side - 0.045)];
    const [c, d] = [out(tip, side + 0.045), out(start, side + 0.045)];
    mesh.face([a, b, c, d], "trim");
  };
  rail(SAIL_WIDE_M);
  rail(SAIL_WIDE_M * 0.5);
  for (let bar = 0; bar <= bars; bar++) {
    const reach = start + (bar / bars) * (tip - start);
    mesh.face([out(reach - 0.04, 0), out(reach + 0.04, 0), out(reach + 0.04, SAIL_WIDE_M), out(reach - 0.04, SAIL_WIDE_M)], "trim", 0.97);
  }
}

/**
 * Åland's post mill, 13 m to the top sail: a red boarded body and a steep roof with
 * white boards at its edges, turning on one great post held by cross-trees and four
 * quarter bars on stone pads, four white lattice sails at the front (+z), and the
 * tail pole and steps at the back that a miller turns it by.
 */
export function buildWindmill(): RoadsideModel {
  const { trees, postTop, bodyLow, eaves, ridge, x, z, shaftY, shaftZ } = MILL;
  const near = new RuralMesh();

  // Stone pads, cross-trees, quarter bars, post.
  const crossM = 3.1;
  for (const [ax, az] of [[crossM, 0], [-crossM, 0], [0, crossM], [0, -crossM]] as const) {
    near.box([ax - 0.42, -0.5, az - 0.42], [ax + 0.42, trees - 0.14, az + 0.42], "field-stone", { open: true, shadeTop: 1.05 });
    near.tube([ax * 0.92, trees, az * 0.92], [ax * 0.1, postTop - 1.3, az * 0.1], 0.13, 4, {}, "mill-timber");
  }
  near.beam([-crossM - 0.3, trees, 0], [crossM + 0.3, trees, 0], 0.3, 0.3, "mill-timber-dark", 0.9, 1);
  near.beam([0, trees + 0.3, -crossM - 0.3], [0, trees + 0.3, crossM + 0.3], 0.3, 0.3, "mill-timber-dark", 0.9, 1);
  near.tube([0, trees, 0], [0, postTop, 0], 0.34, 8, { radiusTo: 0.29, shadeFrom: 0.8, shadeTo: 1 }, "mill-timber");

  // The body, wider at the top than the floor, as a post mill's is, with a skirt of crowntree under it.
  const low: V3[] = [[-x + 0.2, bodyLow, z - 0.18], [x - 0.2, bodyLow, z - 0.18], [x - 0.2, bodyLow, -z + 0.18], [-x + 0.2, bodyLow, -z + 0.18]];
  const high: V3[] = [[-x, eaves, z], [x, eaves, z], [x, eaves, -z], [-x, eaves, -z]];
  near
    .face([low[0], low[1], high[1], [0, ridge - 0.05, z], high[0]], "red-boards")
    .face([low[2], low[3], high[3], [0, ridge - 0.05, -z], high[2]], "red-boards", 0.92)
    .face([low[1], low[2], high[2], high[1]], "red-boards", 0.96)
    .face([low[3], low[0], high[0], high[3]], "red-boards", 0.96)
    .face(low, "roof-under");

  // White corner boards, and a white band where the walls meet the roof.
  for (let corner = 0; corner < 4; corner++) {
    const [a, b] = [low[corner], high[corner]];
    const inward = (at: V3, share: number): V3 => [at[0] * (1 - share), at[1], at[2]];
    const push = (at: V3): V3 => [at[0], at[1], at[2] + Math.sign(at[2]) * 0.015];
    near.face([push(a), push(b), push(inward(b, 0.1)), push(inward(a, 0.1))], "trim");
    const pushX = (at: V3): V3 => [at[0] + Math.sign(at[0]) * 0.015, at[1], at[2]];
    const back = (at: V3, share: number): V3 => [at[0], at[1], at[2] * (1 - share)];
    near.face([pushX(a), pushX(b), pushX(back(b, 0.08)), pushX(back(a, 0.08))], "trim");
  }

  // A roof of two pitches a side: a mill's is steep at the eaves and easing to the ridge.
  const over = 0.3;
  const shoulder = { x: x * 0.58, y: eaves + (ridge - eaves) * 0.72 };
  const [zOut, xOut] = [z + over, x + 0.26];
  const eavesOut = eaves - 0.2;
  for (const side of [-1, 1]) {
    near.face([[side * xOut, eavesOut, -zOut], [side * xOut, eavesOut, zOut], [side * shoulder.x, shoulder.y, zOut], [side * shoulder.x, shoulder.y, -zOut]], "roof-dark", 1);
    near.face([[side * shoulder.x, shoulder.y, -zOut], [side * shoulder.x, shoulder.y, zOut], [0, ridge, zOut], [0, ridge, -zOut]], "roof-dark", 1.08);
    near.face([[side * x, eaves - 0.04, -zOut], [side * x, eaves - 0.04, zOut], [side * xOut, eavesOut - 0.08, zOut], [side * xOut, eavesOut - 0.08, -zOut]], "roof-under");
    near.face([[side * xOut, eavesOut, -zOut], [side * xOut, eavesOut, zOut], [side * xOut, eavesOut - 0.18, zOut], [side * xOut, eavesOut - 0.18, -zOut]], "trim", 0.96);
    for (const end of [-zOut, zOut]) {
      near.face([[side * xOut, eavesOut + 0.02, end], [side * shoulder.x, shoulder.y + 0.02, end], [side * shoulder.x, shoulder.y - 0.22, end], [side * xOut, eavesOut - 0.2, end]], "trim");
      near.face([[side * shoulder.x, shoulder.y + 0.02, end], [0, ridge + 0.02, end], [0, ridge - 0.22, end], [side * shoulder.x, shoulder.y - 0.22, end]], "trim");
    }
  }
  near.face([[-x, eaves, z + over], [x, eaves, z + over], [shoulder.x, shoulder.y, z + over], [0, ridge, z + over], [-shoulder.x, shoulder.y, z + over]], "red-boards", 0.98);
  near.face([[x, eaves, -z - over], [-x, eaves, -z - over], [-shoulder.x, shoulder.y, -z - over], [0, ridge, -z - over], [shoulder.x, shoulder.y, -z - over]], "red-boards", 0.9);

  // The shaft, and the sails.
  const hub: V3 = [0, shaftY, shaftZ];
  near.tube([0, shaftY - 0.05, z - 0.2], [0, shaftY, shaftZ + 0.22], 0.3, 8, { radiusTo: 0.26, cap: true, shadeFrom: 0.8, shadeTo: 1 }, "mill-timber-dark");
  for (let arm = 0; arm < 4; arm++) sailArm(near, Math.PI / 4 + (arm * Math.PI) / 2, hub, SAIL_BARS);

  // Windows, the door at the back, its landing, the steps and the tail pole.
  windowOnSide(near, x - 0.1, 6.2, 0.4, 0.46);
  windowOnSide(near, -x + 0.1, 6.2, -0.4, 0.46);
  doorway(near, 0, 5.05, 0.95, 1.8, -z + 0.09, "door", 1);
  const landingZ = -z - 0.8;
  near.box([-0.75, 4.92, landingZ], [0.75, 5.02, -z + 0.14], "deck-pale", { shade: 0.85, shadeTop: 1 });
  const stepsFoot: V3[] = [[-0.55, 0.05, -9.2], [0.55, 0.05, -9.2]];
  const stepsTop: V3[] = [[-0.55, 4.96, landingZ], [0.55, 4.96, landingZ]];
  for (const end of [0, 1]) near.beam(stepsFoot[end], stepsTop[end], 0.08, 0.2, "mill-timber", 0.9, 1);
  const treads = 12;
  for (let tread = 1; tread < treads; tread++) {
    const share = tread / treads;
    const [y, stepZ] = [stepsFoot[0][1] + share * (stepsTop[0][1] - stepsFoot[0][1]), stepsFoot[0][2] + share * (stepsTop[0][2] - stepsFoot[0][2])];
    near.face([[-0.55, y, stepZ - 0.14], [0.55, y, stepZ - 0.14], [0.55, y, stepZ + 0.14], [-0.55, y, stepZ + 0.14]], "deck-pale");
  }
  near.tube([0, 4.1, -0.5], [0, 0.9, -9.9], 0.16, 4, { radiusTo: 0.1 }, "mill-timber-dark");
  near.beam([-1.3, 0.72, -9.75], [1.3, 0.72, -9.75], 0.1, 0.1, "mill-timber-dark");
  near.tube([1.25, -0.5, -9.75], [1.25, 0.76, -9.75], 0.07, 3, {}, "mill-timber");

  const far = new RuralMesh();
  far.tube([0, -0.5, 0], [0, postTop, 0], 0.9, 4, { radiusTo: 0.35 }, "mill-timber");
  far
    .face([low[0], low[1], high[1], [0, ridge, z], high[0]], "red-boards")
    .face([low[2], low[3], high[3], [0, ridge, -z], high[2]], "red-boards", 0.92)
    .face([low[1], low[2], high[2], high[1]], "red-boards", 0.96)
    .face([low[3], low[0], high[0], high[3]], "red-boards", 0.96);
  for (const side of [-1, 1]) far.face([[side * xOut, eavesOut, -zOut], [side * xOut, eavesOut, zOut], [0, ridge, zOut], [0, ridge, -zOut]], "roof-dark");
  for (let arm = 0; arm < 4; arm++) {
    const angle = Math.PI / 4 + (arm * Math.PI) / 2;
    const out = (reach: number, side: number): V3 => {
      const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
      return [hub[0] + cos * reach - sin * side, hub[1] + sin * reach + cos * side, hub[2]];
    };
    far.face([out(0.6, -0.1), out(MILL.armM, -0.1), out(MILL.armM, 0.1), out(0.6, 0.1)], "trim", 0.95);
    far.face([out(1.1, SAIL_WIDE_M * 0.45), out(MILL.armM, SAIL_WIDE_M * 0.45), out(MILL.armM, SAIL_WIDE_M * 0.75), out(1.1, SAIL_WIDE_M * 0.75)], "trim", 0.9);
  }
  far.face([[-0.5, 0.1, -9.2], [0.5, 0.1, -9.2], [0.5, 4.96, landingZ], [-0.5, 4.96, landingZ]], "mill-timber");
  return finished(near, far, 320, 3400);
}
