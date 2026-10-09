import * as THREE from "three";
import { createRng } from "@/shared/lib/seeded-random";
import type { PaletteKey } from "../palette";
import { cylinder, flat, group } from "../shapes";

/** The height of the base's top, where a figure's feet stand. */
export const BASE_TOP = 0.08;

/** The round base every explorer miniature stands on, the same as the scale pawn's. */
export function figureBase(rim: PaletteKey = "boneDark"): THREE.Mesh {
  return cylinder(0.36, BASE_TOP, flat(rim), [0, 0, 0], { top: 0.34, sides: 12 });
}

/**
 * How tall a figure stands off its base, from the character's real height:
 * every explorer is scaled alike, so they keep their true heights against
 * one another, and Longfellow's 5'11" stands 1.5 m off his base, a little
 * under the 1.6 m the rooms are judged against.
 */
export function miniatureHeight(feet: number, inches: number): number {
  return ((feet * 12 + inches) / 71) * 1.5;
}

/**
 * Where two of a figure's parts are meant to pass into each other: at a
 * joint, round its pivot, so no crack opens as it turns. The clipping check
 * allows their surfaces to cross within `radius` of the pivot `at`, and
 * nowhere else. A part is a mesh, or a group standing for every mesh in it.
 */
export interface Joint {
  parts: readonly [THREE.Object3D, THREE.Object3D];
  at: THREE.Object3D;
  radius: number;
}

/** Declares a figure's joints, as `walks` declares its walk. */
export function joins<T extends THREE.Object3D>(figure: T, joints: readonly Joint[]): T {
  figure.userData.joints = [...jointsOf(figure), ...joints];
  return figure;
}

export function jointsOf(figure: THREE.Object3D): Joint[] {
  return (figure.userData as { joints?: Joint[] }).joints ?? [];
}

/** Declares a figure that floats free of the floor (a spirit): it has no
 *  base, only a mark on the floor beneath it, and nothing that stands on a
 *  base (an explorer's colour ring) is put round it. Every other figure is
 *  grounded, on its base. */
export function floats<T extends THREE.Object3D>(figure: T): T {
  figure.userData.grounded = false;
  return figure;
}

export function isGrounded(figure: THREE.Object3D): boolean {
  return (figure.userData as { grounded?: boolean }).grounded !== false;
}

/** How a figure walks: metres per step (a stride cycle is two steps) and how
 *  much it bounces at each one: walking, how far it sinks into its knees as
 *  both feet are down; running, a third of how high it bounds off its base
 *  between steps. A longer step at the
 *  house's one walking pace is a slower cadence, a shorter one a quicker. A
 *  figure's run is its walk scaled by the shared run factors below, so the
 *  cadence and bounce that give a walk its character carry into the run. */
export interface Walking {
  step: number;
  hop: number;
}

/** Longfellow's walk, and any figure's that declares none: at the house's
 *  walking pace, about two and a half steps a second. */
export const ADULT_WALK: Walking = { step: 0.6, hop: 0.02 };

/** How a figure crosses the house: every figure walks at one pace and runs at
 *  another. Once the haunt starts heroes run and the traitor walks calmly;
 *  in a hidden-traitor haunt everyone runs, since a gait must never give the
 *  traitor away. Monsters keep their own movement. */
export type Pace = "walk" | "run";

/** How much longer a running step is than the figure's walking step: at the
 *  house's running pace, about three steps a second for an adult. */
export const RUN_STRIDE = 2;
/** How much higher a running figure bounds, between steps, than it hops walking. */
const RUN_HOP = 3;
/** The share of a stride each foot spends planted: walking, both feet are
 *  down for a moment at every step; running, neither is, between steps. */
const WALK_STANCE = 0.55;
const RUN_STANCE = 0.26;
/** A runner's foot is down while the floor slides this many leg lengths
 *  under it at most: a short-legged runner's stance is shorter, or it would
 *  have to sink deep to reach a foot landing far ahead. */
