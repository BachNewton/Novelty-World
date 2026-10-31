import { add, inFrame, lerp, pitched, reach, unit, UPRIGHT, yawed, type Body, type Frame, type V3 } from "./skeleton";

/*
 * A pose is where a body's parts are, worked out for that body: joints reached for
 * by height, so a tall person and a short one both put their feet on the ground and
 * their hand on the same cup. What moves afterwards is named here too, as a `Rock`
 * of parts about a pivot, and the shader does the moving, so a pose costs the CPU
 * nothing once it's baked.
 *
 * Measurements that aren't a body's own are the street kit's: a bench's seat, a café
 * chair and table. A pose's origin is the place the caller puts down: the seat's
 * footprint, or the edge of a jetty with +z over the water.
 */

export const POSES = ["stand", "walk", "chat", "sit-bench", "sit-cafe", "fish", "sit-edge", "sunbathe", "field", "tend-boat", "wave"] as const;
export type PoseName = (typeof POSES)[number];

/** All a child is ever given: a background figure, beside an adult. */
export const CHILD_POSES: readonly PoseName[] = ["stand", "walk", "wave"];

export const BENCH_SEAT_M = 0.47;
export const CAFE_SEAT_M = 0.46;
/** From a café chair's place to the table's middle, as `buildCafeSet` has them. */
export const CAFE_TABLE_Z_M = 0.62;
export const CAFE_TABLE_TOP_M = 0.74;

/** A slow turn of some parts about a pivot, in the figure's own axes. */
export interface Rock {
  axis: "x" | "y" | "z";
  pivot: V3;
  degrees: number;
  /** Radians a second. */
  rate: number;
  /** Never stops; otherwise it comes and goes. */
  steady: boolean;
}

export interface Limb {
  root: V3;
  joint: V3;
  end: V3;
  /** Which way a foot's toe or a hand's fingers point. */
  point: V3;
}

/** The named pieces a rock can take hold of. */
export type Piece = "chest" | "head" | "armLeft" | "armRight" | "forearmLeft" | "forearmRight" | "shinLeft" | "shinRight" | "prop";

export interface Prop {
  kind: "rod" | "cup" | "hoe" | "sponge";
  from: V3;
  to: V3;
  /** The rod's line, down to the water. */
  lineTo?: V3;
  /** Which forearm it's held in; left out, it moves with `prop`'s own rock. */
  heldBy?: "forearmLeft" | "forearmRight";
}

export interface Posed {
  pelvis: Frame;
  chest: Frame;
  head: Frame;
  armLeft: Limb;
  armRight: Limb;
  legLeft: Limb;
  legRight: Limb;
  walks: boolean;
  rocks: Partial<Record<Piece, Rock>>;
  prop?: Prop;
  /** Where the shadow goes, on the ground under the place. */
  shadow: { x: number; z: number; radiusM: number; lengthM: number };
}

const degrees = (value: number) => (value * Math.PI) / 180;

interface Trunk {
  pelvis: Frame;
  chest: Frame;
  head: Frame;
  shoulderLeft: V3;
  shoulderRight: V3;
  hipLeft: V3;
  hipRight: V3;
}

interface TrunkOptions {
  hip: V3;
  pelvisPitch?: number;
  spine?: number;
  twist?: number;
  headPitch?: number;
  headYaw?: number;
}

function trunk(body: Body, { hip, pelvisPitch = 0, spine = 0, twist = 0, headPitch = 0, headYaw = 0 }: TrunkOptions): Trunk {
  const pelvis = pitched({ at: hip, ...UPRIGHT }, pelvisPitch);
  const lean = spine + body.stoop;
  const chest = yawed(pitched({ ...pelvis, at: inFrame(pelvis, 0, body.waistUp, 0) }, lean), twist);
  const neck = inFrame(chest, 0, body.neckUp - body.waistUp + body.neckM * 0.8, 0.01 * body.scale + body.stoop * 0.1);
  const head = yawed(pitched({ ...chest, at: neck }, headPitch - lean * 0.75), headYaw);
  const shoulderUp = body.shoulderUp - body.waistUp;
  return {
    pelvis,
    chest,
    head,
    shoulderLeft: inFrame(chest, body.armX, shoulderUp * 0.88, 0),
    shoulderRight: inFrame(chest, -body.armX, shoulderUp * 0.88, 0),
    hipLeft: inFrame(pelvis, body.legX, 0, 0),
    hipRight: inFrame(pelvis, -body.legX, 0, 0),
  };
}

