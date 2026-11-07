import { blendCarStates, type CarState, type Rotation, type Vector3 } from "./car-state";
import { CARS } from "./cars";

/*
 * Where another player's car is, played out a little behind real time from the states its client sent. Each state
 * carries when its client stepped it, on that client's own clock, so it is placed on a timeline by when it happened
 * and not by when it arrived: a message held up on the way, or bunched with others behind a stalled connection, is
 * as smooth as one on time. The car is shown at a playout time a lag behind this player's clock, the lag being how
 * far behind most messages arrive (a share of the last two hundred, which also learns the two clocks' difference; one
 * held up only by queueing behind a stalled one isn't counted, so a long stall is one late message, not a crowd),
 * plus half a send's gap. Between two states the car follows the curve their positions and velocities make (cubic
 * Hermite), so a car through a bend draws a bend, not a polygon. Past the newest state, for the second half of a gap
 * or when a message is later than most, it carries on by its own motion, for a while. `tools/remote-twitch.ts`
 * measured the choices: a whole gap's wait halves the little twitch left on a clean connection but adds 25 ms, and
 * none doubles it; waiting for more than four messages in five to cover a lost packet's stall would add its 200 ms
 * or more to every car's lag, all the time, for the few frames it carries on.
 *
 * The lag moves slowly towards what the messages say, so the car never visibly speeds up or slows down for it; a jump
 * of more than a second (a sleeping laptop) puts it straight there.
 *
 * A state heard with no time is the car as it is now, from this player's own simulation (a computer-driven car run
 * here, traffic) or from a version of the game that sends none: the timeline holds only that state and carries it on
 * from when it was heard, with no lag.
 */

/** When a state was stepped on the clock of the client that sent it, when it was heard here, and whose clock that was. */
export interface Heard {
  sentMs: number;
  heardMs: number;
  source: string;
}

/** A state carries on by its own motion this long at most, past a lost packet's stall over the Atlantic: past it the car has stopped sending (a paused map, a hidden tab). */
export const CARRY_ON_MS = 500;
/** How many of the last messages' delays the lag is read from: about ten seconds at 20 a second. */
const DELAYS_KEPT = 200;
/** The share of them the lag waits for: the rest, a lost packet's stall among them, are covered by carrying on. */
const LAG_QUANTILE = 0.8;
/** Until gaps have been heard. */
const FIRST_GAP_MS = 50;
const GAPS_KEPT = 20;
/** How fast the lag moves, ms a ms: up faster than down, since a lag too short costs more than one too long. */
const LAG_RISES = 0.02;
const LAG_FALLS = 0.01;
/** A lag this far from what the messages say is put there at once. */
const LAG_JUMPS_MS = 1000;
/**
 * A message this much earlier than the lag says can only be a clock that moved: the timeline starts again. Later than
 * that is a stall too, which bunches the messages behind it with less and less delay, so it takes this many in a row,
 * half a second's, to say the clock moved (a laptop that slept) rather than the connection stalled.
 */
const CLOCK_MOVED_MS = 1000;
const LATE_IN_A_ROW = 10;
/** Two states further apart than this are not one movement: the car waits at the first, then is at the second. */
const LONGEST_GAP_MS = 300;
/** A second state this far from where the first's motion takes it is the car put somewhere, not driven there. */
const PUT_M = 4;
const MOST_KEPT = 64;

const add = (a: Vector3, b: Vector3, by = 1): Vector3 => [a[0] + b[0] * by, a[1] + b[1] * by, a[2] + b[2] * by];
const lerp = (a: number, b: number, share: number) => a + (b - a) * share;

function normalised(q: Rotation): Rotation {
  const length = Math.hypot(...q);
  return [q[0] / length, q[1] / length, q[2] / length, q[3] / length];
}

/** A rotation turned on by a world-frame spin for a time. */
function turned([x, y, z, w]: Rotation, [sx, sy, sz]: Vector3, seconds: number): Rotation {
  const half = seconds / 2;
  return normalised([
    x + half * (sx * w + sy * z - sz * y),
    y + half * (sy * w + sz * x - sx * z),
    z + half * (sz * w + sx * y - sy * x),
    w - half * (sx * x + sy * y + sz * z),
  ]);
}