const RUN_STANCE_LEGS = 0.9;

/** The share of a stride each of a figure's feet spends planted. */
function stanceOf(rig: StrideRig, running: boolean): number {
  if (!running) return WALK_STANCE;
  const leg = rig.legs[0].thigh + rig.legs[0].shin;
  return Math.min(RUN_STANCE, (RUN_STANCE_LEGS * leg) / (2 * stepLength(rig.walking.step, true)));
}
/** How far the foot rolls, in radians: back onto the heel as it lands (toe
 *  up), and forward onto the toe as it pushes off (heel up). A runner lands
 *  nearer flat-footed and pushes off harder. */
const WALK_ROLL = { strike: -0.45, push: 0.6 };
const RUN_ROLL = { strike: -0.12, push: 0.8 };
/** How high a swinging foot lifts, for each metre of leg: walking, just
 *  clear of the floor; running, the heel kicks up behind. */
const WALK_LIFT = 0.12;
const RUN_LIFT = 0.4;
/** How much lower a runner carries the hips, for each metre of leg: knees bent. */
const RUN_CROUCH = 0.06;
/** How much further the arms pump running than they swing walking. */
const RUN_ARM = 1.8;
/** How far a runner leans into the run: the whole body from the feet, and the chest from the waist. */
const RUN_BODY_LEAN = 0.1;
const RUN_LEAN = 0.16;
/** The elbow bent near square, the forearm forward, for pumping arms. */
const RUN_ELBOW = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -1.5);
/** How far the elbow bends as an arm swings forward, walking. */
const WALK_ELBOW = 0.35;

/** Metres per step at a pace, from a figure's walking step. */
export function stepLength(step: number, running = false): number {
  return running ? step * RUN_STRIDE : step;
}

/** Declares how a figure walks, as `animated` declares how it moves. */
export function walks<T extends THREE.Object3D>(figure: T, walking: Walking): T {
  figure.userData.walking = walking;
  return figure;
}

export function walkingOf(figure: THREE.Object3D): Walking {
  return (figure.userData as { walking?: Walking }).walking ?? ADULT_WALK;
}

/** How high a running figure bounds off its base between steps, when
 *  neither foot is down: nothing while a foot is planted, rising and falling
 *  smoothly through the flight. A walker always has a foot down, so it never
 *  leaves the base; its hop sinks it into its knees instead (see `stride`). */
function hopHeight({ hop }: Walking, { phase, amount, running = false }: Stride, stance: number): number {
  if (!running) return 0;
  // Half a stride, one step: a foot is down for its first and last `stance`, both off the floor between.
  const half = phase / Math.PI - Math.floor(phase / Math.PI);
  const flight = (half - stance) / (1 - 2 * stance);
  if (flight <= 0 || flight >= 1) return 0;
  return Math.sin(Math.PI * flight) ** 2 * hop * RUN_HOP * amount;
}

/** How a figure moves its legs at a moment: `phase` runs on with the distance
 *  covered (a full turn is two steps), `amount` eases from 0, standing, to 1,
 *  in full stride, and `running` says the stride is a run. */
export interface Stride {
  phase: number;
  amount: number;
  running?: boolean;
}

/** Where a figure is in its stride at a moment on the stage's clock. A figure
 *  that is never walked stands still. */
export type Gait = (seconds: number) => Stride;

export const STANDING: Gait = () => ({ phase: 0, amount: 0 });

/** A leg: the thigh hangs from the hip and the shin from the knee, each a
 *  rigid part at its pivot, and the shoe stands on the base, built in place
 *  on the figure, so the feet stay planted however the body sways. */
