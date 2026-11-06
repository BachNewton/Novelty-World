import { lookAheadM, pursuit } from "../sim/autopilot";
import { Around, type OnLane, type Seen } from "./around";
import { alongNearest, pointAlong, type TileLanes } from "./lane-map";
import type { LaneNet } from "./lane-net";

/*
 * Cars that drive the lane map: each one a place on a lane or a connector, a
 * speed, and a body with steered front wheels and no physics. The body is
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
 * it once it has stood there a while and nothing is coming. Spawning is the simplest there is: a number of cars kept on
 * the lanes round a place, put down where nothing is near and taken away once
 * they drive out of reach.
 */

const LENGTH_M = 4.6;
/** Front axle to rear, a mid-sized car's. */
const WHEELBASE_M = 2.7;
/** How far the front wheels turn, and how fast: a real car's lock, at a calm hand's pace. */
const LOCK = 0.6;
const STEER_RATE = 0.9;
/** A driver aims this near at walking pace, so a tight junction isn't cut over its corner. */
const SHORTEST_LOOK_M = 4;
/** A turn is signalled from this far before its junction, or this many seconds at the car's speed if that's further. */
const SIGNAL_M = 35;
const SIGNAL_S = 4;
/** The intelligent driver model's numbers: pull away, comfortable braking, time gap, gap at a standstill. */
const PULL = 1.4;
const BRAKE = 2.2;
const HEADWAY_S = 1.4;
const STANDSTILL_M = 2.5;
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
/** A new car stands at least this far from any other. */
const SPAWN_CLEAR_M = 25;
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
  place: OnLane;
  speedMS: number;
  /** The connector it will take at its lane's end, once chosen. */
  next: number | null;
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
  pose: Pose;
  last: Pose;
}

type Line = Pick<OnLane, "tile" | "index" | "connector">;

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
  /** The traffic car, or none for a simulated car. */
  car: LaneCar | null;
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

