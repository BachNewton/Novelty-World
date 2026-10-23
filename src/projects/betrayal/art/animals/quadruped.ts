import * as THREE from "three";
import { BASE_TOP, reach, type Joint, type Stride, type Walking } from "../explorers/figure";
import { group } from "../shapes";

/*
 * How a four-legged figure walks and runs: the shared gait every animal on
 * four paws builds on (the Dog, the Cat; wolves, rats and hellhounds next).
 *
 * A quadruped is a trunk in two halves, the chest and the hips, turning about
 * one pivot at the middle of the back so the spine can flex; each half
 * carries its pair of legs. A leg is three rigid segments: the upper bone
 * from the shoulder or hip, the lower bone, and the foot (a dog's pastern or
 * hock) ending in the paw. The paw is planted on the base and slides back
 * exactly as fast as the floor goes by, so it never skates; the foot keeps
 * its standing lean while it is down, so the paw lies flat; the two upper
 * bones reach the foot's top through the middle joint, which points back on
 * a foreleg (the elbow) and forward on a hind leg (the stifle). In the air
 * the paw lifts, the foot folds back and swings forward, leaving and meeting
 * the floor at the floor's own speed.
 *
 * Which paw falls when is the figure's footfall pattern, one for the walk and
 * one for the run (a dog trots and gallops; a cat walks one paw at a time
 * and bounds). The trunk dips at each footfall walking; running, the spine
 * arches and stretches once a stride, the trunk rocks, and the whole figure
 * leaves the base while every paw is off it. The trunk sinks, once for the
 * whole stride, as far as any planted paw needs to stay in its leg's reach,
 * so no leg ever snaps straight and nothing drops mid-stride.
 */

/** One leg: three segments on their pivots, from the half that carries it. */
export interface PawLeg {
  hip: THREE.Group;
  knee: THREE.Group;
  ankle: THREE.Group;
  /** The leg's top, in its half's frame. */
  at: THREE.Vector3;
  upper: number;
  lower: number;
  /** From the ankle down to the middle of the paw. */
  foot: number;
  /** The middle of the paw, planted, as the figure stands. */
  paw: THREE.Vector3;
  /** Which way the middle joint points: back (−1) for a foreleg's elbow, forward (1) for a hind leg's stifle. */
  bend: -1 | 1;
  /** How far the foot leans from straight down while the paw is planted, in radians: positive puts the paw ahead of the ankle. */
  stand: number;
  /** How far the foot folds back mid-swing, the paw trailing, in radians. */
  fold: number;
}

/** The paw's half-height, from its middle down to its sole: a planted paw rests on the base, level. */
export interface PawShape {
  height: number;
}

/**
 * A leg from its three parts, each built hanging straight down from its pivot
 * (`upper` metres from the leg's top to the middle joint, `lower` on to the
 * ankle, `foot` on to the middle of the paw), at `at` in its half's frame,
 * its paw planted at `paw` in the figure's frame. Build the paw turned by
 * `stand` about x (`[stand, 0, 0]`) so it lies level as the foot leans.
 */
export function pawLeg(
  parts: readonly [THREE.Object3D, THREE.Object3D, THREE.Object3D],
  at: THREE.Vector3,
  lengths: { upper: number; lower: number; foot: number },
  paw: THREE.Vector3,
  how: { bend: -1 | 1; stand: number; fold: number },
): PawLeg {
  const ankle = group(parts[2]);
  ankle.position.y = -lengths.lower;
  const knee = group(parts[1], ankle);
  knee.position.y = -lengths.upper;
  const hip = group(parts[0], knee);
  hip.position.copy(at);
  return { hip, knee, ankle, at, ...lengths, paw, ...how };
}

/** Where a paw rests on the base: its middle, so high above the base's top that the paw's underside just clears it. */
export function restingPaw(x: number, z: number, { height }: PawShape): THREE.Vector3 {
  return new THREE.Vector3(x, BASE_TOP + height + 0.001, z);
}

