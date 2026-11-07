import RAPIER from "@dimforge/rapier3d-compat";
import { axleShare, sagOf, STEP_S, wheelBaseOf, type CarTuning } from "./tuning";
import { CARS, type CarId } from "./cars";
import type { CarState, Rotation, Vector3 } from "./car-state";
import { CAR_GROUPS, WHEEL_RAY_GROUPS } from "./groups";
import { pullAt, radiansPerMetre, restingEngine, runningEngine, stepEngine, type EngineRead } from "./gearbox";
import { FIRM_FOOTING, GROUND_GRIP, type Condition, type Footing, type Surface, type SurfaceGrip, type Tyre } from "./surfaces";

/*
 * The car: a rigid body on four rays. Each step a ray from each wheel's mount
 * finds the road, a spring holds the body up there, and the tyre pushes back on
 * the body at the contact point, so weight transfer, squat, dive and lean all
 * come out of the same forces rather than being added.
 *
 * Rapier's own ray-cast vehicle isn't used: its tyres are a single clamped
 * friction with no slip curve, which leaves no way to shape how the car lets go
 * in a handbrake turn or holds on at 200 km/h, and those are the game.
 *
 * Each wheel reads what its ray landed on, and the surface, the condition and
 * the tyres fitted reshape that wheel's tyre curve (`surfaces.ts`): a car with
 * two wheels on the verge grips on two and slides on two.
 */

export interface DriveInput {
  /** 0 to 1. */
  throttle: number;
  /** 0 to 1. Also reverse, once stopped. */
  brake: number;
  /** -1 left to 1 right. */
  steer: number;
  handbrake: boolean;
}

export const NO_INPUT: DriveInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };

/**
 * The driver's aids, each the player's to turn off, as in Forza Horizon. With all three on the car is as forgiving
 * as it was tuned: no wheel spins or locks, and the car turns no faster than its tyres can take.
 */
export interface Assists {
  /** The brakes never lock a wheel. Off, a locked front wheel steers nothing. */
  abs: boolean;
  /** The engine never spins a wheel. Off, the whole engine reaches the wheels, and a tyre can spin. */
  traction: boolean;
  /** Steadies the car's turn to what its steering asks. Off, the car turns only as its tyres push it. */
  stability: boolean;
}

export const ALL_ASSISTS: Assists = { abs: true, traction: true, stability: true };
export const ASSISTS = ["abs", "traction", "stability"] as const satisfies readonly (keyof Assists)[];

/** What the wheels stand on: the surface a ray landed on, and the condition every surface is in. */
export interface Underfoot {
  readonly condition: Condition;
  surfaceUnder(hit: RAPIER.RayColliderIntersection, x: number, z: number): Surface;
}

/** How a wheel's tyre met the ground on the last step, for what's drawn of it: the simulation reads none of it back. */
export interface Tread {
  /** Where the tyre touched, at the start of the step; under the wheel's mount at full droop when it touched nothing. */
  readonly contact: Vector3;
  /** How fast the ground passed under the tyre along the way it rolls, and across it, metres a second; 0 off the ground. */
  rollMS: number;
  slideMS: number;
  /** What the tyre was asked for over what it could grip: past 1 it was sliding, spinning or locked. 0 off the ground. */
  demand: number;
  /** How much faster the tyre's tread turned than the ground passed under it, metres a second: above 0 spinning, below it locking. */
  spinMS: number;
}

const WHEELS = [
  { side: -1, end: 1 },
  { side: 1, end: 1 },
  { side: -1, end: -1 },
  { side: 1, end: -1 },
] as const;

const SLOW_MS = 0.6;
const STOPPED_FOR_REVERSE_MS = 1;
/** The share of the peak slip angle the lock allows on top of the path, measured: more and the fronts slide past their peak at middle speeds. */
const SLIP_ROOM = 0.3;
/** How far past the angle they grip best at the steering lets the front tyres run, wherever the car is heading. */
const FRONT_SLIP_HELD = 1;
/** Under this speed the steering turns as far as the wheel asks: a hairpin taken slowly needs the lock before the car has turned to it. */
const FRONT_SLIP_HELD_FROM_MS = 10;
/** A wheel and its brake disc turning, kg m². */
const WHEEL_INERTIA = 1.2;
/** The engine's flywheel and the gearbox turning with it, kg m²: in a low gear it is most of what a driven wheel has to spin up. */
const ENGINE_INERTIA = 0.2;
/** How much faster or slower than the road a tyre's tread turns where it grips best, as a share of the road's speed. */
const PEAK_SLIP_RATIO = 0.1;
/** A spinning or locked wheel's own turning is worked out in this many steps a step: it settles faster than the car moves. */
const WHEEL_SUBSTEPS = 16;

