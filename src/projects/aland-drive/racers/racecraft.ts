import { STEP_S } from "../sim/tuning";
import type { Relative } from "./awareness";

/*
 * Racecraft (`ideas/traffic-and-racers.md`, "Overtaking and defending", and
 * "Races through traffic"): what a racer does about the cars it sees, as the
 * owner decided. It brakes for a car in its path rather than drive through it,
 * passes a slower one on the side with room, braking into a bend on the inside
 * or along a straight, and comes back to its line once clear; being caught, it
 * holds the inside before a bend, once, and never weaves; side by side it
 * leaves a car's width; and with traffic coming the other way it keeps to its
 * own side of the road until that has passed. A car stopped in the road is
 * gone round, slowly, on the verge if the road has no room. Each rule is a
 * pure function of what is seen and where the racer is, giving two numbers the
 * driver takes: the speed to hold under, and how far right of its line to run.
 */

/** The room a racer has to each side of its line, and where the laid middle is: all metres right of the line. */
export interface Room {
  /** How far right the car's middle may move and stay on the carriageway with its margin; below zero where the line is already past it. */
  rightM: number;
  /** How far left, as a positive number. */
  leftM: number;
  /** Where the laid middle stands, right of the line. */
  middleM: number;
  /** Whether the stretch crosses a gap in the laid road, a junction's apron: nothing says what stands beside the line there. */
  bridged: boolean;
}

export interface Craft {
  /** The speed to hold under for the cars ahead, or none. */
  holdUnderMS: number | null;
  /** How far right of the line to run. */
  offsetM: number;
  /** Whether it is holding for a car that stands or crawls in its way: waiting, which is not being stuck. */
  waiting: boolean;
}

/** A pass under way: which side, the car being passed, and whether it goes round a stopped car by the verge. */
export interface Passing {
  id: string;
  side: 1 | -1;
  verge?: boolean;
}

/** A defence under way, or the last one: where along the line it began, and the side held, chosen once so the racer never weaves. */
export interface Defence {
  atM: number;
  side: 1 | -1;
}

export interface CraftState {
  passing: Passing | null;
  defence: Defence | null;
  /** How long the racer has stood behind a stopped car in its way, seconds. */
  stoodS: number;
}

export const freshCraft = (): CraftState => ({ passing: null, defence: null, stoodS: 0 });

/** The gap kept to a car ahead that is under way, and to one stopped, which leaves the room to pull out round it without backing up first; the time kept to one at speed, and the firm braking a racer counts on to close up without a panic stop. */
const GAP_M = 5;
const GAP_STOPPED_M = 8;
const HEADWAY_S = 0.7;
const CLOSING_BRAKE_MS2 = 7;
/** Room kept beside another car, beyond the two half widths; and how far clear of one sideways a racer must stand before it stops holding back for it. */
const BESIDE_M = 0.6;
const CLEAR_BESIDE_M = 0.2;
/** A car this much slower than the plan where it is, this near or nearer than the racer's closing on it makes soon enough, that the racer is closing on this fast, is one to pass: two cars at one pace, nose to tail, are a queue. */
const PASS_SLOWER_MS = 2.5;
const PASS_WITHIN_M = 45;
const PASS_CLOSING_MS = 1;
/** One under way this much slower than the plan is passed by a racer held behind it too, closing or not: traffic at the road's limit, where two racers a little apart in pace are still a queue. */
const HELD_UP_MS = 6;
/**
 * A pass out on the other side of the road takes as long as the racer needs to gain the car's length and its own, at
 * the rate it is closing or the least a racer pulling out gathers, no longer than this and with this to spare: what is
 * coming must be further off than the two of them cover in that time.
 */
