import { describe, expect, it } from "vitest";
import { bedrockField, bedrockHeight, fbm2, type ArchipelagoProfile } from "./terrain";

const PROFILE: ArchipelagoProfile = {
  seed: 1337,
  center: [0, 0],
  extent: 600,
  grain: Math.PI / 8,
  deep: -30,
};

describe("fbm2", () => {
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
});