const cross = (a: Vector3, b: Vector3): Vector3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vector3, b: Vector3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Where a velocity turning at a spin takes a car in a time, and the velocity it has then: an arc, as a car in a steady bend drives. */
function arc(velocity: Vector3, spin: Vector3, seconds: number): { moved: Vector3; velocity: Vector3 } {
  const rate = Math.hypot(...spin);
  if (rate * seconds < 1e-6) return { moved: add([0, 0, 0], velocity, seconds), velocity };
  const axis: Vector3 = [spin[0] / rate, spin[1] / rate, spin[2] / rate];
  const angle = rate * seconds;
  const across = cross(axis, velocity);
  const along = add([0, 0, 0], axis, dot(axis, velocity));
  const flat = add(velocity, along, -1);
  return {
    moved: add(add(add([0, 0, 0], flat, Math.sin(angle) / rate), across, (1 - Math.cos(angle)) / rate), along, seconds),
    velocity: add(add(add([0, 0, 0], flat, Math.cos(angle)), across, Math.sin(angle)), along),
  };
}

/** Where a car is some time after a state, by its own motion: its velocity turning with it, so a car in a bend carries on round it. */
export function carriedOn(state: CarState, seconds: number): CarState {
  const [x, y, z, w] = state.rotation;
  // The nose is -z in the car's frame.
  const nose: Vector3 = [-2 * (x * z + w * y), -2 * (y * z - w * x), -(1 - 2 * (x * x + y * y))];
  const forward = state.velocity[0] * nose[0] + state.velocity[1] * nose[1] + state.velocity[2] * nose[2];
  const { moved, velocity } = arc(state.velocity, state.spin, seconds);
  return {
    ...state,
    position: add(state.position, moved),
    velocity,
    rotation: turned(state.rotation, state.spin, seconds),
    roll: state.roll.map((turned) => turned + (forward / CARS[state.car].car.wheelRadiusM) * seconds) as CarState["roll"],
  };
}

/** A share of the way between two states a time apart, along the curve of their positions and velocities. */
function between(from: CarState, to: CarState, seconds: number, share: number): CarState {
  const s2 = share * share;
  const s3 = s2 * share;
  const [h00, h10, h01, h11] = [2 * s3 - 3 * s2 + 1, s3 - 2 * s2 + share, -2 * s3 + 3 * s2, s3 - s2];
  const [d00, d10, d01, d11] = [6 * s2 - 6 * share, 3 * s2 - 4 * share + 1, -6 * s2 + 6 * share, 3 * s2 - 2 * share];
  const curve = (axis: number) => h00 * from.position[axis] + h10 * seconds * from.velocity[axis] + h01 * to.position[axis] + h11 * seconds * to.velocity[axis];
  const slope = (axis: number) => (d00 * from.position[axis] + d01 * to.position[axis]) / seconds + d10 * from.velocity[axis] + d11 * to.velocity[axis];
  return {
    ...blendCarStates(from, to, share),
    position: [curve(0), curve(1), curve(2)],
    velocity: [slope(0), slope(1), slope(2)],
    spin: [lerp(from.spin[0], to.spin[0], share), lerp(from.spin[1], to.spin[1], share), lerp(from.spin[2], to.spin[2], share)],
    car: from.car,
    lamps: from.lamps,
  };
}

/** Whether the second of two states follows from the first by driving. */
function driven(from: CarState, to: CarState, seconds: number): boolean {
  if (seconds > LONGEST_GAP_MS / 1000) return false;
  const expected = add(add(from.position, from.velocity, seconds / 2), to.velocity, seconds / 2);
  return Math.hypot(expected[0] - to.position[0], expected[1] - to.position[1], expected[2] - to.position[2]) <= PUT_M;
}

function quantile(values: readonly number[], share: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))];
}

