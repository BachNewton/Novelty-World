/*
 * Where a boat under way is, as a pure function of its voyage and the time: no state, nothing stepped, so every
 * player's boats agree and a test can ask about any moment. A voyage is a lane or two from `lanes.json` (a line
 * over water, checked against the land when it was built), sailed one way and back on a fixed cycle: a passage
 * along the lane, gathering way from a stop and slowing for a berth, a tight corner and the harbour's limit; then
 * a hold, where the boat lies still and comes round, or is out of sight beyond the islands.
 *
 * Scene axes: x east, z south. A pose's yaw is the placement's: it turns the model's +x, its bow, to
 * (cos yaw, -sin yaw).
 */

export type EndKind =
  /** A quay. A single-ended ship stops off it, comes round and backs in, so it lies bow out. */
  | "berth"
  /** Past every island: a ship sails on through it and is out of sight until it comes back. */
  | "open"
  /** A small boat's mooring or anchorage, where it lies and swings to face its way back. */
  | "anchor";

export interface LaneEnd {
  kind: EndKind;
  /** How far along the lane from a berth a single-ended ship comes round. */
  turnM?: number;
}

export interface LaneData {
  name: string;
  vessel: string;
  /** x, z pairs in scene metres. */
  line: number[];
  ends: LaneEnd[];
  /** How far to starboard of the line a vessel keeps, so two meeting on it pass, once it is `keepFromM` past where it comes round at an end. The pipeline checked both sides against the land. */
  keepRightM: number;
  keepFromM: number;
}

/** How a kind of vessel moves. */
export interface Handling {
  lengthM: number;
  beamM: number;
  cruiseMs: number;
  /** The speed within `harbourM` of a berth, and astern. */
  harbourMs: number;
  harbourM: number;
  accelMs2: number;
  /** The sideways acceleration a corner may ask for. */
  lateralMs2: number;
  /** Seconds to come round half a turn. */
  swingS: number;
  /** The same either way, so it sails back without coming round. */
  doubleEnded: boolean;
}

export interface BoatPose {
  x: number;
  z: number;
  yaw: number;
  speedMs: number;
  /** Out beyond the islands, or nowhere yet. */
  shown: boolean;
}

/** A lane's line, with the distance along it at every point. */
export class Lane {
  readonly xs: Float64Array;
  readonly zs: Float64Array;
  readonly along: Float64Array;
  readonly length: number;

  constructor(readonly data: LaneData) {
    const count = data.line.length / 2;
    if (count < 2 || data.ends.length !== 2) throw new Error(`lane ${data.name} needs two points and two ends`);
    this.xs = new Float64Array(count);
    this.zs = new Float64Array(count);
    this.along = new Float64Array(count);
    for (let point = 0; point < count; point++) {
      this.xs[point] = data.line[point * 2];
      this.zs[point] = data.line[point * 2 + 1];
      if (point > 0) this.along[point] = this.along[point - 1] + Math.hypot(this.xs[point] - this.xs[point - 1], this.zs[point] - this.zs[point - 1]);
    }
    this.length = this.along[count - 1];
  }

  end(which: 0 | 1): LaneEnd {
    return this.data.ends[which];
  }

  /** How far to starboard a vessel keeps at `s`: nothing where it comes round at an end, growing smoothly from there. */
  keepRightAt(s: number): number {
    const { keepRightM, keepFromM, ends } = this.data;
    const share = (distance: number, end: LaneEnd) => {
      const into = Math.min(Math.max((distance - (end.turnM ?? 0)) / keepFromM, 0), 1);
      return into * into * (3 - 2 * into);
    };
    return keepRightM * Math.min(share(s, ends[0]), share(this.length - s, ends[1]));
  }

