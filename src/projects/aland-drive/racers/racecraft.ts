import type { Relative } from "./awareness";

/*
 * Racecraft (`ideas/traffic-and-racers.md`, "Overtaking and defending", and
 * "Races through traffic"): what a racer does about the cars it sees, as the
 * owner decided. It brakes for a car in its path rather than drive through it,
 * passes a slower one on the side with room, braking into a bend on the inside
 * or along a straight, and comes back to its line once clear; being caught, it
 * holds the inside before a bend, once, and never weaves; side by side it
 * leaves a car's width; and with traffic coming the other way it keeps to its
 * own side of the road until that has passed. Each rule is a pure function of
 * what is seen and where the racer is, giving two numbers the driver takes:
 * the speed to hold under, and how far right of its line to run.
 */

/** The room a racer has to each side of its line, and where the laid middle is: all metres right of the line. */
export interface Room {
  /** How far right the car's middle may move and stay on the carriageway with its margin; below zero where the line is already past it. */
  rightM: number;
  /** How far left, as a positive number. */
  leftM: number;
  /** Where the laid middle stands, right of the line. */
  middleM: number;
}

export interface Craft {
  /** The speed to hold under for the cars ahead, or none. */
  holdUnderMS: number | null;
  /** How far right of the line to run. */
  offsetM: number;
}

/** A pass under way: which side, and the car being passed. */
export interface Passing {
  id: string;
  side: 1 | -1;
}

/** A defence under way, or the last one: where along the line it began, and the side held, chosen once so the racer never weaves. */
export interface Defence {
  atM: number;
  side: 1 | -1;
}

export interface CraftState {
  passing: Passing | null;
  defence: Defence | null;
}

export const freshCraft = (): CraftState => ({ passing: null, defence: null });

/** The gap kept to a car ahead at a standstill, the time kept to one at speed, and the firm braking a racer counts on to close up without a panic stop. */
const GAP_M = 5;
const HEADWAY_S = 0.7;
const CLOSING_BRAKE_MS2 = 7;
/** Room kept beside another car, beyond the two half widths. */
const BESIDE_M = 0.6;
/** A car this much slower than the plan where it is, this near, that the racer is closing on this fast, is one to pass: at a standing start everyone ahead is slow, and none is in the way. */
const PASS_SLOWER_MS = 2.5;
const PASS_WITHIN_M = 45;
const PASS_CLOSING_MS = 1;
/** A pass is done once the racer's rear is this far past the other's nose. */
const PASSED_BY_M = 3;
/** A car behind this near and closing is a threat worth a move to the inside before a bend this far ahead. */
const THREAT_BEHIND_M = 18;
const THREAT_CLOSING_MS = 0.5;
/** One closing faster than this is past already, and one is through with it; and a racer under this speed, stopped or recovering, has nothing to defend. */
const THREAT_CLOSING_MOST_MS = 6;
const DEFEND_LEAST_MS = 10;
const BEND_AHEAD_M = 120;
/** A bend sharper than this is one worth defending. */
const DEFEND_BEND = 1 / 150;
/** One defence per stretch this long. */
const DEFENCE_APART_M = 200;
/** Traffic coming the other way within this is kept clear of, by staying right of the middle. */
const ONCOMING_WITHIN_M = 160;
const ONCOMING_ROOM_M = 0.8;

/** Whether a car stands in the racer's path at an offset, allowing both their widths and the room kept beside. */
const inPath = (other: Relative, offsetM: number, halfWidthM: number) => Math.abs(other.lateralM - offsetM) < other.car.halfWidthM + halfWidthM + BESIDE_M;

const clampTo = (value: number, room: Room) => Math.max(-room.leftM, Math.min(room.rightM, value));

/**
 * The craft for this step: `me` is the racer's speed and half sizes, `plannedAt` the plan's speed a distance ahead of
 * it, `bendAhead` the signed curvature of the sharpest bend within reach (positive turning right, 0 for none), `offsetM`
 * where it runs now. Returns the speed to hold under, the offset to run at, and the state carried to the next step.
 */
