import { describe, expect, it } from "vitest";
import { limitsOn } from "../sim/car-limits";
import { WORLD } from "../sim/tuning";
import { brakingG, planSpeeds, plannedSpeedAt, slowestAhead } from "./speed-plan";

/*
 * The speed plan along a line: a straight, one bend, a straight, for the
 * Skerry GT on dry asphalt at all of its grip. The plan must hold the bend's
 * speed through it, brake for it no harder than the car's measured braking,
 * and start from a standstill no faster than its pull.
 */

const STEP_M = 4;
const limits = limitsOn("skerry-gt", "dry", "asphalt");
/** 1 km straight, a 60 m bend of 50 m radius, 1 km straight. */
const bends = Float64Array.from({ length: 2060 / STEP_M }, (_, at) => (at * STEP_M >= 1000 && at * STEP_M < 1060 ? 1 / 50 : 0));

describe("the speed plan", () => {
  const plan = planSpeeds({ bends, stepM: STEP_M, limitsAt: () => limits, cornerShare: 1 });

  it("holds a bend at the speed its curvature allows on the car's grip at that speed", () => {
    const inBend = plannedSpeedAt(plan, 1030);
    const g = limits.corner.find(({ kmh }) => kmh === 60)?.g ?? 0;
    // Round a 50 m radius at about 1.3 g is about 25 m/s; the table's grip grows a little with speed.
    expect(inBend).toBeGreaterThan(Math.sqrt(g * WORLD.gravity * 50) * 0.95);
    expect(inBend).toBeLessThan(Math.sqrt(g * WORLD.gravity * 50) * 1.2);
  });

  it("brakes for the bend from the straight before it, never harder than the car's measured braking", () => {
    for (let along = 600; along < 1000; along += STEP_M) {
      const here = plannedSpeedAt(plan, along);
      const next = plannedSpeedAt(plan, along + STEP_M);
      if (next >= here) continue;
      const slowing = (here * here - next * next) / (2 * STEP_M);
      expect(slowing).toBeLessThanOrEqual(brakingG(limits, next) * WORLD.gravity + 1e-6);
    }
    expect(plannedSpeedAt(plan, 700)).toBeGreaterThan(plannedSpeedAt(plan, 950));
  });

  it("starts from a standstill and gains no faster than the car's pull, with no standstill written into it", () => {
    // A car put down behind a standstill in its plan would never drive off: the start reads as the sample after it.
    expect(plannedSpeedAt(plan, 0)).toBe(plannedSpeedAt(plan, STEP_M));
    expect(Math.min(...plan.speeds)).toBeGreaterThan(0);
    expect(plannedSpeedAt(plan, 0) * 3.6).toBeLessThan(40);
    expect(plannedSpeedAt(plan, 40)).toBeLessThan(plannedSpeedAt(plan, 200));
    // 0 to 100 km/h in the table's 4.7 s is about 65 m: at 40 m it's well under 100 km/h.
    expect(plannedSpeedAt(plan, 40) * 3.6).toBeLessThan(100);
  });

  it("reads the slowest speed over a stretch ahead, which is what a driver holds under", () => {
    expect(slowestAhead(plan, 900, 1040)).toBeCloseTo(Math.min(...plan.speeds.slice(900 / STEP_M, 1040 / STEP_M + 1)), 6);
    expect(slowestAhead(plan, 100, 120)).toBeGreaterThan(slowestAhead(plan, 900, 1040));
  });

  it("slows for a crest the car would go light over", () => {
    // A crest of 500 m radius on the second straight, where the car is well past the 54 m/s that leaves it 0.6 of its weight.
    const crest = Float64Array.from(bends, (_, at) => (at * STEP_M >= 1780 && at * STEP_M < 1820 ? 1 / 500 : 0));
    const over = planSpeeds({ bends, crest, stepM: STEP_M, limitsAt: () => limits, cornerShare: 1 });
    expect(plannedSpeedAt(plan, 1800)).toBeGreaterThan(56);
    expect(plannedSpeedAt(over, 1800)).toBeLessThanOrEqual(Math.sqrt(0.6 * WORLD.gravity * 500) + 1e-6);
  });

  it("takes a turn tighter than the steering makes at a crawl, never a standstill", () => {
    // A corner turned at one point of the line, far inside what a lock of 6 m at any speed turns.
    const corner = Float64Array.from(bends, (_, at) => (at * STEP_M === 1000 ? 1 / 2 : 0));
    const tight = planSpeeds({ bends: corner, stepM: STEP_M, limitsAt: () => limits, cornerShare: 1, tightestRadiusAt: () => 6 });
    expect(Math.min(...tight.speeds)).toBeGreaterThan(2);
    expect(plannedSpeedAt(tight, 1000)).toBeLessThan(5);
  });

  it("plans a gentler drive at a share of the grip", () => {
    const eased = planSpeeds({ bends, stepM: STEP_M, limitsAt: () => limits, cornerShare: 0.7 });
    expect(plannedSpeedAt(eased, 1030)).toBeLessThan(plannedSpeedAt(plan, 1030));
    expect(plannedSpeedAt(eased, 1030)).toBeGreaterThan(plannedSpeedAt(plan, 1030) * 0.8);
  });
});
