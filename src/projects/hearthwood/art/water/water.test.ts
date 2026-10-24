import { describe, expect, it } from "vitest";
import { REGIONS } from "../../engine/regions";
import type { LandTile } from "../../engine/tiles";
import { absorptionOf, deepColourOf, REGION_ABSORPTION } from "./absorption";
import { rippleWaves } from "./ripples";
import { waterGeometry } from "./water";

describe("the water's colour from depth", () => {
  it("absorbs red fastest and blue slowest in clear water, so the deeps turn blue-green", () => {
    for (const region of ["greenwood", "highlands"] as const) {
      const [r, g, b] = deepColourOf(REGION_ABSORPTION[region]);
      expect(r).toBeLessThan(g);
      expect(r).toBeLessThan(b);
    }
  });

  it("is tea-brown in the lakeland and peaty on the heath: red and green outlast blue", () => {
    for (const region of ["birchvale", "heath"] as const) {
      const [r, g, b] = deepColourOf(REGION_ABSORPTION[region]);
      expect(b).toBeLessThan(g);
      expect(b).toBeLessThan(r * 1.2);
    }
  });

  it("blends across a border by each region's weight", () => {
    const weights = REGIONS.map((region) => (region === "greenwood" || region === "heath" ? 1 : 0));
    const blend = absorptionOf(weights);
    blend.forEach((value, i) => expect(value).toBeCloseTo((REGION_ABSORPTION.greenwood[i] + REGION_ABSORPTION.heath[i]) / 2));
  });

  it("refuses water in no region at all", () => {
    expect(() => absorptionOf(REGIONS.map(() => 0))).toThrow();
  });
});

describe("the ripples", () => {
  const waves = rippleWaves();

  it("are each smaller and quicker than the last", () => {
    for (let i = 1; i < waves.length; i++) {
      expect(waves[i].length).toBeLessThan(waves[i - 1].length);
      expect(waves[i].amplitude).toBeLessThan(waves[i - 1].amplitude);
      expect(waves[i].omega).toBeGreaterThan(waves[i - 1].omega);
    }
  });

  it("each turn by the golden angle, so no two run the same way", () => {
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 1; i < waves.length; i++) {
      const [ax, az] = waves[i - 1].dir;
      const [bx, bz] = waves[i].dir;
      expect(Math.atan2(ax * bz - az * bx, ax * bx + az * bz)).toBeCloseTo(golden - Math.PI * 2 * Math.round(golden / (Math.PI * 2)));
    }
    for (let i = 0; i < waves.length; i++) {
      for (let j = i + 1; j < waves.length; j++) {
        const [ax, az] = waves[i].dir;
        const [bx, bz] = waves[j].dir;
        expect(Math.abs(ax * bx + az * bz)).toBeLessThan(0.99);
      }
    }
  });
});

describe("a tile's water", () => {
  /** A strip of land three vertices a side: a lake in the first column, dry land beyond with a higher terrace's water table under it. */
  function tile(): LandTile {
    const side = 3;
    const count = side * side;
    const heights = new Float32Array(count);
    const water = new Float32Array(count);
    for (let v = 0; v < count; v++) {
      const column = v % side;
      heights[v] = column === 0 ? 8 : 12;
      water[v] = column === 0 ? 10 : 11;
    }
    return {
      key: { level: 0, i: 0, j: 0 },
      x0: 0,
      z0: 0,
      spacing: 2,
      side,
      heights,
      parentHeights: heights,
      normals: new Float32Array(count * 3),
      regions: new Float32Array(count * REGIONS.length).fill(1),
      woodland: new Float32Array(count),
      water,
      river: new Float32Array(count),
      wobble: new Float32Array(count),
      wet: true,
      flow: new Float32Array(count * 2),
      fall: new Float32Array(count),
      minHeight: 8,
      maxHeight: 12,
    };
  }

  it("stays level with the lake under a bank, rather than climbing to another terrace's water", () => {
    const geometry = waterGeometry(tile());
    const position = geometry?.getAttribute("position");
    if (!position) throw new Error("The lake made no water");
    // The column beside the lake is held at the lake's level; the column beyond, with no water beside it, keeps its own.
    expect(position.getY(1)).toBe(10);
    expect(position.getY(2)).toBe(11);
  });
});
