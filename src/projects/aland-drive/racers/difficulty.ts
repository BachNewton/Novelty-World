/*
 * How well a racer drives (`ideas/traffic-and-racers.md`, "Difficulty without
 * visible cheating"): never more grip, power or luck than its car has, only how
 * much of its car's limit it plans on. A level is a share of the car's measured
 * cornering grip, a share of its braking, the second a little higher, since a
 * driver who corners cautiously still brakes firmly, and how much of the
 * throttle it uses once rolling, out of a bend and down a straight, which is
 * where a cautious driver gives up most of the time; off the line every level
 * launches with all of it, since a racer that dawdles away from the grid reads
 * as broken, not cautious. Each level's time on every track
 * is a count the vetting tool makes, so the spread between levels is measured,
 * never guessed; the shares here are the first to be measured.
 */

export const DIFFICULTIES = ["easy", "medium", "hard", "expert", "legend"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export interface DriverSkill {
  /** The share of the car's measured cornering grip the plan uses. */
  cornerShare: number;
  /** The share of its measured braking, which sets how late it brakes. */
  brakeShare: number;
  /** The most of the throttle it uses. */
  throttleShare: number;
}

export const SKILLS: Readonly<Record<Difficulty, DriverSkill>> = {
  easy: { cornerShare: 0.6, brakeShare: 0.7, throttleShare: 0.55 },
  medium: { cornerShare: 0.68, brakeShare: 0.78, throttleShare: 0.7 },
  hard: { cornerShare: 0.76, brakeShare: 0.85, throttleShare: 0.85 },
  expert: { cornerShare: 0.83, brakeShare: 0.92, throttleShare: 0.95 },
  legend: { cornerShare: 0.9, brakeShare: 0.98, throttleShare: 1 },
};

export const isDifficulty = (name: string): name is Difficulty => (DIFFICULTIES as readonly string[]).includes(name);
