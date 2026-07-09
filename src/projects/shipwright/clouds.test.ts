import { describe, expect, it } from "vitest";
import {
  CLOUD_GENERA,
  cloudBeamTransmittance,
  cloudFieldJs,
  cloudStateFromGenus,
  cloudScatterShare,
  cloudStats,
  cloudThreshold,
  cloudViewOpacity,
  type CloudGenusName,
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

  it("leaves a clear sky completely alone", () => {
    const { fraction, beamFactor, shadeMean } = cloudStats(clear, 0.5, SUN_PLANE);
    expect(fraction).toBe(0);
    expect(beamFactor).toBe(1);
    expect(shadeMean).toBe(1);
    expect(cloudFieldJs(123, -456, clear, 0.3, 0.7)).toBe(0);
  });

  it("tapers thickness to zero at a cloud's edge, so tau*h does too", () => {
    // `taper` is what makes an edge soft. A stratus slab barely tapers; cumulus tapers hard.
    const meanOf = (state: ReturnType<typeof cloudStateFromGenus>) =>
      cloudStats(state, 1, SUN_PLANE).meanThickness;
    expect(meanOf(stratus)).toBeGreaterThan(0.8); // near-uniform slab
    expect(meanOf(cumulus)).toBeLessThan(0.75); // a lens, thin at the rim
    expect(meanOf(cumulus)).toBeGreaterThan(0.1);
  });

  it("self-shadowing redistributes a cloud's radiance without creating or destroying any", () => {
    // `shadeMean` is the spatial mean of exactly the modulation the dome shader applies, so dividing
    // by it leaves the deck's total radiance untouched while lighting one side and darkening the other.
    const { shadeMean } = cloudStats(cumulus, 1, SUN_PLANE);
    expect(shadeMean).toBeGreaterThan(0.5);
    expect(shadeMean).toBeLessThanOrEqual(1);
  });

  it("thick clouds are dominated by MULTIPLE scattering, so their bases are flat and dark", () => {
    // A photon in an optically thick cloud scatters dozens of times and arrives from everywhere.
    // Held fixed at 0.45 this share gave a tau-250 thunderhead the same phase-driven brightening as a
    // wisp of cirrus, and it rendered as a pale lilac blob: a blind reviewer scored cumulonimbus 1/10.
    expect(cloudScatterShare(0.3)).toBeGreaterThan(0.9); // cirrus: almost pure single scatter
    expect(cloudScatterShare(11)).toBeCloseTo(0.31, 1); // cumulus: lit flanks, dark flanks
    expect(cloudScatterShare(20)).toBeCloseTo(0.2, 1); // stratus: nearly flat
    expect(cloudScatterShare(150)).toBeLessThan(0.05); // cumulonimbus: a dark, flat base
    expect(cloudScatterShare(0)).toBe(1);
  });

  it("gives each genus the single-scatter share its optical depth demands", () => {
    const share = (s: ReturnType<typeof cloudStateFromGenus>) =>
      cloudStats(s, 1, SUN_PLANE).scatterShare;
    const cb = cloudStateFromGenus(CLOUD_GENERA.cumulonimbus);
    expect(share(cirrus)).toBeGreaterThan(0.8);
    expect(share(cumulus)).toBeLessThan(share(cirrus));
    expect(share(stratus)).toBeLessThan(share(cumulus));
    expect(share(cb)).toBeLessThan(0.06);
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

  it("is the similarity transform that keeps cirrus transparent and stratus opaque to the BEAM", () => {
    // tau*(1-g): cirrus 0.5 -> 0.1 (transparent); stratus 22 -> 4.4 (opaque).
    expect(cloudBeamTransmittance(0.5, 1)).toBeGreaterThan(0.9);
    expect(cloudBeamTransmittance(22, 1)).toBeLessThan(0.02);
  });

  it("but NOT to the eye: a cloud's visual opacity uses the full tau", () => {
    // The similarity transform belongs to the beam alone. With `(1 - g)` applied here, cirrus was a
    // 7 % veil and a blind reviewer described the cirrus frames as "a cloudless-looking sky".
    expect(cloudViewOpacity(1, 1, 0.5)).toBeGreaterThan(0.35);
    expect(cloudViewOpacity(0, 1, 20)).toBe(0);
    expect(cloudViewOpacity(1, 1, 20)).toBeGreaterThan(0.98);
    expect(cloudViewOpacity(0.3, 0.1, 20)).toBeGreaterThan(cloudViewOpacity(0.3, 1, 20));
    expect(cloudViewOpacity(1, 1, 0)).toBe(0); // no cloud at tau 0, at any thickness
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

describe("genus character", () => {
  const genus = (name: CloudGenusName) => cloudStateFromGenus(CLOUD_GENERA[name]);

  it("gives each genus the optical depth its meteorology demands", () => {
    expect(genus("cirrus").tau).toBeLessThan(1); // 0.1-0.5, a veil
    expect(genus("stratus").tau).toBeGreaterThan(10); // 10-40, opaque
    expect(genus("stratus").tau).toBeLessThan(40);
    expect(genus("cumulonimbus").tau).toBeGreaterThan(100); // enormous
  });

  it("only the convective genera billow, and only cirrus is wind-sheared", () => {
    expect(genus("cumulus").billow).toBeGreaterThan(0.5);
    expect(genus("cumulonimbus").billow).toBeGreaterThan(0.5);
    expect(genus("stratus").billow).toBe(0);
    expect(genus("cirrus").shear).toBeLessThan(0.3);
    expect(genus("cumulus").shear).toBe(1);
  });

  it("stratus is a slab, cirrus is a sheet, cumulus is a lens", () => {
    expect(genus("stratus").taper).toBeLessThan(0.3); // uniform slab
    expect(genus("cumulus").taper).toBeGreaterThan(0.8); // tapers hard to nothing
    expect(genus("cirrus").taper).toBeGreaterThan(genus("stratus").taper);
    expect(genus("stratus").edge).toBeGreaterThan(genus("cumulus").edge);
  });
});
