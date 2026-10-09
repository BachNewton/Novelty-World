import * as THREE from "three";
import { ball, ellipsoid, rod, roundBox, sculpt, type Tone } from "../forms";
import { group } from "../shapes";
import { reach, type Joint, type Limb, type Reach } from "./figure";

/*
 * Arms and hands, shared by every explorer. An arm is rigid parts on pivots:
 * the upper arm hangs from the shoulder, the forearm from the elbow, and the
 * hand from the wrist. A hand is a palm, a thumb, and four fingers in three
 * rows of knuckles (each row one part, so the fingers curl together), and a
 * grip: a named point in the palm where anything held attaches.
 *
 * A hand is built hanging from its wrist, along −y, its thumb forward (+z)
 * and its palm towards the body: +x for the right hand (on −x), −x for the
 * left. Every size here is an adult's (Longfellow's) hand, in metres; a
 * figure scales it.
 */

/** Where the palm meets the fingers, below the wrist. */
const KNUCKLE = 0.058;
/** Half the palm's thickness, back to front of the hand. */
const PALM_HALF = 0.0125;
/** Each finger's three bones, from the knuckle out, and a finger's radius. */
const BONES = [0.026, 0.02, 0.018] as const;
const FINGER = 0.0072;
/** The four fingers across the hand, little finger (back, −z) to index
 *  (front, beside the thumb), and how much shorter than the middle each one's
 *  last bone is. */
const FINGERS: readonly { z: number; short: number }[] = [
  { z: -0.0195, short: 0.006 },
  { z: -0.0065, short: 0.001 },
  { z: 0.0065, short: 0 },
  { z: 0.0195, short: 0.003 },
];
/** The thumb's root on the palm (towards the palm, high and forward), its length and the way it points open. */
const THUMB_ROOT = new THREE.Vector3(0.006, -0.017, 0.023);
const THUMB = 0.046;
const THUMB_OPEN = new THREE.Vector3(0.32, -0.76, 0.56).normalize();
/** Closed, the thumb lies across the front of the fist, over the fingers. */
const THUMB_CLOSED = new THREE.Vector3(0.78, -0.5, 0.1).normalize();

/** The grip, as the hand's parts see it: a held thing's axis runs through the
 *  palm from the little finger's side out past the thumb (the grip's +y), and
 *  its +z points along the hand towards the fingertips. */
const GRIP_TURN = new THREE.Euler(Math.PI / 2, 0, 0);

/** A hand's pose: how far each row of knuckles bends towards the palm, in
 *  radians, and how far the thumb closes, 0 to 1. */
export interface HandPose {
  knuckles: readonly [number, number, number];
  thumb: number;
}

export const OPEN: HandPose = { knuckles: [0.05, 0.05, 0.04], thumb: 0 };
export const RELAXED: HandPose = { knuckles: [0.32, 0.42, 0.3], thumb: 0.15 };

export function blendPose(a: HandPose, b: HandPose, t: number): HandPose {
  const mix = (x: number, y: number) => x + (y - x) * t;
  return { knuckles: [mix(a.knuckles[0], b.knuckles[0]), mix(a.knuckles[1], b.knuckles[1]), mix(a.knuckles[2], b.knuckles[2])], thumb: mix(a.thumb, b.thumb) };
}

/**
 * The pose that closes a hand round a handle `radius` thick, and where the
 * handle's axis then lies (the grip), in the hand's frame: the handle rests
 * against the palm by the knuckles, and each bone of the fingers in turn lies
 * tangent to it, so the fingers wrap it without passing into it. Worked out
 * in the plane across the fingers, `u` towards the palm and `y` up the hand.
 */
function grasp(radius: number, scale: number, palmward: number): { pose: HandPose; grip: THREE.Vector3 } {
  const centre = new THREE.Vector2((PALM_HALF + 0.001) * scale + radius, -KNUCKLE * scale + radius * 0.3);
  const clear = radius + FINGER * scale + 0.0005;
  let at = new THREE.Vector2(0, -KNUCKLE * scale);
  let heading = -Math.PI / 2;
  const bends: number[] = [];
  for (const bone of BONES) {
    const toCentre = centre.clone().sub(at);
    const towards = Math.atan2(toCentre.y, toCentre.x) - Math.asin(Math.min(1, clear / toCentre.length()));
    const bend = THREE.MathUtils.clamp(towards - heading, 0, 1.9);
    heading += bend;
    bends.push(bend);
    at = at.add(new THREE.Vector2(Math.cos(heading), Math.sin(heading)).multiplyScalar(bone * scale));
  }
  return { pose: { knuckles: [bends[0], bends[1], bends[2]], thumb: 0.85 }, grip: new THREE.Vector3(palmward * centre.x, centre.y, 0) };
}

