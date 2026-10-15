import { FROG_THICKNESS } from "../run";
import { TUNING } from "../tuning";
import { HEADROOM, VEHICLE_TOP } from "../world/structures";
import { DECK_THICKNESS } from "./model";

// The Lily Lifter's part in a run, as pure functions of the rules' clock, in
// seconds: cruising down the road with the traffic while the team lines up
// aboard, and, lightened once the team has jumped out, swinging round and
// flying off up the road. Depths run forward along the course, as the rules
// count them, and heights up from the road, in the scene's units.
//
// The rules hold the team and the rows still until the jump out (see
// `run.ts`): the helicopter keeps pace with the traffic, so relative to the
// team only the road beneath moves. So the drawing scrolls the road and its
// scenery under the cruising helicopter, and stops it at the jump, from when
// the course's frame is the road's.

const { wallSpeed } = TUNING;

// It bobs gently on the air, this much each way.
export const BOB = 0.12;
const BOB_PERIOD = 2.4;

// The deck's top: as low as it can fly, the tallest vehicle clearing its
// underside, with the finish gantry's headroom, at the bottom of its bob.
export const HELI_DECK_TOP = VEHICLE_TOP + HEADROOM + DECK_THICKNESS + BOB;

export function bob(time: number): number {
  return BOB * Math.sin((2 * Math.PI * time) / BOB_PERIOD);
}

// Where the deck's middle is along the course while the team is aboard, at
// the course's start: the frogs, a cell deep, stand in the middle of it, their
// front faces on the start.
export const DECK_CENTRE = -FROG_THICKNESS / 2;

// How far the road has gone by beneath the helicopter, `time` seconds into
// the run, the team having jumped out at `jumpedAt` if it has: the road is
// drawn this far up the course from where it lies. It stops at the jump.
export function roadCruise(time: number, jumpedAt: number | null): number {
  return wallSpeed * Math.min(time, jumpedAt ?? time);
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

// The helicopter `time` seconds into the run, its deck centred over the
// road's middle lane line `middle`; `jumpedAt`, when the team jumped out, if
// it has. Aboard, it holds still over the start in the course's frame, which
// is cruising with the traffic; after the jump the course's frame is the
// road's, so it carries on with the traffic, brakes, and flies off.
export function heliPose(middle: number, time: number, jumpedAt: number | null): HeliPose {
  const hover = HELI_DECK_TOP + bob(time);
  if (jumpedAt === null || time <= jumpedAt) {
    return { x: middle, y: hover, depth: DECK_CENTRE, yaw: 0, pitch: 0, roll: 0 };
  }
  const s = time - jumpedAt;
  // Down the road with the traffic, braking to a stop, then off up it.
  const braking = Math.min(s, BRAKE);
  const back = wallSpeed * (braking - braking ** 2 / (2 * BRAKE));
  const ahead = accelerated(s - BRAKE);
  return {
    x: middle + VEER * smoothstep(0.2, 3, s),
    y: hover + POP * smoothstep(0, 0.8, s) - SINK * smoothstep(1.5, 3.5, s) + CLIMB * Math.max(0, s - 3.5),
    depth: DECK_CENTRE - back + ahead,
    yaw: Math.PI * smoothstep(TURN.from, TURN.to, s),
    pitch: DIVE * smoothstep(BRAKE, BRAKE + 1, s),
    roll: -LEAN * bell(TURN.from, TURN.to + 0.6, s),
  };
}