export interface Leg {
  hip: THREE.Group;
  knee: THREE.Group;
  /** Where the shin ends, in the shoe. */
  ankleMark: THREE.Group;
  shoe: THREE.Object3D;
  /** The hip, in the body's frame. */
  at: THREE.Vector3;
  thigh: number;
  shin: number;
  /** The ankle, in the figure's frame as the shoe is built, where the shin ends. */
  ankle: THREE.Vector3;
  /** The z of the sole's back and front edges, which the foot rolls over. */
  heel: number;
  toe: number;
  /** Points on the shoe's underside, as built: a rolled foot is lifted so none sinks into the base. */
  sole: readonly THREE.Vector3[];
}

/** A leg from its thigh and shin, each built hanging straight down from its
 *  pivot (`thigh` metres from the hip to the knee), and its shoe. */
export function leg(
  thighPart: THREE.Object3D,
  shinPart: THREE.Object3D,
  shoe: THREE.Object3D,
  at: THREE.Vector3,
  thigh: number,
  shin: number,
  foot: Pick<Leg, "ankle" | "heel" | "toe">,
): Leg {
  const sole: THREE.Vector3[] = [];
  shoe.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const position = (object.geometry as THREE.BufferGeometry).getAttribute("position");
    for (let i = 0; i < position.count; i += 7) {
      const point = new THREE.Vector3().fromBufferAttribute(position, i);
      if (point.y < BASE_TOP + 0.05) sole.push(point);
    }
  });
  const ankleMark = group();
  ankleMark.position.y = -shin;
  const knee = group(shinPart, ankleMark);
  knee.position.y = -thigh;
  const hip = group(thighPart, knee);
  hip.position.copy(at);
  return { hip, knee, ankleMark, shoe, at, thigh, shin, sole, ...foot };
}

/** Where a sole's back and front edges are, along z, from the shoe's solid:
 *  the foot rolls over them. */
export function soleEnds(distance: (x: number, y: number, z: number) => number, x: number): { heel: number; toe: number } {
  const inside: number[] = [];
  for (let z = -0.4; z <= 0.4; z += 0.002) if (distance(x, BASE_TOP + 0.004, z) < 0) inside.push(z);
  if (inside.length === 0) throw new Error("The shoe has no sole on the base");
  return { heel: inside[0], toe: inside[inside.length - 1] };
}

/** A leg's joints: the thigh in the hips at the hip, the shin in the thigh at the knee, and the shin's end in the shoe. */
export function legJoints(leg: Leg, hips: THREE.Object3D, hipRadius: number, kneeRadius: number, ankleRadius: number): Joint[] {
  const [thigh, shin] = [leg.hip.children[0], leg.knee.children[0]];
  return [
    { parts: [thigh, hips], at: leg.hip, radius: hipRadius },
    { parts: [thigh, shin], at: leg.knee, radius: kneeRadius },
    { parts: [shin, leg.shoe], at: leg.ankleMark, radius: ankleRadius },
  ];
}

/** What a two-legged figure moves when it walks or runs. */
export interface StrideRig {
  walking: Walking;
  /** The right leg, then the left. */
  legs: readonly [Leg, Leg];
  /** What carries the legs and the hips, standing on the base at `rest`: it
   *  sinks a little over a planted foot at full stretch, and leans running. */
  body: THREE.Object3D;
  rest: number;
  /** The arms that swing, each with its side (−1 is the right), how far it
   *  swings walking, and how far, 0 to 1, it bends to pump running (all the
   *  way unless it says). */
  arms: readonly { limb: Limb; side: -1 | 1; swing: number; pump?: number }[];
  /** What leans into the stride, and how far walking. */
  chest: THREE.Object3D;
  lean: number;
  /** How high, as a share of everyone's, a swinging foot lifts: less under a skirt. */
  lifts?: number;
}

const ACROSS = new THREE.Vector3(1, 0, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);
const turn = new THREE.Quaternion();
const bent = new THREE.Quaternion();

interface Foot {
  /** The foot's roll, about the figure's x. */
  roll: number;
  ankle: THREE.Vector3;
  /** 1 while the foot is planted, easing to 0 as it lifts. */
  planted: number;
  /** How far, 0 to 1, the foot hangs from the shin rather than lying on the floor: in the air, mid-swing. */
  hanging: number;
}