function rotate(q: Rotation, v: Vector3): Vector3 {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + y * tz - z * ty, v[1] + w * ty + z * tx - x * tz, v[2] + w * tz + x * ty - y * tx];
}

const dot = (a: Vector3, b: Vector3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vector3, b: Vector3): Vector3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a: Vector3, by: number): Vector3 => [a[0] * by, a[1] * by, a[2] * by];
const along = (a: Vector3, b: Vector3, by: number): Vector3 => [a[0] + b[0] * by, a[1] + b[1] * by, a[2] + b[2] * by];
const unit = (a: Vector3): Vector3 => scale(a, 1 / Math.hypot(...a));
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const point = ({ x, y, z }: { x: number; y: number; z: number }): Vector3 => [x, y, z];

/** Grip against slip: a rise to the peak, then an easing down to a sliding share. */
function gripAt({ peakSlip, slideShare }: Pick<CarTuning["grip"], "peakSlip" | "slideShare">, slip: number): number {
  const size = Math.abs(slip) / peakSlip;
  const curve = size < 1 ? 1.5 * size - 0.5 * size ** 3 : slideShare + (1 - slideShare) * Math.exp(1 - size);
  return Math.sign(slip) * curve;
}

/**
 * The wheels' lock at a speed: the angle that asks for about all the grip there
 * is, and no more. A tyre only pushes sideways once it runs at an angle to where
 * it rolls, so on top of the path's own angle the lock keeps room for some of the
 * slip the tyres grip best at. With the path's angle alone the lock was a degree
 * or so at speed, and the fronts never reached their grip. The lock knows the
 * footing, as a driver feels it through the wheel: on ice it asks for an ice
 * corner, so full lock never ploughs the fronts on.
 */
export function steerLimit(tuning: CarTuning, speed: number, handbrake: boolean, footing: Footing = FIRM_FOOTING): number {
  const { grip, steering } = tuning;
  const path = Math.atan((wheelBaseOf(tuning) * steering.cornerMS2 * footing.grip * steering.cornerMargin) / Math.max(speed * speed, 1));
  return Math.min(steering.lock, path + SLIP_ROOM * grip.peakSlip * footing.peakSlip) * (handbrake ? steering.handbrakeLock : 1);
}

export class Car {
  readonly body: RAPIER.RigidBody;
  private readonly collider: RAPIER.Collider;
  private steer = 0;
  private readonly roll: CarState["roll"] = [0, 0, 0, 0];
  /** How fast each tyre's tread turns, metres a second: the road's speed while it grips, its own while it spins or locks. */
  private readonly wheelMS = [0, 0, 0, 0];
  private readonly slipping = [false, false, false, false];
  /** The driver's aids, which a car keeps until they're changed. */
  assists: Assists = ALL_ASSISTS;
  private reversingNow = false;
  private brakingNow = false;
  /** The headlamps: always on while driving, as the law has it. */
  headlamps = true;
  private engineNow: EngineRead;
  private readonly suspension: [number, number, number, number] = [0, 0, 0, 0];
  /** Whether each wheel touched the road on the last step. */
  readonly contact = [false, false, false, false];
  /** What each wheel was on the last time it touched. */
  readonly surfaces: Surface[] = ["asphalt", "asphalt", "asphalt", "asphalt"];
  /** How each wheel's tyre met the ground on the last step. */
  readonly treads: Tread[] = WHEELS.map(() => ({ contact: [0, 0, 0], rollMS: 0, slideMS: 0, demand: 0, spinMS: 0 }));

  readonly tuning: CarTuning;

