import { pursuit } from "../sim/autopilot";
import { STOPPED_FOR_REVERSE_MS, gripAt, slipForGrip, steerLimit, type DriveInput } from "../sim/car";
import { headingOf, speedOf, type CarState } from "../sim/car-state";
import { CARS } from "../sim/cars";
import { engineAt, resistanceAt } from "../sim/gearbox";
import type { RoadLine } from "../sim/road-net";
import { STEP_S, wheelBaseOf, WORLD, type CarTuning } from "../sim/tuning";
import { brakingG, cornerG, plannedSpeedAt, pullG, slowestAhead, type PacePlan } from "./speed-plan";

/*
 * The driver of a line and its speed plan: pure pursuit along the line (the
 * steering every computer-driven car shares, `sim/autopilot.ts`), aimed along
 * the way the car travels as it corners, and the throttle and brake that gain
 * and lose speed as the plan does where the car is, looking a moment ahead so
 * the brakes are on by the time the plan falls, each held to what the turn
 * leaves of the tyres.
 * Racecraft steers it
 * by two numbers: an offset to run right of the line, and a speed to hold
 * under for a car ahead. It is a pure function of the car's state, its place
 * along the line and the speed it was last held under, so the same drive comes
 * out every time. The racer
 * grows out of it: recovery and racecraft are its own, and this is what every
 * one of them drives with underneath.
 */

/** How far ahead on the plan the driver holds its speed under: a reaction's worth, and never less than a car's length or so. */
const PLAN_AHEAD_S = 0.3;
const PLAN_AHEAD_LEAST_M = 6;
const PLAN_FROM_M = 2;
/**
 * The pedals push as the plan itself is doing where the car is, gaining speed or losing it, and on top of that by this
 * much, metres a second squared, for each metre a second the car is off the speed it is to hold. So a braking zone is
 * one long press and a straight one steady throttle: pedals that only chase the error go from full to nothing and back
 * several times a second, and the brake lamps with them.
 */
const GAIN_PER_S = 2;
/**
 * The throttle may ask this much more than its share of the tyres: the engine's pull at a speed is read without knowing
 * the gear the box holds, and traction control holds whatever is over to the tyres' grip.
 */
const PULL_ROOM = 1.1;
/** Held under this, a car is to stand. */
const STAND_UNDER_MS = 0.5;
/**
 * Well over the speed it is to hold, a car can't make its turn whatever it steers, so slowing comes before turning: from
 * the first of these over, the brake's share grows past what the turn leaves of the tyres, to the whole of their grip
 * at the second.
 */
const OVER_FROM_MS = 2;
const OVER_WHOLE_MS = 6;
/** The nearest the driver aims on its line: on a racing line's apex a long look cuts inside the line, so it looks a little nearer than the autopilot. */
const SHORTEST_LOOK_M = 8;
/** Held to a creep, going round something that stands in the road, it aims this near: the lock a car's length of room needs, which a look of eight metres never asks of the wheel. */
const CREEP_LOOK_M = 4.5;
const CREEP_UNDER_MS = 5;
/**
 * How far ahead it aims at speed, in seconds of travel: much nearer than the autopilot's traffic looks, which never
 * races. A long look turns into a bend before the line does, by the look's square times the bend. The vetting tool read
 * 0.3 to 0.5 s alike, so the nearest of them stands; scaling the look by a
 * car's steering lag, for the heavy and slow-racked cars that swing from side to side, didn't help them.
 */
const LOOK_AHEAD_S = 0.3;
const SEARCH_M = 40;
const SEARCH_STEP_M = 2;
/**
 * Pure pursuit alone lets a car run a metre or two beside its line for a long way: a little steering towards the line
 * by how far off it is, softened at speed, closes that. Metres a second of sideways closing for each metre off.
 */
const CLOSE_PER_M = 0.15;
const CLOSE_SOFT_MS = 5;

/** A point on a line moved right of it. */
const rightOf = (point: { x: number; z: number; heading: number }, metres: number) => ({ x: point.x + metres * Math.cos(point.heading), z: point.z - metres * Math.sin(point.heading) });

export class LineDriver {
  /** How far along the line the car has got. */
  along: number;
  /** The speed it was held under last step, to read how fast a hold is falling. */
  private lastHoldMS: number | null = null;

  constructor(
    readonly line: RoadLine,
    readonly plan: PacePlan,
    from: number,
    private readonly shortestLookM = SHORTEST_LOOK_M,
  ) {
    this.along = from;
  }

  private follow(car: CarState): void {
    this.along = this.line.alongNear(this.along, car.position[0], car.position[2], SEARCH_M, SEARCH_STEP_M);
  }

  /** The plan's sample the car is at. */
  private sample(): number {
    return Math.max(0, Math.min(this.plan.speeds.length - 1, Math.round(this.along / this.plan.stepM)));
  }

