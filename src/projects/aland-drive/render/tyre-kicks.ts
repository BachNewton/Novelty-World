import type { Condition, Surface, Tyre } from "../sim/surfaces";

/*
 * What a tyre throws up, and how much: the rules behind the tyre particles
 * (`tyre-particles.ts`), with nothing drawn here. Loose ground gives some just
 * by rolling over it (a gravel road's dust trail, spray off a wet road, powder
 * off snow), and more by sliding; a dry road gives nothing until the tyre is
 * past its grip, and then smoke. Studs on ice chip it as they roll.
 */

/** Soft, see-through puffs that hang in the air, and small solid bits that fly and land. */
export const PUFFS = ["dust", "spray", "powder", "smoke"] as const;
export const CHIPS = ["stone", "clod", "blade", "grit", "ice"] as const;
export type Puff = (typeof PUFFS)[number];
export type Chip = (typeof CHIPS)[number];
export type Kick = Puff | Chip;

/** One wheel on one step, as the simulation's tread reads it. */
export interface TyreRead {
  surface: Surface;
  condition: Condition;
  tyres: Tyre;
  /** Along the way the tyre rolls, metres a second, either way. */
  rollMS: number;
  /** Across it. */
  slideMS: number;
  /** Asked over what it could grip: past 1 the tyre spins or locks. */
  demand: number;
}

/** The slip angle a tyre still grips at, with room over the cars' peaks: up to here a corner is cornering, not a slide. */
const GRIPPING_SLIP = 0.18;
/** The speed the simulation's slip angle stops shrinking under. */
const LOW_SPEED_MS = 3;
/** Asked this far over its grip, a tyre is spinning or locked rather than at its limit. */
const SPINNING_DEMAND = 1.15;
/** How fast a spinning or locked tyre's tread rubs the ground at a standstill. */
const SPIN_FLOOR_MS = 8;

/** How fast the tread rubs the ground past what it grips, metres a second: sliding sideways, spinning or locked. */
export function rubMS({ rollMS, slideMS, demand }: Pick<TyreRead, "rollMS" | "slideMS" | "demand">): number {
  const rolling = Math.max(Math.abs(rollMS), LOW_SPEED_MS);
  const sliding = Math.max(0, Math.abs(slideMS) - rolling * Math.tan(GRIPPING_SLIP));
  const scrub = demand > SPINNING_DEMAND ? (1 - SPINNING_DEMAND / demand) * Math.max(Math.abs(rollMS), SPIN_FLOOR_MS) : 0;
  return Math.hypot(sliding, scrub);
}

/** Particles a second: some for rolling, more for rubbing, and never more than the most. */
interface Rate {
  perRollMS?: number;
  /** Rolling under this gives none: a slow tyre lifts no spray. */
  rollFromMS?: number;
  perRubMS?: number;
  /** Rubbing under this gives none: a little scrub smokes no tyre. */
  rubFromMS?: number;
  most: number;
}

type Rates = Partial<Record<Kick, Rate>>;

const SPRAY: Rate = { perRollMS: 3, rollFromMS: 4, perRubMS: 8, most: 90 };
const POWDER: Rate = { perRollMS: 1.4, rollFromMS: 2, perRubMS: 9, most: 80 };

const KICKS: Record<Condition, Record<Surface, Rates>> = {
  dry: {
    asphalt: { smoke: { perRubMS: 8, rubFromMS: 2, most: 60 } },
    gravel: { dust: { perRollMS: 1.4, rollFromMS: 2, perRubMS: 8, most: 70 }, stone: { perRollMS: 0.15, rollFromMS: 4, perRubMS: 4, most: 30 } },
    grass: { dust: { perRollMS: 0.15, rollFromMS: 6, perRubMS: 1.5, most: 15 }, blade: { perRollMS: 0.3, rollFromMS: 4, perRubMS: 5, most: 35 }, clod: { perRubMS: 2.5, rubFromMS: 0.5, most: 22 } },
    rock: { grit: { perRollMS: 0.08, rollFromMS: 6, perRubMS: 2, most: 18 }, dust: { perRubMS: 2, rubFromMS: 1, most: 20 } },
  },
  wet: {
    asphalt: { spray: SPRAY },
    gravel: { spray: SPRAY, stone: { perRubMS: 3, rubFromMS: 0.5, most: 22 } },
    grass: { spray: { ...SPRAY, most: 45 }, clod: { perRubMS: 4, rubFromMS: 0.5, most: 30 }, blade: { perRubMS: 4, rubFromMS: 0.5, most: 30 } },
    rock: { spray: SPRAY, grit: { perRubMS: 1.2, rubFromMS: 1, most: 12 } },
  },
  snow: {
    asphalt: { powder: POWDER },
    gravel: { powder: POWDER, stone: { perRubMS: 1, rubFromMS: 3, most: 10 } },
    grass: { powder: POWDER, clod: { perRubMS: 1, rubFromMS: 3, most: 10 } },
    rock: { powder: POWDER },
  },
  // Ice is hard and bare: only a slide scrapes frost off it.
  ice: {
    asphalt: { powder: { perRubMS: 4, rubFromMS: 1.5, most: 30 } },
    gravel: { powder: { perRubMS: 4, rubFromMS: 1.5, most: 30 } },
    grass: { powder: { perRubMS: 4, rubFromMS: 1.5, most: 30 } },
    rock: { powder: { perRubMS: 4, rubFromMS: 1.5, most: 30 } },
  },
};

/** Studs bite into ice and throw chips of it: a few just rolling, more in a slide. */
const ON_STUDS: Partial<Record<Condition, Rates>> = {
  ice: { ice: { perRollMS: 0.3, rollFromMS: 3, perRubMS: 3, most: 25 } },
};

const rateOf = ({ perRollMS = 0, rollFromMS = 0, perRubMS = 0, rubFromMS = 0, most }: Rate, rollMS: number, rub: number) =>
  Math.min(most, perRollMS * Math.max(0, rollMS - rollFromMS) + perRubMS * Math.max(0, rub - rubFromMS));

/** What one wheel throws up this step, in particles a second of each kind it throws any of, and how fast it rubs. */
export function kicksOf(read: TyreRead): { rates: [Kick, number][]; rub: number } {
  const rub = rubMS(read);
  const rolling = Math.abs(read.rollMS);
  const rates: [Kick, number][] = [];
  const studs = read.tyres === "studded" ? ON_STUDS[read.condition] : undefined;
  for (const [kick, rate] of Object.entries({ ...KICKS[read.condition][read.surface], ...studs }) as [Kick, Rate][]) {
    const perS = rateOf(rate, rolling, rub);
    if (perS > 0) rates.push([kick, perS]);
  }
  return { rates, rub };
}