  constructor(
    private readonly world: RAPIER.World,
    readonly id: CarId,
    private readonly underfoot: Underfoot,
    /** The tyres fitted, which a car keeps until they're changed. */
    public tyres: Tyre = "summer",
  ) {
    const tuning = CARS[id];
    this.tuning = tuning;
    const { car } = tuning;
    const [wide, tall, long] = car.inertia;
    const description = RAPIER.RigidBodyDesc.dynamic()
      .setAdditionalMassProperties(car.massKg, { x: 0, y: car.massUpM, z: 0 }, { x: wide, y: tall, z: long }, { x: 0, y: 0, z: 0, w: 1 })
      .setCanSleep(false)
      .setAngularDamping(0.4);
    this.body = world.createRigidBody(description);
    const [x, y, z] = car.halfSize;
    this.collider = world.createCollider(RAPIER.ColliderDesc.cuboid(x, y, z).setTranslation(0, car.boxUpM, 0).setDensity(0).setFriction(0.3).setRestitution(0.1).setCollisionGroups(CAR_GROUPS), this.body);
    this.engineNow = restingEngine(tuning.gearbox);
  }

  /** How high the body's origin rides over the road at rest. */
  get rideM(): number {
    return this.tuning.car.wheelRadiusM + this.tuning.suspension.droopM - sagOf(this.tuning);
  }

  /** Takes over from another car mid-drive: the same place on the road, moving as it moved, the engine in the gear this speed asks for. */
  takeOver(from: Car): void {
    const before = from.state();
    const up = rotate(before.rotation, [0, this.rideM - from.rideM, 0]);
    this.resume({ ...before, position: [before.position[0] + up[0], before.position[1] + up[1], before.position[2] + up[2]] });
    this.reversingNow = from.reversingNow;
    this.assists = from.assists;
  }

  /** Every wheel turning with the road at a speed, none spinning or locked. */
  private rollingAt(forward: number): void {
    this.wheelMS.fill(forward);
    this.slipping.fill(false);
  }

  /** Carries on from a state: there, moving as it moves, the engine in the gear this speed asks for. */
  resume(state: CarState): void {
    const [px, py, pz] = state.position;
    this.body.setTranslation({ x: px, y: py, z: pz }, true);
    const [x, y, z, w] = state.rotation;
    this.body.setRotation({ x, y, z, w }, true);
    this.body.setLinvel({ x: state.velocity[0], y: state.velocity[1], z: state.velocity[2] }, true);
    this.body.setAngvel({ x: state.spin[0], y: state.spin[1], z: state.spin[2] }, true);
    this.steer = state.steer;
    for (let wheel = 0; wheel < 4; wheel++) this.roll[wheel] = state.roll[wheel];
    this.rollingAt(dot(state.velocity, rotate(state.rotation, [0, 0, -1])));
    this.reversingNow = false;
    this.engineNow = runningEngine(this.tuning.gearbox, Math.hypot(...state.velocity));
  }

  /** Takes the car out of the world. */
  remove(): void {
    this.world.removeRigidBody(this.body);
  }