/** A foot planted on the base, `u` of the way through its stance (0 as it
 *  lands, 1 as it pushes off), `range` metres either side of the hip. */
function plantedFoot(leg: Leg, u: number, range: number, roll: { strike: number; push: number }): Foot {
  const landing = 1 - THREE.MathUtils.smoothstep(u, 0, 0.22);
  const pushing = THREE.MathUtils.smoothstep(u, 0.55, 1);
  const angle = roll.strike * landing + roll.push * pushing;
  const pivot = new THREE.Vector3(leg.ankle.x, BASE_TOP, landing > 0 ? leg.heel : leg.toe);
  const ankle = leg.ankle.clone().sub(pivot).applyAxisAngle(ACROSS, angle).add(pivot);
  ankle.z += range * (1 - 2 * u);
  // A rounded toe or heel rolled over its edge would dip below the sole's line: lift it clear.
  const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
  let lowest = BASE_TOP;
  for (const point of leg.sole) lowest = Math.min(lowest, pivot.y + (point.y - pivot.y) * cos - (point.z - pivot.z) * sin);
  ankle.y += BASE_TOP - lowest;
  return { roll: angle, ankle, planted: 1, hanging: 0 };
}

/** Where a foot is `cycle` of the way through its stride: planted, sliding
 *  back under the figure exactly as fast as the floor goes by, then lifted
 *  and swung forward to land again. */
function footAt(leg: Leg, cycle: number, step: number, running: boolean, stance: number, lifts: number): Foot {
  const roll = running ? RUN_ROLL : WALK_ROLL;
  const range = step * stance;
  const c = cycle - Math.floor(cycle);
  if (c < stance) return plantedFoot(leg, c / stance, range, roll);
  const u = (c - stance) / (1 - stance);
  const from = plantedFoot(leg, 1, range, roll);
  const to = plantedFoot(leg, 0, range, roll);
  // The foot leaves the floor going back as fast as the floor, swings
  // forward, and comes back to the floor's pace to land, so it never stops
  // dead at either end: a curve from where it lifts to where it lands that
  // starts and ends at the floor's speed. A runner's carries it on back
  // further, the heel kicking up behind, before the knee drives it forward.
  const slide = (-2 * range * (1 - stance)) / stance;
  const [u2, u3] = [u * u, u * u * u];
  const forward = THREE.MathUtils.smoothstep(u, 0, 1);
  const ankle = from.ankle.clone().lerp(to.ankle, forward);
  ankle.z = from.ankle.z * (2 * u3 - 3 * u2 + 1) + to.ankle.z * (-2 * u3 + 3 * u2) + slide * (u3 - 2 * u2 + u + (u3 - u2));
  // It rises and settles gently; a runner's heel rises early and high.
  const rising = running ? u * (1.6 - 0.6 * u) : u;
  ankle.y += Math.sin(Math.PI * rising) ** 2 * (running ? RUN_LIFT : WALK_LIFT) * lifts * (leg.thigh + leg.shin);
  return {
    roll: from.roll + (to.roll - from.roll) * forward,
    ankle,
    planted: 1 - THREE.MathUtils.smoothstep(u, 0, 0.05),
    hanging: THREE.MathUtils.smoothstep(u, 0, 0.2) * (1 - THREE.MathUtils.smoothstep(u, 0.7, 1)),
  };
}

/** How far a foot rolled `roll` about its ankle at `ankle` must rise for no point of its sole to sink below the base's top. */
function soleLift(leg: Leg, roll: number, ankle: THREE.Vector3): number {
  const [cos, sin] = [Math.cos(roll), Math.sin(roll)];
  let lowest = Infinity;
  for (const point of leg.sole) lowest = Math.min(lowest, ankle.y + (point.y - leg.ankle.y) * cos - (point.z - leg.ankle.z) * sin);
  return Math.max(0, BASE_TOP - lowest);
}

