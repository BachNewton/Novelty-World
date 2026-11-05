import { Around, type OnLane, type Seen } from "./around";
import { pointAlong, type TileLanes } from "./lane-map";
import type { LaneNet } from "./lane-net";

/*
 * Cars that drive the lane map: each one a place on a lane or a connector and a
 * speed, with no physics. A car follows its lane, picks a way on at each
 * junction, keeps its distance from what's ahead of it by the intelligent driver
 * model, slows for bends and lower limits before it reaches them, and stops at
 * a junction's line while anything its turn gives way to is coming. Spawning is
 * the simplest there is: a number of cars kept on the lanes round a place, put
 * down where nothing is near and taken away once they drive out of reach.
 */

const LENGTH_M = 4.6;
/** Front axle to rear: a car is drawn with both on its way, so it swings round a bend as a real one does rather than turning at each corner of the line. */
const WHEELBASE_M = 2.7;
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
/** A new car stands at least this far from any other. */
const SPAWN_CLEAR_M = 25;

export interface Pose {
  x: number;
  y: number;
  z: number;
  /** Turns a model's +z, its tail, against the way it drives. */
  yaw: number;
}

export interface LaneCar {
  id: string;
  place: OnLane;
  speedMS: number;
  /** The connector it will take at its lane's end, once chosen. */
  next: number | null;
  /** The line it drove before this one, where its rear axle may still be. */
  behind: Line | null;
  /** Stopped at a junction's line for what it gives way to. */
  waiting: boolean;
  model: number;
  seed: number;
  pose: Pose;
  last: Pose;
}

type Line = Pick<OnLane, "tile" | "index" | "connector">;

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

const poseOf = (point: { x: number; y: number; z: number; dx: number; dz: number }): Pose => ({ x: point.x, y: point.y, z: point.z, yaw: Math.atan2(-point.dx, -point.dz) });

export class LaneTraffic {
  readonly around: Around;
  private readonly cars = new Map<string, LaneCar>();
  private readonly bends = new WeakMap<TileLanes, Float32Array>();
  private readonly random: () => number;
  private player: { speedMS: number } | null = null;
  private made = 0;

  constructor(
    private readonly net: LaneNet,
    private readonly kinds: number,
    seed = 1,
  ) {
    this.around = new Around(net);
    this.random = mulberry(seed);
    // Around forgets a car whose tile went before this hears of it.
    net.subscribe(() => {
      for (const id of this.cars.keys()) if (!this.around.where(id)) this.cars.delete(id);
    });
  }

  all(): IterableIterator<LaneCar> {
    return this.cars.values();
  }

  count(): number {
    return this.cars.size;
  }

  /** Puts a car down, moving at a speed. */
  spawn(place: OnLane, speedMS: number, model = Math.floor(this.random() * this.kinds), seed = Math.floor(this.random() * 2 ** 31)): LaneCar {
    const id = `lane-car-${this.made++}`;
    const pose = this.poseAt(place);
    const car: LaneCar = { id, place, speedMS, next: null, behind: null, waiting: false, model, seed, pose, last: pose };
    this.cars.set(id, car);
    this.around.put(id, place);
    return car;
  }

  remove(id: string): void {
    this.cars.delete(id);
    this.around.forget(id);
  }

  /**
   * Where the player's car is, so traffic follows it and gives way to it while it drives; off every lane it's nowhere.
   * A stopped one is nowhere too: nothing here yet drives round a car standing in the road, so traffic behind it would
   * wait for good.
   */
  setPlayer(x: number, z: number, heading: { x: number; z: number }, speedMS: number): void {
    this.player = speedMS > SLOWEST_MS && this.around.match("player", x, z, heading) ? { speedMS } : null;
    if (!this.player) this.around.forget("player");
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
    const pulls = new Map<string, number>();
    for (const car of this.cars.values()) pulls.set(car.id, this.pull(car));
    for (const car of [...this.cars.values()]) {
      car.last = car.pose;
      car.speedMS = Math.max(0, car.speedMS + (pulls.get(car.id) ?? 0) * seconds);
      car.place = { ...car.place, along: car.place.along + car.speedMS * seconds };
      while (car.place.along > this.around.length(car.place)) {
        const onward = this.onward(car);
        if (!onward) break;
        car.behind = car.place;
        car.place = { ...onward, along: car.place.along - this.around.length(car.place) };
      }
      if (car.place.along > this.around.length(car.place)) {
        // The lane leads off the loaded tiles, or nowhere.
        this.remove(car.id);
        continue;
      }
      this.around.put(car.id, car.place);
      car.pose = this.carPose(car);
    }
  }