/** A hand's meshes, each at its own pivot. */
export interface HandParts {
  palm: THREE.BufferGeometry;
  thumb: THREE.BufferGeometry;
  /** The fingers' three rows of bones, from the knuckles out. */
  bones: readonly [THREE.BufferGeometry, THREE.BufferGeometry, THREE.BufferGeometry];
}

/** A hand's parts, `side` −1 for the right and 1 for the left, `scale` times an adult's. */
export function handParts(side: -1 | 1, scale = 1, skin: Tone = "skin"): HandParts {
  const palmward = -side;
  const s = (x: number, y: number, z: number): [number, number, number] => [palmward * x * scale, y * scale, z * scale];
  const cell = 0.0042 * scale;
  const palm = sculpt()
    .add(rod(s(0, 0.014, 0), s(0, -0.012, 0.002), 0.017 * scale, 0.019 * scale), skin)
    .add(roundBox(s(0, -0.035, 0.002), [0.011 * scale, 0.024 * scale, 0.024 * scale], 0.0095 * scale), skin, 0.012 * scale)
    // The heel of the thumb, a soft mound on the palm.
    .add(ellipsoid(s(0.005, -0.024, 0.016), [0.009 * scale, 0.017 * scale, 0.011 * scale]), skin, 0.008 * scale)
    // The knuckles, a ridge across the back of the hand where the fingers begin.
    .add(rod(s(-0.002, -KNUCKLE + 0.003, -0.022), s(-0.002, -KNUCKLE + 0.003, 0.024), 0.0095 * scale), skin, 0.008 * scale)
    .geometry(cell);
  const bones = BONES.map((length, row) => {
    const shape = sculpt();
    for (const { z, short } of FINGERS) {
      const own = row === 2 ? length - short : length;
      const radius = FINGER * (1 - row * 0.08);
      shape.add(rod(s(0, 0.002, z), s(0, -own, z), radius * scale, radius * (row === 2 ? 0.82 : 0.94) * scale), skin);
    }
    return shape.geometry(cell);
  }) as unknown as HandParts["bones"];
  const out = THUMB_OPEN.clone().multiplyScalar(THUMB);
  const thumb = sculpt()
    .add(ball([0, 0, 0], 0.0105 * scale), skin)
    .add(rod([0, 0, 0], s(out.x, out.y, out.z), 0.0092 * scale, 0.0076 * scale), skin, 0.006 * scale)
    .geometry(cell);
  return { palm, thumb, bones };
}

/** Something a hand can hold: built round its grip (its handle's axis along
 *  +y through the origin, +z along the hand towards the fingertips), how
 *  thick its handle is, and how it is carried. */
export interface Prop {
  object: THREE.Object3D;
  /** The radius the hand closes round. */
  handle: number;
  /** "hang": swung at the side as the arm swings (a revolver, a lamp by its
   *  bail); "upright": held up before the body, its axis kept upright as the
   *  arm moves (a candle, a spear, a torch). A figure may carry its own
   *  things its own way (Longfellow reads his book). */
  carry: "hang" | "upright";
}

export interface Hand {
  side: -1 | 1;
  scale: number;
  /** The hand's pivot, at the end of the forearm. */
  wrist: THREE.Group;
  /** Where a held prop attaches, and its orientation (see `Prop`). */
  grip: THREE.Group;
  thumb: THREE.Group;
  /** The fingers' three rows of knuckles, from the palm out. */
  knuckles: readonly [THREE.Group, THREE.Group, THREE.Group];
  held: Prop | null;
}

/** An arm: a limb whose forearm ends at a wrist with a hand on it. */
export interface Arm extends Limb {
  wrist: THREE.Group;
  hand: Hand;
  /** From the shoulder to the elbow, and from the elbow to the wrist. */
  upper: number;
  lower: number;
  /** Where the arm's parts pass into each other on purpose, at its pivots. */
  joints: Joint[];
}

const ACROSS = new THREE.Vector3(0, 0, 1);

/**
 * An arm from its meshes: the upper arm hangs from the shoulder at `at` (in
 * the chest's frame), the forearm from the elbow `upper` below it, and the
 * hand from the wrist `lower` below that. The hand starts relaxed and empty.
 */
