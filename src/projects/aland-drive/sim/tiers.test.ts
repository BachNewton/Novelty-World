import { describe, expect, it } from "vitest";
import { limitsOn } from "./car-limits";
import { CAR_IDS, CAR_TIERS, type CarId } from "./cars";
import { sprintSurface, TIER_BANDS, TIERS, type Tier } from "./tiers";

/** Cars measured outside their tier's band, still to be retuned into it. A car's retune deletes its line. */
const RETUNE_PENDING: ReadonlySet<CarId> = new Set<CarId>([
  // 5.0 s to 100 km/h, where A5 asks 4.3–4.9.
  "ankar",
  // 7.8 s to 100 km/h and 186 km/h, where A7 asks 5.7–7.0 and 195–250.
  "ljus",
]);

/** A car's two figures, as its tier's band reads them: a tenth of a second, a whole km/h. */
function figures(id: CarId, tier: Tier): { to100S: number | null; topKmh: number } {
  const sprint = limitsOn(id, "dry", sprintSurface(tier)).sprintS.find(({ kmh }) => kmh === 100);
  return { to100S: sprint ? Number(sprint.s.toFixed(1)) : null, topKmh: Math.round(limitsOn(id, "dry", "asphalt").reachedKmh) };
}

const within = (value: number | null, [low, high]: readonly [number, number]) => value !== null && value >= low && value <= high;

const tiered = CAR_IDS.flatMap((id) => {
  const tier = CAR_TIERS[id];
  return tier === null ? [] : [{ id, tier }];
});

describe("each car's tier", () => {
  it.each(tiered.filter(({ id }) => !RETUNE_PENDING.has(id)))("holds $id inside $tier's band, as measured", ({ id, tier }) => {
    const { to100S, topKmh } = figures(id, tier);
    const band = TIER_BANDS[tier];
    expect({ to100S: within(to100S, band.to100S), topKmh: within(topKmh, band.topKmh) }, `${id}: ${String(to100S)} s to 100 on dry ${sprintSurface(tier)}, ${String(topKmh)} km/h`).toEqual({ to100S: true, topKmh: true });
  });

  it.each(tiered.filter(({ id }) => RETUNE_PENDING.has(id)))("still has $id outside $tier's band: if not, delete its line from RETUNE_PENDING", ({ id, tier }) => {
    const { to100S, topKmh } = figures(id, tier);
    const band = TIER_BANDS[tier];
    expect(within(to100S, band.to100S) && within(topKmh, band.topKmh)).toBe(false);
  });

  it("lists the cars by tier, fastest first, and those outside the tiers last", () => {
    const rank = (id: CarId) => {
      const tier = CAR_TIERS[id];
      return tier === null ? TIERS.length : TIERS.indexOf(tier);
    };
    const ranks = CAR_IDS.map(rank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});
