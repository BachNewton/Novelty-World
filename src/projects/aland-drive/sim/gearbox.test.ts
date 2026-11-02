import { describe, expect, it } from "vitest";
import { CAR_IDS, CARS } from "./cars";
import { radiansPerMetre, resistanceAt, restingEngine, stepEngine, topSpeedMS, torqueAt } from "./gearbox";
import { STEP_S, WORLD } from "./tuning";

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
});
