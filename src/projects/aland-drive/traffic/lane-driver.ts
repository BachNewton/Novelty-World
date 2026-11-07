import { lookAheadM, pursuit } from "../sim/autopilot";
import { Around, keyOf, type LineRef, type OnLane, type Seen } from "./around";
import { alongNearest, lineOf, pointAlong, type Lane, type TileLanes } from "./lane-map";
import type { LaneNet } from "./lane-net";

/*
 * Cars and cyclists that drive the lane map: each one a place on a lane, a
 * connector or a link between a path and a road, a speed, and a body with a
 * steered front wheel or two and no physics. The body is
 * steered along the lanes by the driver every computer-driven car shares
 * (`pursuit`, the autopilot's), so traffic turns as a racer does, its wheels
 * turning at a real car's pace. A car follows its lane, picks a way on at each
 * junction and signals it before it turns, keeps its distance from what's ahead of it by the intelligent driver
 * model, slows for bends and lower limits before it reaches them, and stops at
 * a junction's line while anything its turn gives way to is coming. It sees the
 * cars round it as outlines against its own way: on a road too narrow for two to
 * pass at speed it slows and eases to its edge as an oncoming one comes, or stops
 * on its verge to let it by, and it brakes for a simulated car (the player's,
 * or one hit out of traffic) wherever that lies across its path, and goes round
 * it once it has stood there a while and nothing is coming. A cyclist rides the
 * paths and the roads' edges at its own pace, from a path on to a road and off
 * again by the lane map's links, giving way to the road as it joins it; a car
 * slows behind one, and overtakes only once the oncoming side is clear, with a
 * cyclist's room between them. A walker walks the paths on foot at a pace of its
 * own, keeping to its side, stepping round the slower and the standing, aside for
 * cyclists, and across a road from a path to the path beyond once it's clear; a
 * cyclist slows for walkers and passes them with room, and a car stops for one
 * crossing. Where they come and go is the bubble's (`bubble.ts`); a vehicle whose
 * trip has ended stands until it may go unseen.
 */

export type VehicleKind = "car" | "bike" | "walker";

/**
 * Each kind's build: front axle to rear, how far and fast its front wheel turns, and how near its rider aims at walking
 * pace, so a tight junction isn't cut over its corner. A car's lock is a real car's, at a calm hand's pace. A walker
 * is steered as a short body that turns nearly on the spot. And how it keeps its distance: the gap it leaves standing
 * and the time it leaves moving, and the pace under which it counts as stopped.
 */
const BUILDS: Record<VehicleKind, { wheelbaseM: number; lock: number; steerRate: number; shortestLookM: number; standstillM: number; headwayS: number; slowestMS: number }> = {
  car: { wheelbaseM: 2.7, lock: 0.6, steerRate: 0.9, shortestLookM: 4, standstillM: 2.5, headwayS: 1.4, slowestMS: 1 },
  bike: { wheelbaseM: 1.08, lock: 0.7, steerRate: 2.5, shortestLookM: 2.5, standstillM: 2.5, headwayS: 1.4, slowestMS: 1 },
  walker: { wheelbaseM: 0.3, lock: 1.3, steerRate: 6, shortestLookM: 1.2, standstillM: 0.6, headwayS: 0.8, slowestMS: 0.25 },
};
/** A bike's front axle to its rear, for how far it leans into a turn. */
export const BIKE_WHEELBASE_M = BUILDS.bike.wheelbaseM;
/** Half a bike and rider's width, at the bars, and length, tyre to tyre. */
export const BIKE_HALF: readonly [number, number] = [0.32, 0.9];
/** A cyclist's own pace, the slowest and the range above it. */
const BIKE_PACE_MS = 4.2;
const BIKE_PACE_RANGE_MS = 2.2;
/** A cyclist on a road rides this far in from its lane's outer edge. */
const BIKE_EDGE_M = 0.35;
/** A car passing a cyclist leaves it this much room. */
const BIKE_ROOM_M = 1.2;
/** A cyclist joining a road gives way to what's within this time or distance of where it joins. */
const JOIN_WITHIN_S = 4;
const JOIN_NEAR_M = 10;
const JOIN_LOOK_M = 80;
/** A cyclist riding within this cosine of a car's way is one it may pass. */
const SAME_WAY = 0.7;
/** Within this of its line's end a vehicle may have cut the corner on to the next; and at most this many lines are passed in a step, as lines of no length can follow each other. */
const CUT_M = 4;
const MOST_LINES_A_STEP = 8;
/** A vehicle put down moving rides at this share of its pace there. */
const ENTER_SHARE = 0.8;
/** A link between a path and a road is a straight step, often at a sharp angle to both, so a cyclist takes it at a turning pace. */
const LINK_MS = 2.5;
/** A cyclist on a road turns off at each link to a path with this chance. */
const TURN_OFF = 0.4;
/** Half a walker's width, at the shoulders, and its depth. */
export const WALKER_HALF: readonly [number, number] = [0.28, 0.2];
/** A walker's pace when the game doesn't give one by who they are: the slowest and the range above it. */
const WALKER_PACE_MS = 1.15;
const WALKER_PACE_RANGE_MS = 0.35;
/** A walker hurries across a road at this share of its pace. */
const CROSSING_SHARE = 1.2;
/** A path across a road starts this near where the path ending at it meets the road, and at most this far from its end: further is a junction's diagonal, which no one walks. */
const CROSSING_REACH_M = 15;
const LONGEST_CROSSING_M = 12;
/** How far round a walker looks for others, and how near an oncoming one comes before it keeps further right. */
const FOOT_SEE_M = 20;
const FOOT_MEET_M = 8;
/** The room a walker leaves another; it passes a slower one this near, and goes round a standing one this near. */
const FOOT_CLEAR_M = 0.2;
const FOOT_PASS_M = 4;
const FOOT_ROUND_M = 6;
/** A path not joined to another by a junction, but starting this near where it ends, carries on from it. */
const PATH_ON_M = 1.5;
/** Room a walker or cyclist leaves anyone on foot as it steps. */
const STEP_ROOM_M = 0.04;
/** A walker held up this long with nothing to wait for steps aside, trying each side for this long, and this long turns back. */
const FOOT_HELD_S = 2;
const FOOT_ASIDE_S = 3;
const FOOT_GIVE_UP_S = 8;
/** A walker held up turns on the spot this fast, in radians a second, or sidesteps this fast. */
const PIVOT_RATE = 3;
const SIDESTEP_MS = 0.5;
/** A walker this near its line's end is on to the next. */
const FOOT_END_M = 0.5;
/** Someone this near ahead and in its way, a walker doesn't step into, whatever else it means to do. */
const FOOT_TOUCH_M = 0.6;
/** A walker steps sideways at this pace, at most this far past its lane's outer edge, or round someone standing. */
const FOOT_SHIFT_MS = 0.7;
const FOOT_VERGE_M = 0.6;
const FOOT_ROUND_MOST_M = 2.5;
/** A cyclist this near, coming or catching up, has a walker step to the edge of the path and slow to this share of its pace. */
const BIKE_NOTICE_M = 15;
const ASIDE_SHARE = 0.6;
/** A cyclist leaves a walker this much room, and rides past one at most this fast, from this far off. */
const WALKER_ROOM_M = 0.5;
const PAST_WALKER_MS = 3;
const WALKER_NOTICE_M = 25;
/** A car brakes for a walker crossing in front of it with this much to spare either side. */
const CROSSING_MARGIN_M = 0.5;
/** A turn is signalled from this far before its junction, or this many seconds at the car's speed if that's further. */
const SIGNAL_M = 35;
const SIGNAL_S = 4;
/** The intelligent driver model's numbers: pull away, comfortable braking, time gap, gap at a standstill. */
const PULL = 1.4;
const BRAKE = 2.2;
const HARDEST_BRAKE = 8;
/** How hard a car leans on its tyres through a bend, which sets its speed there. */
const SIDE_PULL = 2;
const LOOK_M = 120;
/** Something coming gives a turn pause when it would reach the junction within this time, or is this close. */
const YIELD_WITHIN_S = 4.5;
const YIELD_NEAR_M = 6;
const STOP_BACK_M = 1;
const TURN_ROUND_MS = 10 / 3.6;
const SLOWEST_MS = 1;
/** Slower than this, a car has stopped. */
const STOPPED_MS = 0.1;
/** How far round a car looks for cars to pass or brake for, and how far behind it one still counts as alongside. */
const SEE_M = LOOK_M;
const ALONGSIDE_M = 3;
/** The room two cars keep between them side by side, and how far past its lane's outer edge a car puts its wheels to pass: on to the verge as it drives by, further once it has stopped to let the other by. */
const PASS_CLEAR_M = 0.3;
/** Creeping by one that has stopped, a driver squeezes past with less. */
const SQUEEZE_CLEAR_M = 0.1;
const VERGE_M = 0.5;
const STOPPED_VERGE_M = 1.6;
/** How fast a car eases across its lane, sideways, and to pass an oncoming car at most this far for each metre it drives on, so at a crawl it doesn't swing its tail out: only going round a standing car does it pull out sharply. */
const SHIFT_MS = 0.8;
const SHIFT_PER_M = 0.15;
/** An oncoming car within this many seconds, or metres, is one to make room for. */
const MEET_S = 5;
const MEET_M = 30;
/** Passing on a narrow road; at a crawl where one has stopped for the other; and short of the meeting while the other is still pulling over. */
const PASS_MS = 6;
const CRAWL_MS = 3;
const MEET_GAP_M = 4;
/** Standing still this long meeting cars on a narrow road, a car has its turn: newcomers from the other way wait for it. */
const TURN_S = 10;
/** Something across a car's path counts this far either side of its own width. */
const PATH_MARGIN_M = 0.3;
/** Going round a standing car: stop this much further back than in a queue, to swing out; wait this long first; go only with nothing coming this far ahead; at this pace. */
const GO_ROUND_BACK_M = 3.5;
const GO_ROUND_WAIT_S = 3;
const GO_ROUND_CLEAR_M = 150;
const GO_ROUND_MS = 7;
const QUEUE_M = 12;
/** Going round, a car stops only for what is this close: it's in the other lane by choice, and gets out of it. */
const TOUCH_M = 8;
/** A vehicle's choices are its seed's shares from this salt on: the lower ones are its pace's and its model's. */
const PICK_SALT = 16;