  /** Puts the car still on the ground at a heading: radians anticlockwise from north. */
  place(position: Vector3, heading: number): void {
    this.body.setTranslation({ x: position[0], y: position[1] + this.rideM, z: position[2] }, true);
    this.body.setRotation({ x: 0, y: Math.sin(heading / 2), z: 0, w: Math.cos(heading / 2) }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.steer = 0;
    this.rollingAt(0);
    this.reversingNow = false;
    this.brakingNow = false;
    this.engineNow = restingEngine(this.tuning.gearbox);
  }

  get engine(): EngineRead {
    return this.engineNow;
  }

  get reversing(): boolean {
    return this.reversingNow;
  }

  step(input: DriveInput): void {
    const { tuning } = this;
    const { car, suspension, grip, power, steering } = tuning;
    const wheelBase = wheelBaseOf(tuning);
    const rotation = this.rotation();
    const position = point(this.body.translation());
    const velocity = point(this.body.linvel());
    const spin = point(this.body.angvel());
    const up = rotate(rotation, [0, 1, 0]);
    const nose = rotate(rotation, [0, 0, -1]);
    const speed = Math.hypot(...velocity);
    const forward = dot(velocity, nose);

    if (input.brake > 0 && forward < STOPPED_FOR_REVERSE_MS && input.throttle === 0) this.reversingNow = true;
    if (input.throttle > 0) this.reversingNow = false;
    this.brakingNow = input.brake > 0 && !this.reversingNow;
    const shares = WHEELS.map((wheel) => (wheel.end === 1 ? 1 - power.rearShare : power.rearShare) / 2);
    const driven = shares.reduce((sum, share, index) => sum + share * Math.abs(this.wheelMS[index]), 0);
    this.engineNow = stepEngine(tuning.gearbox, this.engineNow, Math.abs(forward), this.reversingNow ? input.brake : input.throttle, STEP_S, driven).read;
    // What a tread has to turn to spin its wheel up: the wheel itself, and the engine through the gear for its share of the drive.
    const engineKg = ENGINE_INERTIA * radiansPerMetre(tuning, this.engineNow.gear) ** 2;
    const wheelKg = shares.map((share) => WHEEL_INERTIA / car.wheelRadiusM ** 2 + share * engineKg);

    const drive = this.driveForce(input, forward);
    const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: -up[0], y: -up[1], z: -up[2] });
    const reach = suspension.droopM + car.wheelRadiusM;

    // Springs first: the anti-roll bar needs each axle's two compressions.
    const compression: number[] = [];
    const hits: (RAPIER.RayColliderIntersection | null)[] = [];
    const contacts: Vector3[] = [];
    const grounds: SurfaceGrip[] = [];
    const footing = { grip: 0, peakSlip: 0 };
    WHEELS.forEach((wheel, index) => {
      const mount = along(position, rotate(rotation, [(wheel.side * car.trackM) / 2, 0, car.axleZ[wheel.end === 1 ? 0 : 1]]), 1);
      ray.origin = { x: mount[0], y: mount[1], z: mount[2] };
      const hit = this.world.castRayAndGetNormal(ray, reach, true, undefined, WHEEL_RAY_GROUPS, this.collider);
      hits.push(hit);
      compression.push(hit ? reach - hit.timeOfImpact : 0);
      this.contact[index] = hit !== null;
      this.suspension[index] = Math.min(compression[index], suspension.travelM);
      const contact = along(mount, up, -(hit?.timeOfImpact ?? reach));
      contacts.push(contact);
      const tread = this.treads[index];
      for (let axis = 0; axis < 3; axis++) tread.contact[axis] = contact[axis];
      tread.rollMS = tread.slideMS = tread.demand = tread.spinMS = 0;
      if (hit) this.surfaces[index] = this.underfoot.surfaceUnder(hit, contact[0], contact[2]);
      const ground = GROUND_GRIP[tuning.class][this.tyres][this.underfoot.condition][this.surfaces[index]];
      grounds.push(ground);
      if (!hit) return;
      footing.grip += ground.grip;
      footing.peakSlip += ground.peakSlip;
    });
    const touching = this.contact.filter(Boolean).length;
    const felt = touching === 0 ? FIRM_FOOTING : { grip: footing.grip / touching, peakSlip: footing.peakSlip / touching };

    let target = input.steer * steerLimit(tuning, speed, input.handbrake, felt);
    const frontAxle = along(velocity, cross(spin, rotate(rotation, [0, 0, car.axleZ[0]])), 1);
    const frontForward = dot(frontAxle, nose);
    if (!input.handbrake && frontForward > FRONT_SLIP_HELD_FROM_MS) {
      // The fronts turn no further past the way they're going than the angle they grip best at: braking into a bend, the
      // lock the speed allows opens out as the car slows, and past that angle the tyres plough on rather than turn.
      const heading = Math.atan2(dot(frontAxle, rotate(rotation, [1, 0, 0])), frontForward);
      const most = grip.peakSlip * felt.peakSlip * FRONT_SLIP_HELD;
      if (target > 0) target = Math.min(target, Math.max(0, heading + most));
      if (target < 0) target = Math.max(target, Math.min(0, heading - most));
    }
    const rate = (Math.abs(target) < Math.abs(this.steer) ? steering.returnPerS : steering.turnPerS) * STEP_S;
    this.steer += clamp(target - this.steer, -rate, rate);