  private segment(s: number): number {
    let [low, high] = [0, this.along.length - 1];
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if (this.along[middle] <= s) low = middle;
      else high = middle;
    }
    return low;
  }

  /** The place `s` metres along, held to the line's ends. */
  at(s: number): { x: number; z: number } {
    const along = Math.min(Math.max(s, 0), this.length);
    const at = this.segment(along);
    const share = (along - this.along[at]) / Math.max(this.along[at + 1] - this.along[at], 1e-9);
    return { x: this.xs[at] + (this.xs[at + 1] - this.xs[at]) * share, z: this.zs[at] + (this.zs[at + 1] - this.zs[at]) * share };
  }

  /** The yaw of a bow pointing along the line at `s`, from a chord `reach` either side so a corner turns it smoothly. */
  yawAt(s: number, reach: number): number {
    const back = this.at(Math.max(s - reach, 0));
    const ahead = this.at(Math.min(s + reach, this.length));
    return Math.atan2(-(ahead.z - back.z), ahead.x - back.x);
  }

  /** Each inner point's distance along and the radius of the turn there. */
  corners(): { s: number; radiusM: number }[] {
    const found: { s: number; radiusM: number }[] = [];
    for (let at = 1; at < this.along.length - 1; at++) {
      const into = Math.atan2(this.zs[at] - this.zs[at - 1], this.xs[at] - this.xs[at - 1]);
      const outOf = Math.atan2(this.zs[at + 1] - this.zs[at], this.xs[at + 1] - this.xs[at]);
      const turn = Math.abs(Math.atan2(Math.sin(outOf - into), Math.cos(outOf - into)));
      if (turn < 1e-4) continue;
      const legM = Math.min(this.along[at] - this.along[at - 1], this.along[at + 1] - this.along[at]);
      found.push({ s: this.along[at], radiusM: legM / (2 * Math.sin(turn / 2)) });
    }
    return found;
  }
}

/** Metres between the samples of a passage's speed, at most. */
const SAMPLE_M = 4;
const MOST_SAMPLES = 6000;
/** A chord of this share of the boat's length either side sets its heading. */
const HEADING_REACH_SHARE = 0.35;

/** One way along part of a lane, timed: the speed at each sample, and the time it's reached. */
export class Passage {
  readonly samples: number;
  readonly speeds: Float64Array;
  readonly times: Float64Array;
  readonly seconds: number;
  readonly astern: boolean;
  private readonly stepM: number;

  constructor(
    readonly lane: Lane,
    readonly from: number,
    readonly to: number,
    readonly handling: Handling,
    options: { moving: [boolean, boolean]; astern: boolean },
  ) {
    const distance = Math.abs(to - from);
    if (distance <= 0) throw new Error(`a passage along ${lane.data.name} goes nowhere`);
    const way = Math.sign(to - from);
    this.samples = Math.min(Math.max(Math.ceil(distance / SAMPLE_M), 2), MOST_SAMPLES) + 1;
    this.stepM = distance / (this.samples - 1);
    const { cruiseMs, harbourMs, harbourM, accelMs2, lateralMs2 } = handling;
    const limit = new Float64Array(this.samples).fill(options.astern ? harbourMs : cruiseMs);
    const sAt = (sample: number) => from + way * sample * this.stepM;
    const berths = ([0, 1] as const).filter((end) => lane.end(end).kind === "berth").map((end) => (end === 0 ? 0 : lane.length));
    for (let sample = 0; sample < this.samples; sample++) {
      if (berths.some((s) => Math.abs(sAt(sample) - s) < harbourM)) limit[sample] = Math.min(limit[sample], harbourMs);
    }
    for (const { s, radiusM } of lane.corners()) {
      const sample = Math.round(((s - from) * way) / this.stepM);
      if (sample >= 0 && sample < this.samples) limit[sample] = Math.min(limit[sample], Math.sqrt(lateralMs2 * radiusM));
    }
    if (!options.moving[0]) limit[0] = 0;
    if (!options.moving[1]) limit[this.samples - 1] = 0;
    // The fastest it can go everywhere, gathering and losing way at its acceleration.
    const speeds = new Float64Array(limit);
    for (let sample = 1; sample < this.samples; sample++) speeds[sample] = Math.min(speeds[sample], Math.sqrt(speeds[sample - 1] ** 2 + 2 * accelMs2 * this.stepM));
    for (let sample = this.samples - 2; sample >= 0; sample--) speeds[sample] = Math.min(speeds[sample], Math.sqrt(speeds[sample + 1] ** 2 + 2 * accelMs2 * this.stepM));
    this.speeds = speeds;
    this.times = new Float64Array(this.samples);
    for (let sample = 1; sample < this.samples; sample++) {
      const mean = (speeds[sample - 1] + speeds[sample]) / 2;
      if (mean <= 0) throw new Error(`a passage along ${lane.data.name} can't move`);
      this.times[sample] = this.times[sample - 1] + this.stepM / mean;
    }
    this.seconds = this.times[this.samples - 1];
    this.astern = options.astern;
  }

