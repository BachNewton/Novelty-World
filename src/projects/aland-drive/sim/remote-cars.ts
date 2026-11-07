import RAPIER from "@dimforge/rapier3d-compat";
import { blendCarStates, type CarState, type Rotation, type Vector3 } from "./car-state";
import { GHOST_GROUPS, REMOTE_GROUPS } from "./groups";
import { CARS } from "./cars";
import { STEP_S } from "./tuning";

/*
 * Other players' cars, in this player's own Rapier world. Each player's client
 * is the authority over its own car and sends its `CarState` round; here each
 * of the others is a stand-in body with its own car's box, mass and inertia,
 * steered every step towards where that car is now: its last state carried on
 * by its own velocity and spin since it arrived, for a short while. The stand-in
 * is dynamic, not kinematic, so in a step where the two touch the solver trades
 * momentum between the two by their weights, so a van shoves a roadster aside
 * and is barely moved itself; the next step the stand-in is steered back on its way.
 * The other car feels the same contact on its own client, against this car's
 * stand-in there, so both drivers see the hit and each reacts with its own car.
 *
 * A stand-in touches only the car being driven (`groups.ts`): no gravity, no
 * ground, so a car whose ground isn't loaded here can't fall through it. A
 * stand-in put somewhere rather than steered there (a first sight, a reset, a
 * jump) touches nothing until it's clear of every simulated car, or the two would start
 * inside each other and be thrown apart. The same goes the other way: this
 * car put down near a stand-in (a reset, a challenge's retry on to the start
 * line, where the partner's last state may still stand) leaves it touching
 * nothing until the two are clear.
 *
 * Traffic near a simulated car has stand-ins too, in a set of their own, each
 * the box and weight of the world car it is rather than a drivable car's, and
 * each says how hard the last step's contact shoved it.
 */

/** A stand-in's body: half its box's width, height and length, how far up its body that box sits, and its weight. */
export interface StandInShape {
  halfSize: readonly [number, number, number];
  boxUpM: number;
  massKg: number;
  massUpM: number;
  inertia: readonly [number, number, number];
}

const shapeOf = (id: CarState["car"]): StandInShape => CARS[id].car;

/** A state carries on by its own motion this long at most: past it the car has stopped sending (a paused map, a hidden tab). */
const CARRY_ON_STEPS = 30;
/** How fast a stand-in closes on where its car is, a share a second, and the most that adds to its speed and spin. */
const PULL_PER_S = 10;
const MOST_CORRECTION_MS = 4;
const MOST_TURN_CORRECTION = 3;
/** Further than this from where it should be, a stand-in is put there instead. */
const SNAP_M = 6;
/** Apart by more than this, no two cars' boxes can touch: a ghost becomes solid. */
const CLEAR_M = 2 * Math.max(...Object.values(CARS).map(({ car }) => Math.hypot(...car.halfSize))) + 0.2;

const add = (a: Vector3, b: Vector3, by = 1): Vector3 => [a[0] + b[0] * by, a[1] + b[1] * by, a[2] + b[2] * by];
const difference = (a: Vector3, b: Vector3): Vector3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const capped = (a: Vector3, most: number): Vector3 => {
  const size = Math.hypot(...a);
  return size > most ? [(a[0] * most) / size, (a[1] * most) / size, (a[2] * most) / size] : a;
};
const point = ({ x, y, z }: { x: number; y: number; z: number }): Vector3 => [x, y, z];

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

/** The spin that would turn one rotation into another in a second, near enough for the small errors a stand-in has. */
function spinBetween(from: Rotation, to: Rotation): Vector3 {
  const [ax, ay, az, aw] = from;
  const [bx, by, bz, bw] = to;
  // to × conjugate(from)
  const x = -bw * ax + bx * aw - by * az + bz * ay;
  const y = -bw * ay + by * aw - bz * ax + bx * az;
  const z = -bw * az + bz * aw - bx * ay + by * ax;
  const w = bw * aw + bx * ax + by * ay + bz * az;
  const sign = w < 0 ? -2 : 2;
  return [x * sign, y * sign, z * sign];
}

/** Where a car heard some steps ago is now, by its own motion. */
export function carriedOn(state: CarState, steps: number): CarState {
  const seconds = Math.min(steps, CARRY_ON_STEPS) * STEP_S;
  const [x, y, z, w] = state.rotation;
  // The nose is -z in the car's frame.
  const nose: Vector3 = [-2 * (x * z + w * y), -2 * (y * z - w * x), -(1 - 2 * (x * x + y * y))];
  const forward = state.velocity[0] * nose[0] + state.velocity[1] * nose[1] + state.velocity[2] * nose[2];
  return {
    ...state,
    position: add(state.position, state.velocity, seconds),
    rotation: turned(state.rotation, state.spin, seconds),
    roll: state.roll.map((turned) => turned + (forward / CARS[state.car].car.wheelRadiusM) * seconds) as CarState["roll"],
  };
}

class RemoteCar {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  heard: CarState;
  /** Steps since `heard` arrived. */
  since = 0;
  ghost = true;
  /** How much the last step's contact changed its velocity, in m/s, and its spin, in rad/s. */
  shove = { linear: 0, angular: 0 };
  /** Where the car should be this step, and the velocity and spin it was steered with towards it. */
  private target: CarState;
  steered: { linear: Vector3; angular: Vector3 } = { linear: [0, 0, 0], angular: [0, 0, 0] };
  /** How its body really moves after the last step, contact and all. */
  moving: { velocity: Vector3; spin: Vector3 } = { velocity: [0, 0, 0], spin: [0, 0, 0] };
  before: CarState;
  after: CarState;