/**
 * A leg's joints. As in a real animal, the upper bone (the upper arm, the
 * thigh) lies within the body's flank, so it may pass into the trunk's halves
 * along its whole length, `top` from the leg's top, and its middle joint (an
 * elbow against the ribs, a stifle in the flank) may press into them within
 * `knee`; the lower bone turns in the upper at the middle joint, and the foot
 * in the lower at the ankle.
 */
export function pawLegJoints(leg: PawLeg, body: readonly THREE.Object3D[], radii: { top: number; knee: number; ankle: number }): Joint[] {
  const [upper, lower, foot] = [leg.hip.children[0], leg.knee.children[0], leg.ankle.children[0]];
  return [
    ...body.flatMap((half): Joint[] => [
      { parts: [upper, half], at: leg.hip, radius: radii.top },
      { parts: [lower, half], at: leg.knee, radius: radii.knee },
    ]),
    { parts: [upper, lower], at: leg.knee, radius: radii.knee },
    { parts: [lower, foot], at: leg.ankle, radius: radii.ankle },
  ];
}

/** When each paw falls in a stride (a full turn of the stride's phase is two steps), as a share of it from 0 to 1, in
 *  the order right fore, left fore, right hind, left hind; the share of the stride each paw is down; and how high a
 *  swinging paw lifts, in metres. */
export interface Footfall {
  lands: readonly [number, number, number, number];
  stance: number;
  lift: number;
  /** How far, in metres, the paws stand out to the side (fore, hind: positive is outward) and apart along the body
   *  (fore forward, hind back) in this gait: a galloper's hind legs pass outside its forelegs and its legs reach out
   *  front and back, so neither pair runs into the other. */
  spread?: { across: readonly [number, number]; along: readonly [number, number] };
}

/** What a four-legged figure moves when it walks or runs. */
export interface PawRig {
  walking: Walking;
  /** Right fore, left fore, right hind, left hind. */
  legs: readonly [PawLeg, PawLeg, PawLeg, PawLeg];
  /** The trunk, a child of the figure itself, standing at the middle of the back; the idle poses it each frame. */
  trunk: THREE.Object3D;
  /** The chest and the hips, children of the trunk at its pivot, carrying the fore and hind legs. */
  front: THREE.Object3D;
  rear: THREE.Object3D;
  walk: Footfall;
  run: Footfall & {
    /** How far each half turns as the spine arches and stretches, in radians, and when in the stride (0 to 1) it is
     *  most arched: as the hind paws reach forward under the body. */
    arch: number;
    gathered: number;
    /** How far the trunk rocks, nose up then nose down, in radians. */
    rock: number;
  };
}

/** What the stride did, for the figure's own touches: the step (−1 to 1), and how far the trunk rose or fell. */
export interface PawStride {
  step: number;
  bounce: number;
  /** How far, 0 to 1, the figure is running. */
  run: number;
}

const DOWN = new THREE.Vector3(0, -1, 0);
/** How many moments of a stride the trunk's sink is worked out from. */
const SINK_SAMPLES = 48;
/** How far short of straight a planted leg is held, in metres, so its middle joint never locks. */
const SOFT = 0.006;
/** How many times its hop a runner bounds between footfalls, as a two-legged runner does. */
const RUN_BOUND = 3;
/** The furthest a leg's middle joint folds, in radians from straight, so a paw kicked up never folds the lower bone
 *  into the upper. */
const DEEPEST = 2.1;
/** How quickly a lifted paw stops going back with the floor, and a landing one comes back to the floor's pace: the
 *  higher, the sooner, and the less it overshoots where it lifts and lands. */
const CARRY = 6;
/** How far a forefoot bends at the wrist from the lower bone's line, in radians: freely up to `from`, then easing to
 *  a stop at most `ease` further. */
const ANKLE = { from: 0.9, ease: 0.25 };

interface PawAt {
  /** The middle of the paw, in the figure's frame. */
  paw: THREE.Vector3;
  /** The foot's lean from straight down. */
  lean: number;
  /** Whether the paw is on the floor. */
  down: boolean;
  /** How far through its swing the paw is, 0 to 1 (0 while down). */
  swing: number;
}

