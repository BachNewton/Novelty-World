import { describe, expect, it } from "vitest";
import {
  CLOUD_GENERA,
  cloudBeamTransmittance,
  cloudFieldJs,
  cloudStateFromGenus,
  cloudStats,
  cloudThreshold,
  cloudViewOpacity,
} from "./clouds";

const clear = cloudStateFromGenus(CLOUD_GENERA.clear);
const cumulus = cloudStateFromGenus(CLOUD_GENERA.cumulus);
const stratus = cloudStateFromGenus(CLOUD_GENERA.stratus);

describe("the cloud field", () => {
  it("has no hole at the world origin", () => {
    // REGRESSION. `hash(0,0) = fract(sin(0) * 43758) = 0` exactly, and fbm doubles p each octave, so
    // (0,0) sat on the degenerate lattice corner in all five. That put a permanent thin spot in the
    // deck directly over the world origin — which is where the raft spawns. The GPU probe caught it:
    // under a stratus deck the beam at the origin read 8.9x what the model said it should.
    //
    // Under total overcast the deck must be opaque AT THE ORIGIN, not just on average.
    expect(cloudFieldJs(0, 0, stratus, 0, 0)).toBeCloseTo(1, 5);
    // ...and the same at the origin of the cloud-plane projection for any scroll offset.
    expect(cloudFieldJs(0, 0, stratus, 0.5, 0.25)).toBeCloseTo(1, 5);
  });

  it("makes `coverage` mean the fraction of sky covered", () => {
    // Not `1 - coverage` as a raw threshold: five octaves of averaged value noise are bell-shaped
    // (sigma ~0.12), so thresholding naively covered 5 % of the sky at coverage 0.3.
    for (const coverage of [0.15, 0.3, 0.45, 0.72]) {
      const state = { ...cumulus, coverage, tau: 1 };
      const { fraction } = cloudStats(state, 1);
      expect(fraction).toBeGreaterThan(coverage - 0.09);
      expect(fraction).toBeLessThan(coverage + 0.09);
    }
  });

  it("covers nothing at coverage 0 and everything at coverage 1", () => {
    expect(cloudStats(clear, 1).fraction).toBe(0);
    // Not exactly 1: the threshold sits at the noise's minimum, so a ~0.05 % tail of samples still
    // lands inside the smoothstep's ramp. A real stratus deck does have thin patches; the point is
    // that there is no HOLE, and the mean is overcast.
    expect(cloudStats(stratus, 1).fraction).toBeCloseTo(1, 2);
    expect(cloudThreshold(0)).toBeGreaterThan(1);
    expect(cloudThreshold(1)).toBeLessThan(0);
  });

  it("leaves a clear sky completely alone", () => {
    const { fraction, beamFactor } = cloudStats(clear, 0.5);
    expect(fraction).toBe(0);
    expect(beamFactor).toBe(1);
    expect(cloudFieldJs(123, -456, clear, 0.3, 0.7)).toBe(0);
  });
});

describe("cloud optics", () => {
  it("attenuates the beam more at a lower sun — a longer slant path through the slab", () => {
    const high = cloudBeamTransmittance(5, Math.sin(Math.PI / 2));
    const low = cloudBeamTransmittance(5, Math.sin(Math.PI / 18)); // 10 degrees
    expect(low).toBeLessThan(high);
  });

  it("bounds the slant path, so a horizon sun does not divide by zero", () => {
    expect(cloudBeamTransmittance(5, 0)).toBeGreaterThan(0);
    expect(Number.isFinite(cloudBeamTransmittance(5, 0))).toBe(true);
  });

  it("is the similarity transform that keeps cirrus transparent and stratus opaque", () => {
    // tau*(1-g): cirrus 0.35 -> 0.07 (transparent); stratus 22 -> 4.4 (opaque).
    expect(cloudBeamTransmittance(0.35, 1)).toBeGreaterThan(0.9);
    expect(cloudBeamTransmittance(22, 1)).toBeLessThan(0.02);
  });

  it("view opacity rises with thickness and with a grazing view", () => {
    expect(cloudViewOpacity(0, 1, 20)).toBe(0);
    expect(cloudViewOpacity(1, 1, 20)).toBeGreaterThan(0.98);
    expect(cloudViewOpacity(0.3, 0.1, 20)).toBeGreaterThan(cloudViewOpacity(0.3, 1, 20));
    expect(cloudViewOpacity(1, 1, 0)).toBe(0); // no cloud at tau 0, at any thickness
  });

  it("the shadow map's mean is what the CPU energy budget uses — they are the same expression", () => {
    // `beamFactor` is the spatial mean of exp(-tau*(1-g)*thickness/mu), which is exactly what the
    // shadow-map fragment writes. If these ever diverge, the picture and the light disagree.
    const { beamFactor } = cloudStats(cumulus, 0.5);
    expect(beamFactor).toBeGreaterThan(0);
    expect(beamFactor).toBeLessThan(1);
    // Sparse cumulus: most of the sky is open, so most of the beam survives.
    expect(beamFactor).toBeGreaterThan(1 - cumulus.coverage - 0.1);
  });
});