export interface Pose {
  x: number;
  y: number;
  z: number;
  /** Turns a model's +z, its tail, against the way it drives. */
  yaw: number;
}

/** What a car's indicators show, as the world cars' material reads it. */
export const SIGNAL = { off: 0, left: 1, right: 2, hazards: 3 } as const;

interface Body {
  /** The rear axle's middle on the ground, and the way the car faces, radians anticlockwise from north. */
  x: number;
  z: number;
  heading: number;
  /** The front wheels' angle, positive to the right. */
  wheels: number;
}

export interface LaneCar {
  id: string;
  kind: VehicleKind;
  place: OnLane;
  speedMS: number;
  /** A cyclist's or a walker's own pace; no cap on a car's. */
  paceMS: number;
  /** The connector or link it will take at its lane's end, once chosen; for a walker turning back, its path's other way. */
  next: LineRef | null;
  /** A walker to cross a road to the path beyond, which is its `next`: the link its path has on to the road, where it waits for a gap. */
  crossing: number | null;
  /** A walker out on the road, crossing it, until it reaches the path beyond. */
  onRoad: boolean;
  /** A cyclist on a road: the link to a path it turns off at, partway along its lane. */
  exit: { link: number; along: number } | null;
  /** Its trip has ended, at a dead end, and it stands until it may go unseen. */
  finished: boolean;
  body: Body;
  /** Its indicators: `SIGNAL`'s. */
  signal: number;
  /** How far the middle of the car is from its place on its lane, as its wheels steer it round. */
  offLaneM: number;
  /** Stopped at a junction's line for what it gives way to. */
  waiting: boolean;
  /** Half its width and length. */
  half: readonly [number, number];
  /** How far it has eased right of its lane, or left of it going round something, and how far it wants to. */
  shiftM: number;
  wantShiftM: number;
  /** Meeting oncoming cars on a narrow road: passing them at a slow pace, or where there's no room for both to drive by, stopping on its verge for them or creeping by them. */
  meeting: "passes" | "yields" | "creeps" | null;
  /** How long it has stood still meeting oncoming cars on a narrow road, either way. */
  waitedS: number;
  /** Going round a simulated car standing in its way, and how long it has stood behind it. */
  goingRound: boolean;
  blockedS: number;
  model: number;
  seed: number;
  /** How many choices it has made, each one a pure function of its seed and this count, so every page driving it chooses alike. */
  picks: number;
  pose: Pose;
  last: Pose;
}

/**
 * Everything a vehicle's driver carries on from: whoever drives it next, on this page or another, takes it up from
 * exactly here. What's left out (its pace, size, signal and pose) follows from what's in it.
 */
export type LaneRecord = Pick<
  LaneCar,
  "id" | "kind" | "seed" | "model" | "place" | "speedMS" | "next" | "crossing" | "onRoad" | "exit" | "finished" | "body" | "shiftM" | "wantShiftM" | "meeting" | "waitedS" | "goingRound" | "blockedS" | "waiting" | "picks"
>;

type Line = LineRef;
/** A line as part of a vehicle's way: from where it joins the line to where it leaves it, in metres along the line. */
type Leg = Line & { from: number; to: number };

/** Another car as a driver sees it: where its middle is, the unit way its nose points, its size, speed and velocity. */
interface Other {
  id: string;
  x: number;
  z: number;
  fx: number;
  fz: number;
  half: readonly [number, number];
  speedMS: number;
  vx: number;
  vz: number;
  /** The traffic car, or none for a simulated car or someone placed standing or sitting. */
  car: LaneCar | null;
  /** Someone placed standing or sitting, never moving. */
  still?: true;
}

/**
 * Another car's outline against a driver's way: from the driver's front to its nearest corner, and from the driver's middle
 * to its furthest, in metres along the way; its edges in metres to the way's right (left is negative); whether it faces
 * the other way; and its speed along the way.
 */
interface Outline {
  near: number;
  far: number;
  left: number;
  right: number;
  opposing: boolean;
  alongMS: number;
}

/** What the cars round a driver ask of it this step: things to stop short of, the speed to keep to, and how far to ease across. */
interface Reaction {
  obstacles: { gap: number; speedMS: number }[];
  capMS: number;
  shiftM: number;
  /** The car's meeting and how long it has stood in one, as of this step: every car reacts to the others' as of the last. */
  meeting: LaneCar["meeting"];
  waitedS: number;
}

/**
 * A simulated car as traffic is told of it, the player's or one hit out of traffic: its middle, the way its nose points
 * (radians anticlockwise from north), its velocity and half its width and length.
 */
export interface DrivenCar {
  id: string;
  x: number;
  z: number;
  heading: number;
  vx: number;
  vz: number;
  half: readonly [number, number];
}

/** A cyclist's lanes: every road's, and the paths it may ride. */
const BIKE_PATHS = new Set(["cycleway", "footway", "path", "pedestrian"]);
export const bikeRides = (lane: Lane) => !lane.path || BIKE_PATHS.has(lane.kind);
/** A walker's lanes: the paths outdoors, and never a road but across it. */
const WALK_PATHS = new Set(["footway", "path", "pedestrian", "cycleway", "steps", "bridleway"]);
export const walks = (lane: Lane) => lane.path && WALK_PATHS.has(lane.kind);
const goes = (kind: VehicleKind, lane: Lane) => (kind === "car" ? !lane.path : kind === "bike" ? bikeRides(lane) : walks(lane));

/** The people placed standing or sitting are kept by squares of the ground this wide. */
const STILL_CELL_M = 16;

/** A seed's share between 0 and 1, the same each time, a different one for each salt. */
export function seedShare(seed: number, salt = 0): number {
  let t = Math.imul((seed ^ Math.imul(salt + 1, 0x9e3779b9)) >>> 0, 0x85ebca6b);
  t ^= t >>> 13;
  t = Math.imul(t, 0xc2b2ae35);
  t ^= t >>> 16;
  return (t >>> 0) / 4294967296;
}