/** Where a paw is `cycle` of the way through its own stride, from when it lands, as the floor slides `range` metres
 *  either side of where it stands. */
function pawAt(leg: PawLeg, fore: boolean, cycle: number, range: number, { stance, lift, spread }: Footfall): PawAt {
  const c = cycle - Math.floor(cycle);
  const paw = leg.paw.clone();
  if (spread) {
    const pair = fore ? 0 : 1;
    paw.x += Math.sign(leg.paw.x) * spread.across[pair];
    paw.z += (fore ? 1 : -1) * spread.along[pair];
  }
  if (c < stance) {
    paw.z += range * (1 - (2 * c) / stance);
    return { paw, lean: leg.stand, down: true, swing: 0 };
  }
  const u = (c - stance) / (1 - stance);
  // From where it lifts to where it lands, leaving and meeting the floor at the floor's own speed: it carries on
  // back only a moment after lifting, and slows to the floor's pace only just before landing, so a quick runner's
  // paws never fling far out behind and ahead.
  const slide = (-2 * range * (1 - stance)) / stance;
  const carry = u * (1 - u) ** CARRY - (1 - u) * u ** CARRY;
  paw.z += range * (2 * THREE.MathUtils.smoothstep(u, 0, 1) - 1) + slide * carry;
  const arc = Math.sin(Math.PI * u) ** 2;
  paw.y += arc * lift;
  return { paw, lean: leg.stand + leg.fold * arc, down: false, swing: u };
}

/** How high, 0 to 1, a runner leaves the base at `cycle`: through the longest stretch of its stride with all four paws
 *  in the air, rising from and settling back to nothing, and not at all while any paw is down. Worked out once per
 *  footfall and kept. */
const flights = new WeakMap<Footfall, (cycle: number) => number>();
function flightOf(footfall: Footfall): (cycle: number) => number {
  const found = flights.get(footfall);
  if (found) return found;
  const SAMPLES = 1000;
  const up = (cycle: number) => footfall.lands.every((lands) => cycle - lands - Math.floor(cycle - lands) >= footfall.stance);
  // The longest run of moments with every paw up, round the cycle.
  let best = { start: 0, length: 0 };
  for (let i = 0; i < SAMPLES; i++) {
    if (!up(i / SAMPLES) || up((i - 1) / SAMPLES)) continue;
    let length = 0;
    while (length < SAMPLES && up((i + length) / SAMPLES)) length++;
    if (length > best.length) best = { start: i / SAMPLES, length: length / SAMPLES };
  }
  const { start, length } = best;
  const flight = (cycle: number) => {
    if (length === 0) return 0;
    const t = (cycle - start - Math.floor(cycle - start)) / length;
    return t < 1 ? Math.sin(Math.PI * t) ** 2 : 0;
  };
  flights.set(footfall, flight);
  return flight;
}

interface Carriage {
  y: number;
  pitch: number;
  arch: number;
}

/** How the trunk moves at a phase of the stride: dipping at each footfall walking; running, arching and stretching
 *  and rocking once a stride. */
function carriageAt(rig: PawRig, phase: number, walk: number, run: number): Carriage {
  const cycle = phase / (Math.PI * 2);
  const { arch, gathered, rock } = rig.run;
  return {
    y: -rig.walking.hop * walk * (0.5 - 0.5 * Math.cos(4 * Math.PI * cycle)),
    pitch: run * rock * Math.sin(2 * Math.PI * (cycle - gathered)),
    arch: run * arch * Math.cos(2 * Math.PI * (cycle - gathered)),
  };
}

interface Rest {
  y: number;
  pitch: number;
  front: number;
  rear: number;
}

function place(rig: PawRig, rest: Rest, { y, pitch, arch }: Carriage, drop: number) {
  rig.trunk.position.y = rest.y + y - drop;
  rig.trunk.rotation.x = rest.pitch + pitch;
  rig.front.rotation.x = rest.front + arch;
  rig.rear.rotation.x = rest.rear - arch;
  rig.trunk.updateMatrix();
  rig.front.updateMatrix();
  rig.rear.updateMatrix();
}