  /** The speed the plan asks for over the next moment, from just ahead of the car. */
  plannedSpeed(speed: number): number {
    return slowestAhead(this.plan, this.along + PLAN_FROM_M, this.along + Math.max(PLAN_AHEAD_LEAST_M, speed * PLAN_AHEAD_S));
  }

  /**
   * The slip each axle's tyres run at when the car turns a bend cleanly here, radians: the slip that gives their share
   * of the turn, on the tyres' own curve. The axle that grips less runs at the larger share, and at the car's limit is
   * at its best slip.
   */
  private slips(tuning: CarTuning, speed: number, bend: number): { front: number; rear: number } {
    const { plan } = this;
    const sample = this.sample();
    const asked = Math.min(1, (Math.abs(bend) * speed * speed) / (cornerG(plan.limitsAt(sample), speed) * WORLD.gravity));
    const frontToRear = tuning.grip.frontMu / tuning.grip.rearMu;
    const peak = tuning.grip.peakSlip * plan.footingAt(sample).peakSlip;
    return { front: slipForGrip(asked * Math.min(1, 1 / frontToRear)) * peak, rear: slipForGrip(asked * Math.min(1, frontToRear)) * peak };
  }

  /**
   * How far off its nose a car travels here when it corners cleanly, radians anticlockwise: its rear tyres' slip, which
   * points the nose into the bend, less the swing of its middle about its rear axle, which points it out. Pursuit aims
   * along the way the car travels, not the way it points: aimed along the nose it cuts a slow bend's inside and hangs
   * a metre and more outside a fast one, further on loose ground.
   */
  private attitude(tuning: CarTuning, speed: number): number {
    const bend = this.plan.bends[this.sample()];
    return Math.sign(bend) * this.slips(tuning, speed, bend).rear - tuning.car.axleZ[1] * bend;
  }

  /** How fast the car moves along its nose and to the right of it, metres a second. */
  private static travel(car: CarState): { forward: number; rightward: number } {
    const heading = headingOf(car.rotation);
    return { forward: -car.velocity[0] * Math.sin(heading) - car.velocity[2] * Math.cos(heading), rightward: car.velocity[0] * Math.cos(heading) - car.velocity[2] * Math.sin(heading) };
  }

  /**
   * The wheels' angle that turns the car a bend at a speed, radians to the right: the angle of the path itself, the
   * slip the front tyres need to give their share of that turn, and less the slip the rear tyres are running at, read
   * from the way the rear axle travels. The path's angle alone leaves the car short of every turn asked of it, by more
   * the faster it goes and the further its tyres slip for their grip: on gravel at speed the tyres' share is most of
   * the angle. And a rear that swings wide takes the wheels with it, which is the opposite lock a driver gives a slide.
   */
  private wheelsFor(car: CarState, tuning: CarTuning, speed: number, path: number): number {
    const { front } = this.slips(tuning, speed, Math.tan(path) / wheelBaseOf(tuning));
    const { forward, rightward } = LineDriver.travel(car);
    const rearCourse = Math.atan2(rightward + car.spin[1] * tuning.car.axleZ[1], Math.max(Math.abs(forward), tuning.grip.lowSpeedMS));
    return path + Math.sign(path) * front + rearCourse;
  }

  /**
   * What the turn leaves of the tyres for the pedals: a tyre's grip is one budget, and turning comes out of it first.
   * The turn is the share of their grip the tyres are giving sideways, front or rear, read from the slip they run at
   * as the simulation reads it, and never less than the line's bend here asks of the car; the brake's whole travel is
   * more than the tyres hold on loose ground, so its share is of the pedal that reaches their grip, and so is the
   * engine's on snow or ice, so the throttle's share is of the push the car put down here when it was measured. A tyre
   * past the slip it grips best at is sliding, and has nothing left for a pedal.
   */
  private pedalRoom(car: CarState, tuning: CarTuning, speed: number): { left: number; brakeAtGrip: number; pushAtGripN: number } {
    const { plan } = this;
    const sample = this.sample();
    const limits = plan.limitsAt(sample);
    const { forward, rightward } = LineDriver.travel(car);
    // An axle swings sideways about the car's middle as the car turns, and a tyre's slip is how far off the way its wheel points it travels.
    const [front, rear] = tuning.car.axleZ;
    const tyres = { peakSlip: tuning.grip.peakSlip * plan.footingAt(sample).peakSlip, slideShare: 1 };
    const given = (axleZ: number, wheels: number) => {
      const across = rightward + car.spin[1] * axleZ;
      const rolling = Math.max(Math.abs(forward * Math.cos(wheels) + across * Math.sin(wheels)), tuning.grip.lowSpeedMS);
      return Math.abs(gripAt(tyres, Math.atan2(across * Math.cos(wheels) - forward * Math.sin(wheels), rolling)));
    };
    const turning = Math.max((Math.abs(plan.bends[sample]) * speed * speed) / (cornerG(limits, speed) * WORLD.gravity), given(front, car.steer), given(rear, 0));
    const left = Math.sqrt(Math.max(0, 1 - turning * turning));
    const brakeAtGrip = Math.min(1, (brakingG(limits, speed) * WORLD.gravity * tuning.car.massKg - resistanceAt(tuning, speed)) / tuning.power.brakeN);
    const pushAtGripN = pullG(limits, speed) * WORLD.gravity * tuning.car.massKg + resistanceAt(tuning, speed);
    return { left, brakeAtGrip, pushAtGripN };
  }