/** How far short of straight a leg eases to a stop as its foot swings out of reach, in metres, so the knee never snaps straight. */
const SOFT_REACH = 0.012;

/** The furthest a knee folds, in radians from straight. */
const DEEPEST_KNEE = 2.2;

/** How far a foot in the air points its toe down past square to the shin. */
const POINTED = 0.25;

/** Where each foot is at a phase of the stride, eased in by `amount`, in the figure's frame. */
function feetAt(rig: StrideRig, phase: number, amount: number, running: boolean, lean: number): Foot[] {
  const length = stepLength(rig.walking.step, running);
  const stance = stanceOf(rig, running);
  return rig.legs.map((leg, i) => {
    const moving = footAt(leg, phase / (Math.PI * 2) + stance / 2 + i * 0.5, length, running, stance, rig.lifts ?? 1);
    // A runner's feet land under the hips, which lean ahead of the feet.
    const ahead = Math.sin(lean) * (leg.at.y + rig.rest) * 0.8;
    const ankle = leg.ankle.clone().lerp(moving.ankle, amount);
    ankle.z += ahead;
    return { roll: moving.roll * amount, ankle, planted: moving.planted, hanging: moving.hanging * amount };
  });
}

/** How far the body, standing at its rest, must sink for every planted foot to be within its leg's reach. */
function sinkFor(rig: StrideRig, feet: readonly Foot[]): number {
  let drop = 0;
  for (const [i, leg] of rig.legs.entries()) {
    const hip = leg.at.clone().applyMatrix4(rig.body.matrix);
    const { ankle, planted } = feet[i];
    const reachable = (leg.thigh + leg.shin) * 0.995 - SOFT_REACH;
    const across = Math.hypot(hip.x - ankle.x, hip.z - ankle.z);
    const height = Math.sqrt(Math.max(0, reachable * reachable - across * across));
    drop = Math.max(drop, (hip.y - ankle.y - height) * planted);
  }
  return drop;
}

/** How many phases of a step the body's sink is worked out from. */
const DIP_SAMPLES = 24;
/** How many times its declared hop a walker sinks into its knees at each step. */
const WALK_DIP = 0.5;

/**
 * Walks or runs a figure, after its idle has posed it. Each foot is planted
 * on the base and slides back exactly as fast as the floor goes by, rolling
 * from heel to toe, then lifts and swings forward; the legs reach for the
 * feet through bending knees, and the body sinks a little over a foot at full
 * stretch. Walking, a foot is always down; running, both are off the floor
 * between steps, the heels kick up, the body leans forward and the arms pump
 * with the elbows bent. Returns the step, from −1 to 1, for the figure's own
 * touches (a roll, a bounce of pigtails). At `amount` 0 the feet stand as
 * built and the knees are soft.
 */
