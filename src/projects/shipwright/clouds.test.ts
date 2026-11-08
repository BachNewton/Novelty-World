import { describe, expect, it } from "vitest";
import {
  CLOUD_GENERA,
  cloudBeamTransmittance,
  cloudFieldJs,
  cloudStateFromGenus,
  cloudStats,
  cloudThreshold,
} from "./clouds";

const clear = cloudStateFromGenus(CLOUD_GENERA.clear);
const cirrus = cloudStateFromGenus(CLOUD_GENERA.cirrus);
const cumulus = cloudStateFromGenus(CLOUD_GENERA.cumulus);
const stratus = cloudStateFromGenus(CLOUD_GENERA.stratus);

/** The sun overhead, so the self-shadow march has a well-defined direction. */
const SUN_PLANE: [number, number] = [1, 0];

describe("the cloud field", () => {
  it("has no hole at the world origin", () => {
    // REGRESSION. `hash(0,0) = fract(sin(0) * 43758) = 0` exactly, and fbm doubles p each octave, so
    // (0,0) sat on the degenerate lattice corner in all five. That put a permanent thin spot in the
    // deck directly over the world origin — which is where the raft spawns. The GPU probe caught it:
    // under a stratus deck the beam at the origin read 8.9x what the model said it should.
    expect(cloudFieldJs(0, 0, stratus, 0, 0)).toBeGreaterThan(0.8);
    expect(cloudFieldJs(0, 0, stratus, 0.5, 0.25)).toBeGreaterThan(0.8);
  });

  it("makes `coverage` mean the fraction of sky covered, for every noise character", () => {
    // Not `1 - coverage` as a raw threshold: five octaves of averaged value noise are bell-shaped
    // (sigma ~0.12), so thresholding naively covered 5 % of the sky at coverage 0.3. And `billow`
    // reshapes the distribution AGAIN, so the quantile table is keyed on it.
    for (const base of [cumulus, cirrus]) {
      for (const coverage of [0.15, 0.3, 0.45, 0.72]) {
        // `fraction` is the mean of the MASK. `planeThickness` is the mean of the THICKNESS, which is
        // lower wherever `taper` bleeds a cloud's rim to nothing. Conflating them made a coverage-0.3
        // deck report a covered fraction of 0.38.
        const { fraction, planeThickness } = cloudStats({ ...base, coverage, tau: 1 }, 1, SUN_PLANE);
        expect(fraction).toBeGreaterThan(coverage - 0.08);
        expect(fraction).toBeLessThan(coverage + 0.08);
        expect(planeThickness).toBeLessThanOrEqual(fraction + 1e-6);
      }
    }
  });

  it("covers nothing at coverage 0 and everything at coverage 1", () => {
    expect(cloudStats(clear, 1, SUN_PLANE).fraction).toBe(0);
    expect(cloudStats(stratus, 1, SUN_PLANE).fraction).toBeCloseTo(1, 2);
    expect(cloudThreshold({ coverage: 0, billow: 0, shear: 1 })).toBeGreaterThan(1);
    expect(cloudThreshold({ coverage: 1, billow: 0, shear: 1 })).toBeLessThan(0);
  });

  it("self-shadowing redistributes a cloud's radiance without creating or destroying any", () => {
    // `shadeMean` is the spatial mean of exactly the modulation the dome shader applies, so dividing
    // by it leaves the deck's total radiance untouched while lighting one side and darkening the other.
    const { shadeMean } = cloudStats(cumulus, 1, SUN_PLANE);
    expect(shadeMean).toBeGreaterThan(0.5);
    expect(shadeMean).toBeLessThanOrEqual(1);
  });
});

describe("cloud optics", () => {

  it("bounds the slant path, so a horizon sun does not divide by zero", () => {
    expect(cloudBeamTransmittance(5, 0)).toBeGreaterThan(0);
    expect(Number.isFinite(cloudBeamTransmittance(5, 0))).toBe(true);
  });

  it("the shadow map's mean is what the CPU energy budget uses — they are the same expression", () => {
    // `beamFactor` is the spatial mean of exp(-tau*(1-g)*thickness/mu), which is exactly what the
    // shadow-map fragment writes. If these ever diverge, the picture and the light disagree.
    const { beamFactor } = cloudStats(cumulus, 0.5, SUN_PLANE);
    expect(beamFactor).toBeGreaterThan(0);
    expect(beamFactor).toBeLessThan(1);
    // Sparse cumulus: most of the sky is open, so most of the beam survives.
    expect(beamFactor).toBeGreaterThan(1 - cumulus.coverage - 0.1);
  });
});