export class Timeline {
  /** By when each was stepped, on the sender's clock, oldest first. */
  private states: { atMs: number; state: CarState }[] = [];
  private delays: number[] = [];
  private gaps: number[] = [];
  private source: string | null = null;
  /** Messages in a row far later than the lag says. */
  private lateInARow = 0;
  /** The last message heard, sent after every one before it. */
  private last: Heard | null = null;
  /** How far behind this player's clock the car is shown, on the sender's; null until the first sample. */
  private lagMs: number | null = null;
  private sampledMs: number | null = null;

  /** A state, with when it was sent and heard, or with nothing for the car as it is at `nowMs`. */
  hear(state: CarState, nowMs: number, heard?: Heard): void {
    if (!heard) {
      this.reset(null);
      this.states = [{ atMs: nowMs, state }];
      this.lagMs = 0;
      return;
    }
    const delay = heard.heardMs - heard.sentMs;
    // One that came hard on the last's heels was held behind it, and says nothing of its own about the connection.
    const heldBack = this.last !== null && heard.sentMs > this.last.sentMs && heard.heardMs - this.last.heardMs < (heard.sentMs - this.last.sentMs) / 2;
    const off = this.delays.length > 0 && !heldBack ? delay - this.targetLag() : 0;
    this.lateInARow = off > CLOCK_MOVED_MS ? this.lateInARow + 1 : 0;
    if (heard.source !== this.source || off < -CLOCK_MOVED_MS || this.lateInARow >= LATE_IN_A_ROW) this.reset(heard.source);
    if (this.last === null || heard.sentMs > this.last.sentMs) this.last = heard;
    if (this.states.some(({ atMs }) => atMs === heard.sentMs)) return;
    if (!heldBack || this.delays.length === 0) this.delays.push(delay);
    if (this.delays.length > DELAYS_KEPT) this.delays.shift();
    const newest = this.states.at(-1);
    if (newest && heard.sentMs > newest.atMs) {
      this.gaps.push(heard.sentMs - newest.atMs);
      if (this.gaps.length > GAPS_KEPT) this.gaps.shift();
    }
    const after = this.states.findIndex(({ atMs }) => atMs > heard.sentMs);
    this.states.splice(after === -1 ? this.states.length : after, 0, { atMs: heard.sentMs, state });
    if (this.states.length > MOST_KEPT) this.states.shift();
  }

  /** The car as this player shows it at a time on their own clock. */
  sample(nowMs: number): CarState {
    if (this.states.length === 0) throw new Error("a timeline with nothing heard");
    const target = this.targetLag();
    if (this.lagMs === null || this.sampledMs === null || Math.abs(target - this.lagMs) > LAG_JUMPS_MS) this.lagMs = target;
    else {
      const passed = Math.max(nowMs - this.sampledMs, 0);
      this.lagMs += Math.max(Math.min(target - this.lagMs, passed * LAG_RISES), -passed * LAG_FALLS);
    }
    this.sampledMs = nowMs;
    return this.at(nowMs - this.lagMs);
  }

  /** The car at a time on the sender's clock. */
  private at(playMs: number): CarState {
    const next = this.states.findIndex(({ atMs }) => atMs > playMs);
    if (next === 0) return this.states[0].state;
    // The car has passed every state before the one it's last past, for good.
    this.states.splice(0, (next === -1 ? this.states.length : next) - 1);
    const from = this.states[0];
    const to = this.states.at(1);
    const since = (playMs - from.atMs) / 1000;
    if (to) {
      const seconds = (to.atMs - from.atMs) / 1000;
      if (driven(from.state, to.state, seconds)) return between(from.state, to.state, seconds, since / seconds);
    }
    return carriedOn(from.state, Math.min(since, CARRY_ON_MS / 1000));
  }

  private targetLag(): number {
    if (this.source === null) return 0;
    const gap = this.gaps.length > 0 ? quantile(this.gaps, 0.5) : FIRST_GAP_MS;
    return quantile(this.delays, LAG_QUANTILE) + gap / 2;
  }

  private reset(source: string | null): void {
    this.states = [];
    this.delays = [];
    this.gaps = [];
    this.source = source;
    this.lagMs = null;
    this.sampledMs = null;
    this.lateInARow = 0;
    this.last = null;
  }
}