export function stride(rig: StrideRig, { phase, amount, running = false }: Stride): number {
  const step = Math.sin(phase) * amount;
  const run = running ? amount : 0;
  const lean = run * RUN_BODY_LEAN;

  rig.body.rotation.x = lean;
  rig.body.position.y = rig.rest;
  rig.body.updateMatrix();
  // The hips sink until every planted foot is within the leg's reach, knees
  // soft. Sinking only as each foot needs it would drop the body the moment a
  // foot lands far ahead, so the body rises and falls smoothly once a step,
  // lowest where the step needs it most (as a walker's feet are both down, or
  // as a runner lands), as deep as the step ever needs.
  const needs = Array.from({ length: DIP_SAMPLES }, (_, k) => {
    const at = (k / DIP_SAMPLES) * Math.PI;
    return { at, need: sinkFor(rig, feetAt(rig, at, amount, running, lean)) };
  });
  const [across, along] = needs.reduce(([y, x], { at, need }) => [y + need * Math.sin(2 * at), x + need * Math.cos(2 * at)], [0, 0]);
  const lowest = Math.atan2(across, along) / 2;
  const dip = (at: number) => Math.cos(at - lowest) ** 2;
  const least = Math.min(...needs.map(({ need }) => need));
  const deepest = Math.max(0, ...needs.map(({ at, need }) => (need - least) / Math.max(dip(at), 0.5)));
  let drop = least + deepest * dip(phase);
  drop += run * RUN_CROUCH * (rig.legs[0].thigh + rig.legs[0].shin);
  // A bouncier walker sinks further into its knees at each step, as both feet are down.
  drop += rig.walking.hop * WALK_DIP * (amount - run) * Math.sin(phase) ** 2;
  // A runner bounds between steps: the whole figure off its base, feet and all.
  const bound = hopHeight(rig.walking, { phase, amount, running }, stanceOf(rig, running));
  const feet = feetAt(rig, phase, amount, running, lean);
  for (const foot of feet) foot.ankle.y += bound;
  rig.body.position.y = rig.rest - drop + bound;
  rig.body.updateMatrix();
  const toBody = rig.body.matrix.clone().invert();

  const bodyTurn = new THREE.Quaternion().setFromRotationMatrix(rig.body.matrix);
  for (const [i, leg] of rig.legs.entries()) {
    const { roll, ankle, hanging } = feet[i];
    // A foot still in the air beyond the leg's reach is held in reach, a little off the floor, so the shin never leaves the shoe.
    const hip = leg.at.clone().applyMatrix4(rig.body.matrix);
    const reachable = (leg.thigh + leg.shin) * 0.995 - SOFT_REACH;
    const distance = ankle.distanceTo(hip);
    if (distance > reachable) ankle.sub(hip).setLength(reachable + SOFT_REACH * Math.tanh((distance - reachable) / SOFT_REACH)).add(hip);
    // A heel kicked up behind folds the knee only so far, so the calf never folds into the thigh.
    const folded = Math.sqrt(leg.thigh ** 2 + leg.shin ** 2 + 2 * leg.thigh * leg.shin * Math.cos(DEEPEST_KNEE)) + SOFT_REACH;
    if (distance < folded) ankle.sub(hip).setLength(folded - SOFT_REACH * Math.tanh((folded - distance) / SOFT_REACH)).add(hip);
    let posed = reach(leg.at, ankle.clone().applyMatrix4(toBody), leg.thigh, leg.shin, FORWARD);
    // In the air, the foot hangs from the shin, square to it and pointed a little, as a heel kicks up behind.
    const shin = new THREE.Vector3(0, -1, 0).applyQuaternion(bodyTurn.clone().multiply(posed.shoulder).multiply(posed.elbow));
    const turned = roll + (Math.atan2(-shin.z, -shin.y) + POINTED - roll) * hanging;
    // A foot pointed down just off the floor would dip its toe into the base: lift it clear.
    const lift = soleLift(leg, turned, ankle);
    if (lift > 0) {
      ankle.y += lift;
      posed = reach(leg.at, ankle.clone().applyMatrix4(toBody), leg.thigh, leg.shin, FORWARD);
    }
    leg.hip.quaternion.copy(posed.shoulder);
    leg.knee.quaternion.copy(posed.elbow);
    leg.shoe.quaternion.setFromAxisAngle(ACROSS, turned);
    leg.shoe.position.copy(ankle).sub(leg.ankle.clone().applyQuaternion(leg.shoe.quaternion));
  }

  for (const { limb, side, swing: reachOut, pump = 1 } of rig.arms) {
    const angle = side * step * reachOut * (1 + run * (RUN_ARM - 1));
    // Walking, the elbow bends a little as the arm swings forward.
    limb.elbow.quaternion.premultiply(bent.setFromAxisAngle(ACROSS, -Math.max(0, -angle) * WALK_ELBOW * (1 - run)));
    if (run > 0) limb.elbow.quaternion.slerp(RUN_ELBOW, run * pump);
    limb.shoulder.quaternion.premultiply(turn.setFromAxisAngle(ACROSS, angle));
  }
  rig.chest.rotation.x += rig.lean * amount + run * RUN_LEAN;
  return step;
}

