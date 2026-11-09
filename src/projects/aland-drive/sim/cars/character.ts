import type { Tier } from "../tiers";
import { WORLD, type CarTuning } from "../tuning";
import { skerryGt } from "./skerry-gt";

/*
 * The rules every car but the Skerry GT is tuned by: a car is a character, the
 * few numbers a driver would know it by, and its springs, dampers, inertia,
 * forces and collision box follow from those the same way for every car.
 */

/** The invented makers whose badges the cars wear (`ideas/cars.md`). */
export type Maker = "Tärna" | "Västan" | "Klippa" | "Ödmark" | "Aurelle" | "Valtor" | "Ridgeway" | "Norrsken" | "Castellane" | "Fjäder" | "Kamrat";

/** How a car reaches the island (`ideas/cars.md`): shipped in by the harbour, from a dealer, from the motor club, or found in a barn. */
export type Origin = "harbour" | "dealer" | "club" | "barn";

/**
 * A car as the game enters it: its tuning, the tier it races in or none, and what a player reads about it on the Cars
 * page beside the figures its tuning and limits give: its maker, its engine in a few words, and where it comes from.
 */
export interface CarEntry {
  tier: Tier | null;
  maker: Maker;
  engine: string;
  from: Origin;
  tuning: CarTuning;
}

/** A car as a driver would describe it. */
export interface Character {
  name: string;
  class: CarTuning["class"];
  massKg: number;
  /** The body as drawn: its length, width, height and the height of its sills, from the road. */
  outline: readonly [length: number, width: number, height: number, sill: number];
  axleZ: readonly [number, number];
  trackM: number;
  wheelRadiusM: number;
  /** The centre of mass's height over the road: low in a sports car, high in a van. */
  massHeightM: number;
  /** How fast the body bobs on its springs: a soft car's are slow. */
  rideHz: number;
  /** A share of critical damping: low floats, high is taut. */
  damping: number;
  /** The anti-roll bars against one wheel's spring: more leans less. */
  rollStiffness: number;
  droopM?: number;
  travelM?: number;
  grip: readonly [front: number, rear: number];
  peakSlip: number;
  slideShare: number;
  handbrakeRearShare?: number;
  engine: CarTuning["engine"];
  gearbox: CarTuning["gearbox"];
  /** What the tyres will put down off the line, as an acceleration. */
  launchMS2: number;
  /**
   * What traction control lets it put down off the line on loose ground (gravel, grass), as an acceleration, where it
   * holds back more than on a firm road: a heavy car with instant torque that would dig in and spray stones. None, and
   * it is `launchMS2` on every surface.
   */
  looseLaunchMS2?: number;
  rearShare: number;
  /** How hard the brakes can stop it, as an acceleration, before the tyres give up. */
  brakeMS2: number;
  dragPerMS2: number;
  /** Downforce against the Skerry GT's, weight for weight. */
  aero: number;
  lock: number;
  /** How fast the wheels turn: quick in a small sports car, slow in a truck. */
  turnPerS: number;
}

const SKERRY_DOWNFORCE_PER_KG = skerryGt.tuning.power.downforcePerMS2 / skerryGt.tuning.car.massKg;
/** Sideways acceleration the steering asks for, per unit of grip: the Skerry GT's 14 at its grip. */
const CORNER_PER_MU = 10.4;
/** The collision box stops this far over the sills and under the roof, so a landing lands on the wheels. */
const BOX_OVER_SILL_M = 0.2;
const BOX_UNDER_ROOF_M = 0.18;

export function tuned(c: Character): CarTuning {
  const { massKg: mass, wheelRadiusM } = c;
  const [length, width, height, sill] = c.outline;
  const quarter = mass / 4;
  const springNPerM = quarter * (2 * Math.PI * c.rideHz) ** 2;
  const droopM = c.droopM ?? 0.4;
  const origin = wheelRadiusM + droopM - (quarter * WORLD.gravity) / springNPerM;
  const [bottom, top] = [sill + BOX_OVER_SILL_M, height - BOX_UNDER_ROOF_M];
  const tall = height - sill;
  const inertia = [(mass * (length ** 2 + tall ** 2)) / 12, (mass * (length ** 2 + width ** 2)) / 12, (mass * (width ** 2 + tall ** 2)) / 12] as const;
  const [frontMu, rearMu] = c.grip;
  return {
    name: c.name,
    class: c.class,
    car: {
      massKg: mass,
      halfSize: [width / 2, (top - bottom) / 2, length / 2],
      boxUpM: (top + bottom) / 2 - origin,
      massUpM: c.massHeightM - origin,
      inertia,
      axleZ: c.axleZ,
      trackM: c.trackM,
      wheelRadiusM,
    },
    suspension: {
      droopM,
      travelM: c.travelM ?? 0.3,
      springNPerM,
      damperNPerMS: c.damping * 2 * Math.sqrt(springNPerM * quarter),
      bumpStopNPerM: 4 * springNPerM,
      antiRollNPerM: c.rollStiffness * springNPerM,
    },
    grip: {
      frontMu,
      rearMu,
      peakSlip: c.peakSlip,
      slideShare: c.slideShare,
      lowSpeedMS: 3,
      handbrakeRearShare: c.handbrakeRearShare ?? 0.42,
      forceLiftM: 0.28,
    },
    engine: c.engine,
    gearbox: c.gearbox,
    power: {
      launchN: mass * c.launchMS2,
      ...(c.looseLaunchMS2 === undefined ? {} : { looseLaunchN: mass * c.looseLaunchMS2 }),
      rearShare: c.rearShare,
      reverseSpeedMS: 13,
      reverseN: mass * 3.6,
      brakeN: mass * c.brakeMS2,
      brakeFrontShare: 0.6,
      handbrakeN: mass * 5,
      rollingN: mass * 0.157,
      dragPerMS2: c.dragPerMS2,
      downforcePerMS2: mass * SKERRY_DOWNFORCE_PER_KG * c.aero,
    },
    steering: {
      lock: c.lock,
      cornerMS2: ((frontMu + rearMu) / 2) * CORNER_PER_MU,
      cornerMargin: 1.5,
      turnPerS: c.turnPerS,
      returnPerS: c.turnPerS * 1.73,
      handbrakeLock: 1.8,
      yawAssist: inertia[1],
    },
  };
}