    let grounded = 0;
    WHEELS.forEach((wheel, index) => {
      const hit = hits[index];
      if (!hit) return;
      grounded++;
      const normal = point(hit.normal);
      const contact = contacts[index];
      const ground = grounds[index];
      const arm: Vector3 = [contact[0] - position[0], contact[1] - position[1], contact[2] - position[2]];
      const at = along(velocity, cross(spin, arm), 1);
      const rising = -dot(at, normal);
      const opposite = compression[index ^ 1];
      const over = Math.max(0, compression[index] - suspension.travelM);
      const axle = axleShare(tuning, wheel.end === 1);
      const load = Math.max(
        0,
        axle * (suspension.springNPerM * compression[index] + suspension.damperNPerMS * rising + suspension.bumpStopNPerM * over) + suspension.antiRollNPerM * (compression[index] - opposite),
      );

      const isFront = wheel.end === 1;
      const steer = isFront ? this.steer : 0;
      const wheelNose = rotate(rotation, [Math.sin(steer), 0, -Math.cos(steer)]);
      const rolling = unit(along(wheelNose, normal, -dot(wheelNose, normal)));
      const sideways = cross(rolling, normal);
      const rollSpeed = dot(at, rolling);
      const slideSpeed = dot(at, sideways);

      const handbraked = !isFront && input.handbrake;
      const reachGrip = (isFront ? grip.frontMu : grip.rearMu) * ground.grip * (handbraked ? grip.handbrakeRearShare : 1) * load;
      const slip = Math.atan2(slideSpeed, Math.max(Math.abs(rollSpeed), grip.lowSpeedMS));
      const curve = { peakSlip: grip.peakSlip * ground.peakSlip, slideShare: grip.slideShare + (1 - grip.slideShare) * ground.holdOn };
      const push = shares[index] * drive;
      const braking = input.brake > 0 && !this.reversingNow ? input.brake * power.brakeN * (isFront ? power.brakeFrontShare : 1 - power.brakeFrontShare) / 2 : 0;
      const handbrake = handbraked ? power.handbrakeN / 2 : 0;
      const parked = input.throttle === 0 && input.brake === 0 && speed < SLOW_MS ? power.brakeN / 8 : power.rollingN / 4 + (ground.rolling + ground.rollingPerMS * Math.abs(rollSpeed)) * load;
      const holding = braking + handbrake + parked;
      const wanted = push - clamp(rollSpeed / SLOW_MS, -1, 1) * holding;
      // Traction control and ABS keep a tyre at its grip rather than let it spin or lock.
      const helped = (wanted > 0 && this.assists.traction) || (wanted < 0 && this.assists.abs);
      const tread = this.treads[index];
      tread.rollMS = rollSpeed;
      tread.slideMS = slideSpeed;

      let side: number;
      let ahead: number;
      if (handbraked || (!this.slipping[index] && (Math.abs(wanted) <= reachGrip || helped))) {
        // Turning with the road, or locked by the handbrake: the tyre gives what's asked, up to its grip.
        side = -reachGrip * gripAt(curve, slip);
        ahead = wanted;
        const asked = Math.hypot(side, ahead);
        tread.demand = reachGrip > 0 ? asked / reachGrip : 0;
        if (asked > reachGrip) {
          side *= reachGrip / asked;
          ahead *= reachGrip / asked;
        }
        this.slipping[index] = false;
        this.wheelMS[index] = handbraked ? 0 : rollSpeed;
      } else {
        // Spinning or locking: the wheel turns at its own speed, the engine and the brakes on one side of it and the
        // tyre's grip on the other, and the tyre's slip along and across share one curve.
        const base = Math.max(Math.abs(rollSpeed), grip.lowSpeedMS);
        const peakRatio = PEAK_SLIP_RATIO * ground.peakSlip;
        if (!this.slipping[index]) this.wheelMS[index] = rollSpeed + Math.sign(wanted) * peakRatio * base;
        const across = slip / curve.peakSlip;
        const kg = wheelKg[index];
        const dt = STEP_S / WHEEL_SUBSTEPS;
        let turning = this.wheelMS[index];
        side = ahead = 0;
        let size = 0;
        for (let sub = 0; sub < WHEEL_SUBSTEPS; sub++) {
          const lengthwise = (turning - rollSpeed) / base / peakRatio;
          size = Math.hypot(lengthwise, across);
          const perSlip = size > 0 ? (reachGrip * Math.abs(gripAt(curve, size * curve.peakSlip))) / size : 0;
          const grips = perSlip * lengthwise;
          side -= (perSlip * across) / WHEEL_SUBSTEPS;
          ahead += grips / WHEEL_SUBSTEPS;
          // The brakes and rolling hold the wheel against whichever way it turns, and hold it still once stopped.
          const free = turning + ((push - grips) * dt) / kg;
          const held = (holding * dt) / kg;
          turning = Math.abs(free) <= held ? 0 : free - Math.sign(free) * held;
        }
        this.wheelMS[index] = turning;
        tread.demand = size;
        const lengthwise = (turning - rollSpeed) / base;
        this.slipping[index] = !(Math.abs(lengthwise) <= peakRatio && (Math.abs(wanted) <= reachGrip || helped));
        if (!this.slipping[index]) this.wheelMS[index] = rollSpeed;
      }
      tread.spinMS = this.wheelMS[index] - rollSpeed;

      const applied = along(contact, up, grip.forceLiftM);
      const impulse = along(along(scale(normal, load), sideways, side), rolling, ahead);
      this.body.applyImpulseAtPoint({ x: impulse[0] * STEP_S, y: impulse[1] * STEP_S, z: impulse[2] * STEP_S }, { x: applied[0], y: applied[1], z: applied[2] }, true);
    });

