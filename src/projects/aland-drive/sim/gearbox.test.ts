import { describe, expect, it } from "vitest";
import { CAR_IDS, CARS } from "./cars";
import { radiansPerMetre, resistanceAt, restingEngine, shiftGear, stepEngine, topSpeedMS, torqueAt, type EngineRead } from "./gearbox";
import { STEP_S, WORLD } from "./tuning";

/** The automatic's tests ramp the speed by a fixed amount a step, at a frame's pace. */
const SHIFT_STEP_S = 1 / 60;

describe.each(CAR_IDS)("%s", (id) => {
  const tuning = CARS[id];
  const { gearbox, power, car } = tuning;
  const topGear = gearbox.gearTopMS.length - 1;

  it("stops gaining speed where drag meets the engine, or at its last gear's redline, and nowhere sooner", () => {
    const top = topSpeedMS(tuning);
    expect(top).toBeLessThanOrEqual(gearbox.gearTopMS[topGear] + 0.1);
    // Most of the way to the top speed some gear still pulls past the drag: no hole in the gearing.
    for (let speed = 5; speed < top * 0.97; speed += 1) {
      const best = Math.max(...gearbox.gearTopMS.map((_, gear) => Math.min(power.launchN, torqueAt(tuning, (speed / gearbox.gearTopMS[gear]) * gearbox.redlineRpm) * radiansPerMetre(tuning, gear))));
      expect(best).toBeGreaterThan(resistanceAt(tuning, speed));
    }
  });

  it("pulls harder at a speed in the gear the automatic picks than in the one above", () => {
    let read = restingEngine(gearbox);
    for (let speed = 1; speed < gearbox.gearTopMS[topGear]; speed += 0.02) {
      read = stepEngine(gearbox, read, speed, 1, STEP_S).read;
      if (read.shiftLeftS > 0 || read.gear === topGear || read.rpm < gearbox.redlineRpm * 0.7) continue;
      const here = Math.min(power.launchN, torqueAt(tuning, read.rpm) * radiansPerMetre(tuning, read.gear));
      const above = Math.min(power.launchN, torqueAt(tuning, (speed / gearbox.gearTopMS[read.gear + 1]) * gearbox.redlineRpm) * radiansPerMetre(tuning, read.gear + 1));
      // Right at the shift the two are close: the higher gear may lead a little as torque falls away.
      expect(here).toBeGreaterThan(above * 0.9);
    }
  });

  it("pulls away up a one-in-five hill in first", () => {
    const first = Math.min(power.launchN, torqueAt(tuning, gearbox.redlineRpm * 0.5) * radiansPerMetre(tuning, 0));
    const hill = car.massKg * WORLD.gravity * Math.sin(Math.atan(0.2)) + power.rollingN;
    expect(first).toBeGreaterThan(hill * 1.3);
  });

  it("makes no torque past the redline", () => {
    expect(torqueAt(tuning, gearbox.redlineRpm)).toBe(0);
    expect(torqueAt(tuning, gearbox.redlineRpm * 0.99)).toBeGreaterThan(0);
  });

  it("climbs every gear flat out, keeps under its redline and doesn't hunt", () => {
    let read: EngineRead = restingEngine(gearbox);
    let shifts = 0;
    let highest = 0;
    for (let speed = 0; speed < 55; speed += 0.08) {
      const stepped = stepEngine(gearbox, read, speed, 1, SHIFT_STEP_S);
      read = stepped.read;
      highest = Math.max(highest, read.rpm);
      if (stepped.shifted) shifts++;
    }
    expect(highest).toBeLessThanOrEqual(gearbox.redlineRpm * 1.01);
    expect(shifts).toBeLessThanOrEqual(topGear);
    for (let speed = 55; speed > 0; speed -= 0.15) {
      const stepped = stepEngine(gearbox, read, speed, 0, SHIFT_STEP_S);
      read = stepped.read;
      if (stepped.shifted) shifts++;
    }
    expect(read.gear).toBe(0);
    expect(shifts).toBeLessThanOrEqual(2 * topGear);
  });

  it("holds one gear at a steady cruise", () => {
    for (const speed of [8, 14, 20, 27, 33, 42, 50]) {
      for (const throttle of [0.2, 0.5, 0.8]) {
        let read = restingEngine(gearbox);
        for (let i = 0; i < 300; i++) read = stepEngine(gearbox, read, speed, throttle, SHIFT_STEP_S).read;
        let shifts = 0;
        for (let i = 0; i < 300; i++) {
          const stepped = stepEngine(gearbox, read, speed, throttle, SHIFT_STEP_S);
          read = stepped.read;
          if (stepped.shifted) shifts++;
        }
        expect(shifts).toBe(0);
      }
    }
  });
});

describe("manual", () => {
  const { gearbox } = CARS["skerry-gt"];

  it("never shifts by itself: flat out in first, the revs sit at the limiter", () => {
    let read = restingEngine(gearbox);
    for (let speed = 0; speed < gearbox.gearTopMS[0] * 1.2; speed += 0.08) {
      const stepped = stepEngine(gearbox, read, speed, 1, SHIFT_STEP_S, speed, "manual");
      read = stepped.read;
      expect(stepped.shifted).toBe(false);
    }
    expect(read.gear).toBe(0);
    expect(read.rpm).toBeGreaterThan(gearbox.redlineRpm * 0.99);
    expect(read.rpm).toBeLessThanOrEqual(gearbox.redlineRpm * 1.01);
  });

  it("refuses a downshift past the redline, a shift past either end, and a shift while one is under way", () => {
    const third = { ...restingEngine(gearbox), gear: 2 };
    const fast = gearbox.gearTopMS[1] * 1.05;
    expect(shiftGear(gearbox, third, -1, fast)).toBeNull();
    expect(shiftGear(gearbox, third, -1, gearbox.gearTopMS[1] * 0.9)?.gear).toBe(1);
    expect(shiftGear(gearbox, restingEngine(gearbox), -1, 0)).toBeNull();
    expect(shiftGear(gearbox, { ...third, gear: gearbox.gearTopMS.length - 1 }, 1, fast)).toBeNull();
    const shifting = shiftGear(gearbox, third, 1, fast);
    expect(shifting?.shiftLeftS).toBe(gearbox.shiftS);
    if (shifting) expect(shiftGear(gearbox, shifting, 1, fast)).toBeNull();
  });
});
