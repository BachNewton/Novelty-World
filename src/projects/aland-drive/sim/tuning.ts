import type { Gearbox } from "./gearbox";

/*
 * The shape of a car's numbers, and the world's, which every car shares. Lengths
 * are metres, forces newtons, angles radians. Each car's own numbers are in
 * `cars.ts`. The simulation steps at a fixed rate, so changing a number changes
 * the car and nothing else.
 */

export const STEP_S = 1 / 120;

/** Everything about how one car feels. */
export interface CarTuning {
  /** What the car is called, on screen. */
  name: string;
  car: {
    massKg: number;
    /** Half the box the chassis collides as: wide, tall, long. */
    halfSize: readonly [number, number, number];
    /** The box's middle and the centre of mass, from the body's origin. A low centre of mass rolls less. */
    boxUpM: number;
    massUpM: number;
    /** Rotational inertia about the car's width (pitch), height (yaw) and length (roll). */
    inertia: readonly [number, number, number];
    /** Where the front and rear axles are along the car, nose to -z, from the centre of mass: the balance of weight. */
    axleZ: readonly [front: number, rear: number];
    trackM: number;
    wheelRadiusM: number;
  };
  suspension: {
    /** How far a wheel hangs below its mount with no weight on it. */
    droopM: number;
    /** Past this compression the bump stop takes over. */
    travelM: number;
    /** A wheel's spring and damper if the weight sat midway between the axles; each axle's are matched to the load on it, so the car sits level. */
    springNPerM: number;
    damperNPerMS: number;
    bumpStopNPerM: number;
    /** Moves load between a left and a right wheel by how far apart they sit: more stops the lean. */
    antiRollNPerM: number;
  };
  grip: {
    /** Peak grip as a share of the load on a tyre. Front below rear keeps the back end planted. */
    frontMu: number;
    rearMu: number;
    /** The slip angle grip peaks at, and how much is left once a tyre is sliding. */
    peakSlip: number;
    slideShare: number;
    /** Below this speed slip is measured against it, so a stopped car doesn't jitter. */
    lowSpeedMS: number;
    /** Rear grip while the handbrake is on: the drift. */
    handbrakeRearShare: number;
    /** Tyre forces act this far above the road, which trades roll for stability. */
    forceLiftM: number;
  };
  engine: {
    peakTorqueNm: number;
    /** The share of peak torque at a share of the redline, rising in revs. */
    torqueCurve: readonly (readonly [revs: number, share: number])[];
    /** What the closed throttle holds back with at the redline, less with the revs. An electric car's is its regeneration. */
    engineBrakeNm: number;
  };
  gearbox: Gearbox;
  power: {
    /** The limit to pull off the line, whatever first gear could do. */
    launchN: number;
    /** The share of drive to the rear wheels; the rest goes to the front. */
    rearShare: number;
    reverseSpeedMS: number;
    reverseN: number;
    brakeN: number;
    brakeFrontShare: number;
    handbrakeN: number;
    rollingN: number;
    /** Air drag is this times speed squared: where it meets the engine's power is the top speed. */
    dragPerMS2: number;
    /** Pushes the car on to the road at speed, this times speed squared, so crests stay calm. */
    downforcePerMS2: number;
  };
  steering: {
    /** Lock at a standstill. */
    lock: number;
    /** Lock narrows with speed to the angle that asks this much sideways acceleration, times the margin. */
    cornerMS2: number;
    cornerMargin: number;
    /** How fast the wheels turn, and how fast they come back. */
    turnPerS: number;
    returnPerS: number;
    /** Rear-wheel slip through the handbrake opens the lock this much. */
    handbrakeLock: number;
    /** Steadies the car's yaw above walking pace, against the rate the steering asks for. */
    yawAssist: number;
  };
}

export const WORLD = {
  gravity: 9.81,
  /** Water stops a car in a couple of seconds. */
  waterDrag: 1800,
  /** The tile's edge is a wall: no road or ground exists beyond it yet. */
  wallHeightM: 400,
  wallThicknessM: 8,
} as const;

export const wheelBaseOf = ({ car }: CarTuning) => car.axleZ[1] - car.axleZ[0];

/** How far the springs settle under the car's weight. Each axle's spring is matched to its load, so the two ends settle alike. */
export const sagOf = ({ car, suspension }: CarTuning) => (car.massKg * WORLD.gravity) / 4 / suspension.springNPerM;

/** How much stiffer than `springNPerM` an axle's springs are, for the share of the weight it carries. 1 for both when the weight sits midway. */
export function axleShare({ car }: CarTuning, front: boolean): number {
  const [ahead, behind] = car.axleZ;
  return (2 * (front ? behind : -ahead)) / (behind - ahead);
}