  /** Where along the lane, and how fast, `seconds` into the passage. */
  stateAt(seconds: number): { s: number; speedMs: number } {
    const t = Math.min(Math.max(seconds, 0), this.seconds);
    let [low, high] = [0, this.samples - 1];
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if (this.times[middle] <= t) low = middle;
      else high = middle;
    }
    const span = this.times[high] - this.times[low];
    const share = span > 0 ? (t - this.times[low]) / span : 0;
    // Speed changes evenly through a sample's span, so distance grows by its mean so far.
    const [v0, v1] = [this.speeds[low], this.speeds[high]];
    const speedMs = v0 + (v1 - v0) * share;
    const travelled = span > 0 ? ((v0 + speedMs) / 2) * (t - this.times[low]) : 0;
    const along = low * this.stepM + Math.min(travelled, this.stepM);
    return { s: this.from + Math.sign(this.to - this.from) * along, speedMs };
  }

  poseAt(seconds: number): BoatPose {
    const { s, speedMs } = this.stateAt(seconds);
    const { x, z } = this.lane.at(s);
    const forward = this.lane.yawAt(s, this.handling.lengthM * HEADING_REACH_SHARE);
    // Sailing towards the lane's start, the bow points back along it; astern, the stern leads.
    const backwards = this.to < this.from !== this.astern;
    // To starboard of the way it travels: heading (cos yaw, -sin yaw) has its starboard at (sin yaw, cos yaw).
    const travel = this.to < this.from ? forward + Math.PI : forward;
    const keep = this.lane.keepRightAt(s);
    return { x: x + Math.sin(travel) * keep, z: z + Math.cos(travel) * keep, yaw: backwards ? forward + Math.PI : forward, speedMs, shown: true };
  }
}

/** Lying still, or out of sight: turning from one yaw to another over its first `turnS`. */
export interface Hold {
  seconds: number;
  x: number;
  z: number;
  fromYaw: number;
  /** Unwrapped: the turn is `toYaw - fromYaw`. */
  toYaw: number;
  turnS: number;
  shown: boolean;
}

type Step = { kind: "pass"; passage: Passage; start: number } | { kind: "hold"; hold: Hold; start: number };

export interface Leg {
  lane: string;
  /** "out" sails from the lane's first end to its last. */
  way: "out" | "in";
  /** Seconds into the cycle the next leg leaves. The last leg's is the period. */
  untilS?: number;
  /** Or how long it lies at the end it reaches, when it has no `untilS`; left out, it leaves once it has come round. */
  waitS?: number;
}

/** The yaw to turn by to face from one way to another, the short way round. */
const shortTurn = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
/** Smooth start and stop. */
const eased = (share: number) => share * share * (3 - 2 * share);

/**
 * One vessel's cycle, repeating from `departS` (seconds of the sea's clock) every `periodS`; left out, the cycle is
 * as long as its legs and waits, and the last leg says how long it waits.
 */
export class Voyage {
  private readonly steps: Step[] = [];
  readonly periodS: number;