const ELBOW_BACK: V3 = [0, -0.2, -1];
const KNEE_FORWARD: V3 = [0, 0.1, 1];

function arm(body: Body, root: V3, target: V3, bend: V3 = ELBOW_BACK): Limb {
  const { joint, end } = reach(root, target, body.upperArmM, body.forearmM, bend);
  return { root, joint, end, point: unit([end[0] - joint[0], end[1] - joint[1], end[2] - joint[2]]) };
}

function leg(body: Body, root: V3, ankle: V3, toe: V3 = [0, 0, 1], bend: V3 = KNEE_FORWARD): Limb {
  const { joint, end } = reach(root, ankle, body.thighM, body.shinM, bend);
  return { root, joint, end, point: unit(toe) };
}

const OUT_LEFT: V3 = [0.1, 0, 1];
const OUT_RIGHT: V3 = [-0.1, 0, 1];

/** Arms at rest, a little bent and a little out, as they hang on anyone. */
function armsDown(body: Body, { shoulderLeft, shoulderRight }: Trunk) {
  const down = (body.upperArmM + body.forearmM) * 0.97;
  return { armLeft: arm(body, shoulderLeft, add(shoulderLeft, [0.035, -down, 0.05])), armRight: arm(body, shoulderRight, add(shoulderRight, [-0.035, -down, 0.05])) };
}

function legsDown(body: Body, { hipLeft, hipRight }: Trunk) {
  const ankle = (hip: V3, out: number): V3 => [hip[0] + out, body.ankleY, hip[2]];
  return { legLeft: leg(body, hipLeft, ankle(hipLeft, 0.012), OUT_LEFT), legRight: leg(body, hipRight, ankle(hipRight, -0.012), OUT_RIGHT) };
}

/** A look round, now and then, that everyone has. */
const LOOK_ROUND = (pivot: V3, degrees = 22): Rock => ({ axis: "y", pivot, degrees, rate: 1.1, steady: false });

const STILL_SHADOW = { x: 0, z: 0, radiusM: 0.42, lengthM: 0.42 };

function stand(body: Body): Posed {
  const parts = trunk(body, { hip: [0.012 * body.scale, body.hipY - 0.006, 0], headPitch: 0.03 });
  return {
    ...parts,
    ...armsDown(body, parts),
    ...legsDown(body, parts),
    walks: false,
    rocks: { head: LOOK_ROUND(parts.head.at) },
    shadow: STILL_SHADOW,
  };
}

function walk(body: Body): Posed {
  const parts = trunk(body, { hip: [0, body.hipY - 0.004, 0], spine: 0.04, headPitch: 0.03 });
  const down = (body.upperArmM + body.forearmM) * 0.985;
  const hang = (shoulder: V3, out: number) => add(shoulder, [out, -down, 0.02]);
  const ankle = (hip: V3): V3 => [hip[0] * 0.9, body.ankleY, hip[2]];
  return {
    ...parts,
    armLeft: arm(body, parts.shoulderLeft, hang(parts.shoulderLeft, 0.02)),
    armRight: arm(body, parts.shoulderRight, hang(parts.shoulderRight, -0.02)),
    legLeft: leg(body, parts.hipLeft, ankle(parts.hipLeft)),
    legRight: leg(body, parts.hipRight, ankle(parts.hipRight)),
    walks: true,
    rocks: { head: LOOK_ROUND(parts.head.at, 14) },
    shadow: STILL_SHADOW,
  };
}