    const drag = power.dragPerMS2 * speed;
    const downforce = grounded > 0 ? power.downforcePerMS2 * speed * speed : 0;
    const air = along(scale(velocity, -drag), up, -downforce);
    this.body.applyImpulse({ x: air[0] * STEP_S, y: air[1] * STEP_S, z: air[2] * STEP_S }, true);

    if (this.assists.stability && grounded === 4 && !input.handbrake && speed > SLOW_MS) {
      // The rate the wheels' angle asks for, but no faster than the tyres can turn the car at this speed.
      const most = (steering.cornerMS2 * felt.grip) / Math.abs(forward);
      const asked = clamp((forward * Math.tan(this.steer)) / wheelBase, -most, most);
      const yaw = dot(spin, up);
      const assist = steering.yawAssist * (-asked - yaw) * STEP_S;
      this.body.applyTorqueImpulse({ x: up[0] * assist, y: up[1] * assist, z: up[2] * assist }, true);
    }

    for (let wheel = 0; wheel < 4; wheel++) {
      // A wheel off the ground turns with the car, or carries on spinning or locked as it was.
      if (!this.contact[wheel] && !this.slipping[wheel]) this.wheelMS[wheel] = forward;
      this.roll[wheel] += (this.wheelMS[wheel] / car.wheelRadiusM) * STEP_S;
    }
  }

  private driveForce(input: DriveInput, forward: number): number {
    const { power } = this.tuning;
    // The handbrake holds the clutch in, as the driving games do: it always beats the engine.
    if (input.handbrake) return 0;
    if (this.reversingNow) return forward > -power.reverseSpeedMS ? -input.brake * power.reverseN : 0;
    return pullAt(this.tuning, this.engineNow, input.throttle, this.assists.traction);
  }

  rotation(): Rotation {
    const { x, y, z, w } = this.body.rotation();
    return [x, y, z, w];
  }

  addDrag(strength: number): void {
    const velocity = point(this.body.linvel());
    const impulse = scale(velocity, -strength * STEP_S);
    this.body.applyImpulse({ x: impulse[0], y: impulse[1], z: impulse[2] }, true);
  }

  state(): CarState {
    const rotation = this.rotation();
    return {
      position: point(this.body.translation()),
      rotation,
      velocity: point(this.body.linvel()),
      spin: point(this.body.angvel()),
      car: this.id,
      steer: this.steer,
      suspension: [...this.suspension],
      roll: [...this.roll],
      lamps: { head: this.headlamps, brake: this.brakingNow, reverse: this.reversingNow },
    };
  }
}