export function craft(
  me: { speedMS: number; halfWidthM: number; halfLengthM: number },
  plannedAt: (aheadM: number) => number,
  bendAhead: number,
  offsetM: number,
  room: Room,
  around: readonly Relative[],
  state: CraftState,
  alongM: number,
): Craft & { state: CraftState } {
  let holdUnderMS: number | null = null;
  let target = 0;
  let passing = state.passing;
  let { defence } = state;

  // A pass under way: hold the side until clear of the car, then come back.
  if (passing) {
    const other = around.find(({ car }) => car.id === passing?.id);
    const clear = !other || other.alongM < -(me.halfLengthM + other.car.halfLengthM + PASSED_BY_M);
    if (clear) passing = null;
    else target = other.lateralM + passing.side * (other.car.halfWidthM + me.halfWidthM + BESIDE_M);
  }

  // Oncoming traffic within reach: keep right of the middle until it has passed.
  const oncoming = around.filter((other) => !other.sameWay && other.alongM > -me.halfLengthM && other.alongM < ONCOMING_WITHIN_M && other.speedAlongMS < 0);
  const keepRightOf = oncoming.length === 0 ? null : Math.max(room.middleM + me.halfWidthM + ONCOMING_ROOM_M, ...oncoming.map((other) => other.lateralM + other.car.halfWidthM + me.halfWidthM + ONCOMING_ROOM_M));
  if (keepRightOf !== null && !passing) target = Math.max(target, keepRightOf);

  // The nearest car ahead in the path: hold a gap to it, and pass it if it's slow and there's room.
  const ahead = around.filter((other) => other.alongM > 0 && other.alongM - other.car.halfLengthM - me.halfLengthM < PASS_WITHIN_M * 2 && inPath(other, passing ? target : offsetM, me.halfWidthM));
  if (ahead.length > 0) {
    const nearest = ahead[0];
    const gapM = nearest.alongM - nearest.car.halfLengthM - me.halfLengthM;
    const theirs = nearest.sameWay ? Math.max(0, nearest.speedAlongMS) : 0;
    // Fast enough to keep the headway, and no faster than lets a firm brake bring it down to theirs by the gap.
    const hold = gapM <= GAP_M ? theirs - 1 : Math.min(theirs + (gapM - GAP_M) / HEADWAY_S, Math.sqrt(theirs * theirs + 2 * CLOSING_BRAKE_MS2 * (gapM - GAP_M)));
    holdUnderMS = Math.max(0, hold);
    if (!passing && gapM < PASS_WITHIN_M && theirs < plannedAt(nearest.alongM) - PASS_SLOWER_MS && me.speedMS - theirs > PASS_CLOSING_MS) {
      const width = nearest.car.halfWidthM + me.halfWidthM + BESIDE_M;
      const rightAt = nearest.lateralM + width;
      const leftAt = nearest.lateralM - width;
      const rightRoom = room.rightM - rightAt;
      const leftRoom = leftAt + room.leftM;
      // Into a bend, pass on the inside; otherwise on the side with more room; never into oncoming traffic's side.
      const inside: 1 | -1 | 0 = Math.abs(bendAhead) > DEFEND_BEND ? (bendAhead > 0 ? 1 : -1) : 0;
      const leftAllowed = keepRightOf === null || leftAt >= keepRightOf;
      let side: 1 | -1 | null = null;
      if (inside === 1 && rightRoom >= 0) side = 1;
      else if (inside === -1 && leftRoom >= 0 && leftAllowed) side = -1;
      else if (rightRoom >= 0 && (rightRoom >= leftRoom || !leftAllowed)) side = 1;
      else if (leftRoom >= 0 && leftAllowed) side = -1;
      if (side !== null) {
        passing = { id: nearest.car.id, side };
        target = side === 1 ? rightAt : leftAt;
        holdUnderMS = null;
      }
    }
  }

  // Caught from behind before a bend: move to that bend's inside once, and hold that side through it.
  if (!passing) {
    const threat = me.speedMS >= DEFEND_LEAST_MS && Math.abs(bendAhead) > DEFEND_BEND && around.some((other) => other.sameWay && other.alongM < 0 && other.alongM > -THREAT_BEHIND_M && other.speedAlongMS - me.speedMS > THREAT_CLOSING_MS && other.speedAlongMS - me.speedMS < THREAT_CLOSING_MOST_MS);
    if (threat && (defence === null || alongM - defence.atM > DEFENCE_APART_M)) defence = { atM: alongM, side: bendAhead > 0 ? 1 : -1 };
    if (defence !== null && alongM - defence.atM <= BEND_AHEAD_M) target = defence.side === 1 ? room.rightM : -room.leftM;
  }

  // Side by side, a car's width: shift away from whoever is alongside, within the room.
  for (const other of around) {
    const alongside = Math.abs(other.alongM) < other.car.halfLengthM + me.halfLengthM;
    if (!alongside) continue;
    const need = other.car.halfWidthM + me.halfWidthM + BESIDE_M;
    const gap = other.lateralM - target;
    if (Math.abs(gap) < need) target = gap >= 0 ? other.lateralM - need : other.lateralM + need;
  }

  return { holdUnderMS, offsetM: clampTo(target, room), state: { passing, defence } };
}