function chat(body: Body): Posed {
  const parts = trunk(body, { hip: [0.018 * body.scale, body.hipY - 0.008, 0], twist: 0.08, headPitch: 0.05, headYaw: 0.1 });
  const { armLeft } = armsDown(body, parts);
  const armRight = arm(body, parts.shoulderRight, add(parts.shoulderRight, [0.06, -0.27 * body.scale, 0.27 * body.scale]), [-0.5, -0.6, -0.4]);
  const talk: Rock = { axis: "x", pivot: armRight.joint, degrees: 24, rate: 3.4, steady: false };
  return {
    ...parts,
    armLeft,
    armRight,
    ...legsDown(body, parts),
    walks: false,
    rocks: { head: { axis: "x", pivot: parts.head.at, degrees: 5, rate: 1.9, steady: false }, forearmRight: talk },
    shadow: STILL_SHADOW,
  };
}

const SIT_BACK_M = 0.1;
const SIT_LIFT_M = 0.095;

function sittingLegs(body: Body, parts: Trunk, footZ: number, footX = 0.13) {
  return {
    legLeft: leg(body, parts.hipLeft, [footX * body.scale, body.ankleY, footZ], OUT_LEFT),
    legRight: leg(body, parts.hipRight, [-footX * body.scale, body.ankleY, footZ - 0.05], OUT_RIGHT),
  };
}

function sitBench(body: Body): Posed {
  const parts = trunk(body, { hip: [0, BENCH_SEAT_M + SIT_LIFT_M * body.scale, -SIT_BACK_M], pelvisPitch: -0.14, spine: 0.08, headPitch: 0.1 });
  const legs = sittingLegs(body, parts, 0.34);
  const lap = (hip: V3, knee: V3) => add(lerp(hip, knee, 0.72), [0, 0.1 * body.scale, 0]);
  return {
    ...parts,
    ...legs,
    armLeft: arm(body, parts.shoulderLeft, lap(parts.hipLeft, legs.legLeft.joint), [0.5, -0.3, -1]),
    armRight: arm(body, parts.shoulderRight, lap(parts.hipRight, legs.legRight.joint), [-0.5, -0.3, -1]),
    walks: false,
    rocks: { head: LOOK_ROUND(parts.head.at, 26) },
    shadow: { x: 0, z: 0.1, radiusM: 0.5, lengthM: 0.5 },
  };
}

function sitCafe(body: Body): Posed {
  const table = CAFE_TABLE_TOP_M;
  const parts = trunk(body, { hip: [0, CAFE_SEAT_M + SIT_LIFT_M * body.scale, -0.03], pelvisPitch: -0.04, spine: 0.14, headPitch: 0.06 });
  const legs = sittingLegs(body, parts, 0.36, 0.11);
  const cupAt: V3 = [-0.1, table + 0.1, 0.3];
  const armRight = arm(body, parts.shoulderRight, add(cupAt, [-0.01, -0.01, -body.handM * 0.75]), [-0.8, -0.8, -0.3]);
  const armLeft = arm(body, parts.shoulderLeft, [0.15, table + 0.05, 0.31], [0.8, -0.8, -0.3]);
  const sip: Rock = { axis: "x", pivot: armRight.joint, degrees: 13, rate: 1.7, steady: false };
  return {
    ...parts,
    ...legs,
    armLeft,
    armRight,
    walks: false,
    rocks: { head: LOOK_ROUND(parts.head.at, 18), forearmRight: sip },
    prop: { kind: "cup", from: add(cupAt, [0, -0.04, 0]), to: add(cupAt, [0, 0.045, 0]), heldBy: "forearmRight" },
    shadow: { x: 0, z: 0.12, radiusM: 0.45, lengthM: 0.5 },
  };
}

const ROD_M = 2.5;