  constructor(
    rapier: RAPIER.World,
    state: CarState,
    readonly shape: StandInShape,
  ) {
    const [wide, tall, long] = shape.inertia;
    this.body = rapier.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setAdditionalMassProperties(shape.massKg, { x: 0, y: shape.massUpM, z: 0 }, { x: wide, y: tall, z: long }, { x: 0, y: 0, z: 0, w: 1 })
        .setGravityScale(0)
        .setCanSleep(false),
    );
    const [x, y, z] = shape.halfSize;
    this.collider = rapier.createCollider(
      RAPIER.ColliderDesc.cuboid(x, y, z).setTranslation(0, shape.boxUpM, 0).setDensity(0).setFriction(0.3).setRestitution(0.1).setCollisionGroups(GHOST_GROUPS),
      this.body,
    );
    this.heard = this.target = state;
    this.before = this.after = state;
    this.put(state);
  }

  put(state: CarState): void {
    const [x, y, z] = state.position;
    const [rx, ry, rz, rw] = state.rotation;
    this.body.setTranslation({ x, y, z }, true);
    this.body.setRotation({ x: rx, y: ry, z: rz, w: rw }, true);
    this.fade();
  }

  /** Touches nothing until it's clear of every simulated car. */
  fade(): void {
    this.ghost = true;
    this.collider.setCollisionGroups(GHOST_GROUPS);
  }

  near(at: Vector3): boolean {
    return Math.hypot(...difference(at, point(this.body.translation()))) <= CLEAR_M;
  }

  /** Steers the stand-in for the coming step. */
  steer(cars: readonly Vector3[]): void {
    this.since++;
    const target = carriedOn(this.heard, this.since);
    this.target = target;
    if (Math.hypot(...difference(target.position, point(this.body.translation()))) > SNAP_M) this.put(target);
    const off = difference(target.position, point(this.body.translation()));
    const { x, y, z, w } = this.body.rotation();
    const linear = add(target.velocity, capped(off, MOST_CORRECTION_MS / PULL_PER_S), PULL_PER_S);
    const angular = add(target.spin, capped(spinBetween([x, y, z, w], target.rotation), MOST_TURN_CORRECTION / PULL_PER_S), PULL_PER_S);
    this.body.setLinvel({ x: linear[0], y: linear[1], z: linear[2] }, true);
    this.body.setAngvel({ x: angular[0], y: angular[1], z: angular[2] }, true);
    this.steered = { linear, angular };
    const at = point(this.body.translation());
    if (this.ghost && cars.every((car) => Math.hypot(...difference(at, car)) > CLEAR_M)) {
      this.ghost = false;
      this.collider.setCollisionGroups(REMOTE_GROUPS);
    }
  }

  settle(): void {
    const { x, y, z, w } = this.body.rotation();
    const velocity = point(this.body.linvel());
    const spin = point(this.body.angvel());
    this.shove = { linear: Math.hypot(...difference(velocity, this.steered.linear)), angular: Math.hypot(...difference(spin, this.steered.angular)) };
    this.before = this.after;
    this.after = { ...this.target, position: point(this.body.translation()), rotation: [x, y, z, w] };
    this.moving = { velocity, spin };
  }
}

export class RemoteCars {
  private readonly cars = new Map<string, RemoteCar>();

  constructor(private readonly rapier: RAPIER.World) {}

  /** A car's state as its own client sent it, and its body: a drivable car's own, unless it's given. */
  hear(id: string, state: CarState, shape = shapeOf(state.car)): void {
    const car = this.cars.get(id);
    // A player who swaps car needs a stand-in of the new one's size and weight, put where it is.
    if (car && car.shape !== shape) this.forget(id);
    else if (car) {
      car.heard = state;
      car.since = 0;
      return;
    }
    this.cars.set(id, new RemoteCar(this.rapier, state, shape));
  }

  forget(id: string): void {
    const car = this.cars.get(id);
    if (!car) return;
    this.rapier.removeRigidBody(car.body);
    this.cars.delete(id);
  }

  ids(): string[] {
    return [...this.cars.keys()];
  }

  /** How much the last step's contact changed a stand-in's velocity and spin. */
  shove(id: string): { linear: number; angular: number } {
    const car = this.cars.get(id);
    if (!car) throw new Error(`no stand-in ${id}`);
    return car.shove;
  }

  /**
   * A stand-in as its body stands after the last step, moving across the ground as the step left it rather than as it was
   * steered. It has no ground and no weight on wheels, so the lift, pitch and roll a hit gives it are what a real car's
   * tyres and springs would take: out of the ground's plane it moves as it was steered.
   */
  bodyState(id: string): CarState {
    const car = this.cars.get(id);
    if (!car) throw new Error(`no stand-in ${id}`);
    const { velocity, spin } = car.moving;
    const { linear, angular } = car.steered;
    return { ...car.after, velocity: [velocity[0], linear[1], velocity[2]], spin: [angular[0], spin[1], angular[2]] };
  }

  /** Whether a car still touches nothing, having been put where it is. */
  ghost(id: string): boolean {
    return this.cars.get(id)?.ghost ?? true;
  }

  /** A simulated car has been put here rather than driven: every stand-in it could be inside touches nothing until they're apart. */
  placed(at: Vector3): void {
    for (const remote of this.cars.values()) if (remote.near(at)) remote.fade();
  }

  /** Before the world steps, with where every simulated car is. */
  steer(cars: readonly Vector3[]): void {
    for (const remote of this.cars.values()) remote.steer(cars);
  }

  /** After the world steps. */
  settle(): void {
    for (const remote of this.cars.values()) remote.settle();
  }

  /** A car a share of the way from the last step to this one. */
  stateAt(id: string, share: number): CarState {
    const car = this.cars.get(id);
    if (!car) throw new Error(`no remote car ${id}`);
    return blendCarStates(car.before, car.after, share);
  }
}