/** A half's frame in the figure's: the trunk's, then its own. */
function halfMatrix(rig: PawRig, leg: number, out: THREE.Matrix4): THREE.Matrix4 {
  return out.multiplyMatrices(rig.trunk.matrix, (leg < 2 ? rig.front : rig.rear).matrix);
}

/** The foot's direction, down from the ankle to the paw, leaning `lean` (positive: the paw ahead). */
function footDirection(lean: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(0, -Math.cos(lean), Math.sin(lean));
}

/** Where each paw is at a phase, eased in by `amount`, and `adjust`ed by the figure. */
function pawsAt(rig: PawRig, phase: number, amount: number, running: boolean, adjust?: PawAdjust): PawAt[] {
  const footfall = running ? rig.run : rig.walk;
  const length = running ? rig.walking.step * 2 : rig.walking.step;
  // A stride (two steps) carries the floor its length twice; each paw is down for its stance of it.
  const range = length * footfall.stance;
  return rig.legs.map((leg, i) => {
    const moving = pawAt(leg, i < 2, phase / (Math.PI * 2) - footfall.lands[i], range, footfall);
    const at: PawAt = { paw: leg.paw.clone().lerp(moving.paw, amount), lean: leg.stand + (moving.lean - leg.stand) * amount, down: moving.down, swing: moving.swing };
    adjust?.(i, at);
    return at;
  });
}

/** Lets a figure move a paw off its gait for a gesture of its own (a play bow's forepaws stretched out, a cat's paw
 *  raised to be washed): it may move the paw and change the foot's lean, and say the paw is off the floor. */
export type PawAdjust = (leg: number, at: { paw: THREE.Vector3; lean: number; down: boolean }) => void;

/** How far the trunk must sink for every planted paw at this pose to be within its leg's reach. */
function sinkFor(rig: PawRig, paws: readonly PawAt[]): number {
  const matrix = new THREE.Matrix4();
  const direction = new THREE.Vector3();
  let drop = 0;
  rig.legs.forEach((leg, i) => {
    if (!paws[i].down) return;
    const hip = leg.at.clone().applyMatrix4(halfMatrix(rig, i, matrix));
    const ankle = paws[i].paw.clone().addScaledVector(footDirection(paws[i].lean, direction), -leg.foot);
    const reachable = (leg.upper + leg.lower) * 0.995 - SOFT;
    const across = Math.hypot(hip.x - ankle.x, hip.z - ankle.z);
    drop = Math.max(drop, hip.y - ankle.y - Math.sqrt(Math.max(0, reachable * reachable - across * across)));
  });
  return drop;
}

/**
 * Walks or runs a four-legged figure, after its idle has posed the trunk and
 * its halves (`trunk.position.y`, `trunk.rotation.x`, and each half's
 * `rotation.x`, set afresh each frame), which it moves on from there: each
 * paw planted on the base sliding back as fast as the floor, or swinging
 * forward to land again, on the figure's footfall pattern; the trunk dipping
 * or arching, sinking as far as the stride needs; and each leg reaching its
 * paw. At `amount` 0 the paws stand as built. `adjust` moves a paw for a
 * gesture of the figure's own (a planted paw it moves stays in reach only as
 * far as its leg allows).
 */
