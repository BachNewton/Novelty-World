import { describe, expect, it } from "vitest";
import {
  RHYTHMS,
  SIGNAL_COLORS,
  candelaToRendererIntensity,
  rhythmAt,
  signalLightIntensity,
} from "./iala";
import { luminance } from "./sky-model";
describe("renderer units", () => {

  it("makes candela mean candela whatever colour the lamp is", () => {
    // A saturated green lamp emits only `luminance(green)` of what its intensity says, because three
    // multiplies the colour in. Divide it back out, or a green light is a third as bright as a white
    // one of the same rating -- which is exactly the bug that makes signal lights look wrong.
    const cd = 100;
    for (const color of ["red", "green", "yellow", "white", "blue"] as const) {
      const emitted = signalLightIntensity(cd, color) * luminance(SIGNAL_COLORS[color]);
      expect(emitted, color).toBeCloseTo(candelaToRendererIntensity(cd), 9);
    }
    // ...and the saturated colours really are much darker than white, so this matters.
    expect(luminance(SIGNAL_COLORS.blue)).toBeLessThan(0.15);
    expect(luminance(SIGNAL_COLORS.red)).toBeLessThan(0.3);
  });
});

describe("the cardinal rhythms", () => {
  it("fills its period exactly, so the pattern never drifts", () => {
    for (const [name, rhythm] of Object.entries(RHYTHMS)) {
      const total = rhythm.pulses.reduce((s, p) => s + p.on + p.off, 0);
      expect(total, name).toBeCloseTo(rhythm.period, 6);
      // And no eclipse may be negative -- that is how a hand-written group silently overruns.
      for (const p of rhythm.pulses) expect(p.off, `${name} eclipse`).toBeGreaterThanOrEqual(0);
    }
  });

  it("is lit when the rhythm says lit, and dark between groups", () => {
    // West: nine 0.25 s flashes at the front of a 10 s period, then a long eclipse.
    const west = RHYTHMS.cardinalWest;
    expect(rhythmAt(west, 0.1)).toBe(true); // inside flash 1
    expect(rhythmAt(west, 0.35)).toBeUndefined(); // inside eclipse 1
    expect(rhythmAt(west, 0.6)).toBe(true); // inside flash 2
    expect(rhythmAt(west, 7)).toBeUndefined(); // the long eclipse
    expect(rhythmAt(west, 10.1)).toBe(true); // and it repeats
    expect(rhythmAt(west, -9.9)).toBe(true); // negative time is not a special case
  });
});
