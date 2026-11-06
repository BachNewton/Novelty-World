import { NO_INPUT } from "../sim/car";
import { CARS, type CarId } from "../sim/cars";
import { headingOf, speedOf, type CarState, type Vector3 } from "../sim/car-state";
import type { Drive, SimulatedCar } from "../sim/drive";
import type { StandInShape } from "../sim/remote-cars";
import { sagOf, STEP_S } from "../sim/tuning";
import { SIGNAL, type DrivenCar, type LaneTraffic, type Pose } from "./lane-driver";

/*
 * Where traffic meets the simulation. A traffic car away from every simulated
 * car is a place on a lane and nothing else. Near one it has a stand-in in the
 * simulation's world, as another player's car has (`sim/remote-cars.ts`): its
 * own box and weight, steered every step to where its lane driver has it, so a
 * touch trades momentum by weight and nothing passes through anything. A stand-in
 * is always pulled back on its way, so a car shoved hard is taken out of traffic
 * and built as a full simulated car where its stand-in was, moving as the hit
 * left it (`Drive.addMovingCar`): it brakes, slides and spins to a stop on its
 * own wheels, and stands with its hazards on. Traffic sees it as it sees the
 * player's car, queuing behind it and going round. After a while, on its wheels
 * and by a lane running its way, it rejoins traffic where it stands and drives
 * off; otherwise it stands until the player has gone, and goes.
 *
 * A world car's handling is the drivable car's nearest it in size, and its
 * collision box, once hit, is that car's too.
 */

/** Within this of a simulated car, a traffic car has a stand-in: inside the ground the simulated car already has round it. */
const NEAR_M = 100;
/** A stand-in's velocity or spin changed this much by one step's contact: it was hit, not brushed. */
const HIT_MS = 2;
const HIT_SPIN = 1;
/** Slower than this, a hit car has stopped. */
const STOPPED_MS = 0.3;
/** How long a hit car stands with its hazards on before it drives on. */
const WAIT_S = 5;
/** Its up at least this near straight up: on its wheels. */
const UPRIGHT = 0.8;
/** A hit car that can't drive on goes once the player is this far away. */
const GONE_M = 150;

interface Hit {
  id: string;
  model: number;
  seed: number;
  car: SimulatedCar;
  stoppedS: number;
}

/** A hit car as it is drawn: the world car it was, where it is. */
export interface HitCarView {
  id: string;
  model: number;
  seed: number;
  pose: Pose;
  signal: number;
}

const rideOf = (id: CarId) => CARS[id].car.wheelRadiusM + CARS[id].suspension.droopM - sagOf(CARS[id]);

/** The drivable car nearest a world car in size. */
function handlingOf([wide, long]: readonly [number, number]): CarId {
  let best: { id: CarId; off: number } | null = null;
  for (const [id, { car }] of Object.entries(CARS) as [CarId, (typeof CARS)[CarId]][]) {
    const off = Math.hypot(car.halfSize[0] - wide, car.halfSize[2] - long);
    if (!best || off < best.off) best = { id, off };
  }
  if (!best) throw new Error("no drivable cars");
  return best.id;
}

/** A world car's stand-in: its own footprint, at its handling car's height, weighed by its footprint against that car's. */
function shapeOf([wide, long]: readonly [number, number], id: CarId): StandInShape {
  const { car } = CARS[id];
  const scale = (wide * long) / (car.halfSize[0] * car.halfSize[2]);
  return { halfSize: [wide, car.halfSize[1], long], boxUpM: car.boxUpM, massKg: car.massKg * scale, massUpM: car.massUpM, inertia: [car.inertia[0] * scale, car.inertia[1] * scale, car.inertia[2] * scale] };
}

const upOf = ([x, , z]: CarState["rotation"]) => 1 - 2 * (x * x + z * z);
/** How fast a car rolls the way its nose points. */
const forwardOf = ({ rotation, velocity }: CarState) => -Math.sin(headingOf(rotation)) * velocity[0] - Math.cos(headingOf(rotation)) * velocity[2];

export class TrafficContact {
  private readonly handling: CarId[];
  private readonly shapes: StandInShape[];
  private readonly hits = new Map<string, Hit>();

  constructor(
    private readonly drive: Drive,
    private readonly traffic: LaneTraffic,
    kinds: readonly (readonly [number, number])[],
    /** How many simulation steps one traffic step lasts. */
    private readonly every: number,
  ) {
    this.handling = kinds.map(handlingOf);
    this.shapes = kinds.map((half, model) => shapeOf(half, this.handling[model]));
  }

