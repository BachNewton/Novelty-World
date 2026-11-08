import type { Surface } from "./surfaces";

/*
 * The tiers a car is entered in, Test Drive Unlimited 2's scheme moved to
 * today's cars (`ideas/cars.md`): A asphalt, B gravel, C classic, each from
 * its fastest tier down. A tier is a band of two figures, each read from the
 * car's measured limits (`car-limits.ts`): its time from a standstill to
 * 100 km/h, on dry asphalt in A and C and on dry gravel in B, since B ranks
 * cars by how they drive on gravel, and its top speed on dry asphalt.
 */

export const TIERS = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "B1", "B2", "B3", "B4", "C1", "C2", "C3", "C4"] as const;
export type Tier = (typeof TIERS)[number];

export interface TierBand {
  /** Seconds from a standstill to 100 km/h, on summer tyres, fastest and slowest, to a tenth of a second. */
  to100S: readonly [low: number, high: number];
  /** Top speed on dry asphalt, km/h, slowest and fastest, to a whole km/h. */
  topKmh: readonly [low: number, high: number];
}

export const TIER_BANDS: Readonly<Record<Tier, TierBand>> = {
  A1: { to100S: [1.8, 2.7], topKmh: [340, 400] },
  A2: { to100S: [2.8, 3.1], topKmh: [310, 345] },
  A3: { to100S: [3.2, 3.6], topKmh: [250, 340] },
  A4: { to100S: [3.7, 4.2], topKmh: [280, 320] },
  A5: { to100S: [4.3, 4.9], topKmh: [225, 300] },
  A6: { to100S: [5.0, 5.6], topKmh: [230, 250] },
  A7: { to100S: [5.7, 7.0], topKmh: [195, 250] },
  B1: { to100S: [2.4, 4.3], topKmh: [195, 260] },
  B2: { to100S: [4.4, 6.0], topKmh: [175, 250] },
  B3: { to100S: [6.0, 8.0], topKmh: [190, 250] },
  B4: { to100S: [8.5, 14], topKmh: [140, 185] },
  C1: { to100S: [3.2, 3.8], topKmh: [210, 380] },
  C2: { to100S: [5.4, 6.3], topKmh: [210, 290] },
  C3: { to100S: [6.2, 7.8], topKmh: [170, 220] },
  C4: { to100S: [12, 26], topKmh: [110, 160] },
};

/** The dry surface a tier's time to 100 km/h is taken on. */
export const sprintSurface = (tier: Tier): Surface => (tier.startsWith("B") ? "gravel" : "asphalt");
