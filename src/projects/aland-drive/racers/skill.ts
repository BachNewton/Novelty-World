/*
 * How hard the racers drive (`ideas/traffic-and-racers.md`, "Difficulty without
 * visible cheating", and the owner's ruling in `ideas/racer-method.md`): there
 * is one racer, as fast as it legally can be, never more grip, power or luck
 * than its car has. Its skill is the share of its car's measured cornering
 * grip its plan uses and the share of its braking, the second a little higher,
 * since even a driver at the limit leaves the brakes some room for a crest or
 * a camber. The shares are the highest the vetting tool finds clean, and go up
 * as the plan learns to see what still catches it out; they are measured,
 * never guessed.
 */

export interface DriverSkill {
  /** The share of the car's measured cornering grip the plan uses. */
  cornerShare: number;
  /** The share of its measured braking, which sets how late it brakes. */
  brakeShare: number;
}

export const RACER_SKILL: DriverSkill = { cornerShare: 0.85, brakeShare: 0.92 };