const keyOf = ({ tile, index, connector }: Line) => `${tile}:${connector ? "c" : "l"}${index}`;

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
  private readonly cars = new Map<string, LaneCar>();
  private readonly bends = new WeakMap<TileLanes, Float32Array>();
  private readonly random: () => number;
  private driven = new Map<string, Other>();
  private made = 0;

  constructor(
    private readonly net: LaneNet,
    /** Half the width and length of each kind of car. */
    private readonly kinds: readonly (readonly [number, number])[],
    seed = 1,
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

  /** Puts a car down, moving at a speed. */
  spawn(place: OnLane, speedMS: number, model = Math.floor(this.random() * this.kinds.length), seed = Math.floor(this.random() * 2 ** 31)): LaneCar {
    const pose = this.poseAt(place);
    return this.put(`lane-car-${this.made++}`, place, pose, speedMS, model, seed);
  }

  /**
   * Takes a car back from the simulation, standing where it is, its middle and heading as given: on the lane running its
   * way nearest it, from where it steers back on to the lane as it drives off. None if no lane near it runs its way.
   */
  rejoin(id: string, at: { x: number; y: number; z: number; heading: number }, model: number, seed: number): LaneCar | null {
    const place = this.around.match(id, at.x, at.z, { x: -Math.sin(at.heading), z: -Math.cos(at.heading) });
    if (!place) return null;
    return this.put(id, place, { x: at.x, y: at.y, z: at.z, yaw: at.heading }, 0, model, seed);
  }

  private put(id: string, place: OnLane, pose: Pose, speedMS: number, model: number, seed: number): LaneCar {
    const body = { x: pose.x + Math.sin(pose.yaw) * (WHEELBASE_M / 2), z: pose.z + Math.cos(pose.yaw) * (WHEELBASE_M / 2), heading: pose.yaw, wheels: 0 };
    const car: LaneCar = {
      id,
      place,
      speedMS,
      next: null,
      waiting: false,
      half: this.kinds[model],
      shiftM: 0,
      wantShiftM: 0,
      meeting: null,
      waitedS: 0,
      goingRound: false,
      blockedS: 0,
      model,
      seed,
      body,
      signal: SIGNAL.off,
      offLaneM: 0,
      pose,
      last: pose,
    };
    this.cars.set(id, car);
    this.around.put(id, place);
    return car;
  }

  remove(id: string): void {
    this.cars.delete(id);
    this.around.forget(id);
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

  /** Keeps `count` cars on the road lanes within `reach` of a place: takes away those gone past it, and puts down one more if there are too few, no nearer than `nearest`. */
  keep(x: number, z: number, count: number, reach: number, nearest = 0): void {
    for (const car of this.cars.values()) if (Math.hypot(car.pose.x - x, car.pose.z - z) > reach * 1.25) this.remove(car.id);
    if (this.cars.size >= count) return;
    const lanes = this.net.lanesNear(x, z, reach).filter((ref) => !this.net.lane(ref).path);
    if (lanes.length === 0) return;
    const ref = lanes[Math.floor(this.random() * lanes.length)];
    const place: OnLane = { tile: ref.tile, index: ref.lane, connector: false, along: 0 };
    place.along = this.random() * this.around.length(place);
    const at = this.poseAt(place);
    const distance = Math.hypot(at.x - x, at.z - z);
    if (distance > reach || distance < nearest) return;
    for (const car of this.cars.values()) if (Math.hypot(car.pose.x - at.x, car.pose.z - at.z) < SPAWN_CLEAR_M) return;
    this.spawn(place, this.limitAt(place) * 0.8);
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
      const across = car.goingRound ? Infinity : Math.min(SHIFT_MS * seconds, SHIFT_PER_M * car.speedMS * seconds);
      car.shiftM += Math.max(-across, Math.min(across, car.wantShiftM - car.shiftM));
      if (this.endsHere(car, this.route(car)) && car.speedMS < SLOWEST_MS && this.around.length(car.place) - car.place.along < STANDSTILL_M + LENGTH_M) {
        this.remove(car.id);
        continue;
      }
      const travelled = car.speedMS * seconds;
      this.drive(car, travelled);
      // Where the car now is on its way is found from its body, as the autopilot finds itself on its line, never counted
      // on from where it was: a car steered round a corner covers a little less ground than its line, and would drift.
      const middle = this.middleOf(car.body);
      // Never back: a car only moves on along its way, so it can't lose its place and chase a point behind it.
      let along = this.nearestOn(car.place, middle, car.place.along, car.place.along + travelled + 2);
      while (along > this.around.length(car.place)) {
        const past = along - this.around.length(car.place);
        const onward = this.onward(car);
        if (!onward) break;
        car.place = { ...onward, along: 0 };
        along = this.nearestOn(car.place, middle, 0, past + 2);
      }
      if (along > this.around.length(car.place)) {
        // The lane leads off the loaded tiles, or nowhere.
        this.remove(car.id);
        continue;
      }
      car.place = { ...car.place, along };
      this.around.put(car.id, car.place);
      const ground = this.onWay(car, 0);
      car.pose = { ...middle, y: ground.y, yaw: car.body.heading };
      // Off its lane as it means to be, eased across or not.
      car.offLaneM = Math.hypot(middle.x - (ground.x - ground.dz * car.shiftM), middle.z - (ground.z + ground.dx * car.shiftM));
      car.signal = this.signalOf(car);
    }
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
    const ahead = this.onWay(car, lookAheadM(car.speedMS, SHORTEST_LOOK_M) - WHEELBASE_M / 2);
    // To the right of the way is (-dz, dx) on the ground.
    const target = { x: ahead.x - ahead.dz * car.shiftM, z: ahead.z + ahead.dx * car.shiftM };
    const wanted = Math.max(-LOCK, Math.min(LOCK, pursuit(body, body.heading, target, WHEELBASE_M)));
    const seconds = travelled / Math.max(car.speedMS, 1e-6);
    body.wheels += Math.max(-STEER_RATE * seconds, Math.min(STEER_RATE * seconds, wanted - body.wheels));
    // Heading runs anticlockwise; the wheels steer clockwise.
    body.heading -= (travelled / WHEELBASE_M) * Math.tan(body.wheels);
    body.x -= Math.sin(body.heading) * travelled;
    body.z -= Math.cos(body.heading) * travelled;
  }

  /** The middle of a car on the ground, half its wheelbase ahead of its rear axle. */
  private middleOf(body: Body): { x: number; z: number } {
    return { x: body.x - Math.sin(body.heading) * (WHEELBASE_M / 2), z: body.z - Math.cos(body.heading) * (WHEELBASE_M / 2) };
  }

  private nearestOn(line: Line, at: { x: number; z: number }, from: number, to: number): number {
    const tile = this.tileOf(line);
    return alongNearest(tile.points, line.connector ? tile.connectors[line.index] : tile.lanes[line.index], at.x, at.z, from, to);
  }

  /** Which way a car signals: the turn it is in, or the one coming within its signalling distance. */
  private signalOf(car: LaneCar): number {
    const tile = this.tileOf(car.place);
    let turn: string | null = null;
    if (car.place.connector) turn = tile.connectors[car.place.index].turn;
    else if (car.next !== null && this.around.length(car.place) - car.place.along < Math.max(SIGNAL_M, car.speedMS * SIGNAL_S)) turn = tile.connectors[car.next].turn;
    return turn === "right" ? SIGNAL.right : turn === "left" ? SIGNAL.left : SIGNAL.off;
  }

  /** The place `offset` metres ahead along a car's way from where it is, through the lines it has chosen, and the way it runs there. */
  private onWay(car: LaneCar, offset: number): ReturnType<typeof pointAlong> {
    let along = car.place.along + offset;
    const lines = this.route(car);
    for (const line of lines) {
      const length = this.around.length(line);
      if (along <= length) return this.pointOn(line, along);
      along -= length;
    }
    const last = lines[lines.length - 1];
    return this.pointOn(last, this.around.length(last) + along);
  }

  private pointOn(line: Line, along: number): ReturnType<typeof pointAlong> {
    const tile = this.tileOf(line);
    return pointAlong(tile.points, line.connector ? tile.connectors[line.index] : tile.lanes[line.index], along);
  }

  private poseAt(place: OnLane): Pose {
    const tile = this.tileOf(place);
    return poseOf(pointAlong(tile.points, place.connector ? tile.connectors[place.index] : tile.lanes[place.index], place.along));
  }

  private tileOf(place: Line): TileLanes {
    const tile = this.net.tile(place.tile);
    if (!tile) throw new Error(`${place.tile} has no lanes loaded`);
    return tile;
  }

  /**
   * The connector a car takes at its lane's end: any way on. A dead end's turning round is a U-turn tighter than any car
   * can make on its wheels (a real driver backs and fills), so there a car's trip ends instead: it stops and is gone.
   */
  private choose(car: LaneCar): number | null {
    if (car.place.connector) return null;
    if (car.next !== null) return car.next;
    const tile = this.tileOf(car.place);
    const onward = tile.lanes[car.place.index].next.filter((index) => tile.connectors[index].turn !== "back");
    car.next = onward.length > 0 ? onward[Math.floor(this.random() * onward.length)] : null;
    return car.next;
  }

  /** The line after a car's own, or none where its lane ends with no way on. */
  private onward(car: LaneCar): Line | null {
    const { place } = car;
    const tile = this.tileOf(place);
    if (place.connector) {
      car.next = null;
      return { tile: place.tile, index: tile.connectors[place.index].to, connector: false };
    }
    const across = this.net.acrossSeam({ tile: place.tile, lane: place.index });
    if (across) {
      car.next = null;
      return { tile: across.tile, index: across.lane, connector: false };
    }
    const next = this.choose(car);
    return next === null ? null : { tile: place.tile, index: next, connector: true };
  }

  /** Whether a car's way ends at its lane's end: a dead end, not a seam to the next tile. */
  private endsHere(car: LaneCar, route: Line[]): boolean {
    return route.length === 1 && !car.place.connector && !this.tileOf(car.place).lanes[car.place.index].seamEnd;
  }

  /** The lines a car will drive next, as far as it has chosen: its own, its connector and the lane after, or a seam's other half. */
  private route(car: LaneCar): Line[] {
    const { place } = car;
    const tile = this.tileOf(place);
    if (place.connector) return [place, { tile: place.tile, index: tile.connectors[place.index].to, connector: false }];
    const across = this.net.acrossSeam({ tile: place.tile, lane: place.index });
    if (across) return [place, { tile: across.tile, index: across.lane, connector: false }];
    const next = this.choose(car);
    return next === null ? [place] : [place, { tile: place.tile, index: next, connector: true }, { tile: place.tile, index: tile.connectors[next].to, connector: false }];
  }

  /** A line's speed limit at a place along it: a lane's as signed, a connector's the lower of the lanes either side, or turning round's. */
  private limitAt(place: OnLane): number {
    const tile = this.tileOf(place);
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

  /** The fastest a car may go now and still slow in comfort for every limit and bend ahead within its look. */
  private planned(car: LaneCar, route: Line[]): number {
    let best = this.limitAt(car.place);
    let ahead = -car.place.along;
    for (const line of route) {
      const tile = this.tileOf(line);
      const drawn = line.connector ? tile.connectors[line.index] : tile.lanes[line.index];
      let bends = this.bends.get(tile);
      if (!bends) {
        bends = bendSpeeds(tile);
        this.bends.set(tile, bends);
      }
      let along = 0;
      for (let at = drawn.first; at < drawn.first + drawn.count; at++) {
        if (at > drawn.first) along += Math.hypot(tile.points[at * 3] - tile.points[at * 3 - 3], tile.points[at * 3 + 2] - tile.points[at * 3 - 1]);
        const gap = ahead + along;
        if (gap < 0) continue;
        if (gap > LOOK_M) return best;
        const cap = Math.min(bends[at], this.limitAt({ ...line, along }));
        best = Math.min(best, Math.sqrt(cap * cap + 2 * BRAKE * gap));
      }
      ahead += this.around.length(line);
    }
    return best;
  }

  /** The nearest car ahead on the way this one is going, not on another branch out of the junction. */
  private leader(car: LaneCar, route: Line[]): Seen | null {
    const tile = this.tileOf(route[0]);
    const ways = new Set(route.map(keyOf));
    const into = route.find((line) => line.connector);
    if (into) tile.connectors.forEach((other, index) => other.to === tile.connectors[into.index].to && ways.add(keyOf({ tile: into.tile, index, connector: true })));
    // A simulated car is braked for by where it lies, whatever its way (`react`).
    return this.around.ahead(car.id, LOOK_M).find((seen) => !this.driven.has(seen.id) && ways.has(keyOf(seen.place))) ?? null;
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
    const wanted = Math.max(SLOWEST_MS, Math.min(this.planned(car, route), reaction.capMS));
    const obstacles = [...reaction.obstacles];
    const leader = this.leader(car, route);
    const ahead = leader && this.cars.get(leader.id);
    if (leader) obstacles.push({ gap: leader.gap - LENGTH_M, speedMS: ahead?.speedMS ?? 0 });
    // Queuing behind one stopped on its verge, on the verge too: a car standing still can't move aside later.
    if (leader && ahead && ahead.shiftM > car.wantShiftM && ahead.speedMS < CRAWL_MS && leader.gap < QUEUE_M + LENGTH_M) car.wantShiftM = Math.min(this.roomOf(car).stopped, ahead.shiftM);
    car.waiting = false;
    if (this.endsHere(car, route)) obstacles.push({ gap: Math.max(0.1, this.around.length(car.place) - car.place.along), speedMS: 0 });
    const next = car.place.connector ? null : car.next;
    if (next !== null && this.tileOf(car.place).connectors[next].yields.length > 0) {
      const toLine = this.around.length(car.place) - car.place.along - STOP_BACK_M;
      const stopping = (car.speedMS * car.speedMS) / (2 * BRAKE) + 15;
      if (toLine < stopping && this.mustYield(car, next, LOOK_M)) {
        obstacles.push({ gap: Math.max(0.1, toLine), speedMS: 0 });
        car.waiting = car.speedMS < SLOWEST_MS;
      }
    }
    const v = car.speedMS;
    let pull = PULL * (1 - (v / wanted) ** 4);
    for (const { gap, speedMS } of obstacles) {
      const wish = STANDSTILL_M + Math.max(0, v * HEADWAY_S + (v * (v - speedMS)) / (2 * Math.sqrt(PULL * BRAKE)));
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
    const tile = this.tileOf(car.place);
    return tile.lanes[car.place.connector ? tile.connectors[car.place.index].to : car.place.index].width;
  }

  /** How far a car can ease right of its lane's middle, on to the verge, as it drives by and once it has stopped. */
  private roomOf(car: LaneCar): { moving: number; stopped: number } {
    const edge = this.laneWidth(car) / 2 - car.half[0];
    return { moving: Math.max(0, edge + VERGE_M), stopped: Math.max(0, edge + STOPPED_VERGE_M) };
  }

  /** The point of a car's way nearest a place, from a little behind the car to as far as it sees, and how far ahead of the car it is. */
  private nearestOnWay(car: LaneCar, x: number, z: number): { ahead: number; point: ReturnType<typeof pointAlong> } | null {
    let best: { ahead: number; point: ReturnType<typeof pointAlong>; off: number } | null = null;
    let before = -car.place.along;
    for (const line of this.route(car)) {
      const length = this.around.length(line);
      const from = Math.max(0, -before - car.half[1] - ALONGSIDE_M - 4);
      const to = Math.min(length, SEE_M - before);
      if (to >= from) {
        const along = this.nearestOn(line, { x, z }, from, to);
        const point = this.pointOn(line, along);
        const off = Math.hypot(point.x - x, point.z - z);
        if (!best || off < best.off) best = { ahead: before + along, point, off };
      }
      before += length;
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
    let right = 0;
    let left = 0;
    for (const other of others) {
      // Traffic going this car's way is the leader's business.
      if (other.id === car.id || (other.car && other.fx * facing.x + other.fz * facing.z > 0)) continue;
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
      // Traffic facing this car in its lane, or a simulated car at any angle, is in its path.
      if (other.car && !seen.opposing) continue;
      if (car.goingRound && seen.opposing && seen.near > TOUCH_M) continue;
      const standing = other.car === null && other.speedMS < SLOWEST_MS;
      const across = (shiftM: number) => seen.right > shiftM - wide - PATH_MARGIN_M && seen.left < shiftM + wide + PATH_MARGIN_M && seen.far > 0;
      // Clear of the standing car's left side, and still on the road's far half and its verge.
      const round = seen.left - PASS_CLEAR_M - wide;
      const roundFits = round - wide >= -1.5 * laneWidth - VERGE_M;
      if (standing && car.goingRound && roundFits) {
        stillRound = true;
        left = Math.min(left, round);
        cap(GO_ROUND_MS, seen.near);
        // Not drawing level while its body, as it really stands rather than where it aims, would touch a metre on.
        if (seen.near < 1 && overlapping(movedOn(asOther(car), 1), other, SQUEEZE_CLEAR_M)) stopAt(seen.near);
        continue;
      }
      if (!across(car.shiftM)) continue;
      reaction.obstacles.push({ gap: Math.max(0.1, seen.near - (standing ? GO_ROUND_BACK_M : 0)), speedMS: seen.opposing ? 0 : seen.alongMS });
      if (standing && car.speedMS < STOPPED_MS && seen.near < QUEUE_M + GO_ROUND_BACK_M) {
        blocked = true;
        if (roundFits && car.blockedS >= GO_ROUND_WAIT_S && !car.place.connector && this.clearAhead(car, others, other.id, GO_ROUND_CLEAR_M)) startRound = true;
      }
    }
    // Queued close behind one of its own way that waits on its verge, it waits too, whatever it would do itself: it can't
    // creep by anyone from there, and the oncoming cars must see it as one of those they have the road from.
    const leader = this.leader(car, this.route(car));
    const ahead = leader && this.cars.get(leader.id);
    if (leader && ahead?.meeting === "yields" && leader.gap < QUEUE_M + LENGTH_M) yielding = true;
    reaction.meeting = yielding ? "yields" : creeping ? "creeps" : passing ? "passes" : null;
    reaction.waitedS = !yielding && !creeping ? 0 : car.speedMS < STOPPED_MS ? car.waitedS + seconds : car.waitedS;
    car.goingRound = stillRound || startRound;
    car.blockedS = blocked ? car.blockedS + seconds : 0;
    reaction.shiftM = left < 0 ? left : right;
    return reaction;
  }
}