  /** Where a car is drawn between its last step and this one. */
  poseBetween(car: LaneCar, share: number): Pose {
    const { last, pose } = car;
    let turn = pose.yaw - last.yaw;
    turn -= Math.round(turn / (2 * Math.PI)) * 2 * Math.PI;
    return { x: last.x + (pose.x - last.x) * share, y: last.y + (pose.y - last.y) * share, z: last.z + (pose.z - last.z) * share, yaw: last.yaw + turn * share };
  }

  /** A car's pose from its two axles' places on its way: the rear on its line or the one before, the front on the lines ahead. */
  private carPose(car: LaneCar): Pose {
    const rear = this.onWay(car, -WHEELBASE_M / 2);
    const front = this.onWay(car, WHEELBASE_M / 2);
    return poseOf({ x: (rear.x + front.x) / 2, y: (rear.y + front.y) / 2, z: (rear.z + front.z) / 2, dx: front.x - rear.x, dz: front.z - rear.z });
  }

  /** The place `offset` metres along a car's way from where it is, ahead through the lines it has chosen or back into the one before. */
  private onWay(car: LaneCar, offset: number): { x: number; y: number; z: number } {
    let along = car.place.along + offset;
    // A tile let go behind a car takes its rear axle's line with it; the rear then rests at its own line's start.
    if (along < 0 && car.behind && this.net.tile(car.behind.tile)) return this.pointOn(car.behind, this.around.length(car.behind) + along);
    for (const line of this.route(car)) {
      const length = this.around.length(line);
      if (along <= length) return this.pointOn(line, along);
      along -= length;
    }
    const lines = this.route(car);
    const last = lines[lines.length - 1];
    return this.pointOn(last, this.around.length(last) + along);
  }

  private pointOn(line: Line, along: number) {
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

  /** The connector a car takes at its lane's end: any way on, turning round only where nothing else leads on. */
  private choose(car: LaneCar): number | null {
    if (car.place.connector) return null;
    if (car.next !== null) return car.next;
    const tile = this.tileOf(car.place);
    const ways = tile.lanes[car.place.index].next;
    const onward = ways.filter((index) => tile.connectors[index].turn !== "back");
    const from = onward.length > 0 ? onward : ways;
    car.next = from.length > 0 ? from[Math.floor(this.random() * from.length)] : null;
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
    return this.around.ahead(car.id, LOOK_M).find((seen) => ways.has(keyOf(seen.place))) ?? null;
  }

  /** Whether anything the car's turn gives way to is coming. */
  private mustYield(car: LaneCar, next: number, room: number): boolean {
    for (const seen of this.around.coming(car.place.tile, next, room)) {
      if (seen.id === car.id) continue;
      const other = seen.id === "player" ? this.player : this.cars.get(seen.id);
      if (!other) continue;
      if (seen.place.connector) return true;
      if ("waiting" in other && other.waiting) continue;
      if (seen.gap < YIELD_NEAR_M || (other.speedMS > SLOWEST_MS && seen.gap / other.speedMS < YIELD_WITHIN_S)) return true;
    }
    return false;
  }

  /** A car's pull this step, by the intelligent driver model, towards its planned speed and short of what's ahead. */
  private pull(car: LaneCar): number {
    const route = this.route(car);
    const wanted = Math.max(SLOWEST_MS, this.planned(car, route));
    const obstacles: { gap: number; speedMS: number }[] = [];
    const leader = this.leader(car, route);
    if (leader) obstacles.push({ gap: leader.gap - LENGTH_M, speedMS: (leader.id === "player" ? this.player : this.cars.get(leader.id))?.speedMS ?? 0 });
    car.waiting = false;
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
}