export function pawStride(rig: PawRig, { phase, amount, running = false }: Stride, adjust?: PawAdjust): PawStride {
  const run = running ? amount : 0;
  const walk = amount - run;
  const rest: Rest = { y: rig.trunk.position.y, pitch: rig.trunk.rotation.x, front: rig.front.rotation.x, rear: rig.rear.rotation.x };

  // The trunk sinks as deep as the stride ever needs, the same all through it, so it never drops mid-stride.
  let drop = 0;
  if (amount > 0) {
    for (let k = 0; k < SINK_SAMPLES; k++) {
      const at = (k / SINK_SAMPLES) * Math.PI * 2;
      place(rig, rest, carriageAt(rig, at, walk, run), 0);
      drop = Math.max(drop, sinkFor(rig, pawsAt(rig, at, amount, running, adjust)));
    }
  }
  // A paw the figure moves for a gesture of its own is kept in reach the same way, as it would stand without the
  // stride: the gestures ease out as the stride eases in. (Asking the stride's own paws at this moment instead would
  // drop the trunk the instant a paw lands.)
  place(rig, rest, { y: 0, pitch: 0, arch: 0 }, 0);
  drop = Math.max(drop, sinkFor(rig, pawsAt(rig, 0, 0, false, adjust)));

  const carriage = carriageAt(rig, phase, walk, run);
  // Running, the whole figure leaves the base while all four paws are off it.
  const bound = running ? flightOf(rig.run)(phase / (Math.PI * 2)) * rig.walking.hop * RUN_BOUND * run : 0;
  place(rig, rest, carriage, drop - bound);
  const paws = pawsAt(rig, phase, amount, running, adjust);

  const matrix = new THREE.Matrix4();
  const inverse = new THREE.Matrix4();
  const turn = new THREE.Quaternion();
  const direction = new THREE.Vector3();
  const bend = new THREE.Vector3();
  rig.legs.forEach((leg, i) => {
    const { paw, lean } = paws[i];
    paw.y += bound;
    halfMatrix(rig, i, matrix);
    inverse.copy(matrix).invert();
    footDirection(lean, direction);
    const ankle = paw.clone().addScaledVector(direction, -leg.foot).applyMatrix4(inverse);
    // A paw reaching beyond its leg is held in reach, easing to a stop a little short of straight, so the leg never
    // snaps straight (and its middle joint never flicks round as the paw comes back in reach).
    const reachable = (leg.upper + leg.lower) * 0.995 - SOFT;
    const out = ankle.distanceTo(leg.at);
    if (out > reachable) ankle.sub(leg.at).setLength(reachable + SOFT * Math.tanh((out - reachable) / SOFT)).add(leg.at);
    // A paw kicked up close under its leg's top holds off, easing to a stop, so the leg never folds shut.
    const folded = Math.sqrt(leg.upper ** 2 + leg.lower ** 2 + 2 * leg.upper * leg.lower * Math.cos(DEEPEST)) + SOFT;
    const distance = ankle.distanceTo(leg.at);
    if (distance < folded) ankle.sub(leg.at).setLength(folded - SOFT * Math.tanh((folded - distance) / SOFT)).add(leg.at);
    const posed = reach(leg.at, ankle, leg.upper, leg.lower, bend.set(0, 0, leg.bend));
    leg.hip.quaternion.copy(posed.shoulder);
    leg.knee.quaternion.copy(posed.elbow);
    // The foot points from the ankle to the paw, in the figure's frame, whatever the bones above it do.
    turn.setFromRotationMatrix(matrix).multiply(posed.shoulder).multiply(posed.elbow).invert();
    direction.applyQuaternion(turn);
    // A forepaw folded back in the air bends at the wrist no further than it allows, easing to a stop, so it never
    // folds into the lower bone. (A hind foot's hock always stands at an angle to the shin, so it bends as it must.)
    const bent = Math.acos(THREE.MathUtils.clamp(-direction.y, -1, 1));
    const eased = bent < ANKLE.from ? bent : ANKLE.from + ANKLE.ease * Math.tanh((bent - ANKLE.from) / ANKLE.ease);
    if (leg.bend < 0 && eased < bent) {
      const sideways = Math.hypot(direction.x, direction.z);
      direction.set((direction.x / sideways) * Math.sin(eased), -Math.cos(eased), (direction.z / sideways) * Math.sin(eased));
    }
    leg.ankle.quaternion.setFromUnitVectors(DOWN, direction);
  });
  return { step: Math.sin(phase) * amount, bounce: carriage.y - drop + bound, run };
}
