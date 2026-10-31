import { describe, expect, it } from "vitest";
import { rhythm, rhythmRow } from "./characteristic";
import data from "./lights.json";

const lit = (found: ReturnType<typeof rhythm>) => found.flashes.reduce((sum, { fromS, toS }) => sum + toS - fromS, 0);

describe("a sea light's rhythm", () => {
  it("takes a real sequence, whichever way OSM wrote it", () => {
    expect(rhythm({ character: "Fl", periodS: 5, group: "2", sequence: "0.5+(1),0.5+(3)" }).flashes).toEqual([
      { fromS: 0, toS: 0.5 },
      { fromS: 1.5, toS: 2 },
    ]);
    expect(rhythm({ character: "VQ", periodS: 6, group: "5", sequence: "(00.3+(00.3)+00.3+(00.3)+00.3+(00.3)+00.3+(00.3)+00.3+(03.3))" }).flashes).toHaveLength(5);
  });

  it("gives an isophase equal light and dark", () => {
    expect(lit(rhythm({ character: "Iso", periodS: 2 }))).toBe(1);
  });

  it("gives a cardinal IALA's period when the tag holds a single flash's", () => {
    const south = rhythm({ character: "VQ+LFl", periodS: 0.5, group: "6" });
    expect(south.periodS).toBe(10);
    expect(south.flashes).toHaveLength(7);
    expect(south.flashes[6].toS - south.flashes[6].fromS).toBe(2);
    expect(rhythm({ character: "Q", periodS: 1, group: "9" }).periodS).toBe(15);
  });

  it("fits every light on the map inside its period, with some dark in it", () => {
    for (const { sectors } of data.lights) {
      for (const sector of sectors) {
        const found = rhythm(sector);
        expect(found.flashes.at(-1)?.toS).toBeLessThanOrEqual(found.periodS + 1e-6);
        expect(lit(found)).toBeLessThan(found.periodS);
        expect(rhythmRow(found, 512).some((value) => value === 255)).toBe(true);
      }
    }
  });
});
