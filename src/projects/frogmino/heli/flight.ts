import { dropPose, leapProgress, type LeapPose } from "../frog/leaps";
import { TUNING } from "../tuning";
import { HEADROOM, VEHICLE_TOP } from "../world/structures";
import { DECK_THICKNESS } from "./model";

// The `?heli` preview's flight, as pure functions of time: the Lily Lifter
// cruising down the road with the traffic, the frogs leaping off it onto the
// road along the game's own drop, and the helicopter, lightened, swinging
// round and flying off up the road. Depths run forward along the course, and
// heights up from the road, in the scene's units.

const { wallSpeed, dropDistance, dropDuration } = TUNING;

// It bobs gently on the air, this much each way.
export const BOB = 0.12;
const BOB_PERIOD = 2.4;

// The deck's top: as low as it can fly, the tallest vehicle clearing its
// underside, with the overpass's headroom, at the bottom of its bob.
export const HELI_DECK_TOP = VEHICLE_TOP + HEADROOM + DECK_THICKNESS + BOB;

export function bob(time: number): number {
  return BOB * Math.sin((2 * Math.PI * time) / BOB_PERIOD);
}

// It cruises down the road at the traffic's speed, so the traffic beneath
// holds still under the frogs and they can jump out whenever they're ready.
export function cruiseDepth(startDepth: number, time: number): number {
  return startDepth - wallSpeed * time;
}

// Where the frogs stand aboard: the middle of the deck, their front faces half
// a cell ahead of it.
export function aboardFrogDepth(heliDepth: number): number {
  return heliDepth + 0.5;
}

// The frogs' leap off the deck, `seconds` after jumping from `fromDepth` at
// `fromLevel`: the game's drop, the drop distance ahead.
export function frogLeap(fromDepth: number, fromLevel: number, seconds: number): LeapPose {
  return dropPose({ fromDepth, fromLevel }, fromDepth + dropDistance, leapProgress(seconds, dropDuration));
}

export function landed(seconds: number): boolean {
  return seconds >= dropDuration;
}

// The helicopter's pose: across the road, height, depth, and how it is turned.
export interface HeliPose {
  x: number;
  y: number;
  depth: number;
  // About its upright axis, its nose swinging from down the road (0) round
  // to its right and up the road (π).
  yaw: number;
  // Nose down as it speeds off.
  pitch: number;
  // Leaning into the turn.
  roll: number;
}

const smoothstep = (from: number, to: number, t: number): number => {
  const u = Math.min(1, Math.max(0, (t - from) / (to - from)));
  return u * u * (3 - 2 * u);
};
const bell = (from: number, to: number, t: number): number => Math.sin(Math.PI * Math.min(1, Math.max(0, (t - from) / (to - from))));

// Lightened of the frogs, it pops up, brakes against the traffic and swings
// round to its right, out over the valley side, then sinks a little and
// speeds off up the road there, beside the road and under the camera's
// eye-line, so it stays in view as it goes and never flies over the lanes
// ahead. It veers out far enough that its rotor tips clear the road's edge.
const POP = 1.5;
const SINK = 2.5;
const BRAKE = 1.2;
const VEER = 16.5;
const TURN = { from: 0.3, to: 2.6 };
const ACCELERATION = 4;
const TOP_SPEED = 16;
const CLIMB = 0.1;
const LEAN = 0.3;
const DIVE = 0.18;

// Distance covered `seconds` into steady acceleration from rest, up to a top speed.
function accelerated(seconds: number): number {
  if (seconds <= 0) return 0;
  const reach = TOP_SPEED / ACCELERATION;
  if (seconds <= reach) return (ACCELERATION * seconds ** 2) / 2;
  return (ACCELERATION * reach ** 2) / 2 + TOP_SPEED * (seconds - reach);
}

// The helicopter `time` seconds into the preview, from `startDepth`, its
// deck centred over the road's middle lane line `middle`; `jumpedAt`, when
// the frogs jumped, if they have.
export function heliPose(startDepth: number, middle: number, time: number, jumpedAt: number | null): HeliPose {
  const hover = HELI_DECK_TOP + bob(time);
  if (jumpedAt === null || time <= jumpedAt) {
    return { x: middle, y: hover, depth: cruiseDepth(startDepth, time), yaw: 0, pitch: 0, roll: 0 };
  }
  const s = time - jumpedAt;
  const from = cruiseDepth(startDepth, jumpedAt);
  // Down the road with the traffic, braking to a stop, then off up it.
  const braking = Math.min(s, BRAKE);
  const back = wallSpeed * (braking - braking ** 2 / (2 * BRAKE));
  const ahead = accelerated(s - BRAKE);
  return {
    x: middle + VEER * smoothstep(0.2, 3, s),
    y: hover + POP * smoothstep(0, 0.8, s) - SINK * smoothstep(1.5, 3.5, s) + CLIMB * Math.max(0, s - 3.5),
    depth: from - back + ahead,
    yaw: Math.PI * smoothstep(TURN.from, TURN.to, s),
    pitch: DIVE * smoothstep(BRAKE, BRAKE + 1, s),
    roll: -LEAN * bell(TURN.from, TURN.to + 0.6, s),
  };
}

// The preview's traffic: rows a fixed spacing apart along the road, driving
// at the traffic's speed, laid out so that the frogs aboard hover over a
// gap, and land in the next gap ahead, a reading room short of the row after.
export const ROW_SPACING = 17;
// The first row's front, ahead of the frogs aboard.
export const FIRST_ROW_AHEAD = 9;
// Rows go round: they vanish this far behind the frogs, behind the camera,
// and come back far up the road.
const ROWS_BEHIND = 40;

// How far ahead of the frogs row `index` of `count` is, `time` seconds in,
// with the frogs at `frogDepth` and the helicopter having set off from
// `startDepth`.
export function rowAhead(index: number, count: number, time: number, startDepth: number, frogDepth: number): number {
  const span = count * ROW_SPACING;
  const depth = aboardFrogDepth(startDepth) + FIRST_ROW_AHEAD + index * ROW_SPACING - wallSpeed * time;
  return ((((depth - frogDepth + ROWS_BEHIND) % span) + span) % span) - ROWS_BEHIND;
}
