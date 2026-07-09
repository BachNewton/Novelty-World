import { describe, expect, it } from "vitest";
import { bedrockField, bedrockHeight, fbm2, noise2, type ArchipelagoProfile } from "./terrain";

const PROFILE: ArchipelagoProfile = {
  seed: 1337,
  center: [0, 0],
  extent: 600,
  grain: Math.PI / 8,
  deep: -30,
};

/** Sample the central half of the window (inside the edge taper) on a coarse lattice. */
const sampleCore = (height: (x: number, z: number) => number, step = 5) => {
  const out: number[] = [];
  const half = PROFILE.extent / 4;
  for (let x = -half; x <= half; x += step) {
    for (let z = -half; z <= half; z += step) out.push(height(x, z));
  }
  return out;
};

describe("noise2", () => {
  it("is deterministic for the same (x, z, seed)", () => {
    expect(noise2(12.5, -3.25, 7)).toBe(noise2(12.5, -3.25, 7));
  });

  it("varies with the seed", () => {
    expect(noise2(12.5, -3.25, 7)).not.toBe(noise2(12.5, -3.25, 8));
  });

  it("is zero at lattice points (gradient noise has no value at the corners)", () => {
    expect(noise2(4, 9, 3)).toBeCloseTo(0, 10);
  });

  it("stays within roughly [-1, 1] across a wide sample", () => {
    for (let i = 0; i < 2000; i++) {
      expect(Math.abs(noise2(i * 0.37, i * -0.61, 42))).toBeLessThanOrEqual(1);
    }
  });
});

describe("fbm2", () => {
  it("is deterministic", () => {
    expect(fbm2(1.5, 2.5, 9, 4)).toBe(fbm2(1.5, 2.5, 9, 4));
  });

  it("stays normalised within [-1, 1] regardless of octave count", () => {
    for (const octaves of [1, 3, 6]) {
      for (let i = 0; i < 500; i++) {
        expect(Math.abs(fbm2(i * 0.13, i * 0.29, 5, octaves))).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("bedrockHeight", () => {
  const height = bedrockHeight(PROFILE);

  it("is deterministic", () => {
    expect(height(3, -8)).toBe(height(3, -8));
  });

  it("produces a different archipelago for a different seed", () => {
    const other = bedrockHeight({ ...PROFILE, seed: PROFILE.seed + 1 });
    expect(height(20, 20)).not.toBe(other(20, 20));
  });

  it("puts some land above sea level", () => {
    expect(Math.max(...sampleCore(height))).toBeGreaterThan(0);
  });

  it("is mostly sea — land is the exception, so it reads as an archipelago", () => {
    // Measured over a WIDE area, not one window: any single 600 m window may legitimately land on
    // open sea. What must hold is the field's global character — land is a minority everywhere.
    const wide = bedrockHeight({ ...PROFILE, extent: 8000 });
    const heights: number[] = [];
    for (let x = -1500; x <= 1500; x += 15) {
      for (let z = -1500; z <= 1500; z += 15) heights.push(wide(x, z));
    }
    const land = heights.filter((h) => h > 0).length / heights.length;
    expect(land).toBeGreaterThan(0.05);
    expect(land).toBeLessThan(0.35);
  });

  it("keeps land relief low, in the Archipelago Sea's range", () => {
    // Skerries 1-4 m, medium islands 5-20 m. Nothing should approach an alpine peak.
    expect(Math.max(...sampleCore(height, 2))).toBeLessThan(25);
  });

  it("anchors the bedrock to the world, not to the window", () => {
    // Two windows over the same seed must agree wherever they overlap, or streamed windows could
    // never share a coastline. Both points below sit inside each window's untapered core.
    const shifted = bedrockHeight({ ...PROFILE, center: [60, 0] });
    expect(shifted(30, 0)).toBeCloseTo(height(30, 0), 10);
    expect(shifted(-10, 40)).toBeCloseTo(height(-10, 40), 10);
  });

  it("tapers to deep water at the window's edge, so the field has no boundary cliff", () => {
    const edge = PROFILE.extent / 2;
    for (const [x, z] of [[edge, 0], [0, edge], [-edge, -edge], [edge, -edge]] as const) {
      expect(height(x, z)).toBeCloseTo(PROFILE.deep, 5);
    }
  });

  it("strips the metre-scale detail out of `broad`, so it is the smoother field", () => {
    const { height: h, broad } = bedrockField(PROFILE);
    const roughness = (f: (x: number, z: number) => number) => {
      let sum = 0;
      let n = 0;
      for (let x = -100; x <= 100; x += 4) {
        for (let z = -100; z <= 100; z += 4) {
          sum += Math.abs(f(x + 4, z) - f(x, z));
          n++;
        }
      }
      return sum / n;
    };
    expect(roughness(broad)).toBeLessThan(roughness(h));
  });

  it("keeps skerries unsheltered — their `broad` sits at or below sea level", () => {
    // A skerry is a place the METRE-SCALE detail pokes above water while the broad field does not.
    // This is what lets vegetation be gated on shelter instead of height: gate on height and every
    // 4 m rock in the sea grows spruce. Sweep the window for land and check the small stuff.
    const { height: h, broad } = bedrockField(PROFILE);
    const skerries: number[] = [];
    for (let x = -280; x <= 280; x += 3) {
      for (let z = -480; z <= 80; z += 3) {
        const surface = h(x, z);
        if (surface > 0 && surface < 3) skerries.push(broad(x, z));
      }
    }
    expect(skerries.length).toBeGreaterThan(50);
    // The great majority of low land is detail poking through an unsheltered broad field.
    const unsheltered = skerries.filter((b) => b < 1).length / skerries.length;
    expect(unsheltered).toBeGreaterThan(0.5);
  });

  it("lineates the terrain along the glacial grain", () => {
    // The headline silhouette cue: islands stretch ALONG the ice flow. So height should change
    // more slowly walking along the grain than across it. Measured as mean |Δh| at a fixed lag.
    const { grain } = PROFILE;
    const along: [number, number] = [Math.cos(grain), Math.sin(grain)];
    const across: [number, number] = [-Math.sin(grain), Math.cos(grain)];
    const LAG = 20;

    const meanDelta = ([dx, dz]: [number, number]) => {
      let sum = 0;
      let n = 0;
      for (let x = -120; x <= 120; x += 10) {
        for (let z = -120; z <= 120; z += 10) {
          sum += Math.abs(height(x + dx * LAG, z + dz * LAG) - height(x, z));
          n++;
        }
      }
      return sum / n;
    };

    expect(meanDelta(along)).toBeLessThan(meanDelta(across));
  });
});