const PASS_GATHERS_MS = 4;
const PASS_LONGEST_S = 7;
const PASS_SPARE_S = 1.5;
/** Off the line a racer holds its lane for this far from its place on the grid: every car ahead is slow there, two abreast with no room, and the car creeping up behind one that hasn't moved yet is closing on it. */
const LAUNCH_M = 40;
/** A pass is done once the racer's rear is this far past the other's nose. */
const PASSED_BY_M = 3;
/** A pass begins only with the room to finish it: beside the car all the way to where the racer is clear ahead of it, at the rate it is closing, and no further ahead than this is the road read for it. */
const PASS_ROOM_MOST_M = 300;
/** A pass under way is called off where the road ahead is this much short of the room beside the car, while the racer is still behind it. */
const PASS_SHORT_M = 0.5;
/** A car slower than this is stopped: it is gone round by a racer closing on it, or by one that has stood behind it this long, since one that has only just stopped may be about to move off; by this much of the verge where the road has no room, and by the verge no faster than this. */
const STOPPED_MS = 1.5;
const STOOD_S = 2;
/** The verge is taken only round a car that has stayed stopped this long: one waiting at a junction, or for a car coming the other way on a narrow road, moves off sooner. */
const VERGE_AFTER_S = 8;
/** Behind a stopped car with no way round, a racer queues this long before it counts itself stuck. */
const QUEUE_PATIENCE_S = 20;
const VERGE_M = 2.4;
const ROUND_STOPPED_MS = 8;
/** Behind a stopped car it means to go round, a racer creeps at this while the gap is more than this, swinging out as it comes. */
const CREEP_MS = 3;
const CREEP_GAP_M = 1.5;
/** Holding under this for a car in the way is waiting behind it. */
const WAITING_MS = 2;
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
/** A defence moves this far to the bend's inside, or as far as the room there: enough to take the line from the car behind, and not the whole road's width, which on a left-hand bend is the other side of the road. */
const DEFEND_M = 1.5;
/**
 * Traffic coming the other way is kept clear of, by staying right of the middle, from this far off or this long before
 * the two meet, whichever is further: at a race's pace on a main road they close at 90 m/s.
 */
const ONCOMING_WITHIN_M = 160;
const ONCOMING_AHEAD_S = 4;
const ONCOMING_ROOM_M = 0.8;
/** A car is coming the other way once it moves against the racer's line faster than this: one standing, whichever way it faces, is something in the road. */
const ONCOMING_MS = 0.5;
/** Past an oncoming car with less than the room it likes beside it, a racer goes no faster than this; and it has stood for one with no way by this long before that counts as being stuck. */
const MEET_MS = 14;
const MEET_PATIENCE_S = 6;
/** A racer moves out to pass this long before it would reach the car, at the rate it is closing: at speed that is far more than a few lengths. */
const PASS_AHEAD_S = 3;

/** Whether a car stands in the racer's path at an offset, allowing both their widths and the room kept beside. */
const inPath = (other: Relative, offsetM: number, halfWidthM: number) => Math.abs(other.lateralM - offsetM) < other.car.halfWidthM + halfWidthM + BESIDE_M;

/** Whether a car stands in the racer's way where the racer is now, sideways: until it is clear of it, it holds back for it. */
const inWay = (other: Relative, lateralM: number, halfWidthM: number) => Math.abs(other.lateralM - lateralM) < other.car.halfWidthM + halfWidthM + CLEAR_BESIDE_M;

const clampTo = (value: number, room: Room) => Math.max(-room.leftM, Math.min(room.rightM, value));

/**
 * The craft for this step: `me` is the racer's speed, where it stands right of its line, how far it has come from its
 * place on the grid and its half sizes, `plannedAt`
 * the plan's speed a distance ahead of it, `bendAhead` the signed curvature of the sharpest bend within reach
 * (positive turning right, 0 for none), `offsetM` where it means to run now, `room` the least room to each side over
 * the stretch ahead, and `roomTo` the least over any distance ahead. Returns the speed to hold under, the offset to run
 * at, and the state carried to the next step.
 */