export function buildArm(
  mesh: (geometry: THREE.BufferGeometry, name: string) => THREE.Mesh,
  parts: { upperArm: THREE.BufferGeometry; forearm: THREE.BufferGeometry; hand: HandParts },
  side: -1 | 1,
  at: THREE.Vector3,
  upper: number,
  lower: number,
  scale: number,
): Arm {
  const name = side < 0 ? "right" : "left";
  const palmward = -side;
  const [proximal, middle, distal] = parts.hand.bones.map((bone, row) => mesh(bone, `${name} fingers ${row + 1}`));
  const ends = group(distal);
  ends.position.y = -BONES[1] * scale;
  const middles = group(middle, ends);
  middles.position.y = -BONES[0] * scale;
  const knuckles = group(proximal, middles);
  knuckles.position.y = -KNUCKLE * scale;
  const thumbPart = mesh(parts.hand.thumb, `${name} thumb`);
  const thumb = group(thumbPart);
  thumb.position.set(palmward * THUMB_ROOT.x * scale, THUMB_ROOT.y * scale, THUMB_ROOT.z * scale);
  const grip = group();
  grip.name = `${name} grip`;
  grip.rotation.copy(GRIP_TURN);
  const palm = mesh(parts.hand.palm, `${name} palm`);
  const wrist = group(palm, thumb, knuckles, grip);
  wrist.position.y = -lower;
  const forearm = mesh(parts.forearm, `${name} forearm`);
  const elbow = group(forearm, wrist);
  elbow.position.y = -upper;
  const upperArm = mesh(parts.upperArm, `${name} upper arm`);
  const shoulder = group(upperArm, elbow);
  shoulder.position.copy(at);
  const hand: Hand = { side, scale, wrist, grip, thumb, knuckles: [knuckles, middles, ends], held: null };
  poseHand(hand, RELAXED);
  const joint = (a: THREE.Object3D, b: THREE.Object3D, pivot: THREE.Object3D, radius: number): Joint => ({ parts: [a, b], at: pivot, radius });
  return {
    shoulder,
    elbow,
    at,
    wrist,
    hand,
    upper,
    lower,
    joints: [
      // A bent elbow folds the forearm's sleeve into the upper arm's, on the inside.
      joint(upperArm, forearm, elbow, 0.1 * scale),
      joint(forearm, palm, wrist, 0.04 * scale),
      // The root of the thumb sits against the wrist.
      joint(forearm, thumbPart, wrist, 0.045 * scale),
      joint(palm, thumbPart, thumb, 0.022 * scale),
      // Each row of knuckles is a joint across the whole hand.
      joint(palm, proximal, knuckles, 0.032 * scale),
      joint(proximal, middle, middles, 0.028 * scale),
      joint(middle, distal, ends, 0.027 * scale),
    ],
  };
}

/** Poses a hand: its knuckles bend towards the palm and its thumb closes. */
export function poseHand(hand: Hand, { knuckles, thumb }: HandPose) {
  const towardsPalm = -hand.side;
  for (const [i, row] of hand.knuckles.entries()) row.quaternion.setFromAxisAngle(ACROSS, towardsPalm * knuckles[i]);
  const closed = THUMB_CLOSED.clone().setX(THUMB_CLOSED.x * towardsPalm);
  const open = THUMB_OPEN.clone().setX(THUMB_OPEN.x * towardsPalm);
  const way = open.clone().lerp(closed, thumb).normalize();
  hand.thumb.quaternion.setFromUnitVectors(open, way);
}

/** A loose fist: the fingers curled as round a thin rod, so they close without passing into the palm. */
export function fist(hand: Hand): HandPose {
  return { ...grasp(0.006, hand.scale, -hand.side).pose, thumb: 0.8 };
}

/** The pose that closes a hand round what it holds, or `empty` if it holds nothing. */
export function holding(hand: Hand, empty: HandPose): HandPose {
  return hand.held ? closedRound(hand, hand.held.handle) : empty;
}

/** The pose that closes a hand round a handle `radius` thick, held or about to be. */
export function closedRound(hand: Hand, radius: number): HandPose {
  return grasp(radius, hand.scale, -hand.side).pose;
}

/**
 * Puts a prop in a hand, or empties it (null): the prop rides the grip, the
 * hand closes round its handle, and the figure carries it as its `carry`
 * says. A hand holds one thing; whatever it held is let go.
 */
export function holdIn(hand: Hand, prop: Prop | null) {
  if (hand.held) hand.grip.remove(hand.held.object);
  hand.held = prop;
  if (!prop) return;
  hand.grip.position.copy(grasp(prop.handle, hand.scale, -hand.side).grip);
  hand.grip.add(prop.object);
  poseHand(hand, holding(hand, RELAXED));
}

/** A figure's hands, right then left, as its builder declares them. */
export interface Hands {
  right: Hand;
  left: Hand;
}

export function hasHands<T extends THREE.Object3D>(figure: T, hands: Hands): T {
  figure.userData.hands = hands;
  return figure;
}

export function handsOf(figure: THREE.Object3D): Hands | undefined {
  return (figure.userData as { hands?: Hands }).hands;
}