/** An arm built from its two meshes: the upper arm hangs from the shoulder at
 *  `at` (in its parent's frame) and the forearm from the elbow, `upper` below. */
export function arm(upperArm: THREE.Object3D, forearm: THREE.Object3D, at: THREE.Vector3, upper: number): Limb {
  const elbow = group(forearm);
  elbow.position.y = -upper;
  const shoulder = group(upperArm, elbow);
  shoulder.position.copy(at);
  return { shoulder, elbow, at };
}

/** A limb's two rotations: the shoulder (or hip) and the elbow (or knee). */
export interface Reach {
  shoulder: THREE.Quaternion;
  elbow: THREE.Quaternion;
}

const DOWN = new THREE.Vector3(0, -1, 0);

/** A two-bone arm: the shoulder pivot, the elbow pivot inside it, and where
 *  the shoulder sits in its parent's frame. */
export interface Limb {
  shoulder: THREE.Group;
  elbow: THREE.Group;
  at: THREE.Vector3;
}

/** Blends a limb between two poses: 0 is `from`, 1 is `to`. */
export function pose(limb: Limb, from: Reach, to: Reach, amount: number) {
  limb.shoulder.quaternion.slerpQuaternions(from.shoulder, to.shoulder, amount);
  limb.elbow.quaternion.slerpQuaternions(from.elbow, to.elbow, amount);
}

/**
 * Two-bone reach: the rotations that put the end of a limb hanging straight
 * down from `from` (upper bone `upper` long, lower bone `lower`) on `target`,
 * with the joint bending towards `bendTowards`. All in the parent's frame.
 * A target out of reach is reached for as far as the limb goes.
 */
export function reach(from: THREE.Vector3, target: THREE.Vector3, upper: number, lower: number, bendTowards: THREE.Vector3): Reach {
  const toTarget = target.clone().sub(from);
  const distance = THREE.MathUtils.clamp(toTarget.length(), Math.abs(upper - lower) + 1e-3, upper + lower - 1e-3);
  const direction = toTarget.normalize();
  const cosine = (upper * upper + distance * distance - lower * lower) / (2 * upper * distance);
  const axis = direction.clone().cross(bendTowards).normalize();
  const upperDirection = direction.clone().applyAxisAngle(axis, Math.acos(THREE.MathUtils.clamp(cosine, -1, 1)));
  const shoulder = new THREE.Quaternion().setFromUnitVectors(DOWN, upperDirection);
  const joint = from.clone().addScaledVector(upperDirection, upper);
  const end = from.clone().addScaledVector(direction, distance);
  const lowerDirection = end.sub(joint).normalize().applyQuaternion(shoulder.clone().invert());
  return { shoulder, elbow: new THREE.Quaternion().setFromUnitVectors(DOWN, lowerDirection) };
}

export interface BurstTiming {
  /** Seconds per slot; at most one burst starts in each. */
  every: number;
  /** How long one burst lasts, in seconds; less than `every`. */
  lasts: number;
  /** The chance a slot has a burst at all. */
  chance: number;
}

/**
 * An occasional movement at irregular times, as a pure function of the clock:
 * time is cut into slots, and the seed decides for each slot whether a burst
 * happens and when in the slot it starts. `amount` eases from 0 up to 1, holds,
 * and eases back; `progress` runs from 0 to 1 through the burst, for a motion
 * inside it; `pick` is a seeded value in [0, 1) for that burst, to vary it.
 */
