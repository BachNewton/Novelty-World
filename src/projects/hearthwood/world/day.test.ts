import { describe, expect, it } from "vitest";
import { blendAt, DAY_SECONDS, FIRST_HOUR, hourAt, keyLight, lightAt, sunDirection } from "./day";

describe("the day", () => {
  it("starts at its first hour and turns once in DAY_SECONDS", () => {
    expect(hourAt(0)).toBe(FIRST_HOUR);
    expect(hourAt(DAY_SECONDS)).toBeCloseTo(FIRST_HOUR);
    expect(hourAt(DAY_SECONDS / 2)).toBeCloseTo((FIRST_HOUR + 12) % 24);
  });

  it("has the sun up by day and down at night", () => {
    expect(sunDirection(12.3).y).toBeGreaterThan(0.6);
    expect(sunDirection(8).y).toBeGreaterThan(0);
    expect(sunDirection(23).y).toBeLessThan(0);
    expect(sunDirection(3).y).toBeLessThan(0);
  });

  it("lights the night by the moon, and hands over between them in the dark", () => {
    expect(keyLight(0).direction.y).toBeGreaterThan(0.5);
    expect(keyLight(0).strength).toBeGreaterThan(0.9);
    for (let h = 17; h < 21; h += 0.01) {
      const handover = keyLight(h).strength;
      if (sunDirection(h).y > 0 && sunDirection(h + 0.01).y <= 0) expect(handover).toBeLessThan(0.05);
    }
  });

  it("blends its light without a jump anywhere round the clock", () => {
    let previous = lightAt(0);
    for (let h = 0.02; h <= 24; h += 0.02) {
      const now = lightAt(h);
      expect(Math.abs(now.sun - previous.sun)).toBeLessThan(0.05);
      expect(Math.abs(now.ambient - previous.ambient)).toBeLessThan(0.05);
      previous = now;
    }
    expect(blendAt(0)).toEqual(blendAt(24));
  });

  it("is brightest round noon and fire-lit at night", () => {
    expect(lightAt(12.5).sun).toBeGreaterThan(lightAt(19).sun);
    expect(lightAt(23).fire).toBeGreaterThan(lightAt(12).fire);
    expect(lightAt(23).night).toBe(1);
    expect(lightAt(12).night).toBe(0);
  });
});