function fish(body: Body): Posed {
  const parts = trunk(body, { hip: [0, body.hipY - 0.02, -0.12], spine: 0.1, headPitch: 0.25, twist: -0.12 });
  const legs = {
    legLeft: leg(body, parts.hipLeft, [parts.hipLeft[0] + 0.03, body.ankleY, 0.02], OUT_LEFT),
    legRight: leg(body, parts.hipRight, [parts.hipRight[0] - 0.05, body.ankleY, -0.22], OUT_RIGHT),
  };
  const butt: V3 = [0.02, body.hipY + 0.0, -0.02];
  const way = unit([-0.08, 0.52, 1]);
  const tip = add(butt, way, ROD_M);
  const armLeft = arm(body, parts.shoulderLeft, add(butt, way, 0.04), [0.8, -0.3, -0.4]);
  const armRight = arm(body, parts.shoulderRight, add(butt, way, 0.36), [-0.8, -0.3, -0.4]);
  return {
    ...parts,
    ...legs,
    armLeft,
    armRight,
    walks: false,
    rocks: { head: LOOK_ROUND(parts.head.at, 10), prop: { axis: "x", pivot: butt, degrees: 3, rate: 1.3, steady: false } },
    prop: { kind: "rod", from: butt, to: tip, lineTo: [tip[0], -1.6, tip[2] + 0.06] },
    shadow: { x: 0, z: -0.1, radiusM: 0.42, lengthM: 0.42 },
  };
}

function sitEdge(body: Body): Posed {
  const parts = trunk(body, { hip: [0, SIT_LIFT_M * body.scale, -0.16], pelvisPitch: -0.2, spine: 0.08, headPitch: 0.1 });
  const hang = (body.thighM + body.shinM) * 0.5;
  const legLeft = leg(body, parts.hipLeft, [body.legX * 1.1, -body.shinM * 0.86, parts.pelvis.at[2] + hang * 0.82], [0.1, -0.3, 1]);
  const legRight = leg(body, parts.hipRight, [-body.legX * 1.1, -body.shinM * 0.95, parts.pelvis.at[2] + hang * 0.72], [-0.1, -0.4, 1]);
  const swing = (limb: Limb, rate: number): Rock => ({ axis: "x", pivot: limb.joint, degrees: 13, rate, steady: false });
  return {
    ...parts,
    armLeft: arm(body, parts.shoulderLeft, add(parts.hipLeft, [0.17, -0.02, -0.24 * body.scale]), [1, -0.2, 0.6]),
    armRight: arm(body, parts.shoulderRight, add(parts.hipRight, [-0.17, -0.02, -0.24 * body.scale]), [-1, -0.2, 0.6]),
    legLeft,
    legRight,
    walks: false,
    rocks: { head: LOOK_ROUND(parts.head.at), shinLeft: swing(legLeft, 2.1), shinRight: swing(legRight, 1.7) },
    shadow: { x: 0, z: -0.2, radiusM: 0.42, lengthM: 0.42 },
  };
}

function sunbathe(body: Body): Posed {
  const parts = trunk(body, { hip: [0, 0.11 * body.scale, 0], pelvisPitch: -degrees(66), spine: 0.08, headPitch: degrees(44) });
  const back = (shoulder: V3, out: number): V3 => [shoulder[0] + out, 0.03, shoulder[2] - 0.12 * body.scale];
  return {
    ...parts,
    armLeft: arm(body, parts.shoulderLeft, back(parts.shoulderLeft, 0.05), [1, 0.1, 0.5]),
    armRight: arm(body, parts.shoulderRight, back(parts.shoulderRight, -0.05), [-1, 0.1, 0.5]),
    legLeft: leg(body, parts.hipLeft, [parts.hipLeft[0] + 0.03, body.calfR + 0.01, parts.hipLeft[2] + (body.thighM + body.shinM) * 0.98], [0.2, 1, 0.25], [0, 1, 0]),
    legRight: leg(body, parts.hipRight, [parts.hipRight[0] - 0.02, body.ankleY * 0.8, parts.hipRight[2] + (body.thighM + body.shinM) * 0.74], [0, 0, 1], [-0.1, 1, 0]),
    walks: false,
    rocks: { head: LOOK_ROUND(parts.head.at, 14) },
    shadow: { x: 0, z: 0.2, radiusM: 0.55, lengthM: 1 },
  };
}

