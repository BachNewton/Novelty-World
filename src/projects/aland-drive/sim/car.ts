import RAPIER from "@dimforge/rapier3d-compat";
import { CAR, GRIP, POWER, STEERING, STEP_S, SUSPENSION, WORLD } from "./tuning";
import type { CarState, Rotation, Vector3 } from "./car-state";

/*
 * The car: a rigid body on four rays. Each step a ray from each wheel's mount
 * finds the road, a spring holds the body up there, and the tyre pushes back on
 * the body at the contact point, so weight transfer, squat, dive and lean all
 * come out of the same forces rather than being added.
 *
 * Rapier's own ray-cast vehicle isn't used: its tyres are a single clamped
 * friction with no slip curve, which leaves no way to shape how the car lets go
 * in a handbrake turn or holds on at 200 km/h, and those are the game.
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

const WHEELS = [
  { side: -1, end: 1 },
  { side: 1, end: 1 },
  { side: -1, end: -1 },
  { side: 1, end: -1 },
] as const;

const SLOW_MS = 0.6;
const STOPPED_FOR_REVERSE_MS = 1;

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
function gripAt(slip: number): number {
  const size = Math.abs(slip) / GRIP.peakSlip;
  const curve = size < 1 ? 1.5 * size - 0.5 * size ** 3 : GRIP.slideShare + (1 - GRIP.slideShare) * Math.exp(1 - size);
  return Math.sign(slip) * curve;
}

/** The wheels' lock at a speed: the angle that asks for about all the grip there is, and no more. */
export function steerLimit(speed: number, handbrake: boolean): number {
  const asked = Math.atan((CAR.wheelBaseM * STEERING.cornerMS2 * STEERING.cornerMargin) / Math.max(speed * speed, 1));
  return Math.min(STEERING.lock, asked) * (handbrake ? STEERING.handbrakeLock : 1);
}

export class Car {
  readonly body: RAPIER.RigidBody;
  private readonly collider: RAPIER.Collider;
  private steer = 0;
  private roll = 0;
  private reversing = false;
  private readonly suspension: [number, number, number, number] = [0, 0, 0, 0];
  /** Whether each wheel touched the road on the last step. */
  readonly contact = [false, false, false, false];

  constructor(private readonly world: RAPIER.World) {
    const [wide, tall, long] = CAR.inertia;
    const description = RAPIER.RigidBodyDesc.dynamic()
      .setAdditionalMassProperties(CAR.massKg, { x: 0, y: CAR.massUpM, z: 0 }, { x: wide, y: tall, z: long }, { x: 0, y: 0, z: 0, w: 1 })
      .setCanSleep(false)
      .setAngularDamping(0.4);
    this.body = world.createRigidBody(description);
    const [x, y, z] = CAR.halfSize;
    this.collider = world.createCollider(RAPIER.ColliderDesc.cuboid(x, y, z).setTranslation(0, CAR.boxUpM, 0).setDensity(0).setFriction(0.3).setRestitution(0.1), this.body);
  }

  /** Puts the car still on the ground at a heading: radians anticlockwise from north. */
  place(position: Vector3, heading: number): void {
    this.body.setTranslation({ x: position[0], y: position[1] + CAR.wheelRadiusM + SUSPENSION.droopM - this.sag(), z: position[2] }, true);
    this.body.setRotation({ x: 0, y: Math.sin(heading / 2), z: 0, w: Math.cos(heading / 2) }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.steer = 0;
    this.reversing = false;
  }

  private sag() {
    return (CAR.massKg * WORLD.gravity) / 4 / SUSPENSION.springNPerM;
  }

  step(input: DriveInput): void {
    const rotation = this.rotation();
    const position = point(this.body.translation());
    const velocity = point(this.body.linvel());
    const spin = point(this.body.angvel());
    const up = rotate(rotation, [0, 1, 0]);
    const nose = rotate(rotation, [0, 0, -1]);
    const speed = Math.hypot(...velocity);
    const forward = dot(velocity, nose);

    if (input.brake > 0 && forward < STOPPED_FOR_REVERSE_MS && input.throttle === 0) this.reversing = true;
    if (input.throttle > 0) this.reversing = false;

    const target = input.steer * steerLimit(speed, input.handbrake);
    const rate = (Math.abs(target) < Math.abs(this.steer) ? STEERING.returnPerS : STEERING.turnPerS) * STEP_S;
    this.steer += clamp(target - this.steer, -rate, rate);

    const drive = this.driveForce(input, forward);
    const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: -up[0], y: -up[1], z: -up[2] });
    const reach = SUSPENSION.droopM + CAR.wheelRadiusM;

