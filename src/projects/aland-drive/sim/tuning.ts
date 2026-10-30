/*
 * Everything about how the car feels, in one place. Lengths are metres, forces
 * newtons, angles radians. The simulation steps at a fixed rate, so changing a
 * number here changes the car and nothing else.
 */

export const STEP_S = 1 / 120;

export const CAR = {
  massKg: 1400,
  /** Half the box the chassis collides as: wide, tall, long. */
  halfSize: [0.9, 0.42, 2.2],
  /** The box's middle and the centre of mass, from the body's origin. A low centre of mass rolls less. */
  boxUpM: 0.2,
  massUpM: -0.14,
  /** Rotational inertia about the car's width (pitch), height (yaw) and length (roll). */
  inertia: [2500, 2650, 620],
  wheelBaseM: 2.6,
  trackM: 1.6,
  wheelRadiusM: 0.33,
} as const;

export const SUSPENSION = {
  /** How far a wheel hangs below its mount with no weight on it. */
  droopM: 0.4,
  /** Past this compression the bump stop takes over. */
  travelM: 0.3,
  springNPerM: 30000,
  damperNPerMS: 2600,
  bumpStopNPerM: 120000,
  /** Moves load between a left and a right wheel by how far apart they sit: more stops the lean. */
  antiRollNPerM: 14000,
} as const;

export const GRIP = {
  /** Peak grip as a share of the load on a tyre. Front below rear keeps the back end planted. */
  frontMu: 1.3,
  rearMu: 1.4,
  /** The slip angle grip peaks at, and how much is left once a tyre is sliding. */
  peakSlip: 0.14,
  slideShare: 0.8,
  /** Below this speed slip is measured against it, so a stopped car doesn't jitter. */
  lowSpeedMS: 3,
  /** Rear grip while the handbrake is on: the drift. */
  handbrakeRearShare: 0.42,
  /** Tyre forces act this far above the road, which trades roll for stability. */
  forceLiftM: 0.28,
} as const;

export const POWER = {
  /** Sets the acceleration at speed, and with the drag below sets the top speed. */
  engineW: 205000,
  /** The limit to pull off the line. */
  launchN: 9500,
  /** The share of drive to the rear wheels; the rest goes to the front. */
  rearShare: 0.65,
  topSpeedMS: 55.6,
  reverseSpeedMS: 13,
  reverseN: 5000,
  brakeN: 17000,
  brakeFrontShare: 0.6,
  handbrakeN: 7000,
  rollingN: 220,
  /** Air drag is this times speed squared. 200 km/h needs it far above a real car's, so the power can stay fun. */
  dragPerMS2: 1.05,
  /** Pushes the car on to the road at speed, this times speed squared, so crests stay calm. */
  downforcePerMS2: 1.6,
} as const;

export const STEERING = {
  /** Lock at a standstill. */
  lock: 0.6,
  /** Lock narrows with speed to the angle that asks this much sideways acceleration, times the margin. */
  cornerMS2: 14,
  cornerMargin: 1.5,
  /** How fast the wheels turn, and how fast they come back. */
  turnPerS: 2.6,
  returnPerS: 4.5,
  /** Rear-wheel slip through the handbrake opens the lock this much. */
  handbrakeLock: 1.8,
  /** Steadies the car's yaw above walking pace, against the rate the steering asks for. */
  yawAssist: 2600,
} as const;

export const WORLD = {
  gravity: 9.81,
  /** Water stops a car in a couple of seconds, and it's put back on the road soon after. */
  waterDrag: 1800,
  waterStepsToRespawn: 150,
  /** A car on its roof or side for this long goes back to the road. */
  flippedStepsToRespawn: 240,
  /** The tile's edge is a wall: no road or ground exists beyond it yet. */
  wallHeightM: 400,
  wallThicknessM: 8,
} as const;