function mulberry(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The speed each point of a tile's lines can be taken at for its bend, from the turn between the two steps either side. */
function bendSpeeds(lanes: TileLanes): Float32Array {
  const { points } = lanes;
  const speeds = new Float32Array(points.length / 3).fill(Infinity);
  for (const line of [...lanes.lanes, ...lanes.connectors]) {
    for (let at = line.first + 1; at < line.first + line.count - 1; at++) {
      const [ax, az] = [points[at * 3] - points[at * 3 - 3], points[at * 3 + 2] - points[at * 3 - 1]];
      const [bx, bz] = [points[at * 3 + 3] - points[at * 3], points[at * 3 + 5] - points[at * 3 + 2]];
      const [a, b] = [Math.hypot(ax, az), Math.hypot(bx, bz)];
      if (a < 1e-3 || b < 1e-3) continue;
      const turn = Math.acos(Math.max(-1, Math.min(1, (ax * bx + az * bz) / (a * b))));
      if (turn > 1e-3) speeds[at] = Math.sqrt(SIDE_PULL * (Math.min(a, b) / turn));
    }
  }
  return speeds;
}

/** A car moved on along the way its nose points. */
const movedOn = (car: Other, metres: number): Other => ({ ...car, x: car.x + car.fx * metres, z: car.z + car.fz * metres });

/** Whether two cars' bodies, each grown by half of `clear`, overlap on the ground: by the separating axes of both. */
function overlapping(a: Other, b: Other, clear: number): boolean {
  const corners = ({ x, z, fx, fz, half: [wide, long] }: Other) =>
    [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([forth, side]) => [x + fx * (long + clear / 2) * forth - fz * (wide + clear / 2) * side, z + fz * (long + clear / 2) * forth + fx * (wide + clear / 2) * side]);
  const [ca, cb] = [corners(a), corners(b)];
  for (const [ax, az] of [[a.fx, a.fz], [-a.fz, a.fx], [b.fx, b.fz], [-b.fz, b.fx]]) {
    const sa = ca.map(([x, z]) => x * ax + z * az);
    const sb = cb.map(([x, z]) => x * ax + z * az);
    if (Math.max(...sa) < Math.min(...sb) || Math.max(...sb) < Math.min(...sa)) return false;
  }
  return true;
}

/** A traffic car as the others see it. */
function asOther(car: LaneCar): Other {
  const [fx, fz] = [-Math.sin(car.body.heading), -Math.cos(car.body.heading)];
  return { id: car.id, x: car.pose.x, z: car.pose.z, fx, fz, half: car.half, speedMS: car.speedMS, vx: fx * car.speedMS, vz: fz * car.speedMS, car };
}

const poseOf = (point: { x: number; y: number; z: number; dx: number; dz: number }): Pose => ({ x: point.x, y: point.y, z: point.z, yaw: Math.atan2(-point.dx, -point.dz) });

export class LaneTraffic {
  readonly around: Around;
  /** Whether a vehicle whose trip has ended may go now: unseen, as the bubble judges it. Anywhere, alone. */
  mayGo: (car: LaneCar) => boolean = () => true;
  /**
   * Vehicles another player's page runs (`net/shared-traffic.ts`): this page drives them between that page's messages,
   * as it drives its own, but never takes one away, which is the page running it to do.
   */
  readonly elsewhere = new Set<string>();
  private readonly cars = new Map<string, LaneCar>();
  private readonly junctions = new WeakMap<TileLanes, Map<number, number[]>>();
  private readonly links = new WeakMap<TileLanes, { onTo: Map<number, number[]>; offOf: Map<number, number[]> }>();
  private readonly bends = new WeakMap<TileLanes, Float32Array>();
  private readonly chains = new WeakMap<TileLanes, Map<number, number[]>>();
  private readonly random: () => number;
  private driven = new Map<string, Other>();
  /** Everyone placed standing or sitting, by tile and by square of the ground. */
  private readonly still = new Map<string, Map<string, Other[]>>();
  private made = 0;

  constructor(
    private readonly net: LaneNet,
    /** Half the width and length of each kind of car. */
    private readonly kinds: readonly (readonly [number, number])[],
    seed = 1,
    /** A walker's pace by its seed, which is who they are: slower with age. */
    private readonly walkerPace: (seed: number) => number = (seed) => WALKER_PACE_MS + seedShare(seed, 1) * WALKER_PACE_RANGE_MS,
  ) {
    this.around = new Around(net);
    this.random = mulberry(seed);
    // Around forgets a car whose tile went before this hears of it.
    net.subscribe(() => {
      for (const id of this.cars.keys()) if (!this.around.where(id)) this.cars.delete(id);
    });
  }

  get(id: string): LaneCar | undefined {
    return this.cars.get(id);
  }

  all(): IterableIterator<LaneCar> {
    return this.cars.values();
  }

  count(): number {
    return this.cars.size;
  }

  /** Puts a car or cyclist down, moving at a speed. A seed is a vehicle's own: its car's model and its cyclist's pace. */
  spawn(place: OnLane, speedMS: number, options: { kind?: VehicleKind; seed?: number; id?: string } = {}): LaneCar {
    const kind = options.kind ?? "car";
    const seed = options.seed ?? Math.floor(this.random() * 2 ** 31);
    const id = options.id ?? `lane-${kind}-${this.made++}`;
    if (this.cars.has(id)) throw new Error(`${id} is already on the road`);
    return this.put(id, place, this.poseAt(place), speedMS, kind, kind === "car" ? this.modelOf(seed) : 0, seed);
  }

  /** Puts a vehicle down already moving, a little under the pace it would ride there. */
  enter(place: OnLane, options: { kind: VehicleKind; seed: number; id: string }): LaneCar {
    const vehicle = this.spawn(place, 0, options);
    vehicle.speedMS = ENTER_SHARE * this.wantedAt(vehicle, place);
    return vehicle;
  }

  /** Which of the kinds of car a seed is. */
  private modelOf(seed: number): number {
    return Math.floor(seedShare(seed) * this.kinds.length);
  }

  /** Half the width and length of the car a seed is. */
  halfOf(seed: number): readonly [number, number] {
    return this.kinds[this.modelOf(seed)];
  }

  /**
   * Takes a car back from the simulation, standing where it is, its middle and heading as given: on the lane running its
   * way nearest it, from where it steers back on to the lane as it drives off. None if no lane near it runs its way.
   */
  rejoin(id: string, at: { x: number; y: number; z: number; heading: number }, model: number, seed: number): LaneCar | null {
    const place = this.around.match(id, at.x, at.z, { x: -Math.sin(at.heading), z: -Math.cos(at.heading) });
    if (!place) return null;
    return this.put(id, place, { x: at.x, y: at.y, z: at.z, yaw: at.heading }, 0, "car", model, seed);
  }

  private put(id: string, place: OnLane, pose: Pose, speedMS: number, kind: VehicleKind, model: number, seed: number): LaneCar {
    const { wheelbaseM } = BUILDS[kind];
    const body = { x: pose.x + Math.sin(pose.yaw) * (wheelbaseM / 2), z: pose.z + Math.cos(pose.yaw) * (wheelbaseM / 2), heading: pose.yaw, wheels: 0 };
    const car: LaneCar = {
      id,
      kind,
      place,
      speedMS,
      paceMS: kind === "bike" ? BIKE_PACE_MS + seedShare(seed, 1) * BIKE_PACE_RANGE_MS : kind === "walker" ? this.walkerPace(seed) : Infinity,
      next: null,
      crossing: null,
      onRoad: false,
      exit: null,
      finished: false,
      waiting: false,
      half: kind === "bike" ? BIKE_HALF : kind === "walker" ? WALKER_HALF : this.kinds[model],
      shiftM: 0,
      wantShiftM: 0,
      meeting: null,
      waitedS: 0,
      goingRound: false,
      blockedS: 0,
      model,
      seed,
      picks: 0,
      body,
      signal: SIGNAL.off,
      offLaneM: 0,
      pose,
      last: pose,
    };
    this.cars.set(id, car);
    this.around.put(id, place);
    car.exit = this.exitOf(car);
    return car;
  }

  remove(id: string): void {
    this.cars.delete(id);
    this.around.forget(id);
    this.elsewhere.delete(id);
  }

  /** A vehicle's record, to carry on from. */
  record(car: LaneCar): LaneRecord {
    const { id, kind, seed, model, place, speedMS, next, crossing, onRoad, exit, finished, body, shiftM, wantShiftM, meeting, waitedS, goingRound, blockedS, waiting, picks } = car;
    return { id, kind, seed, model, place: { ...place }, speedMS, next, crossing, onRoad, exit, finished, body: { ...body }, shiftM, wantShiftM, meeting, waitedS, goingRound, blockedS, waiting, picks };
  }

  /**
   * Puts a vehicle exactly where its record has it, as a new one or over the one of its id; none where its line's tile
   * isn't loaded here. It is drawn sliding from where it stood to there over the next step.
   */
  restore(record: LaneRecord): LaneCar | null {
    if (!this.net.tile(record.place.tile) || (record.next && !this.net.tile(record.next.tile))) return null;
    const was = this.cars.get(record.id);
    this.cars.delete(record.id);
    const car = this.put(record.id, { ...record.place }, { x: 0, y: 0, z: 0, yaw: 0 }, record.speedMS, record.kind, record.model, record.seed);
    Object.assign(car, { ...record, place: { ...record.place }, body: { ...record.body } });
    const middle = this.middleOf(car);
    const ground = this.onWay(car, 0);
    car.pose = { ...middle, y: ground.y, yaw: car.body.heading };
    car.last = was ? was.pose : car.pose;
    car.offLaneM = Math.hypot(middle.x - (ground.x - ground.dz * car.shiftM), middle.z - (ground.z + ground.dx * car.shiftM));
    car.signal = this.signalOf(car);
    return car;
  }

  /** A vehicle's next choice, between 0 and 1. */
  private pick(car: LaneCar): number {
    return seedShare(car.seed, PICK_SALT + car.picks++);
  }

  /** The people a tile's people files place, where each stands, as (x, z) pairs: walkers and cyclists go round them. */
  setStill(tile: string, places: ArrayLike<number>): void {
    const squares = new Map<string, Other[]>();
    for (let at = 0; at < places.length; at += 2) {
      const [x, z] = [places[at], places[at + 1]];
      const key = `${Math.floor(x / STILL_CELL_M)},${Math.floor(z / STILL_CELL_M)}`;
      const person: Other = { id: `still:${tile}:${at / 2}`, x, z, fx: 0, fz: -1, half: [WALKER_HALF[0], WALKER_HALF[0]], speedMS: 0, vx: 0, vz: 0, car: null, still: true };
      const list = squares.get(key);
      if (list) list.push(person);
      else squares.set(key, [person]);
    }
    this.still.set(tile, squares);
  }

  forgetStill(tile: string): void {
    this.still.delete(tile);
  }

  /** Everyone placed standing or sitting within a reach of a place. */
  stillNear(x: number, z: number, reach: number): { x: number; z: number; half: readonly [number, number] }[] {
    return this.stillAround(x, z, reach);
  }

  private stillAround(x: number, z: number, reach: number): Other[] {
    const found: Other[] = [];
    const [west, east] = [Math.floor((x - reach) / STILL_CELL_M), Math.floor((x + reach) / STILL_CELL_M)];
    const [north, south] = [Math.floor((z - reach) / STILL_CELL_M), Math.floor((z + reach) / STILL_CELL_M)];
    for (const squares of this.still.values()) {
      for (let cx = west; cx <= east; cx++) {
        for (let cz = north; cz <= south; cz++) for (const person of squares.get(`${cx},${cz}`) ?? []) if (Math.hypot(person.x - x, person.z - z) < reach) found.push(person);
      }
    }
    return found;
  }

  /**
   * Where the simulated cars are: traffic brakes for each wherever it lies across a car's path, and goes round one
   * standing. A junction's turn gives way to one only while it drives along a lane, since one standing near a junction
   * would hold the turn up for good.
   */
  setDriven(cars: readonly DrivenCar[]): void {
    for (const id of this.driven.keys()) if (!cars.some((car) => car.id === id)) this.around.forget(id);
    this.driven = new Map(
      cars.map((car) => {
        const speedMS = Math.hypot(car.vx, car.vz);
        if (!(speedMS > SLOWEST_MS && this.around.match(car.id, car.x, car.z, { x: car.vx, z: car.vz }))) this.around.forget(car.id);
        return [car.id, { id: car.id, x: car.x, z: car.z, fx: -Math.sin(car.heading), fz: -Math.cos(car.heading), half: car.half, speedMS, vx: car.vx, vz: car.vz, car: null }];
      }),
    );
  }

  /** One step of every car: each one's pull worked out from where all stand, then all moved. */
  step(seconds: number): void {
    const others = this.others();
    const pulls = new Map<string, number>();
    const reactions = new Map<LaneCar, Reaction>();
    for (const car of this.cars.values()) reactions.set(car, this.react(car, others, seconds));
    for (const [car, reaction] of reactions) {
      car.meeting = reaction.meeting;
      car.waitedS = reaction.waitedS;
      car.wantShiftM = reaction.shiftM;
      pulls.set(car.id, this.pull(car, reaction));
    }
    for (const car of [...this.cars.values()]) {
      car.last = car.pose;
      car.speedMS = Math.max(0, car.speedMS + (pulls.get(car.id) ?? 0) * seconds);
      // Pulling out round a standing car it aims at the clear line at once, so its wheels have the whole gap to turn out in.
      const across = car.goingRound ? Infinity : car.kind === "walker" ? FOOT_SHIFT_MS * seconds : Math.min(SHIFT_MS * seconds, SHIFT_PER_M * car.speedMS * seconds);
      car.shiftM += Math.max(-across, Math.min(across, car.wantShiftM - car.shiftM));
      const route = this.route(car);
      if (this.endsHere(car, route) && car.speedMS < BUILDS[car.kind].slowestMS && route[0].to - car.place.along < BUILDS[car.kind].standstillM + 2 * car.half[1]) car.finished = true;
      if (car.finished && !this.elsewhere.has(car.id) && this.mayGo(car)) {
        this.remove(car.id);
        continue;
      }
      let travelled = car.speedMS * seconds;
      const before = { ...car.body };
      this.drive(car, travelled);
      // A walker never steps into anyone, nor a cyclist into someone on foot: the step is taken back and it stands, a
      // walker turning on the spot towards where it means to go, so a step aside frees it.
      if (car.kind !== "car" && travelled > 0 && this.wouldTouch(car, this.bodyAsOther(car), STEP_ROOM_M)) {
        car.body = before;
        car.speedMS = 0;
        travelled = 0;
        if (car.kind === "walker") this.pivot(car, seconds);
      }
      // Where the car now is on its way is found from its body, as the autopilot finds itself on its line, never counted
      // on from where it was: a car steered round a corner covers a little less ground than its line, and would drift.
      const middle = this.middleOf(car);
      // Never back: a car only moves on along its way, so it can't lose its place and chase a point behind it.
      let along = this.nearestOn(car.place, middle, car.place.along, car.place.along + travelled + 2);
      let end = this.route(car)[0].to;
      // On at its line's end, a line of no length included, or near the end once nearer the next line than its own: a
      // square corner, as a link or a path's turn can be, is cut, and the body never passes the corner's point.
      let nowhere = false;
      // A walker, which turns on the spot, steps on to its next line as it reaches the end of its own: one going back the
      // way it came, or on to a path not joined to its own, would otherwise turn round short of the end for good.
      const reached = (at: number) => at >= end || (car.kind === "walker" && end - at < FOOT_END_M);
      for (let lines = 0; lines < MOST_LINES_A_STEP && (reached(along) || (lines === 0 && end - along < CUT_M && this.cutOnto(car, middle, along))); lines++) {
        const past = Math.max(0, along - end) + CUT_M;
        const onward = this.onward(car);
        nowhere = !onward;
        if (!onward) break;
        const { from, tile, index, connector, link } = onward;
        car.place = link ? { tile, index, connector, link, along: from } : { tile, index, connector, along: from };
        along = this.nearestOn(car.place, middle, from, from + past + 2);
        car.exit = this.exitOf(car);
        end = this.route(car)[0].to;
      }
      if (nowhere && along > end) {
        // The lane leads off the loaded tiles, or nowhere: its runner takes it away, and here it waits for that.
        if (!this.elsewhere.has(car.id)) {
          this.remove(car.id);
          continue;
        }
        along = end;
      }
      car.place = { ...car.place, along };
      this.around.put(car.id, car.place);
      const ground = this.onWay(car, 0);
      car.pose = { ...middle, y: ground.y, yaw: car.body.heading };
      // Off its lane as it means to be, eased across or not.
      car.offLaneM = Math.hypot(middle.x - (ground.x - ground.dz * car.shiftM), middle.z - (ground.z + ground.dx * car.shiftM));
      // A walker across the road is on the path beyond once it reaches it.
      if (car.onRoad && car.offLaneM < 1) car.onRoad = false;
      car.signal = this.signalOf(car);
    }
  }

  /**
   * Whether a walker or cyclist, moved or turned to where it would be, would touch someone near it that it isn't
   * touching now, or come closer to within `clear` of them: anyone but a car, for a walker, and anyone on foot, for a
   * cyclist.
   */
  private wouldTouch(car: LaneCar, stepped: Other, clear = 0): boolean {
    const self = asOther(car);
    const reach = 1 + Math.hypot(...car.half) + Math.hypot(stepped.x - self.x, stepped.z - self.z);
    const near = ({ id, pose }: LaneCar) => id !== car.id && Math.abs(pose.x - self.x) < reach && Math.abs(pose.z - self.z) < reach;
    // Where everyone stands now, part way through the step: two moving into one gap in the same step mustn't both take it.
    const others = [...[...this.cars.values()].filter(near).map(asOther), ...this.driven.values(), ...this.stillAround(self.x, self.z, reach)];
    const minds = (other: Other) => (car.kind === "walker" ? other.car?.kind !== "car" : other.still === true || other.car?.kind === "walker");
    const closer = (other: Other) => Math.hypot(stepped.x - other.x, stepped.z - other.z) < Math.hypot(self.x - other.x, self.z - other.z);
    return others.some((other) => minds(other) && !overlapping(self, other, 0) && (overlapping(stepped, other, 0) || (overlapping(stepped, other, clear) && closer(other))));
  }

  /** A vehicle as the others see it where its body is now, before its pose has caught up. */
  private bodyAsOther(car: LaneCar): Other {
    const middle = this.middleOf(car);
    return { ...asOther(car), x: middle.x, z: middle.z, fx: -Math.sin(car.body.heading), fz: -Math.cos(car.body.heading) };
  }

  /**
   * Turns a walker standing towards where it means to go, at a person's pace on the spot, unless that turns it into
   * someone; squeezed too close to turn, it sidesteps towards that side instead, which it may whenever that takes it
   * further from them.
   */
  private pivot(car: LaneCar, seconds: number): void {
    const { body } = car;
    const ahead = this.onWay(car, BUILDS.walker.shortestLookM);
    const [x, z] = [ahead.x - ahead.dz * car.shiftM - body.x, ahead.z + ahead.dx * car.shiftM - body.z];
    let turn = Math.atan2(-x, -z) - body.heading;
    turn -= Math.round(turn / (2 * Math.PI)) * 2 * Math.PI;
    const heading = body.heading + Math.max(-PIVOT_RATE * seconds, Math.min(PIVOT_RATE * seconds, turn));
    const self = asOther(car);
    // About its middle, as a person turns: the body's own point is its rear axle, half its wheelbase behind.
    if (!this.wouldTouch(car, { ...self, fx: -Math.sin(heading), fz: -Math.cos(heading) })) {
      const half = BUILDS.walker.wheelbaseM / 2;
      [body.x, body.z, body.heading] = [self.x + Math.sin(heading) * half, self.z + Math.cos(heading) * half, heading];
      return;
    }
    // Right of the way it faces is (-fz, fx).
    const side = (x * -self.fz + z * self.fx >= 0 ? 1 : -1) * SIDESTEP_MS * seconds;
    const [dx, dz] = [-self.fz * side, self.fx * side];
    if (this.wouldTouch(car, { ...self, x: self.x + dx, z: self.z + dz }, STEP_ROOM_M)) return;
    body.x += dx;
    body.z += dz;
  }

  /** Whether a vehicle near its line's end is nearer the next line than its own: it has cut the corner on to it. */
  private cutOnto(car: LaneCar, middle: { x: number; z: number }, along: number): boolean {
    const route = this.route(car);
    if (route.length < 2) return false;
    const next = route[1];
    const here = this.pointOn(car.place, along);
    const there = this.pointOn(next, this.nearestOn(next, middle, next.from, Math.min(next.to, next.from + 2 * CUT_M)));
    return Math.hypot(there.x - middle.x, there.z - middle.z) < Math.hypot(here.x - middle.x, here.z - middle.z);
  }

  /** Where a car is drawn between its last step and this one. */
  poseBetween(car: LaneCar, share: number): Pose {
    const { last, pose } = car;
    let turn = pose.yaw - last.yaw;
    turn -= Math.round(turn / (2 * Math.PI)) * 2 * Math.PI;
    return { x: last.x + (pose.x - last.x) * share, y: last.y + (pose.y - last.y) * share, z: last.z + (pose.z - last.z) * share, yaw: last.yaw + turn * share };
  }

  /** Steers a car's body towards a point ahead on its way, eased across as far as it means to be, and moves it on its wheels by `travelled` metres. */
  private drive(car: LaneCar, travelled: number): void {
    const { body } = car;
    const { wheelbaseM, lock, steerRate, shortestLookM } = BUILDS[car.kind];
    const ahead = this.onWay(car, lookAheadM(car.speedMS, shortestLookM) - wheelbaseM / 2);
    // To the right of the way is (-dz, dx) on the ground.
    const target = { x: ahead.x - ahead.dz * car.shiftM, z: ahead.z + ahead.dx * car.shiftM };
    // Pursuit steers by the sine of the angle to its target, which comes to nothing for a target straight behind; one
    // behind at all, as a sharp link can leave it, is turned towards at full lock.
    const [ax, az] = [target.x - body.x, target.z - body.z];
    const [fx, fz] = [-Math.sin(body.heading), -Math.cos(body.heading)];
    const behind = ax * fx + az * fz < 0;
    const wanted = behind ? (ax * fz - az * fx < 0 ? lock : -lock) : Math.max(-lock, Math.min(lock, pursuit(body, body.heading, target, wheelbaseM)));
    const seconds = travelled / Math.max(car.speedMS, 1e-6);
    body.wheels += Math.max(-steerRate * seconds, Math.min(steerRate * seconds, wanted - body.wheels));
    // Heading runs anticlockwise; the wheels steer clockwise.
    body.heading -= (travelled / wheelbaseM) * Math.tan(body.wheels);
    body.x -= Math.sin(body.heading) * travelled;
    body.z -= Math.cos(body.heading) * travelled;
  }

  /** The middle of a vehicle on the ground, half its wheelbase ahead of its rear axle. */
  private middleOf({ body, kind }: LaneCar): { x: number; z: number } {
    const half = BUILDS[kind].wheelbaseM / 2;
    return { x: body.x - Math.sin(body.heading) * half, z: body.z - Math.cos(body.heading) * half };
  }

  private nearestOn(line: Line, at: { x: number; z: number }, from: number, to: number): number {
    const tile = this.tileOf(line);
    return alongNearest(tile.points, lineOf(tile, line), at.x, at.z, from, to);
  }

  /** Which way a car signals: the turn it is in, or the one coming within its signalling distance. A bike has no lamps. */
  private signalOf(car: LaneCar): number {
    if (car.kind !== "car") return SIGNAL.off;
    const tile = this.tileOf(car.place);
    let turn: string | null = null;
    if (car.place.connector) turn = tile.connectors[car.place.index].turn;
    else if (car.next?.connector && this.route(car)[0].to - car.place.along < Math.max(SIGNAL_M, car.speedMS * SIGNAL_S)) turn = tile.connectors[car.next.index].turn;
    return turn === "right" ? SIGNAL.right : turn === "left" ? SIGNAL.left : SIGNAL.off;
  }

  /** The place `offset` metres ahead along a car's way from where it is, through the lines it has chosen, and the way it runs there. */
  private onWay(car: LaneCar, offset: number): ReturnType<typeof pointAlong> {
    let along = car.place.along + offset;
    const legs = this.route(car);
    for (const leg of legs) {
      // The first leg is measured from its line's start, where the vehicle's own place is measured from.
      const start = leg === legs[0] ? 0 : leg.from;
      if (along <= leg.to - start) return this.pointOn(leg, start + along);
      along -= leg.to - start;
    }
    const last = legs[legs.length - 1];
    return this.pointOn(last, last.to + along);
  }

  private pointOn(line: Line, along: number): ReturnType<typeof pointAlong> {
    const tile = this.tileOf(line);
    return pointAlong(tile.points, lineOf(tile, line), along);
  }

  private poseAt(place: OnLane): Pose {
    return poseOf(this.pointOn(place, place.along));
  }

  private tileOf(place: Line): TileLanes {
    const tile = this.net.tile(place.tile);
    if (!tile) throw new Error(`${place.tile} has no lanes loaded`);
    return tile;
  }

  /** A tile's links by the path lane each leaves the end of on to a road, and by the road lane each leaves for a path. */
  private linksOf(tile: TileLanes) {
    let found = this.links.get(tile);
    if (!found) {
      found = { onTo: new Map(), offOf: new Map() };
      for (const [index, link] of tile.links.entries()) {
        const [by, key] = link.onToRoad ? [found.onTo, link.path] : [found.offOf, link.road];
        const list = by.get(key);
        if (list) list.push(index);
        else by.set(key, [index]);
      }
      this.links.set(tile, found);
    }
    return found;
  }

  /** The link a cyclist on a road turns off it at, ahead of where it is, if it does. */
  private exitOf(car: LaneCar): LaneCar["exit"] {
    const { place } = car;
    if (car.kind !== "bike" || place.connector || place.link) return null;
    const tile = this.tileOf(place);
    if (tile.lanes[place.index].path) return null;
    for (const index of this.linksOf(tile).offOf.get(place.index) ?? []) {
      const along = tile.links[index].along;
      if (along > place.along + 3 && this.pick(car) < TURN_OFF) return { link: index, along };
    }
    return null;
  }

  /** The lane a line runs on or leads to: a lane's own, a connector's next, a link's road or path. */
  private laneOf(line: Line): Lane {
    const tile = this.tileOf(line);
    if (line.link) {
      const link = tile.links[line.index];
      return tile.lanes[link.onToRoad ? link.road : link.path];
    }
    return tile.lanes[line.connector ? tile.connectors[line.index].to : line.index];
  }

  /**
   * The connector or link a vehicle takes at its lane's end: any way on its kind may ride, and for a cyclist at a path's
   * end, a link on to the road there. A dead end's turning round is a U-turn tighter than any car can make on its
   * wheels (a real driver backs and fills), so there a car's trip ends instead: it stops and is gone. A bike turns
   * round on the spot.
   */
  private choose(car: LaneCar): LineRef | null {
    if (car.place.connector || car.place.link) return null;
    if (car.next !== null) return car.next;
    const tile = this.tileOf(car.place);
    const ways: { way: LineRef; crossing: number | null }[] = tile.lanes[car.place.index].next
      .filter((index) => (car.kind === "car" ? tile.connectors[index].turn !== "back" : goes(car.kind, tile.lanes[tile.connectors[index].to])))
      .map((index) => ({ way: { tile: car.place.tile, index, connector: true }, crossing: null }));
    if (car.kind === "bike") for (const index of this.linksOf(tile).onTo.get(car.place.index) ?? []) ways.push({ way: { tile: car.place.tile, index, connector: false, link: true }, crossing: null });
    if (car.kind === "walker") {
      for (const { on, beyond } of this.crossingsFrom(tile, car.place.index)) ways.push({ way: { tile: car.place.tile, index: beyond, connector: false }, crossing: on });
      for (const index of this.pathsOn(tile, car.place.index)) ways.push({ way: { tile: car.place.tile, index, connector: false }, crossing: null });
    }
    const back = car.kind === "walker" && ways.length === 0 ? this.otherWay(tile, car.place.index) : null;
    if (back !== null) ways.push({ way: { tile: car.place.tile, index: back, connector: false }, crossing: null });
    const chosen = ways.length > 0 ? ways[Math.floor(this.pick(car) * ways.length)] : null;
    car.next = chosen?.way ?? null;
    car.crossing = chosen?.crossing ?? null;
    return car.next;
  }

  /** A tile's lanes by the road or path each is one way of. */
  private chainsOf(tile: TileLanes): Map<number, number[]> {
    let found = this.chains.get(tile);
    if (!found) {
      found = new Map();
      for (const [index, lane] of tile.lanes.entries()) {
        const list = found.get(lane.chain);
        if (list) list.push(index);
        else found.set(lane.chain, [index]);
      }
      this.chains.set(tile, found);
    }
    return found;
  }

  /** The paths that start where a path ends, not joined to it by a junction: a walker walks straight on to one. */
  private pathsOn(tile: TileLanes, index: number): number[] {
    const lane = tile.lanes[index];
    const end = pointAlong(tile.points, lane, Infinity);
    const joined = new Set(lane.next.map((connector) => tile.connectors[connector].to));
    return this.pathStartsNear(tile, end).filter((other) => tile.lanes[other].chain !== lane.chain && !joined.has(other));
  }

  /** The paths a walker may walk that start within a step of a place. */
  private pathStartsNear(tile: TileLanes, at: { x: number; z: number }): number[] {
    const found: number[] = [];
    for (const [index, lane] of tile.lanes.entries()) {
      if (!walks(lane)) continue;
      const start = pointAlong(tile.points, lane, 0);
      if (Math.abs(start.x - at.x) < PATH_ON_M && Math.abs(start.z - at.z) < PATH_ON_M && Math.hypot(start.x - at.x, start.z - at.z) < PATH_ON_M) found.push(index);
    }
    return found;
  }

  /** Turns a walker back the way it came, on to its path's other way where it stands, from a path's lane or a junction's connector. */
  private turnBack(car: LaneCar): boolean {
    if (car.place.link) return false;
    const tile = this.tileOf(car.place);
    const lane = tile.lanes[car.place.connector ? tile.connectors[car.place.index].from : car.place.index];
    const back = (this.chainsOf(tile).get(lane.chain) ?? []).find((other) => tile.lanes[other].forward !== lane.forward && walks(tile.lanes[other]));
    if (back === undefined) return false;
    const line = tile.lanes[back];
    car.place = { tile: car.place.tile, index: back, connector: false, along: alongNearest(tile.points, line, car.pose.x, car.pose.z, 0, Infinity) };
    this.around.put(car.id, car.place);
    car.next = null;
    car.crossing = null;
    car.shiftM = 0;
    return true;
  }

  /** A path's other way, starting where this one ends: where a walker with nowhere on to go turns back. */
  private otherWay(tile: TileLanes, index: number): number | null {
    const lane = tile.lanes[index];
    const end = pointAlong(tile.points, lane, Infinity);
    let best: { index: number; off: number } | null = null;
    for (const other of this.chainsOf(tile).get(lane.chain) ?? []) {
      if (tile.lanes[other].forward === lane.forward || !walks(tile.lanes[other])) continue;
      const start = pointAlong(tile.points, tile.lanes[other], 0);
      const off = Math.hypot(start.x - end.x, start.z - end.z);
      if (off < CUT_M && (!best || off < best.off)) best = { index: other, off };
    }
    return best?.index ?? null;
  }

  /**
   * The ways a walker at a path's end by a road can cross it: the link from its path on to the road there, and the path
   * beyond, linked to the road near where it met it, on the road's other side. It walks straight from one to the other.
   */
  private crossingsFrom(tile: TileLanes, index: number): { on: number; beyond: number }[] {
    const found: { on: number; beyond: number }[] = [];
    const { chain } = tile.lanes[index];
    const end = pointAlong(tile.points, tile.lanes[index], Infinity);
    for (const on of this.linksOf(tile).onTo.get(index) ?? []) {
      const onRoad = pointAlong(tile.points, tile.links[on], Infinity);
      for (const [off, link] of tile.links.entries()) {
        if (link.onToRoad || tile.lanes[link.path].chain === chain || !walks(tile.lanes[link.path])) continue;
        const offRoad = pointAlong(tile.points, link, 0);
        const beyond = pointAlong(tile.points, link, Infinity);
        if (Math.hypot(offRoad.x - onRoad.x, offRoad.z - onRoad.z) < CROSSING_REACH_M && Math.hypot(beyond.x - end.x, beyond.z - end.z) < LONGEST_CROSSING_M && this.crossesRoad(tile, on, off)) found.push({ on, beyond: link.path });
      }
    }
    return found;
  }

  /** Whether a link on to a road and one off it take a walker over the road, from one side of the lane it steps on to to the other, rather than along its edge. */
  private crossesRoad(tile: TileLanes, on: number, off: number): boolean {
    const link = tile.links[on];
    const road = pointAlong(tile.points, tile.lanes[link.road], link.along);
    const side = (point: { x: number; z: number }) => Math.sign((point.x - road.x) * road.dz - (point.z - road.z) * road.dx);
    return side(pointAlong(tile.points, link, 0)) !== side(pointAlong(tile.points, tile.links[off], Infinity));
  }

  /**
   * Whether anything on the road a walker's crossing spans, either way, is near where it crosses or will be soon, or
   * anything else on the roads is: a turn through a junction beside the crossing.
   */
  private roadBusy(car: LaneCar, on: number): boolean {
    const tile = this.tileOf(car.place);
    const link = tile.links[on];
    const at = pointAlong(tile.points, link, Infinity);
    for (const other of this.others()) {
      if (other.car?.kind === "walker" || other.still) continue;
      const [x, z] = [at.x - other.x, at.z - other.z];
      const away = Math.hypot(x, z);
      const closing = (other.vx * x + other.vz * z) / Math.max(away, 1e-6);
      if (away < JOIN_NEAR_M || (closing > SLOWEST_MS && away / closing < JOIN_WITHIN_S)) return true;
    }
    for (const lane of this.chainsOf(tile).get(tile.lanes[link.road].chain) ?? []) {
      if (tile.lanes[lane].path) continue;
      const along = alongNearest(tile.points, tile.lanes[lane], at.x, at.z, 0, Infinity);
      if (this.comingTo(car, { tile: car.place.tile, index: lane, connector: false }, along)) return true;
    }
    return false;
  }

  /** Where a line leads: the lane after a connector, and the road partway along or the path after a link. */
  private after(line: Line): Leg {
    const tile = this.tileOf(line);
    if (line.link) {
      const link = tile.links[line.index];
      const lane = { tile: line.tile, index: link.onToRoad ? link.road : link.path, connector: false };
      return { ...lane, from: link.onToRoad ? link.along : 0, to: this.around.length(lane) };
    }
    return this.whole({ tile: line.tile, index: tile.connectors[line.index].to, connector: false });
  }

  private whole(line: Line): Leg {
    return { ...line, from: 0, to: this.around.length(line) };
  }

  /** The line after a vehicle's own, from where it joins it, or none where its lane ends with no way on. */
  private onward(car: LaneCar): Leg | null {
    const route = this.route(car);
    // On to the path beyond, a walker crossing has stepped out on to the road, and is on it until it reaches the path.
    if (car.crossing !== null) car.onRoad = true;
    car.next = null;
    car.exit = null;
    return route.length > 1 ? route[1] : null;
  }

  /** Whether a car's way ends at its lane's end: a dead end, or a seam to a tile whose lanes aren't loaded. */
  private endsHere(car: LaneCar, route: Leg[]): boolean {
    return route.length === 1 && !car.place.connector && !car.place.link;
  }

  /**
   * The lines a vehicle will drive next, as far as it has chosen: its own, then its connector and the lane after, a
   * seam's other half, or a link and the road or path it leads to. The first leg runs to where the vehicle leaves its
   * line: the line's end, or a cyclist's turn off a road.
   */
  private route(car: LaneCar): Leg[] {
    const { place } = car;
    const own = this.whole(place);
    if (place.connector || place.link) return [own, this.after(place)];
    if (car.exit) {
      const link = { tile: place.tile, index: car.exit.link, connector: false, link: true };
      return [{ ...own, to: car.exit.along }, this.whole(link), this.after(link)];
    }
    const across = this.net.acrossSeam({ tile: place.tile, lane: place.index });
    if (across) return [own, this.whole({ tile: across.tile, index: across.lane, connector: false })];
    const next = this.choose(car);
    if (next === null) return [own];
    // A walker's way on to a path not joined to its own, across a road or turning back, is that path from its start.
    if (!next.connector && !next.link) return [own, this.whole(next)];
    return [own, this.whole(next), this.after(next)];
  }

  /** The speed a vehicle may ride at a place along a line: a car the line's limit; a cyclist its own pace, and no faster than a road's limit. */
  private wantedAt(car: LaneCar, place: OnLane): number {
    if (car.kind === "car") return this.limitAt(place);
    if (car.kind === "walker") return car.onRoad ? car.paceMS * CROSSING_SHARE : car.paceMS;
    if (place.link) return Math.min(car.paceMS, LINK_MS);
    return this.laneOf(place).path ? car.paceMS : Math.min(car.paceMS, this.limitAt(place));
  }

  /** A line's speed limit at a place along it: a lane's as signed, a connector's the lower of the lanes either side, turning round's, or a link's road's. */
  private limitAt(place: OnLane): number {
    const tile = this.tileOf(place);
    if (place.link) {
      const { from, ...road } = this.after(place);
      return this.limitAt({ ...road, along: from });
    }
    if (place.connector) {
      const connector = tile.connectors[place.index];
      if (connector.turn === "back") return TURN_ROUND_MS;
      const before = tile.lanes[connector.from].speeds;
      return Math.min(before[before.length - 1][1], tile.lanes[connector.to].speeds[0][1]) / 3.6;
    }
    let limit = 0;
    for (const [from, kmh] of tile.lanes[place.index].speeds) if (from <= place.along || limit === 0) limit = kmh;
    return limit / 3.6;
  }

  /** The fastest a vehicle may go now and still slow in comfort for every limit and bend ahead within its look. */
  private planned(car: LaneCar, route: Leg[]): number {
    let best = this.wantedAt(car, car.place);
    let ahead = -car.place.along;
    for (const leg of route) {
      const tile = this.tileOf(leg);
      const drawn = lineOf(tile, leg);
      let bends = this.bends.get(tile);
      if (!bends) {
        bends = bendSpeeds(tile);
        this.bends.set(tile, bends);
      }
      const start = leg === route[0] ? 0 : leg.from;
      let along = 0;
      for (let at = drawn.first; at < drawn.first + drawn.count; at++) {
        if (at > drawn.first) along += Math.hypot(tile.points[at * 3] - tile.points[at * 3 - 3], tile.points[at * 3 + 2] - tile.points[at * 3 - 1]);
        if (along < start || along > leg.to) continue;
        const gap = ahead + along - start;
        if (gap < 0) continue;
        if (gap > LOOK_M) return best;
        const cap = Math.min(bends[at], this.wantedAt(car, { ...leg, along }));
        best = Math.min(best, Math.sqrt(cap * cap + 2 * BRAKE * gap));
      }
      ahead += leg.to - start;
    }
    return best;
  }

  /**
   * The nearest vehicle ahead on the way this one is going, not on another branch out of the junction. A car passes a
   * cyclist rather than following it, so it brakes for one by where it rides (`react`), as for a simulated car.
   */
  private leader(car: LaneCar, route: Leg[]): Seen | null {
    const tile = this.tileOf(route[0]);
    const ways = new Set(route.map(keyOf));
    const into = route.find((line) => line.connector);
    if (into) for (const index of this.around.connectorsInto(tile, tile.connectors[into.index].to)) ways.add(keyOf({ tile: into.tile, index, connector: true }));
    // A simulated car is braked for by where it lies, whatever its way (`react`).
    // A car passes cyclists, and anyone passes walkers, by where they are (`react`); a car meets a walker only crossing its road.
    const followed = (kind: VehicleKind | undefined) => kind !== "walker" && !(car.kind === "car" && kind === "bike");
    return this.around.ahead(car.id, car.kind === "walker" ? FOOT_SEE_M : LOOK_M).find((seen) => !this.driven.has(seen.id) && ways.has(keyOf(seen.place)) && followed(this.cars.get(seen.id)?.kind)) ?? null;
  }

  /** Whether anyone but this vehicle is moving through the junction a connector crosses. */
  private junctionBusy(car: LaneCar, connector: number): boolean {
    const tile = this.tileOf(car.place);
    let through = this.junctions.get(tile);
    if (!through) {
      through = new Map();
      for (const [index, { junction }] of tile.connectors.entries()) {
        const list = through.get(junction);
        if (list) list.push(index);
        else through.set(junction, [index]);
      }
      this.junctions.set(tile, through);
    }
    // Only someone moving through it: one standing there may be waiting for this one to clear its way.
    const moving = (id: string) => {
      const other = this.cars.get(id);
      return other !== undefined && other.speedMS > BUILDS[other.kind].slowestMS;
    };
    return (through.get(tile.connectors[connector].junction) ?? []).some((index) => this.around.on({ tile: car.place.tile, index, connector: true }, car.id).some(({ id }) => moving(id)));
  }

  /** Whether anything on a road is coming up to where a link joins it, which a cyclist on the link gives way to. */
  private mustJoinYield(car: LaneCar, link: number): boolean {
    const { road, along } = this.tileOf(car.place).links[link];
    return this.comingTo(car, { tile: car.place.tile, index: road, connector: false }, along);
  }

  /** Whether anything on a road lane is at a place along it, or will be within a few seconds. */
  private comingTo(car: LaneCar, road: LineRef, along: number): boolean {
    for (const other of this.around.on(road, car.id)) {
      const gap = along - other.along;
      if (gap < -JOIN_NEAR_M / 2 || gap > JOIN_LOOK_M) continue;
      const speedMS = this.driven.get(other.id)?.speedMS ?? this.cars.get(other.id)?.speedMS ?? 0;
      if (Math.abs(gap) < JOIN_NEAR_M || (speedMS > SLOWEST_MS && gap / speedMS < JOIN_WITHIN_S)) return true;
    }
    return false;
  }

  /** Whether anything the car's turn gives way to is coming. */
  private mustYield(car: LaneCar, next: number, room: number): boolean {
    for (const seen of this.around.coming(car.place.tile, next, room)) {
      if (seen.id === car.id) continue;
      const other = this.driven.get(seen.id) ?? this.cars.get(seen.id);
      if (!other) continue;
      if (seen.place.connector) return true;
      if ("waiting" in other && other.waiting) continue;
      if (seen.gap < YIELD_NEAR_M || (other.speedMS > SLOWEST_MS && seen.gap / other.speedMS < YIELD_WITHIN_S)) return true;
    }
    return false;
  }

  /** A car's pull this step, by the intelligent driver model, towards its planned speed and short of what's ahead. */
  private pull(car: LaneCar, reaction: Reaction): number {
    const route = this.route(car);
    const { standstillM, headwayS, slowestMS } = BUILDS[car.kind];
    const wanted = Math.max(slowestMS, Math.min(this.planned(car, route), reaction.capMS));
    const obstacles = [...reaction.obstacles];
    const leader = this.leader(car, route);
    const ahead = leader && this.cars.get(leader.id);
    const lengths = car.half[1] + (ahead?.half[1] ?? car.half[1]);
    if (leader) obstacles.push({ gap: leader.gap - lengths, speedMS: ahead?.speedMS ?? 0 });
    // Queuing behind one stopped on its verge, on the verge too: a car standing still can't move aside later.
    if (car.kind !== "walker" && leader && ahead && ahead.shiftM > car.wantShiftM && ahead.speedMS < CRAWL_MS && leader.gap < QUEUE_M + lengths) car.wantShiftM = Math.min(this.roomOf(car).stopped, ahead.shiftM);
    car.waiting = false;
    if (this.endsHere(car, route)) obstacles.push({ gap: Math.max(0.1, route[0].to - car.place.along), speedMS: 0 });
    const toLine = route[0].to - car.place.along - STOP_BACK_M;
    const stopping = (car.speedMS * car.speedMS) / (2 * BRAKE) + 15;
    const next = car.place.connector || car.place.link ? null : car.next;
    if (next?.connector && this.tileOf(car.place).connectors[next.index].yields.length > 0 && toLine < stopping && this.mustYield(car, next.index, LOOK_M)) {
      obstacles.push({ gap: Math.max(0.1, toLine), speedMS: 0 });
      car.waiting = car.speedMS < slowestMS;
    }
    // The lane map gives a path's junctions no right of way: a cyclist waits while anyone else is crossing one. A walker
    // just never steps into anyone.
    if (car.kind === "bike" && next?.connector && this.laneOf(car.place).path && toLine < stopping && this.junctionBusy(car, next.index)) {
      obstacles.push({ gap: Math.max(0.1, toLine), speedMS: 0 });
      car.waiting = car.speedMS < slowestMS;
    }
    // A cyclist joining a road waits at its path's end, clear of the road, for a gap, and a walker crossing one for a gap
    // either way; once on the link, or the road, it's committed.
    const joining = next?.link && this.tileOf(car.place).links[next.index].onToRoad && toLine < stopping && this.mustJoinYield(car, next.index);
    const crossing = car.crossing !== null && toLine < stopping && this.roadBusy(car, car.crossing);
    if (joining || crossing) {
      obstacles.push({ gap: Math.max(0.1, toLine), speedMS: 0 });
      car.waiting = car.speedMS < slowestMS;
    }
    const v = car.speedMS;
    let pull = PULL * (1 - (v / wanted) ** 4);
    for (const { gap, speedMS } of obstacles) {
      const wish = standstillM + Math.max(0, v * headwayS + (v * (v - speedMS)) / (2 * Math.sqrt(PULL * BRAKE)));
      pull = Math.min(pull, PULL * (1 - (v / wanted) ** 4 - (wish / Math.max(0.1, gap)) ** 2));
    }
    return Math.max(-HARDEST_BRAKE, Math.min(PULL, pull));
  }

  /** Every car a driver may have to react to: the traffic cars (`react` sorts them) and the simulated ones. */
  private others(): Other[] {
    return [...[...this.cars.values()].map(asOther), ...this.driven.values()];
  }

  /** The width of the lane a car is on, or is turning on to. */
  private laneWidth(car: LaneCar): number {
    return this.laneOf(car.place).width;
  }

  /** How far right of its lane's middle a vehicle keeps when nothing moves it: a cyclist on a road, near its edge. */
  private keptRight(car: LaneCar): number {
    if (car.kind === "car" || car.place.link || this.laneOf(car.place).path) return 0;
    return Math.max(0, this.laneWidth(car) / 2 - car.half[0] - BIKE_EDGE_M);
  }

  /** How far a car can ease right of its lane's middle, on to the verge, as it drives by and once it has stopped. */
  private roomOf(car: LaneCar): { moving: number; stopped: number } {
    const edge = this.laneWidth(car) / 2 - car.half[0];
    return { moving: Math.max(0, edge + VERGE_M), stopped: Math.max(0, edge + STOPPED_VERGE_M) };
  }

  /** The point of a car's way nearest a place, from a little behind the car to as far as it sees, and how far ahead of the car it is. */
  private nearestOnWay(car: LaneCar, x: number, z: number): { ahead: number; point: ReturnType<typeof pointAlong> } | null {
    let best: { ahead: number; point: ReturnType<typeof pointAlong>; off: number } | null = null;
    const route = this.route(car);
    let before = -car.place.along;
    for (const leg of route) {
      // How far ahead of the vehicle this leg starts: the first leg from its line's own start, each after it from its join.
      const start = leg === route[0] ? 0 : leg.from;
      const from = Math.max(start, start - before - car.half[1] - ALONGSIDE_M - 4);
      const to = Math.min(leg.to, SEE_M - before + start);
      if (to >= from) {
        const along = this.nearestOn(leg, { x, z }, from, to);
        const point = this.pointOn(leg, along);
        const off = Math.hypot(point.x - x, point.z - z);
        if (!best || off < best.off) best = { ahead: before + along - start, point, off };
      }
      before += leg.to - start;
      if (before > SEE_M) break;
    }
    // Further off than a road is wide, it's on another road.
    return best && best.off < 12 ? best : null;
  }

  private outline(car: LaneCar, other: Other): Outline | null {
    const found = this.nearestOnWay(car, other.x, other.z);
    if (!found) return null;
    const { ahead, point } = found;
    const [wide, long] = other.half;
    const seen = { near: Infinity, far: -Infinity, left: Infinity, right: -Infinity };
    for (const [forth, side] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const x = other.x + other.fx * long * forth - other.fz * wide * side - point.x;
      const z = other.z + other.fz * long * forth + other.fx * wide * side - point.z;
      const along = ahead + x * point.dx + z * point.dz;
      const across = -x * point.dz + z * point.dx;
      seen.near = Math.min(seen.near, along);
      seen.far = Math.max(seen.far, along);
      seen.left = Math.min(seen.left, across);
      seen.right = Math.max(seen.right, across);
    }
    return { ...seen, near: seen.near - car.half[1], opposing: other.fx * point.dx + other.fz * point.dz < -0.5, alongMS: Math.max(0, other.vx * point.dx + other.vz * point.dz) };
  }

  /** Whether nothing but `except` is coming the other way on a car's road within a reach. */
  private clearAhead(car: LaneCar, others: Other[], except: string, reach: number): boolean {
    const laneWidth = this.laneWidth(car);
    for (const other of others) {
      if (other.id === car.id || other.id === except || Math.hypot(other.x - car.pose.x, other.z - car.pose.z) > reach + 10) continue;
      const seen = this.outline(car, other);
      if (seen?.opposing && seen.near < reach && seen.far > -car.half[1] && seen.right > -2 * laneWidth) return false;
    }
    return true;
  }

  /**
   * What the cars round a car ask of it this step. An oncoming one on a road too narrow for both at speed: ease right and
   * slow until it has passed, sharing the room with it, and where there isn't room for both to drive by, one stops on its
   * verge for the other. A simulated car anywhere across its path: brake for it, and go round it once it has stood there
   * a while and nothing is coming.
   */
  private react(car: LaneCar, others: Other[], seconds: number): Reaction {
    if (car.kind === "walker") return this.reactOnFoot(car, others, seconds);
    const reaction: Reaction = { obstacles: [], capMS: Infinity, shiftM: 0, meeting: null, waitedS: 0 };
    const [wide, long] = car.half;
    const room = this.roomOf(car);
    const laneWidth = this.laneWidth(car);
    const cap = (speedMS: number, near: number) => (reaction.capMS = Math.min(reaction.capMS, Math.sqrt(speedMS * speedMS + 2 * BRAKE * Math.max(0, near))));
    const stopAt = (gap: number) => reaction.obstacles.push({ gap: Math.max(0.1, gap), speedMS: 0 });
    const facing = { x: -Math.sin(car.body.heading), z: -Math.cos(car.body.heading) };
    let passing = false;
    let yielding = false;
    let creeping = false;
    let stillRound = false;
    let startRound = false;
    let blocked = false;
    let right = this.keptRight(car);
    let left = 0;
    const onFoot = car.kind === "bike" ? this.stillAround(car.pose.x, car.pose.z, WALKER_NOTICE_M) : [];
    for (const other of [...others, ...onFoot]) {
      if (other.id === car.id) continue;
      if (other.still || other.car?.kind === "walker") {
        if (Math.hypot(other.x - car.pose.x, other.z - car.pose.z) > WALKER_NOTICE_M) continue;
        const seen = this.outline(car, other);
        if (!seen || seen.far < -long) continue;
        if (car.kind === "car" || other.car?.onRoad) {
          // A car never meets a walker but one crossing its road, and stops short of them; nor does a cyclist go round one.
          if (other.car?.onRoad && seen.far > 0 && seen.right > car.shiftM - wide - CROSSING_MARGIN_M && seen.left < car.shiftM + wide + CROSSING_MARGIN_M) stopAt(seen.near);
          continue;
        }
        // A cyclist slows for someone on foot near its way, and passes them with room: left of one going its way or
        // standing, while nothing is coming, and right of one coming.
        const inWay = (shiftM: number) => seen.right > shiftM - wide - WALKER_ROOM_M && seen.left < shiftM + wide + WALKER_ROOM_M;
        if (!inWay(car.shiftM) && !inWay(right) && !inWay(left)) continue;
        cap(PAST_WALKER_MS, seen.near - 2);
        const middle = (seen.left + seen.right) / 2;
        if (seen.opposing || middle < 0) right = Math.max(right, Math.min(room.moving, seen.right + WALKER_ROOM_M + wide));
        else if (seen.left - WALKER_ROOM_M - wide >= -laneWidth - VERGE_M && this.clearAhead(car, others, other.id, WALKER_NOTICE_M)) left = Math.min(left, seen.left - WALKER_ROOM_M - wide);
        if (inWay(car.shiftM) && seen.far > 0) reaction.obstacles.push({ gap: Math.max(0.1, seen.near), speedMS: seen.opposing ? 0 : seen.alongMS });
        // Where paths bend through a junction its way and its body part; it never rides into anyone right in front of it.
        if (this.aboutToTouch(car, other)) stopAt(seen.near);
        continue;
      }
      // A cyclist going a car's way is passed with room to spare; anything else going a vehicle's way is the leader's business.
      const sameWay = other.fx * facing.x + other.fz * facing.z;
      const cyclist = car.kind === "car" && other.car?.kind === "bike" && sameWay > SAME_WAY;
      if (other.car && sameWay > 0 && !cyclist) continue;
      if (Math.hypot(other.x - car.pose.x, other.z - car.pose.z) > SEE_M) continue;
      const seen = this.outline(car, other);
      if (!seen || seen.far < -long - ALONGSIDE_M) continue;
      if (seen.opposing && (seen.left + seen.right) / 2 < 0 && !car.goingRound) {
        // Meeting one on the left: the room the two need beyond what their lanes leave between them.
        const need = PASS_CLEAR_M + wide + seen.right + (other.car?.shiftM ?? 0);
        if (need <= 0 || seen.near > Math.max(MEET_M, (car.speedMS + other.speedMS) * MEET_S)) continue;
        const theirs = other.car ? this.roomOf(other.car) : { moving: 0, stopped: 0 };
        const mine = other.car ? need / 2 : need;
        if (mine <= room.moving && need - mine <= theirs.moving) {
          right = Math.max(right, mine);
          cap(PASS_MS, seen.near);
          passing = true;
          continue;
        }
        // No room for both to drive by: one way stops on its verge and the other creeps by. A car takes the other role to
        // whichever the oncoming one has, so a whole queue yields to a whole queue; but a newcomer waits for one that has
        // stood long enough, and of two standing still, the one that has waited longer goes, so the two ways take turns and
        // two stuck nose to nose sort themselves out.
        const theirRole = other.car?.meeting;
        const mineBefore = car.meeting === "yields" || car.meeting === "creeps" ? car.meeting : null;
        const longer = (them: LaneCar) => car.waitedS > them.waitedS || (car.waitedS === them.waitedS && car.id < them.id);
        let role: "yields" | "creeps";
        if (other.car === null) role = other.speedMS > SLOWEST_MS ? "yields" : "creeps";
        else if (car.speedMS < STOPPED_MS && other.speedMS < STOPPED_MS && mineBefore && theirRole) role = longer(other.car) ? "creeps" : "yields";
        else if (theirRole === "creeps") role = "yields";
        else if (theirRole === "yields") {
          if (mineBefore === null) role = other.car.waitedS >= TURN_S ? "yields" : "creeps";
          else if (mineBefore === "yields") role = longer(other.car) ? "creeps" : "yields";
          else role = "creeps";
        } else role = mineBefore ?? (car.speedMS < other.speedMS || (car.speedMS === other.speedMS && car.id < other.id) ? "yields" : "creeps");
        if (role === "yields") {
          yielding = true;
          right = Math.max(right, room.stopped);
          stopAt(seen.near / 2);
          continue;
        }
        creeping = true;
        // By the room the other really leaves, so nothing creeps by a car that hasn't got out of the way yet.
        const clear = (other.speedMS < STOPPED_MS ? SQUEEZE_CLEAR_M : PASS_CLEAR_M) + wide + seen.right;
        right = Math.max(right, Math.min(room.stopped, clear));
        if (clear > room.stopped) stopAt(seen.near - MEET_GAP_M);
        else {
          cap(CRAWL_MS, seen.near);
          // About to draw alongside: not while its own body, as it really stands rather than where it aims, would touch the other.
          const self = this.outline(car, asOther(car));
          if (seen.near > 0 && seen.near < MEET_GAP_M && self && self.left < seen.right) stopAt(seen.near);
        }
        continue;
      }
      // Traffic facing this car in its lane, a cyclist ahead of a car, or a simulated car at any angle, is in its path.
      if (other.car && !seen.opposing && !cyclist) continue;
      if (car.goingRound && seen.opposing && seen.near > TOUCH_M) continue;
      const standing = other.car === null && other.speedMS < SLOWEST_MS;
      const margin = cyclist ? BIKE_ROOM_M : PATH_MARGIN_M;
      const across = (shiftM: number) => seen.right > shiftM - wide - margin && seen.left < shiftM + wide + margin && seen.far > 0;
      // Clear of the other's left side, and still on the road's far half and its verge.
      const round = seen.left - (cyclist ? BIKE_ROOM_M : PASS_CLEAR_M) - wide;
      const roundFits = round - wide >= -1.5 * laneWidth - VERGE_M;
      if ((standing || cyclist) && car.goingRound && roundFits) {
        stillRound = true;
        left = Math.min(left, round);
        if (standing) {
          cap(GO_ROUND_MS, seen.near);
          // Not drawing level while its body, as it really stands rather than where it aims, would touch a metre on.
          if (seen.near < 1 && overlapping(movedOn(asOther(car), 1), other, SQUEEZE_CLEAR_M)) stopAt(seen.near);
        }
        continue;
      }
      if (!across(car.shiftM)) continue;
      reaction.obstacles.push({ gap: Math.max(0.1, seen.near - (standing ? GO_ROUND_BACK_M : 0)), speedMS: seen.opposing ? 0 : seen.alongMS });
      // Stopped behind a car standing in the way, or held to a cyclist's pace: once it has been a while, it goes round.
      const heldUp = standing ? car.speedMS < STOPPED_MS && seen.near < QUEUE_M + GO_ROUND_BACK_M : cyclist && car.speedMS < other.speedMS + 1 && seen.near < QUEUE_M && !other.car?.waiting && !other.car?.place.connector;
      if (heldUp) {
        blocked = true;
        if (roundFits && car.blockedS >= GO_ROUND_WAIT_S && !car.place.connector && this.clearAhead(car, others, other.id, GO_ROUND_CLEAR_M)) startRound = true;
      }
    }
    // Queued close behind one of its own way that waits on its verge, it waits too, whatever it would do itself: it can't
    // creep by anyone from there, and the oncoming cars must see it as one of those they have the road from.
    const leader = this.leader(car, this.route(car));
    const ahead = leader && this.cars.get(leader.id);
    if (leader && ahead?.meeting === "yields" && leader.gap < QUEUE_M + car.half[1] + ahead.half[1]) yielding = true;
    reaction.meeting = yielding ? "yields" : creeping ? "creeps" : passing ? "passes" : null;
    reaction.waitedS = !yielding && !creeping ? 0 : car.speedMS < STOPPED_MS ? car.waitedS + seconds : car.waitedS;
    car.goingRound = stillRound || startRound;
    car.blockedS = blocked ? car.blockedS + seconds : 0;
    reaction.shiftM = left < 0 ? left : right;
    return reaction;
  }

  /**
   * Whether a walker or cyclist would step into someone ahead of it: on the ground, by its body as it really stands and
   * faces, whatever lane it means to be on, since one stepping between paths that don't join is off every lane.
   */
  private aboutToTouch(car: LaneCar, other: Other): boolean {
    const self = asOther(car);
    const ahead = (other.x - self.x) * self.fx + (other.z - self.z) * self.fz > 0;
    return ahead && overlapping(movedOn(self, FOOT_TOUCH_M), other, FOOT_CLEAR_M / 2);
  }

  /**
   * What the people and cyclists round a walker ask of it this step. It keeps its side: further right as someone comes,
   * past a slower walker on the left while nothing is coming, and round someone standing on whichever side is nearer.
   * It steps to the edge of the path and slows for a cyclist coming or catching it up. Cars it meets only crossing a
   * road, and it waits for those before it steps out.
   */
  private reactOnFoot(car: LaneCar, others: Other[], seconds: number): Reaction {
    const reaction: Reaction = { obstacles: [], capMS: Infinity, shiftM: 0, meeting: null, waitedS: 0 };
    const [wide, long] = car.half;
    const laneWidth = this.laneWidth(car);
    const edge = Math.max(0, laneWidth / 2 - wide) + FOOT_VERGE_M;
    const roundMost = laneWidth / 2 + FOOT_ROUND_MOST_M;
    let right = 0;
    let left = 0;
    const near = [...others, ...this.stillAround(car.pose.x, car.pose.z, FOOT_SEE_M)].filter((other) => other.id !== car.id && other.car?.kind !== "car" && (other.car !== null || other.still) && Math.hypot(other.x - car.pose.x, other.z - car.pose.z) < FOOT_SEE_M);
    const outlines = near.map((other) => ({ other, seen: this.outline(car, other) }));
    // Nothing coming on its left for a few metres: room to step out past someone.
    const clear = !outlines.some(({ other, seen }) => seen && !other.still && seen.opposing && seen.near < FOOT_SEE_M / 2 && seen.far > -long && seen.right > -laneWidth - wide - FOOT_CLEAR_M);
    for (const { other, seen } of outlines) {
      if (!seen || seen.far < -long - BIKE_NOTICE_M) continue;
      const middle = (seen.left + seen.right) / 2;
      const inWay = (shiftM: number) => seen.right > shiftM - wide - FOOT_CLEAR_M && seen.left < shiftM + wide + FOOT_CLEAR_M;
      if (other.car?.kind === "bike") {
        const behind = seen.far < long && !seen.opposing && other.speedMS > car.speedMS;
        const coming = seen.opposing && seen.near < BIKE_NOTICE_M && seen.far > -long;
        if ((behind || coming) && Math.abs(middle) < laneWidth + WALKER_ROOM_M) {
          right = Math.max(right, edge);
          reaction.capMS = Math.min(reaction.capMS, car.paceMS * ASIDE_SHARE);
        }
        continue;
      }
      if (seen.far < -long) continue;
      const standing = other.still === true || other.speedMS < BUILDS.walker.slowestMS;
      if (seen.opposing && !standing) {
        if (seen.near > FOOT_MEET_M) continue;
        if (middle <= 0) right = Math.max(right, Math.min(edge, seen.right + FOOT_CLEAR_M + wide));
        else left = Math.min(left, Math.max(-roundMost, seen.left - FOOT_CLEAR_M - wide));
        continue;
      }
      if (seen.far <= 0 || !inWay(car.shiftM)) continue;
      const slower = standing || other.speedMS < car.paceMS - 0.1;
      if (slower && seen.near < (standing ? FOOT_ROUND_M : FOOT_PASS_M)) {
        // Round someone standing on the nearer side that has room, keeping to a side once stepping out to it, and round a
        // walker on its left while nothing is coming.
        const [byLeft, byRight] = [seen.left - FOOT_CLEAR_M - wide, seen.right + FOOT_CLEAR_M + wide];
        const leftFits = byLeft >= -roundMost && (clear || standing);
        const rightFits = standing && byRight <= roundMost;
        const leftFirst = car.shiftM < -FOOT_CLEAR_M / 2 || (car.shiftM <= FOOT_CLEAR_M / 2 && -byLeft <= byRight);
        if (leftFits && (!rightFits || leftFirst)) {
          left = Math.min(left, byLeft);
          continue;
        }
        if (rightFits) {
          right = Math.max(right, byRight);
          continue;
        }
      }
      reaction.obstacles.push({ gap: Math.max(0.1, seen.near), speedMS: standing ? 0 : seen.alongMS });
    }
    // Never into someone, where paths meet and nobody has the right of way. Two walkers each about to step into the
    // other don't both wait: the one standing, or else the first by name, goes first.
    for (const { other, seen } of outlines) {
      if (!seen || other.car?.kind === "bike" || !this.aboutToTouch(car, other)) continue;
      const theirs = other.car;
      if (theirs?.kind === "walker") {
        const first = car.speedMS < theirs.speedMS || (car.speedMS === theirs.speedMS && car.id < theirs.id) ? car : theirs;
        if (this.aboutToTouch(theirs, asOther(car)) && first === car) continue;
      }
      reaction.obstacles.push({ gap: 0.1, speedMS: 0 });
    }
    reaction.shiftM = left < 0 ? left : right;
    // Held up with nothing to wait for, face to face with someone or squeezed by a corner, it steps aside, one way and
    // then the other, past whoever is in front: it still never steps into them.
    const held = car.speedMS < BUILDS.walker.slowestMS && !car.waiting;
    car.blockedS = held ? car.blockedS + seconds : 0;
    if (car.blockedS > FOOT_GIVE_UP_S && this.turnBack(car)) car.blockedS = 0;
    if (car.blockedS > FOOT_HELD_S) {
      reaction.obstacles = [];
      reaction.shiftM = Math.floor((car.blockedS - FOOT_HELD_S) / FOOT_ASIDE_S) % 2 === 0 ? edge : -laneWidth / 2 - FOOT_VERGE_M;
    }
    return reaction;
  }
}