  /** How fast the plan is gaining speed where the car is about to be, metres a second squared, below zero where it slows. */
  private plannedGain(speed: number): number {
    const at = this.along + Math.max(PLAN_AHEAD_LEAST_M, speed * PLAN_AHEAD_S) / 2;
    const [from, to] = [plannedSpeedAt(this.plan, at), plannedSpeedAt(this.plan, at + this.plan.stepM)];
    return (to * to - from * from) / (2 * this.plan.stepM);
  }

  /** The input for the coming step: along the line moved `offsetM` to the right, no faster than `holdUnderMS` where given. */
  input(car: CarState, offsetM = 0, holdUnderMS: number | null = null): DriveInput {
    this.follow(car);
    const speed = speedOf(car);
    const tuning = CARS[car.car];
    const creeping = holdUnderMS !== null && holdUnderMS <= CREEP_UNDER_MS && speed <= CREEP_UNDER_MS;
    const ahead = rightOf(this.line.at(this.along + (creeping ? CREEP_LOOK_M : Math.max(this.shortestLookM, speed * LOOK_AHEAD_S))), offsetM);
    const here = this.line.at(this.along);
    // How far right of the line's offset the car stands: steering runs clockwise, so right of it asks for left.
    const rightOfLine = (car.position[0] - here.x) * Math.cos(here.heading) - (car.position[2] - here.z) * Math.sin(here.heading) - offsetM;
    const path = pursuit({ x: car.position[0], z: car.position[2] }, headingOf(car.rotation) + this.attitude(tuning, speed), ahead, wheelBaseOf(tuning));
    const wheels = this.wheelsFor(car, tuning, speed, path) - Math.atan((CLOSE_PER_M * rightOfLine) / (speed + CLOSE_SOFT_MS));
    const planned = this.plannedSpeed(speed);
    const held = holdUnderMS !== null && holdUnderMS < planned;
    const target = held ? holdUnderMS : planned;
    // Rolling backwards is further from the speed to hold than standing still is, and the throttle's to answer, as it is for too slow.
    const { forward } = LineDriver.travel(car);
    const error = target - (forward < 0 ? forward : speed);
    // The brake pedal is reverse once the car has stopped, as a player's is: under that speed it isn't pressed, and a car held to a stand is held on its handbrake, as on the grid.
    const stopped = forward < STOPPED_FOR_REVERSE_MS;
    const standing = stopped && target < STAND_UNDER_MS;
    const pedals = this.pedalRoom(car, tuning, speed);
    const over = Math.max(0, Math.min(1, (-error - OVER_FROM_MS) / (OVER_WHOLE_MS - OVER_FROM_MS)));
    // A hold that falls is a car ahead being closed on: the pedals slow as the hold does, as they do with the plan, and no harder than the tyres brake. Chasing the hold's speed alone arrives at the car ahead still faster than it.
    const holdGain = held && this.lastHoldMS !== null ? Math.max(-brakingG(this.plan.limitsAt(this.sample()), speed) * WORLD.gravity, Math.min(0, (holdUnderMS - this.lastHoldMS) / STEP_S)) : 0;
    this.lastHoldMS = holdUnderMS;
    // The push at the road that gains speed as the plan does here, or as the hold does where something else holds the speed down, and closes on the speed to hold, with what the air and the tyres' rolling take.
    const pushN = ((held ? holdGain : this.plannedGain(speed)) + GAIN_PER_S * error) * tuning.car.massKg + resistanceAt(tuning, speed);
    // The engine gives its pull at full throttle and holds the car back at none, so a push between the two is a share of the pedal; less than that is the brake's.
    const engine = engineAt(tuning, speed);
    const span = engine.pullN + engine.holdN;
    return {
      throttle: span > 0 && !standing ? Math.max(0, Math.min(1, (Math.min(pushN, pedals.left * pedals.pushAtGripN * PULL_ROOM) + engine.holdN) / span)) : 0,
      brake: stopped ? 0 : Math.max(0, Math.min(Math.max(pedals.left, over) * pedals.brakeAtGrip, (-pushN - engine.holdN) / tuning.power.brakeN)),
      // The wheel's whole travel is the lock on the footing under the car, narrower on slippery ground: the share of it that turns the wheels as far as asked.
      steer: Math.max(-1, Math.min(1, wheels / steerLimit(tuning, speed, false, this.plan.footingAt(this.sample())))),
      handbrake: standing,
    };
  }
}
