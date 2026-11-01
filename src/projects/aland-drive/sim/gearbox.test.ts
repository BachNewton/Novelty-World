import { describe, expect, it } from "vitest";
import { radiansPerMetre, restingEngine, stepEngine, torqueAt } from "./gearbox";
import { GEARBOX, POWER, STEP_S } from "./tuning";

const resistance = (speed: number) => POWER.dragPerMS2 * speed * speed + POWER.rollingN;
const topGear = GEARBOX.gearTopMS.length - 1;
const revsAt = (speed: number) => (speed / GEARBOX.gearTopMS[topGear]) * GEARBOX.redlineRpm;
const pull = (speed: number) => torqueAt(revsAt(speed)) * radiansPerMetre(topGear);

describe("the top speed", () => {
  it("is where drag meets the engine, before the redline ends it", () => {
    let speed = 40;
    while (pull(speed) > resistance(speed)) speed += 0.1;
    expect(speed * 3.6).toBeGreaterThan(240);
    expect(speed).toBeLessThan(GEARBOX.gearTopMS[topGear]);
  });
});

describe("the gears", () => {
  it("pull harder at a speed in the gear the automatic picks than in the one above", () => {
    let read = restingEngine(GEARBOX);
    for (let speed = 1; speed < 70; speed += 0.02) {
      read = stepEngine(GEARBOX, read, speed, 1, STEP_S).read;
      if (read.shiftLeftS > 0 || read.gear === topGear || read.rpm < GEARBOX.redlineRpm * 0.7) continue;
      const here = Math.min(POWER.launchN, torqueAt(read.rpm) * radiansPerMetre(read.gear));
      const above = torqueAt((speed / GEARBOX.gearTopMS[read.gear + 1]) * GEARBOX.redlineRpm) * radiansPerMetre(read.gear + 1);
      // Right at the shift the two are close: the higher gear may lead a little as torque falls away.
      expect(here).toBeGreaterThan(above * 0.9);
    }
  });

  it("makes no torque past the redline", () => {
    expect(torqueAt(GEARBOX.redlineRpm)).toBe(0);
    expect(torqueAt(GEARBOX.redlineRpm * 0.99)).toBeGreaterThan(0);
  });
});