  constructor(
    readonly name: string,
    legs: readonly Leg[],
    lanes: ReadonlyMap<string, Lane>,
    readonly handling: Handling,
    readonly departS: number,
    periodS?: number,
  ) {
    let clock = 0;
    const push = (step: { kind: "pass"; passage: Passage } | { kind: "hold"; hold: Hold }) => {
      this.steps.push({ ...step, start: clock } as Step);
      clock += step.kind === "pass" ? step.passage.seconds : step.hold.seconds;
    };
    const waits: { hold: Hold; step: number }[] = [];
    legs.forEach((leg, index) => {
      const lane = lanes.get(leg.lane);
      if (!lane) throw new Error(`${name} sails lane ${leg.lane}, which there isn't`);
      const [fromEnd, toEnd] = leg.way === "out" ? ([0, 1] as const) : ([1, 0] as const);
      const [fromS, toS] = [fromEnd === 0 ? 0 : lane.length, toEnd === 0 ? 0 : lane.length];
      const arrival = lane.end(toEnd);
      const moving: [boolean, boolean] = [lane.end(fromEnd).kind === "open", arrival.kind === "open"];
      const turns = arrival.kind === "berth" && !handling.doubleEnded;
      if (turns) {
        const turnM = arrival.turnM;
        if (turnM === undefined) throw new Error(`${name}: lane ${lane.data.name}'s berth has no room to come round`);
        const turnAt = toS + Math.sign(fromS - toS) * turnM;
        const inward = new Passage(lane, fromS, turnAt, handling, { moving, astern: false });
        push({ kind: "pass", passage: inward });
        const facing = inward.poseAt(inward.seconds);
        push({ kind: "hold", hold: { seconds: handling.swingS, x: facing.x, z: facing.z, fromYaw: facing.yaw, toYaw: facing.yaw - Math.PI, turnS: handling.swingS, shown: true } });
        push({ kind: "pass", passage: new Passage(lane, turnAt, toS, handling, { moving: [false, false], astern: true }) });
      } else {
        push({ kind: "pass", passage: new Passage(lane, fromS, toS, handling, { moving, astern: false }) });
      }
      const last = this.steps[this.steps.length - 1];
      const arrived = last.kind === "pass" ? last.passage.poseAt(last.passage.seconds) : null;
      if (!arrived) throw new Error(`${name} ends a leg without a passage`);
      const until = index === legs.length - 1 && periodS !== undefined ? periodS : leg.untilS;
      const seconds = until === undefined ? (leg.waitS ?? (arrival.kind === "anchor" ? handling.swingS : 0)) : until - clock;
      if (seconds < 0) throw new Error(`${name} reaches the end of leg ${index} ${(-seconds).toFixed(0)} s after its next leg leaves`);
      const hold: Hold = { seconds, x: arrived.x, z: arrived.z, fromYaw: arrived.yaw, toYaw: arrived.yaw, turnS: 0, shown: arrival.kind !== "open" };
      waits.push({ hold, step: this.steps.length });
      push({ kind: "hold", hold });
    });
    this.periodS = periodS ?? clock;
    if (Math.abs(clock - this.periodS) > 1e-6) throw new Error(`${name}'s legs take ${clock.toFixed(0)} s of its ${this.periodS} s cycle`);
    // A boat at an anchorage swings to face its way out; a ship at a berth eases to its next lane's line. A
    // double-ended ferry needn't: it leaves the other end first.
    for (const { hold, step } of waits) {
      const leaving = this.steps[(step + 1) % this.steps.length];
      if (leaving.kind !== "pass" || !hold.shown || handling.doubleEnded) continue;
      const turn = shortTurn(hold.fromYaw, leaving.passage.poseAt(0).yaw);
      hold.toYaw = hold.fromYaw + turn;
      hold.turnS = Math.abs(turn) > Math.PI / 2 ? Math.min(handling.swingS, hold.seconds) : hold.seconds;
    }
  }

  /** Where the boat is at `seconds` of the sea's clock. */
  poseAt(seconds: number): BoatPose {
    const into = (((seconds - this.departS) % this.periodS) + this.periodS) % this.periodS;
    let [low, high] = [0, this.steps.length];
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if (this.steps[middle].start <= into) low = middle;
      else high = middle;
    }
    const step = this.steps[low];
    if (step.kind === "pass") return step.passage.poseAt(into - step.start);
    const { hold } = step;
    const share = hold.turnS > 0 ? eased(Math.min((into - step.start) / hold.turnS, 1)) : 1;
    return { x: hold.x, z: hold.z, yaw: hold.fromYaw + (hold.toYaw - hold.fromYaw) * share, speedMs: 0, shown: hold.shown };
  }
}
