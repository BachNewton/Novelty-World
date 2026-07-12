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

/** Sample 3 km of the world. Anything about the field's CHARACTER has to be measured out here: one
 *  600 m window is smaller than the scale the archipelago is organised into, so it proves nothing. */
const sampleWide = (height: (x: number, z: number) => number, step = 15) => {
  const out: number[] = [];
  for (let x = -1500; x <= 1500; x += step) {
    for (let z = -1500; z <= 1500; z += step) out.push(height(x, z));
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
    // Measured WIDE, not over one window: since the super-regional scale landed, a single 600 m
    // window may legitimately be an open basin with no land in it at all — that is the zoning
    // working, not a broken field. The property is that the FIELD makes land.
    expect(Math.max(...sampleWide(bedrockHeight({ ...PROFILE, extent: 8000 })))).toBeGreaterThan(0);
  });

  it("is mostly sea — land is the exception, so it reads as an archipelago", () => {
    const heights = sampleWide(bedrockHeight({ ...PROFILE, extent: 8000 }));
    const land = heights.filter((h) => h > 0).length / heights.length;
    expect(land).toBeGreaterThan(0.05);
    expect(land).toBeLessThan(0.35);
  });

  it("zones the world: dense archipelago in some regions, open basin in others", () => {
    // The reason SUPER_RELIEF exists. Without a scale ABOVE the island scale the field is spectrally
    // flat, and a flat spectrum splatters same-sized islands at uniform density forever — measured,
    // that gave 1,568 islands over 9 km² with NOT ONE above 10 ha and every 500 m tile holding
    // 11-13 % land. There is no inner/outer archipelago for docs/ISLANDS.md's exposure gradient to
    // hang on, and nothing to sail toward. So: land fraction per 500 m tile must VARY a lot.
    const wide = bedrockHeight({ ...PROFILE, extent: 8000 });
    const TILE = 500;
    const fractions: number[] = [];
    for (let tz = -1500; tz < 1500; tz += TILE) {
      for (let tx = -1500; tx < 1500; tx += TILE) {
        let land = 0;
        let n = 0;
        for (let x = tx; x < tx + TILE; x += 5) {
          for (let z = tz; z < tz + TILE; z += 5) {
            n++;
            if (wide(x, z) > 0) land++;
          }
        }
        fractions.push(land / n);
      }
    }
    const mean = fractions.reduce((a, b) => a + b, 0) / fractions.length;
    const sd = Math.sqrt(fractions.reduce((a, b) => a + (b - mean) ** 2, 0) / fractions.length);

    // Spread must dwarf a flat splatter's (relative sd measured at 0.49 with the term off, 1.6 with
    // it on), and the extremes must actually be reached: real open water, real dense archipelago.
    expect(sd / mean).toBeGreaterThan(0.8);
    expect(Math.min(...fractions)).toBeLessThan(0.02);
    expect(Math.max(...fractions)).toBeGreaterThan(0.25);
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

  it("keeps SKERRIES unsheltered and ISLAND INTERIORS sheltered — the gate vegetation hangs on", () => {
    // This is what lets vegetation be gated on shelter instead of height: gate on height and every
    // 4 m rock in the sea grows spruce. The invariant is about island SIZE, so it is measured by
    // island (connected components of land), not by sampling "low land" — low land also includes the
    // long, low, SHELTERED shoreline of a big island, which would muddy the signal.
    const { height: h, broad } = bedrockField({ ...PROFILE, extent: 8000 });
    const STEP = 3;
    const SPAN = 1500;
    const N = SPAN / STEP;
    const world = (i: number) => -SPAN / 2 + i * STEP;

    const land = new Float32Array(N * N);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) land[j * N + i] = h(world(i), world(j));
    }

    // Flood-fill the land into islands.
    const label = new Int32Array(N * N).fill(-1);
    const islands: number[][] = [];
    const stack: number[] = [];
    for (let s = 0; s < N * N; s++) {
      if (land[s] <= 0 || label[s] !== -1) continue;
      const id = islands.length;
      const cells: number[] = [];
      stack.push(s);
      label[s] = id;
      while (stack.length) {
        const p = stack.pop()!;
        cells.push(p);
        const pi = p % N;
        const pj = (p / N) | 0;
        const push = (q: number) => {
          if (land[q] > 0 && label[q] === -1) {
            label[q] = id;
            stack.push(q);
          }
        };
        if (pi > 0) push(p - 1);
        if (pi < N - 1) push(p + 1);
        if (pj > 0) push(p - N);
        if (pj < N - 1) push(p + N);
      }
      islands.push(cells);
    }

    const area = (cells: number[]) => cells.length * STEP * STEP;
    const shelterOf = (p: number) => broad(world(p % N), world((p / N) | 0));

    const skerries = islands.filter((cells) => area(cells) < 200).flatMap((cells) => cells.map(shelterOf));
    expect(skerries.length).toBeGreaterThan(200);
    // A skerry is DETAIL poking through a broad field that never left the water.
    expect(skerries.filter((b) => b < 1).length / skerries.length).toBeGreaterThan(0.9);

    // ...while the interior of a real island (its top quartile of shelter) is well clear of it, or
    // there is nowhere for soil, undergrowth and spruce to gate ON.
    const interiors = islands
      .filter((cells) => area(cells) > 10_000)
      .flatMap((cells) => {
        const sorted = cells.map(shelterOf).sort((a, b) => b - a);
        return sorted.slice(0, Math.max(1, sorted.length >> 2));
      });
    expect(interiors.length).toBeGreaterThan(0);
    const median = interiors.sort((a, b) => a - b)[interiors.length >> 1];
    expect(median).toBeGreaterThan(4);
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