function field(body: Body): Posed {
  const parts = trunk(body, { hip: [0, body.hipY - 0.05, -0.02], pelvisPitch: 0.3, spine: 0.42, headPitch: -0.2 });
  const legs = {
    legLeft: leg(body, parts.hipLeft, [parts.hipLeft[0] + 0.05, body.ankleY, 0.3 * body.scale], OUT_LEFT),
    legRight: leg(body, parts.hipRight, [parts.hipRight[0] - 0.06, body.ankleY, -0.28 * body.scale], OUT_RIGHT),
  };
  const blade: V3 = [-0.02, 0.02, 1.02 * body.scale];
  const top: V3 = [0.03, body.hipY + 0.34 * body.scale, 0.08];
  const pivot = parts.chest.at;
  const dig: Rock = { axis: "x", pivot, degrees: 7, rate: 2.2, steady: true };
  return {
    ...parts,
    ...legs,
    armLeft: arm(body, parts.shoulderLeft, lerp(blade, top, 0.92), [0.9, -0.3, -0.3]),
    armRight: arm(body, parts.shoulderRight, lerp(blade, top, 0.62), [-0.9, -0.3, -0.3]),
    walks: false,
    rocks: { chest: dig, head: dig, armLeft: dig, armRight: dig, forearmLeft: dig, forearmRight: dig, prop: dig },
    prop: { kind: "hoe", from: blade, to: top },
    shadow: { x: 0, z: 0.15, radiusM: 0.5, lengthM: 0.6 },
  };
}

function tendBoat(body: Body): Posed {
  const parts = trunk(body, { hip: [0, body.thighM + 0.1 * body.scale, -0.12], pelvisPitch: 0.12, spine: 0.34, headPitch: -0.05 });
  const legLeft = leg(body, parts.hipLeft, [parts.hipLeft[0] + 0.04, body.ankleY, 0.3 * body.scale], OUT_LEFT);
  const legRight = leg(body, parts.hipRight, [parts.hipRight[0] - 0.02, 0.09 * body.scale, -0.52 * body.scale], [-0.05, -1, -0.5], [0, -0.6, 1]);
  const spot: V3 = [-0.08, body.thighM + 0.2 * body.scale, 0.66 * body.scale];
  const armRight = arm(body, parts.shoulderRight, add(spot, [0, 0, -body.handM * 0.5]), [-0.8, -0.6, -0.2]);
  const scrub: Rock = { axis: "y", pivot: parts.shoulderRight, degrees: 12, rate: 5, steady: true };
  return {
    ...parts,
    legLeft,
    legRight,
    armLeft: arm(body, parts.shoulderLeft, add(legLeft.joint, [0, 0.07, -0.03]), [0.8, -0.2, -0.3]),
    armRight,
    walks: false,
    rocks: { head: LOOK_ROUND(parts.head.at, 10), armRight: scrub, forearmRight: scrub },
    prop: { kind: "sponge", from: add(spot, [0, 0, -0.04]), to: add(spot, [0, 0, 0.04]), heldBy: "forearmRight" },
    shadow: { x: 0, z: 0.05, radiusM: 0.48, lengthM: 0.6 },
  };
}

function wave(body: Body): Posed {
  const parts = trunk(body, { hip: [0.016 * body.scale, body.hipY - 0.006, 0], spine: -0.02, twist: -0.06, headPitch: 0.06 });
  const { armLeft } = armsDown(body, parts);
  const up = body.scale;
  const armRight = arm(body, parts.shoulderRight, add(parts.shoulderRight, [-0.3 * up, 0.42 * up, 0.08]), [-1, -0.6, 0]);
  const hello: Rock = { axis: "z", pivot: armRight.joint, degrees: 20, rate: 7, steady: true };
  return {
    ...parts,
    armLeft,
    armRight,
    ...legsDown(body, parts),
    walks: false,
    rocks: { head: { axis: "y", pivot: parts.head.at, degrees: 6, rate: 1.3, steady: false }, forearmRight: hello },
    shadow: STILL_SHADOW,
  };
}

const POSE_MAKERS: Record<PoseName, (body: Body) => Posed> = {
  stand,
  walk,
  chat,
  "sit-bench": sitBench,
  "sit-cafe": sitCafe,
  fish,
  "sit-edge": sitEdge,
  sunbathe,
  field,
  "tend-boat": tendBoat,
  wave,
};

export const posed = (name: PoseName, body: Body): Posed => POSE_MAKERS[name](body);