export function craft(
  me: { speedMS: number; lateralM: number; offGridM: number; halfWidthM: number; halfLengthM: number },
  plannedAt: (aheadM: number) => number,
  bendAhead: number,
  offsetM: number,
  room: Room,
  roomTo: (aheadM: number) => Room,
  around: readonly Relative[],
  state: CraftState,
  alongM: number,
): Craft & { state: CraftState } {
  let holdUnderMS: number | null = null;
  let target = 0;
  let passing = state.passing;
  let { defence } = state;
  const verge: Room = { ...room, rightM: room.rightM + VERGE_M, leftM: room.leftM + VERGE_M };
  // What is coming the other way soon, on the carriageway or over its edge: a walker or a cyclist on a path beside the road is no one to meet.
  const coming = (other: Relative) => !other.sameWay && other.speedAlongMS < -ONCOMING_MS;
  const onCarriageway = (other: Relative) => other.lateralM > -(room.leftM + me.halfWidthM + other.car.halfWidthM) && other.lateralM < room.rightM + me.halfWidthM + other.car.halfWidthM;
  const meeting = (other: Relative) => coming(other) && onCarriageway(other) && other.alongM < Math.max(ONCOMING_WITHIN_M, (me.speedMS - other.speedAlongMS) * ONCOMING_AHEAD_S);

  // A pass under way: hold the side until clear of the car, then come back.
  if (passing) {
    const other = around.find(({ car }) => car.id === passing?.id);
    const clear = !other || other.alongM < -(me.halfLengthM + other.car.halfLengthM + PASSED_BY_M);
    if (clear) passing = null;
    // Out on the left with something coming the other way, and still behind the car: the pass is off.
    else if (passing.side === -1 && other.alongM > me.halfLengthM + other.car.halfLengthM && around.some((each) => meeting(each) && each.alongM > 0 && each.lateralM < other.lateralM)) passing = null;
    else {
      target = other.lateralM + passing.side * (other.car.halfWidthM + me.halfWidthM + BESIDE_M);
      // Still behind it, with the road ahead short of the room beside it: the pass is off, and the racer drops back behind.
      const within = passing.verge ? verge : room;
      const short = passing.side === 1 ? target - within.rightM : -within.leftM - target;
      if (short > PASS_SHORT_M && other.alongM > me.halfLengthM + other.car.halfLengthM) {
        passing = null;
        target = 0;
      }
    }
  }

  // Oncoming traffic within reach: keep right of the middle, and of it, until it has passed. One on the racer's own side and to its right, a walker at the road's edge, is left there instead, where the road has the room.
  const besideM = (other: Relative) => other.car.halfWidthM + me.halfWidthM + ONCOMING_ROOM_M;
  const leftOnRight = (other: Relative) => other.lateralM > room.middleM && other.lateralM > target && other.lateralM - besideM(other) >= -room.leftM;
  const oncoming = around.filter((other) => meeting(other) && other.alongM > -me.halfLengthM && !leftOnRight(other));
  const onRight = around.filter((other) => meeting(other) && other.alongM > -me.halfLengthM && leftOnRight(other));
  const keepRightOf = oncoming.length === 0 ? null : Math.max(room.middleM + me.halfWidthM + ONCOMING_ROOM_M, ...oncoming.map((other) => other.lateralM + besideM(other)));
  const keepLeftOf = onRight.length === 0 ? null : Math.min(...onRight.map((other) => other.lateralM - besideM(other)));
  if (keepRightOf !== null && !passing) target = Math.max(target, keepRightOf);
  if (keepLeftOf !== null) target = Math.min(target, keepLeftOf);

  // Meeting one where the road hasn't the room for both at speed: slower past it with little room, by the verge and slower still with none, and stopped as far over as it goes where even that leaves no way by.
  let meetUnderMS: number | null = null;
  let meetOnVerge = false;
  for (const other of oncoming) {
    const need = other.car.halfWidthM + me.halfWidthM;
    const onRoad = clampTo(target, room) - other.lateralM - need;
    if (onRoad >= BESIDE_M) continue;
    // How far the racer goes before the two meet, each closing the gap at its own speed, and the speed that lets a firm brake bring it down to a pace by then.
    const gapM = other.alongM - other.car.halfLengthM - me.halfLengthM;
    const mineM = (gapM * me.speedMS) / Math.max(me.speedMS - other.speedAlongMS, 1);
    const paceTo = (meetMS: number) => Math.sqrt(meetMS * meetMS + 2 * CLOSING_BRAKE_MS2 * Math.max(0, mineM - GAP_M));
    if (onRoad >= CLEAR_BESIDE_M) {
      meetUnderMS = Math.min(meetUnderMS ?? Infinity, paceTo(MEET_MS));
      continue;
    }
    const besideIt = other.lateralM + need + CLEAR_BESIDE_M;
    target = Math.max(target, Math.min(verge.rightM, besideIt));
    meetOnVerge = true;
    meetUnderMS = Math.min(meetUnderMS ?? Infinity, paceTo(besideIt <= verge.rightM ? ROUND_STOPPED_MS : 0));
  }

  // The nearest car ahead that is in the way, where the racer stands or where it means to run: hold a gap to it, and pass it if it's slow and there's room.
  const pathM = passing ? target : offsetM;
  const inWayNow = (other: Relative) => inWay(other, me.lateralM, me.halfWidthM) || inPath(other, pathM, me.halfWidthM);
  // In the way now, or in the path by the time the racer reaches it: a car in a lane the line crosses further on.
  const ahead = around.filter((other) => other.alongM > 0 && !coming(other) && (inWayNow(other) || inPath({ ...other, lateralM: other.meetLateralM }, pathM, me.halfWidthM)));
  let waiting = false;
  let stoodS = 0;
  if (meetUnderMS !== null && meetUnderMS < WAITING_MS && me.speedMS < STOPPED_MS) stoodS = state.stoodS + STEP_S;
  if (ahead.length > 0) {
    const nearest = ahead[0];
    const gapM = nearest.alongM - nearest.car.halfLengthM - me.halfLengthM;
    const theirs = nearest.sameWay ? Math.max(0, nearest.speedAlongMS) : 0;
    // Fast enough to keep the headway, and no faster than lets a firm brake bring it down to theirs by the gap.
    const stopped = theirs < STOPPED_MS;
    const keepM = stopped ? GAP_STOPPED_M : GAP_M;
    const hold = gapM <= keepM ? theirs - 1 : Math.min(theirs + (gapM - keepM) / HEADWAY_S, Math.sqrt(theirs * theirs + 2 * CLOSING_BRAKE_MS2 * (gapM - keepM)));
    holdUnderMS = Math.max(0, hold);
    if (stopped && me.speedMS < STOPPED_MS) stoodS = state.stoodS + STEP_S;
    const stood = stoodS > STOOD_S;
    const closingMS = me.speedMS - theirs;
    const slowerMS = plannedAt(nearest.alongM) - theirs;
    // A pass begins with none under way, or with one that has come to a stand behind some other car stopped in its way: that car is the one to go round now.
    if ((!passing || (stood && passing.id !== nearest.car.id)) && gapM < Math.max(PASS_WITHIN_M, closingMS * PASS_AHEAD_S) && slowerMS > PASS_SLOWER_MS && (stood || (me.offGridM > LAUNCH_M && (closingMS > PASS_CLOSING_MS || (!stopped && slowerMS > HELD_UP_MS))))) {
      const width = nearest.car.halfWidthM + me.halfWidthM + BESIDE_M;
      // Beside where it is, or where it will be if it is only crossing into the path.
      const standsM = inWayNow(nearest) ? nearest.lateralM : nearest.meetLateralM;
      const rightAt = standsM + width;
      const leftAt = standsM - width;
      // Into a bend, pass on the inside; otherwise on the side with more room; never into oncoming traffic's side.
      const inside: 1 | -1 | 0 = Math.abs(bendAhead) > DEFEND_BEND ? (bendAhead > 0 ? 1 : -1) : 0;
      // The road it will be beside the car on: from here to where it is clear ahead of it, at the rate it is closing.
      const toGainM = gapM + 2 * (me.halfLengthM + nearest.car.halfLengthM) + PASSED_BY_M;
      const passS = Math.min(PASS_LONGEST_S, toGainM / Math.max(closingMS, PASS_GATHERS_MS)) + PASS_SPARE_S;
      const met = around.some((each) => coming(each) && onCarriageway(each) && each.alongM > 0 && each.alongM < (me.speedMS - each.speedAlongMS) * passS && each.lateralM + besideM(each) > leftAt);
      // A side is a way by only if whatever else runs or stands in it is faster than this car, or will leave the racer a place to come back into ahead of this car once it is by.
      const open = (lateralM: number) =>
        around.every((each) => {
          if (each === nearest || each.alongM <= 0 || coming(each) || !inPath(each, lateralM, me.halfWidthM)) return true;
          const its = each.sameWay ? Math.max(0, each.speedAlongMS) : 0;
          const place = 2 * me.halfLengthM + nearest.car.halfLengthM + each.car.halfLengthM + (stopped ? CREEP_GAP_M : PASSED_BY_M + GAP_M);
          return its > theirs + PASS_SLOWER_MS || each.alongM - nearest.alongM + (its - theirs) * passS > place;
        });
      const leftAllowed = (keepRightOf === null || leftAt >= keepRightOf) && !met && open(leftAt);
      const rightAllowed = (keepLeftOf === null || rightAt <= keepLeftOf) && open(rightAt);
      const whole = roomTo(Math.min(PASS_ROOM_MOST_M, Math.max(toGainM, (me.speedMS * toGainM) / Math.max(PASS_CLOSING_MS, me.speedMS - theirs))));
      const sideWith = (within: Room): 1 | -1 | null => {
        const rightRoom = within.rightM - rightAt;
        const leftRoom = leftAt + within.leftM;
        if (inside === 1 && rightRoom >= 0 && rightAllowed) return 1;
        if (inside === -1 && leftRoom >= 0 && leftAllowed) return -1;
        if (rightRoom >= 0 && rightAllowed && (rightRoom >= leftRoom || !leftAllowed)) return 1;
        if (leftRoom >= 0 && leftAllowed) return -1;
        return null;
      };
      const onRoad = sideWith(whole);
      // A stopped car with no room beside it on the road is gone round by the verge, but not over a junction's apron, where one stopped is waiting its turn and the verge may be an island.
      const side = onRoad ?? (stopped && !whole.bridged && stoodS > VERGE_AFTER_S ? sideWith({ ...whole, rightM: whole.rightM + VERGE_M, leftM: whole.leftM + VERGE_M }) : null);
      if (side !== null) {
        passing = { id: nearest.car.id, side, verge: onRoad === null };
        target = side === 1 ? rightAt : leftAt;
      }
    }
    // Behind a stopped car it is going round, it creeps out from behind it rather than stand there, while there is still a gap to creep in.
    if (passing?.id === nearest.car.id && stopped && gapM > CREEP_GAP_M) holdUnderMS = Math.max(holdUnderMS, CREEP_MS);
    // Held behind a car that moves, or stopped behind one with no way round as traffic queues at a junction, is waiting, and so is a pass held up by some other car in its way; behind one that stays stopped for longer than a queue does, the racer is stuck as it would be at a wall.
    waiting = holdUnderMS < WAITING_MS && passing?.id !== nearest.car.id && stoodS <= QUEUE_PATIENCE_S;
  }
  // Past a stopped car by the verge, no faster than a careful driver would be.
  if (passing?.verge) holdUnderMS = Math.min(holdUnderMS ?? Infinity, ROUND_STOPPED_MS);
  if (meetUnderMS !== null) {
    holdUnderMS = Math.min(holdUnderMS ?? Infinity, meetUnderMS);
    // Stopped for one coming with no way by is waiting for it, for a while: after that the racer is stuck, and sees to itself.
    if (meetUnderMS < WAITING_MS && stoodS <= MEET_PATIENCE_S) waiting = true;
  }

  // Caught from behind before a bend: move to that bend's inside once, and hold that side through it.
  if (!passing) {
    const threat = me.speedMS >= DEFEND_LEAST_MS && Math.abs(bendAhead) > DEFEND_BEND && around.some((other) => other.sameWay && other.alongM < 0 && other.alongM > -THREAT_BEHIND_M && other.speedAlongMS - me.speedMS > THREAT_CLOSING_MS && other.speedAlongMS - me.speedMS < THREAT_CLOSING_MOST_MS);
    if (threat && (defence === null || alongM - defence.atM > DEFENCE_APART_M)) defence = { atM: alongM, side: bendAhead > 0 ? 1 : -1 };
    if (defence !== null && alongM - defence.atM <= BEND_AHEAD_M) target = defence.side === 1 ? Math.min(room.rightM, DEFEND_M) : -Math.min(room.leftM, DEFEND_M);
  }

  // Side by side, a car's width: shift away from whoever is alongside, within the room.
  for (const other of around) {
    const alongside = Math.abs(other.alongM) < other.car.halfLengthM + me.halfLengthM;
    if (!alongside) continue;
    const need = other.car.halfWidthM + me.halfWidthM + BESIDE_M;
    const gap = other.lateralM - target;
    if (Math.abs(gap) < need) target = gap >= 0 ? other.lateralM - need : other.lateralM + need;
  }
  // Whatever else it is about, it stays on its own side while something is coming the other way.
  if (keepRightOf !== null && !passing) target = Math.max(target, keepRightOf);
  if (keepLeftOf !== null) target = Math.min(target, keepLeftOf);

  return { holdUnderMS, offsetM: clampTo(target, passing?.verge || meetOnVerge ? verge : room), waiting, state: { passing, defence, stoodS } };
}