    // Springs first: the anti-roll bar needs each axle's two compressions.
    const compression: number[] = [];
    const hits: (RAPIER.RayColliderIntersection | null)[] = [];
    const mounts: Vector3[] = [];
    WHEELS.forEach((wheel, index) => {
      const mount = along(position, rotate(rotation, [(wheel.side * CAR.trackM) / 2, 0, (-wheel.end * CAR.wheelBaseM) / 2]), 1);
      mounts.push(mount);
      ray.origin = { x: mount[0], y: mount[1], z: mount[2] };
      const hit = this.world.castRayAndGetNormal(ray, reach, true, undefined, undefined, this.collider);
      hits.push(hit);
      compression.push(hit ? reach - hit.timeOfImpact : 0);
      this.contact[index] = hit !== null;
      this.suspension[index] = Math.min(compression[index], SUSPENSION.travelM);
    });

    let grounded = 0;
    WHEELS.forEach((wheel, index) => {
      const hit = hits[index];
      if (!hit) return;
      grounded++;
      const normal = point(hit.normal);
      const contact = along(mounts[index], up, -hit.timeOfImpact);
      const arm: Vector3 = [contact[0] - position[0], contact[1] - position[1], contact[2] - position[2]];
      const at = along(velocity, cross(spin, arm), 1);
      const rising = -dot(at, normal);
      const opposite = compression[index ^ 1];
      const over = Math.max(0, compression[index] - SUSPENSION.travelM);
      const load = Math.max(
        0,
        SUSPENSION.springNPerM * compression[index] + SUSPENSION.damperNPerMS * rising + SUSPENSION.bumpStopNPerM * over + SUSPENSION.antiRollNPerM * (compression[index] - opposite),
      );

      const isFront = wheel.end === 1;
      const steer = isFront ? this.steer : 0;
      const wheelNose = rotate(rotation, [Math.sin(steer), 0, -Math.cos(steer)]);
      const rolling = unit(along(wheelNose, normal, -dot(wheelNose, normal)));
      const sideways = cross(rolling, normal);
      const rollSpeed = dot(at, rolling);
      const slideSpeed = dot(at, sideways);

      const handbraked = !isFront && input.handbrake;
      const reachGrip = (isFront ? GRIP.frontMu : GRIP.rearMu) * (handbraked ? GRIP.handbrakeRearShare : 1) * load;
      const slip = Math.atan2(slideSpeed, Math.max(Math.abs(rollSpeed), GRIP.lowSpeedMS));
      let side = -reachGrip * gripAt(slip);
      let ahead = (isFront ? 1 - POWER.rearShare : POWER.rearShare) * drive / 2;
      const braking = input.brake > 0 && !this.reversing ? input.brake * POWER.brakeN * (isFront ? POWER.brakeFrontShare : 1 - POWER.brakeFrontShare) / 2 : 0;
      const handbrake = handbraked ? POWER.handbrakeN / 2 : 0;
      const parked = input.throttle === 0 && input.brake === 0 && speed < SLOW_MS ? POWER.brakeN / 8 : POWER.rollingN / 4;
      ahead -= clamp(rollSpeed / SLOW_MS, -1, 1) * (braking + handbrake + parked);

      const asked = Math.hypot(side, ahead);
      if (asked > reachGrip) {
        side *= reachGrip / asked;
        ahead *= reachGrip / asked;
      }

      const applied = along(contact, up, GRIP.forceLiftM);
      const impulse = along(along(scale(normal, load), sideways, side), rolling, ahead);
      this.body.applyImpulseAtPoint({ x: impulse[0] * STEP_S, y: impulse[1] * STEP_S, z: impulse[2] * STEP_S }, { x: applied[0], y: applied[1], z: applied[2] }, true);
    });

    const drag = POWER.dragPerMS2 * speed;
    const downforce = grounded > 0 ? POWER.downforcePerMS2 * speed * speed : 0;
    const air = along(scale(velocity, -drag), up, -downforce);
    this.body.applyImpulse({ x: air[0] * STEP_S, y: air[1] * STEP_S, z: air[2] * STEP_S }, true);

    if (grounded === 4 && !input.handbrake && speed > SLOW_MS) {
      const asked = (forward * Math.tan(this.steer)) / CAR.wheelBaseM;
      const yaw = dot(spin, up);
      const assist = STEERING.yawAssist * (-asked - yaw) * STEP_S;
      this.body.applyTorqueImpulse({ x: up[0] * assist, y: up[1] * assist, z: up[2] * assist }, true);
    }

    this.roll += (forward / CAR.wheelRadiusM) * STEP_S;
  }

  private driveForce(input: DriveInput, forward: number): number {
    if (this.reversing) return forward > -POWER.reverseSpeedMS ? -input.brake * POWER.reverseN : 0;
    if (forward >= POWER.topSpeedMS) return 0;
    return input.throttle * Math.min(POWER.launchN, POWER.engineW / Math.max(forward, 1));
  }

  rotation(): Rotation {
    const { x, y, z, w } = this.body.rotation();
    return [x, y, z, w];
  }

  /** Below 0 the car is past its side. */
  uprightness(): number {
    return rotate(this.rotation(), [0, 1, 0])[1];
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
      steer: this.steer,
      suspension: [...this.suspension],
      roll: this.roll,
    };
  }
}