  /**
   * Before a simulation step, `steps` into the traffic step that's being drawn: every traffic car near a simulated car
   * gets its stand-in, steered to where the drawn car will be at the step's end, and every hit car its input.
   */
  beforeStep(steps: number): void {
    const simulated = [this.drive.player.position, ...this.drive.cars().map(({ position }) => position)];
    const near = new Set<string>();
    for (const car of this.traffic.all()) {
      // A cyclist is never more than a place on a lane: it has no stand-in to touch.
      if (car.kind !== "car") continue;
      if (!simulated.some(([x, , z]) => Math.hypot(car.pose.x - x, car.pose.z - z) < NEAR_M)) continue;
      near.add(car.id);
      this.drive.traffic.hear(car.id, this.stateOf(car.id, car.model, steps), this.shapes[car.model]);
    }
    for (const id of this.drive.traffic.ids()) if (!near.has(id)) this.drive.traffic.forget(id);
    // The brake reverses a car that has stopped, so it brakes only while it still rolls forward, and holds on the handbrake.
    for (const hit of this.hits.values()) hit.car.input = forwardOf(hit.car.stateAt(1)) > STOPPED_MS ? { ...NO_INPUT, brake: 1 } : { ...NO_INPUT, handbrake: true };
  }

  /** After a simulation step: a stand-in shoved hard becomes a simulated car, and a hit car that has stood long enough drives on or goes. */
  afterStep(): void {
    for (const id of this.drive.traffic.ids()) {
      const { linear, angular } = this.drive.traffic.shove(id);
      if (linear > HIT_MS || angular > HIT_SPIN) this.hit(id);
    }
    const [px, , pz] = this.drive.player.position;
    for (const hit of [...this.hits.values()]) {
      const state = hit.car.stateAt(1);
      hit.stoppedS = speedOf(state) < STOPPED_MS ? hit.stoppedS + STEP_S : 0;
      if (hit.stoppedS < WAIT_S) continue;
      const [x, y, z] = state.position;
      const rejoined = upOf(state.rotation) > UPRIGHT && this.traffic.rejoin(hit.id, { x, y: y - rideOf(hit.car.id), z, heading: headingOf(state.rotation) }, hit.model, hit.seed);
      if (rejoined || Math.hypot(x - px, z - pz) > GONE_M) {
        this.drive.removeCar(hit.car);
        this.hits.delete(hit.id);
      }
    }
  }

  private hit(id: string): void {
    const car = this.traffic.get(id);
    if (!car) throw new Error(`a stand-in for ${id}, which isn't in traffic`);
    const state = this.drive.traffic.bodyState(id);
    this.drive.traffic.forget(id);
    this.traffic.remove(id);
    this.hits.set(id, { id, model: car.model, seed: car.seed, car: this.drive.addMovingCar(state), stoppedS: 0 });
  }

  /** Where a traffic car's stand-in is at the start of a simulation step `steps` into the drawn traffic step, moving as the drawn car does. */
  private stateOf(id: string, model: number, steps: number): CarState {
    const car = this.traffic.get(id);
    if (!car) throw new Error(`no traffic car ${id}`);
    const seconds = STEP_S * this.every;
    const pose = this.traffic.poseBetween(car, steps / this.every);
    let turn = car.pose.yaw - car.last.yaw;
    turn -= Math.round(turn / (2 * Math.PI)) * 2 * Math.PI;
    const handling = this.handling[model];
    const velocity: Vector3 = [(car.pose.x - car.last.x) / seconds, (car.pose.y - car.last.y) / seconds, (car.pose.z - car.last.z) / seconds];
    return {
      car: handling,
      position: [pose.x, pose.y + rideOf(handling), pose.z],
      rotation: [0, Math.sin(pose.yaw / 2), 0, Math.cos(pose.yaw / 2)],
      velocity,
      spin: [0, turn / seconds, 0],
      steer: car.body.wheels,
      suspension: [0, 0, 0, 0],
      roll: 0,
      lamps: { head: true, brake: false, reverse: false },
    };
  }

  /** Every simulated car traffic should see: the hit ones, and the player's unless it's left out. */
  driven(playerHalf: readonly [number, number] | null): DrivenCar[] {
    const seen = (id: string, state: CarState, half: readonly [number, number]): DrivenCar => ({ id, x: state.position[0], z: state.position[2], heading: headingOf(state.rotation), vx: state.velocity[0], vz: state.velocity[2], half });
    const hits = [...this.hits.values()].map((hit) => seen(hit.id, hit.car.stateAt(1), this.shapeHalf(hit.model)));
    return playerHalf ? [seen("player", this.drive.player.stateAt(1), playerHalf), ...hits] : hits;
  }

  /** The hit cars a share of the way from the last simulation step to this one. */
  hitCars(share: number): HitCarView[] {
    return [...this.hits.values()].map(({ id, model, seed, car }) => {
      const state = car.stateAt(share);
      return { id, model, seed, pose: { x: state.position[0], y: state.position[1] - rideOf(car.id), z: state.position[2], yaw: headingOf(state.rotation) }, signal: SIGNAL.hazards };
    });
  }

  count(): number {
    return this.hits.size;
  }

  private shapeHalf(model: number): readonly [number, number] {
    const [wide, , long] = this.shapes[model].halfSize;
    return [wide, long];
  }
}