/** A hand's held prop and the hand's own parts (and the wrist's end of the forearm) pass into each other round the grip. */
export function heldJoint(hand: Hand): Joint | null {
  if (!hand.held) return null;
  return { parts: [hand.held.object, hand.wrist.parent ?? hand.wrist], at: hand.grip, radius: hand.held.handle + 0.03 * hand.scale };
}

/** How `object` is turned in `root`'s frame: its own turn and every parent's up to `root`. */
export function turnIn(object: THREE.Object3D, root: THREE.Object3D): THREE.Quaternion {
  const turn = new THREE.Quaternion();
  for (let at: THREE.Object3D | null = object; at && at !== root; at = at.parent) turn.premultiply(at.quaternion);
  return turn;
}

const GRIP_AXIS = new THREE.Vector3(0, 1, 0).applyEuler(GRIP_TURN);

/**
 * Turns the wrist, by `amount`, so the grip's axis points along `up` in
 * `root`'s frame (usually the figure's): a candle or a spear kept upright as
 * the arm swings. Call it after the arm is posed for the frame.
 */
export function aimGrip(hand: Hand, root: THREE.Object3D, up: THREE.Vector3, amount: number) {
  if (amount <= 0 || !hand.wrist.parent) return;
  const parent = turnIn(hand.wrist.parent, root);
  const now = GRIP_AXIS.clone().applyQuaternion(hand.wrist.quaternion).applyQuaternion(parent);
  const correction = new THREE.Quaternion().setFromUnitVectors(now, up.clone().normalize());
  const aimed = parent.clone().invert().multiply(correction).multiply(parent).multiply(hand.wrist.quaternion);
  hand.wrist.quaternion.slerp(aimed, amount);
}

/** An arm's pose: a limb's reach, and how the wrist turns the hand. */
export interface ArmPose extends Reach {
  wrist: THREE.Quaternion;
}

/** An arm reaching its wrist for `target` (in the chest's frame), the hand
 *  straight on the forearm, the elbow bending towards `bend`. */
export function reachWrist(arm: Arm, target: THREE.Vector3, bend: THREE.Vector3, wrist = new THREE.Quaternion()): ArmPose {
  return { ...reach(arm.at, target, arm.upper, arm.lower, bend), wrist };
}

/**
 * The pose that puts an arm's grip at `target`, a whole placement (where,
 * and turned how) in the chest's frame: the arm reaches for the wrist, and
 * the wrist turns the hand to match. For holding a thing at a set place,
 * whichever way the arm has to bend (Longfellow's book).
 */
export function gripAt(arm: Arm, target: THREE.Matrix4, bend: THREE.Vector3): ArmPose {
  const grip = new THREE.Matrix4().compose(arm.hand.grip.position, arm.hand.grip.quaternion, new THREE.Vector3(1, 1, 1));
  const wrist = target.clone().multiply(grip.invert());
  const at = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  wrist.decompose(at, turn, new THREE.Vector3());
  const reached = reach(arm.at, at, arm.upper, arm.lower, bend);
  const forearm = reached.shoulder.clone().multiply(reached.elbow);
  return { ...reached, wrist: forearm.invert().multiply(turn) };
}

/** Blends an arm between two poses: 0 is `from`, 1 is `to`. */
export function poseArm(arm: Arm, from: ArmPose, to: ArmPose, amount: number) {
  arm.shoulder.quaternion.slerpQuaternions(from.shoulder, to.shoulder, amount);
  arm.elbow.quaternion.slerpQuaternions(from.elbow, to.elbow, amount);
  arm.wrist.quaternion.slerpQuaternions(from.wrist, to.wrist, amount);
}

const ALONG = new THREE.Vector3(0, -1, 0);

/**
 * Turns the hand of an arm pose to point along `direction` (in the chest's
 * frame), its fingers that way, then rolled `roll` radians about its own
 * length: for a gesture with an open hand, rather than a held thing.
 */
export function pointHand(pose: ArmPose, direction: THREE.Vector3, roll = 0): ArmPose {
  const forearm = pose.shoulder.clone().multiply(pose.elbow);
  const local = direction.clone().normalize().applyQuaternion(forearm.clone().invert());
  const wrist = new THREE.Quaternion().setFromUnitVectors(ALONG, local).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), roll));
  return { ...pose, wrist };
}

/** An arm pose between two: 0 is `from`, 1 is `to`. */
export function between(from: ArmPose, to: ArmPose, amount: number): ArmPose {
  return {
    shoulder: from.shoulder.clone().slerp(to.shoulder, amount),
    elbow: from.elbow.clone().slerp(to.elbow, amount),
    wrist: from.wrist.clone().slerp(to.wrist, amount),
  };
}