export function burst(seconds: number, seed: string, { every, lasts, chance }: BurstTiming): { amount: number; progress: number; pick: number } {
  const slot = Math.floor(seconds / every);
  for (const k of [slot, slot - 1]) {
    const rng = createRng(`${seed}:${k}`);
    if (rng.next() >= chance) continue;
    const start = k * every + rng.next() * (every - lasts);
    const t = (seconds - start) / lasts;
    if (t < 0 || t > 1) continue;
    const ease = (x: number) => THREE.MathUtils.smootherstep(x, 0, 1);
    return { amount: t < 0.3 ? ease(t / 0.3) : t > 0.7 ? ease((1 - t) / 0.3) : 1, progress: t, pick: rng.next() };
  }
  return { amount: 0, progress: 0, pick: 0 };
}

/** A point something sweeps through, and how far round it it reaches. */
export interface Swept {
  at: THREE.Vector3;
  radius: number;
}

/** Points along a leg as it is posed now, in the body's frame: the thigh
 *  from `from` of the way down (by default a third: above that, it is in the
 *  hip's joint) to the knee, and the shin to the ankle, each point with the
 *  leg's radius there. */
export function legPoints(leg: Leg, thighRadius: number, shinRadius: number, { samples = 5, from = 0.3 } = {}): Swept[] {
  const knee = new THREE.Vector3(0, -leg.thigh, 0).applyQuaternion(leg.hip.quaternion).add(leg.at);
  const shin = leg.hip.quaternion.clone().multiply(leg.knee.quaternion);
  const ankle = new THREE.Vector3(0, -leg.shin, 0).applyQuaternion(shin).add(knee);
  const points: Swept[] = [];
  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    points.push({ at: leg.at.clone().lerp(knee, from + (1 - from) * t), radius: thighRadius });
    points.push({ at: knee.clone().lerp(ankle, t), radius: shinRadius });
  }
  return points;
}

/**
 * Cloth pushed back by the legs: how far to turn a hanging piece (a coat's
 * tail) about its pivot's x axis, back from `rest` (the hem going back), so
 * that every one of `points` (in the pivot's parent frame; `pivot` is where
 * the piece hangs from there) sits in front of the cloth's inside. `margin`
 * says, in the piece's own frame, how far a point of a given radius is clear
 * in front of the cloth (negative: the cloth must go back). Each point needs
 * the cloth turned back only as far as it must, found to a hair, and the
 * cloth turns as far as the most demanding point needs: so it follows the
 * legs smoothly, never jumping from one side of a leg to the other.
 */
export function pushAside(
  margin: (local: THREE.Vector3, radius: number) => number,
  pivot: THREE.Vector3,
  points: readonly Swept[],
  rest: number,
  { reach = 1.4 }: { reach?: number } = {},
): number {
  const local = new THREE.Vector3();
  const clear = (at: THREE.Vector3, radius: number, angle: number) => margin(local.copy(at).sub(pivot).applyAxisAngle(ACROSS, -angle), radius) >= 0;
  let angle = rest;
  for (const { at, radius } of points) {
    if (clear(at, radius, angle)) continue;
    // The first angle back from here that clears the point, found by small
    // steps (it may clear, then not, further back) and then to a hair.
    let blocked = angle;
    while (blocked < rest + reach && !clear(at, radius, blocked + PUSH_STEP)) blocked += PUSH_STEP;
    if (blocked >= rest + reach) {
      angle = rest + reach;
      continue;
    }
    let open = blocked + PUSH_STEP;
    for (let i = 0; i < 12; i++) {
      const middle = (blocked + open) / 2;
      if (clear(at, radius, middle)) open = middle;
      else blocked = middle;
    }
    angle = open;
  }
  // Let go of the cloth gently: a little past what the legs need, easing into
  // the rest, rather than snapping from following a leg to hanging.
  return rest + RELEASE * Math.log1p(Math.exp((angle - rest) / RELEASE));
}

/** The steps, in radians, cloth pushed by the legs is turned back by as it looks for where it clears them. */
const PUSH_STEP = 0.004;
/** How softly, in radians, cloth the legs push eases back to its rest. */
const RELEASE = 0.1;
