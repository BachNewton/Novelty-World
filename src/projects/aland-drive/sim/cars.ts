import { WORLD, type CarTuning } from "./tuning";

/*
 * The fourteen cars a player can drive, each its own car: its wheels where its
 * art has them, its weight, engine, gears, tyres, springs and steering chosen
 * for what it is. The art reads each car's axles, track, wheels and ride height
 * from here, so a car sits on its wheels where the simulation has them. A car is
 * named by its id wherever it has to travel, as to another player.
 *
 * The Skerry GT is written out in full. The rest are a character each, a few
 * numbers a driver would know a car by, and the springs, dampers, inertia and
 * forces follow from those by the same rules for every car.
 */

export const CAR_IDS = ["skerry-gt", "ljus", "fjard", "sund", "holm", "kobb", "salta", "vik", "sten", "berg", "strom", "ankar", "bris", "grus"] as const;
export type CarId = (typeof CAR_IDS)[number];

export const DEFAULT_CAR: CarId = "skerry-gt";

export const isCarId = (id: string): id is CarId => (CAR_IDS as readonly string[]).includes(id);

/** The car a player starts in: one that drives well on and off the road, while the game is in development. */
export const PLAYER_START_CAR: CarId = "grus";

/** The car a link asks to start in (`?car=grus`), or `otherwise` when it asks for none. */
export function carAsked(search: string, otherwise: CarId = DEFAULT_CAR): CarId {
  const asked = new URLSearchParams(search).get("car");
  if (asked === null) return otherwise;
  if (!isCarId(asked)) throw new Error(`?car= takes ${CAR_IDS.join(", ")}, not ${asked}`);
  return asked;
}

/** The sports fastback the game starts in: a straight six that loves to rev, and a tail that stays planted. */
const SKERRY_GT: CarTuning = {
  name: "Skerry GT",
  class: "sports",
  car: {
    massKg: 1400,
    halfSize: [0.9, 0.42, 2.2],
    boxUpM: 0.2,
    massUpM: -0.14,
    inertia: [2500, 2650, 620],
    axleZ: [-1.3, 1.3],
    trackM: 1.6,
    wheelRadiusM: 0.33,
  },
  suspension: {
    droopM: 0.4,
    travelM: 0.3,
    springNPerM: 30000,
    damperNPerMS: 2600,
    bumpStopNPerM: 120000,
    antiRollNPerM: 14000,
  },
  grip: {
    frontMu: 1.35,
    rearMu: 1.4,
    peakSlip: 0.14,
    slideShare: 0.8,
    lowSpeedMS: 3,
    handbrakeRearShare: 0.42,
    forceLiftM: 0.28,
  },
  engine: {
    peakTorqueNm: 320,
    // About 205 kW at its best, near 6,800 rpm.
    torqueCurve: [
      [0.12, 0.6],
      [0.35, 0.9],
      [0.6, 1],
      [0.85, 0.93],
      [1, 0.78],
    ],
    engineBrakeNm: 40,
  },
  gearbox: {
    idleRpm: 900,
    redlineRpm: 7800,
    // Top gear is long enough that drag, not the redline, ends the car's speed: about 260 km/h.
    gearTopMS: [17, 28, 40, 52, 64, 78],
    shiftS: 0.11,
    gentleShift: 0.42,
  },
  power: {
    launchN: 9500,
    rearShare: 0.65,
    reverseSpeedMS: 13,
    reverseN: 5000,
    brakeN: 17000,
    brakeFrontShare: 0.6,
    handbrakeN: 7000,
    rollingN: 220,
    dragPerMS2: 0.51,
    downforcePerMS2: 1.6,
  },
  steering: {
    lock: 0.6,
    cornerMS2: 14,
    cornerMargin: 1.5,
    turnPerS: 2.6,
    returnPerS: 4.5,
    handbrakeLock: 1.8,
    yawAssist: 2600,
  },
};

