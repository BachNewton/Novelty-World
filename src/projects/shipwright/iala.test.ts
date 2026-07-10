import { describe, expect, it } from "vitest";
import {
  NIGHT_THRESHOLD_LUX,
  RHYTHMS,
  SIGNAL_COLORS,
  allardIlluminanceLux,
  candelaForNominalRange,
  candelaToRendererIntensity,
  dutyCycle,
  rhythmAt,
  signalLightIntensity,
  type Rhythm,
} from "./iala";
import { DAYLIGHT_EFFICACY, WATTS_PER_UNIT } from "./lighting";
import { luminance } from "./sky-model";

describe("Allard's law and nominal range", () => {
  it("reproduces IALA's own anchor: 500 cd is about 8 nautical miles", () => {
    // The figure IALA quotes in its own material. If this drifts, the photometry is wrong.
    expect(candelaForNominalRange(8)).toBeGreaterThan(450);
    expect(candelaForNominalRange(8)).toBeLessThan(520);
  });

  it("puts exactly the night threshold on the eye at the nominal range", () => {
    // This is the DEFINITION of nominal range, so it has to close on itself: a light rated for `d` NM
    // delivers 2e-7 lux at `d` NM through 10 NM-visibility air. Any error in the 0.686 collapses here.
    for (const nm of [2, 4, 6, 8]) {
      const cd = candelaForNominalRange(nm);
      const lux = allardIlluminanceLux(cd, nm * 1852);
      expect(lux / NIGHT_THRESHOLD_LUX).toBeCloseTo(1, 1);
    }
  });

  it("grows faster than the inverse-square alone, because the air absorbs too", () => {
    // Doubling the range costs more than 4x the candela: 0.74^-d is doing work.
    expect(candelaForNominalRange(8) / candelaForNominalRange(4)).toBeGreaterThan(4);
  });

  it("gives a minor Baltic spar lantern a plausible intensity", () => {
    // Finnish channel spars are rated 2-3 NM. That is a handful of candela, not hundreds.
    expect(candelaForNominalRange(2)).toBeGreaterThan(3);
    expect(candelaForNominalRange(3)).toBeLessThan(20);
  });
});

describe("renderer units", () => {
  it("closes the loop: 100 cd at 5 m is 4 lux, in our units too", () => {
    // three multiplies color x intensity and divides by d^2, so `intensity` is an irradiance x m^2.
    const intensity = candelaToRendererIntensity(100);
    const irradiance = intensity / (5 * 5); // renderer units at 5 m
    const lux = irradiance * WATTS_PER_UNIT * DAYLIGHT_EFFICACY;
    expect(lux).toBeCloseTo(4, 6);
  });

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

describe("signal colours", () => {
  it("makes green a blue-green, not a lime", () => {
    // IALA E-200-1 explicitly excludes yellow-greens. Everybody renders this wrong.
    const [r, g, b] = SIGNAL_COLORS.green;
    expect(b).toBeGreaterThan(0.2); // there IS blue in it
    expect(r).toBe(0); // and no red at all
    expect(g).toBeGreaterThan(b);
  });

  it("makes yellow an amber, warmer than a lemon", () => {
    const [r, g] = SIGNAL_COLORS.yellow;
    expect(g / r).toBeLessThan(0.5); // a lemon yellow would be ~1.0
  });

  it("uses blue on exactly one mark in the whole system", () => {
    const blueRhythms = Object.values(RHYTHMS).filter((r: Rhythm) =>
      r.pulses.some((p) => p.color === "blue"),
    );
    expect(blueRhythms).toHaveLength(1);
    expect(blueRhythms[0].abbr).toBe("Al.Bu.Y 3s");
  });
});

describe("the cardinal rhythms", () => {
  /** Count the flashes in one period, and the length of the longest one. */
  const flashes = (rhythm: Rhythm) => rhythm.pulses.length;
  const longest = (rhythm: Rhythm) => Math.max(...rhythm.pulses.map((p) => p.on));

  it("counts by the clock face: 3 = East, 6 = South, 9 = West, North is continuous", () => {
    expect(flashes(RHYTHMS.cardinalEast)).toBe(3);
    expect(flashes(RHYTHMS.cardinalSouth)).toBe(7); // 6 quick + the long flash
    expect(flashes(RHYTHMS.cardinalWest)).toBe(9);
    expect(RHYTHMS.cardinalNorth.abbr).toBe("VQ");
  });

  it("gives South a long flash, which is a safety feature and not decoration", () => {
    // Six flashes must never be miscountable as three (East) or nine (West). The 2 s long flash is
    // what makes the group's end unmistakable. A boat goes on the rocks if this is wrong.
    expect(longest(RHYTHMS.cardinalSouth)).toBe(2);
    expect(longest(RHYTHMS.cardinalEast)).toBe(0.25);
    expect(longest(RHYTHMS.cardinalWest)).toBe(0.25);
    expect(RHYTHMS.cardinalSouthQ.pulses.at(-1)?.on).toBe(2);
  });

  it("fills its period exactly, so the pattern never drifts", () => {
    for (const [name, rhythm] of Object.entries(RHYTHMS)) {
      const total = rhythm.pulses.reduce((s, p) => s + p.on + p.off, 0);
      expect(total, name).toBeCloseTo(rhythm.period, 6);
      // And no eclipse may be negative -- that is how a hand-written group silently overruns.
      for (const p of rhythm.pulses) expect(p.off, `${name} eclipse`).toBeGreaterThanOrEqual(0);
    }
  });

  it("flashes at the standard rate: Q is 60/min, VQ is 120/min", () => {
    expect(RHYTHMS.cardinalNorth.period).toBeCloseTo(0.5); // VQ: 0.25 on, 0.25 off
    expect(RHYTHMS.cardinalNorthQ.period).toBeCloseTo(1); // Q: 0.5 on, 0.5 off
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

  it("alternates colour within the emergency wreck period", () => {
    expect(rhythmAt(RHYTHMS.emergencyWreck, 0.5)).toBe("blue");
    expect(rhythmAt(RHYTHMS.emergencyWreck, 1.2)).toBeUndefined();
    expect(rhythmAt(RHYTHMS.emergencyWreck, 2)).toBe("yellow");
    expect(rhythmAt(RHYTHMS.emergencyWreck, 2.8)).toBeUndefined();
  });

  it("keeps a solar lantern's duty cycle low enough to survive the night", () => {
    // The whole reason a cardinal flashes rather than burns: a 10 % duty cycle is a 10x battery.
    expect(dutyCycle(RHYTHMS.cardinalWest)).toBeLessThan(0.3);
    expect(dutyCycle(RHYTHMS.portFlashing)).toBeLessThan(0.15);
    expect(dutyCycle(RHYTHMS.safeWater)).toBeCloseTo(0.2, 2);
  });

  it("reserves the (2+1) group for preferred-channel marks", () => {
    // A plain lateral may use any rhythm EXCEPT this one, precisely so it stays unambiguous.
    expect(RHYTHMS.preferredChannel.pulses).toHaveLength(3);
    expect(RHYTHMS.portFlashing.abbr).not.toContain("2+1");
    expect(RHYTHMS.starboardFlashing.abbr).not.toContain("2+1");
  });
});