/** A car as a driver would describe it. */
interface Character {
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

const SKERRY_DOWNFORCE_PER_KG = SKERRY_GT.power.downforcePerMS2 / SKERRY_GT.car.massKg;
/** Sideways acceleration the steering asks for, per unit of grip: the Skerry GT's 14 at its grip. */
const CORNER_PER_MU = 10.4;
/** The collision box stops this far over the sills and under the roof, so a landing lands on the wheels. */
const BOX_OVER_SILL_M = 0.2;
const BOX_UNDER_ROOF_M = 0.18;

function tuned(c: Character): CarTuning {
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

export const CARS: Readonly<Record<CarId, CarTuning>> = {
  "skerry-gt": SKERRY_GT,

  // A small five-door with a turbo triple: light, eager, out of breath past 180, and the front tyres do everything.
  ljus: tuned({
    name: "Ljus",
    class: "road",
    massKg: 1080,
    outline: [3.92, 1.72, 1.5, 0.2],
    axleZ: [-1.23, 1.23],
    trackM: 1.5,
    wheelRadiusM: 0.31,
    massHeightM: 0.52,
    rideHz: 1.45,
    damping: 0.38,
    rollStiffness: 0.4,
    grip: [1.175, 1.2],
    peakSlip: 0.12,
    slideShare: 0.82,
    engine: {
      peakTorqueNm: 170,
      torqueCurve: [
        [0.12, 0.55],
        [0.25, 0.95],
        [0.45, 1],
        [0.75, 0.92],
        [1, 0.7],
      ],
      engineBrakeNm: 22,
    },
    gearbox: { idleRpm: 850, redlineRpm: 6300, gearTopMS: [12, 22, 33, 45, 57], shiftS: 0.16, gentleShift: 0.4 },
    launchMS2: 5.5,
    rearShare: 0,
    brakeMS2: 10.5,
    dragPerMS2: 0.5,
    aero: 0.8,
    lock: 0.62,
    turnPerS: 3,
  }),

  // A long Nordic estate with a turbo five: a broad shove from low revs, grip from all four wheels, calm at 240.
  fjard: tuned({
    name: "Fjärd",
    class: "road",
    massKg: 1640,
    outline: [4.76, 1.82, 1.48, 0.2],
    axleZ: [-1.42, 1.38],
    trackM: 1.58,
    wheelRadiusM: 0.33,
    massHeightM: 0.55,
    rideHz: 1.35,
    damping: 0.38,
    rollStiffness: 0.42,
    grip: [1.24, 1.26],
    peakSlip: 0.14,
    slideShare: 0.82,
    engine: {
      peakTorqueNm: 360,
      torqueCurve: [
        [0.12, 0.6],
        [0.25, 0.95],
        [0.35, 1],
        [0.7, 1],
        [0.85, 0.9],
        [1, 0.72],
      ],
      engineBrakeNm: 45,
    },
    gearbox: { idleRpm: 800, redlineRpm: 6600, gearTopMS: [14, 25, 37, 50, 61, 73], shiftS: 0.13, gentleShift: 0.38 },
    launchMS2: 6,
    rearShare: 0.35,
    brakeMS2: 11,
    dragPerMS2: 0.53,
    aero: 1,
    lock: 0.6,
    turnPerS: 2.5,
  }),

  // A low two-seater with a flat-plane V8 that screams to 9,000: the fastest car here, stiff, sharp, and all its drive at the back.
  sund: tuned({
    name: "Sund",
    class: "sports",
    massKg: 1360,
    outline: [4.35, 1.86, 1.27, 0.16],
    axleZ: [-1.27, 1.23],
    trackM: 1.62,
    wheelRadiusM: 0.34,
    massHeightM: 0.44,
    rideHz: 1.75,
    damping: 0.45,
    rollStiffness: 0.55,
    grip: [1.525, 1.6],
    peakSlip: 0.12,
    slideShare: 0.75,
    handbrakeRearShare: 0.45,
    engine: {
      peakTorqueNm: 390,
      torqueCurve: [
        [0.12, 0.5],
        [0.35, 0.78],
        [0.65, 0.97],
        [0.8, 1],
        [0.93, 0.95],
        [1, 0.85],
      ],
      engineBrakeNm: 55,
    },
    gearbox: { idleRpm: 1000, redlineRpm: 9000, gearTopMS: [21, 35, 49, 63, 77, 92], shiftS: 0.08, gentleShift: 0.45 },
    launchMS2: 7.5,
    rearShare: 1,
    brakeMS2: 13,
    dragPerMS2: 0.46,
    aero: 1.5,
    lock: 0.58,
    turnPerS: 3.1,
  }),

  // A working pickup with a lazy cross-plane V8 and four gears: heavy, soft, wallowing on its tall tyres.
  holm: tuned({
    name: "Holm",
    class: "offroad",
    massKg: 2150,
    outline: [5.24, 1.94, 1.76, 0.36],
    axleZ: [-1.6, 1.6],
    trackM: 1.66,
    wheelRadiusM: 0.385,
    massHeightM: 0.78,
    rideHz: 1.15,
    damping: 0.3,
    rollStiffness: 0.3,
    droopM: 0.45,
    travelM: 0.36,
    grip: [1, 1.02],
    peakSlip: 0.17,
    slideShare: 0.85,
    engine: {
      peakTorqueNm: 540,
      torqueCurve: [
        [0.12, 0.75],
        [0.3, 0.95],
        [0.5, 1],
        [0.75, 0.9],
        [1, 0.72],
      ],
      engineBrakeNm: 70,
    },
    gearbox: { idleRpm: 650, redlineRpm: 5600, gearTopMS: [17, 30, 45, 61], shiftS: 0.35, gentleShift: 0.36 },
    launchMS2: 5,
    rearShare: 0.75,
    brakeMS2: 9.5,
    dragPerMS2: 1.15,
    aero: 0.6,
    lock: 0.55,
    turnPerS: 2,
  }),

  // A tradesman's turbo-diesel van: slow, tall and top-heavy, but it pulls hard low down and never minds a hill.
  kobb: tuned({
    name: "Kobb",
    class: "road",
    massKg: 1950,
    outline: [4.94, 1.9, 1.98, 0.24],
    axleZ: [-1.62, 1.42],
    trackM: 1.66,
    wheelRadiusM: 0.345,
    massHeightM: 0.78,
    rideHz: 1.25,
    damping: 0.32,
    rollStiffness: 0.32,
    travelM: 0.32,
    grip: [1.025, 1.05],
    peakSlip: 0.15,
    slideShare: 0.85,
    engine: {
      peakTorqueNm: 340,
      torqueCurve: [
        [0.18, 0.6],
        [0.3, 0.95],
        [0.4, 1],
        [0.65, 0.95],
        [0.85, 0.8],
        [1, 0.55],
      ],
      engineBrakeNm: 60,
    },
    gearbox: { idleRpm: 760, redlineRpm: 4200, gearTopMS: [10, 19, 31, 45, 62], shiftS: 0.34, gentleShift: 0.52 },
    launchMS2: 4.5,
    rearShare: 0,
    brakeMS2: 9.5,
    dragPerMS2: 0.95,
    aero: 0.6,
    lock: 0.58,
    turnPerS: 2,
  }),

  // An old estate with a tired four and a four-speed box: soft, slow to answer, and a long way to stop.
  salta: tuned({
    name: "Sälta",
    class: "road",
    massKg: 1320,
    outline: [4.75, 1.72, 1.44, 0.2],
    axleZ: [-1.36, 1.36],
    trackM: 1.505,
    wheelRadiusM: 0.31,
    massHeightM: 0.56,
    rideHz: 1.2,
    damping: 0.3,
    rollStiffness: 0.3,
    grip: [1.025, 1.05],
    peakSlip: 0.16,
    slideShare: 0.85,
    engine: {
      peakTorqueNm: 150,
      torqueCurve: [
        [0.15, 0.7],
        [0.35, 0.92],
        [0.55, 1],
        [0.8, 0.88],
        [1, 0.68],
      ],
      engineBrakeNm: 25,
    },
    gearbox: { idleRpm: 780, redlineRpm: 5200, gearTopMS: [13, 24, 38, 60], shiftS: 0.28, gentleShift: 0.48 },
    launchMS2: 4.5,
    rearShare: 1,
    brakeMS2: 9,
    dragPerMS2: 0.58,
    aero: 0.7,
    lock: 0.6,
    turnPerS: 2.2,
  }),

  // A tiny open roadster on skinny tyres with a twin-carb four: light as a feather, quick to turn, happy to slide.
  vik: tuned({
    name: "Vik",
    class: "road",
    massKg: 900,
    outline: [3.95, 1.55, 1.12, 0.17],
    axleZ: [-1.15, 1.15],
    trackM: 1.355,
    wheelRadiusM: 0.3,
    massHeightM: 0.42,
    rideHz: 1.5,
    damping: 0.33,
    rollStiffness: 0.35,
    grip: [1.075, 1.1],
    peakSlip: 0.13,
    slideShare: 0.8,
    engine: {
      peakTorqueNm: 125,
      torqueCurve: [
        [0.15, 0.55],
        [0.4, 0.85],
        [0.7, 1],
        [0.88, 0.95],
        [1, 0.8],
      ],
      engineBrakeNm: 20,
    },
    gearbox: { idleRpm: 900, redlineRpm: 6800, gearTopMS: [14, 25, 36, 46, 56], shiftS: 0.15, gentleShift: 0.45 },
    launchMS2: 6,
    rearShare: 1,
    brakeMS2: 9.5,
    dragPerMS2: 0.52,
    aero: 0.6,
    lock: 0.62,
    turnPerS: 3.2,
  }),

  // A hot hatch with a four that revs to 8,200 and close gears: front-driven, stiff, and it wants to be wrung out.
  sten: tuned({
    name: "Sten",
    class: "road",
    massKg: 1180,
    outline: [3.95, 1.78, 1.42, 0.2],
    axleZ: [-1.25, 1.25],
    trackM: 1.535,
    wheelRadiusM: 0.31,
    massHeightM: 0.5,
    rideHz: 1.7,
    damping: 0.42,
    rollStiffness: 0.55,
    grip: [1.3, 1.3],
    peakSlip: 0.13,
    slideShare: 0.8,
    engine: {
      peakTorqueNm: 215,
      torqueCurve: [
        [0.12, 0.55],
        [0.4, 0.82],
        [0.62, 0.93],
        [0.82, 1],
        [0.94, 0.97],
        [1, 0.88],
      ],
      engineBrakeNm: 30,
    },
    gearbox: { idleRpm: 950, redlineRpm: 8200, gearTopMS: [15, 24, 33, 42, 52, 66], shiftS: 0.1, gentleShift: 0.45 },
    launchMS2: 6,
    rearShare: 0,
    brakeMS2: 12,
    dragPerMS2: 0.52,
    aero: 1,
    lock: 0.62,
    turnPerS: 3,
  }),

  // An old four-by-four with a slow straight six: tall, soft, heavy, on mud tyres, and the slowest thing on the road.
  berg: tuned({
    name: "Berg",
    class: "offroad",
    massKg: 2050,
    outline: [4.4, 1.84, 1.92, 0.42],
    axleZ: [-1.3, 1.3],
    trackM: 1.55,
    wheelRadiusM: 0.4,
    massHeightM: 0.82,
    rideHz: 1.05,
    damping: 0.28,
    rollStiffness: 0.25,
    droopM: 0.48,
    travelM: 0.4,
    grip: [0.935, 0.95],
    peakSlip: 0.18,
    slideShare: 0.88,
    engine: {
      peakTorqueNm: 300,
      torqueCurve: [
        [0.15, 0.85],
        [0.35, 1],
        [0.6, 0.97],
        [0.85, 0.82],
        [1, 0.65],
      ],
      engineBrakeNm: 55,
    },
    gearbox: { idleRpm: 650, redlineRpm: 4600, gearTopMS: [11, 20, 32, 46], shiftS: 0.4, gentleShift: 0.4 },
    launchMS2: 4.5,
    rearShare: 0.5,
    brakeMS2: 8.5,
    dragPerMS2: 1.05,
    aero: 0.5,
    lock: 0.55,
    turnPerS: 1.8,
  }),

  // An electric car: one gear, all its shove at once, a low battery floor, regeneration on the lift, and a limit at 230.
  strom: tuned({
    name: "Ström",
    class: "road",
    massKg: 2120,
    outline: [4.5, 1.9, 1.62, 0.26],
    axleZ: [-1.425, 1.425],
    trackM: 1.635,
    wheelRadiusM: 0.36,
    massHeightM: 0.46,
    rideHz: 1.5,
    damping: 0.42,
    rollStiffness: 0.5,
    grip: [1.275, 1.3],
    peakSlip: 0.13,
    slideShare: 0.8,
    engine: {
      peakTorqueNm: 600,
      // Full torque to the motor's base speed, then its power held: about 280 kW.
      torqueCurve: [
        [0, 1],
        [0.3, 1],
        [0.5, 0.62],
        [0.75, 0.42],
        [1, 0.32],
      ],
      engineBrakeNm: 160,
    },
    gearbox: { idleRpm: 0, redlineRpm: 15000, gearTopMS: [64], shiftS: 0, gentleShift: 1 },
    launchMS2: 7.2,
    rearShare: 0.6,
    brakeMS2: 11.5,
    dragPerMS2: 0.42,
    aero: 1,
    lock: 0.6,
    turnPerS: 2.6,
  }),

  // A long black saloon with a V12 and eight gears: silk at a cruise, a wall of pull flat out, heavy and planted.
  ankar: tuned({
    name: "Ankar",
    class: "sports",
    massKg: 2080,
    outline: [5.1, 1.92, 1.46, 0.19],
    axleZ: [-1.525, 1.525],
    trackM: 1.645,
    wheelRadiusM: 0.35,
    massHeightM: 0.55,
    rideHz: 1.25,
    damping: 0.42,
    rollStiffness: 0.45,
    grip: [1.275, 1.3],
    peakSlip: 0.14,
    slideShare: 0.8,
    engine: {
      peakTorqueNm: 580,
      torqueCurve: [
        [0.12, 0.6],
        [0.3, 0.88],
        [0.5, 1],
        [0.75, 0.97],
        [0.9, 0.88],
        [1, 0.78],
      ],
      engineBrakeNm: 60,
    },
    gearbox: { idleRpm: 650, redlineRpm: 7000, gearTopMS: [13, 21, 30, 40, 51, 62, 74, 88], shiftS: 0.09, gentleShift: 0.38 },
    launchMS2: 6,
    rearShare: 1,
    brakeMS2: 11.5,
    dragPerMS2: 0.56,
    aero: 0.9,
    lock: 0.58,
    turnPerS: 2.3,
  }),

  // An open four-seat cruiser with a gruff V6: comfortable, rear-driven, quick enough, made for the coast road.
  bris: tuned({
    name: "Bris",
    class: "road",
    massKg: 1600,
    outline: [4.3, 1.8, 1.3, 0.18],
    axleZ: [-1.275, 1.275],
    trackM: 1.545,
    wheelRadiusM: 0.32,
    massHeightM: 0.5,
    rideHz: 1.3,
    damping: 0.36,
    rollStiffness: 0.4,
    grip: [1.25, 1.3],
    peakSlip: 0.14,
    slideShare: 0.8,
    engine: {
      peakTorqueNm: 370,
      torqueCurve: [
        [0.12, 0.65],
        [0.3, 0.9],
        [0.55, 1],
        [0.8, 0.92],
        [1, 0.75],
      ],
      engineBrakeNm: 45,
    },
    gearbox: { idleRpm: 750, redlineRpm: 6800, gearTopMS: [14, 24, 34, 45, 56, 66, 76], shiftS: 0.12, gentleShift: 0.4 },
    launchMS2: 6,
    rearShare: 1,
    brakeMS2: 11,
    dragPerMS2: 0.58,
    aero: 0.8,
    lock: 0.6,
    turnPerS: 2.5,
  }),

  // A rally special with a turbo flat four: lag, then a rush; four-wheel drive, a wing, and a tail that swings on the handbrake.
  grus: tuned({
    name: "Grus",
    class: "rally",
    massKg: 1330,
    outline: [4.2, 1.88, 1.34, 0.2],
    axleZ: [-1.25, 1.25],
    trackM: 1.605,
    wheelRadiusM: 0.32,
    massHeightM: 0.5,
    rideHz: 1.55,
    damping: 0.42,
    rollStiffness: 0.5,
    travelM: 0.32,
    grip: [1.375, 1.4],
    peakSlip: 0.14,
    slideShare: 0.82,
    handbrakeRearShare: 0.38,
    engine: {
      peakTorqueNm: 400,
      torqueCurve: [
        [0.12, 0.4],
        [0.3, 0.75],
        [0.42, 1],
        [0.75, 0.98],
        [0.9, 0.85],
        [1, 0.7],
      ],
      engineBrakeNm: 40,
    },
    gearbox: { idleRpm: 900, redlineRpm: 7400, gearTopMS: [15, 25, 35, 46, 57, 71], shiftS: 0.09, gentleShift: 0.45 },
    launchMS2: 8,
    rearShare: 0.55,
    brakeMS2: 12.5,
    dragPerMS2: 0.6,
    aero: 1.3,
    lock: 0.62,
    turnPerS: 3,
  }),
};
