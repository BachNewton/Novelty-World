import { describe, expect, it } from "vitest";
import { LIGHTHOUSE_LAMP_M, LIGHTHOUSE_TOP_M } from "../art/identity/index";
import { LIGHTHOUSES } from "../art/lighthouses/index";
import { LANDMARK_LIGHTHOUSES, lampAt, lighthouseScale } from "./lighthouses";

/* A lighthouse is drawn at the real one's size, and its light shines from its own lamp. */

describe("a lighthouse drawn as the generic tower", () => {
  it("stands as tall as the register says: Enskär's 36.6 m", () => {
    expect(LIGHTHOUSE_TOP_M * lighthouseScale(36.6, 63554.3, -56306.1)).toBeCloseTo(36.6, 6);
    expect(lampAt(63554.3, -56306.1)?.upM).toBeCloseTo((36.6 / LIGHTHOUSE_TOP_M) * LIGHTHOUSE_LAMP_M, 6);
  });

  it("where the register gives no height, has its lamp at its light's: Salkobb's 11 m", () => {
    expect(lampAt(3314.9, 29069.2)?.upM).toBeCloseTo(11, 6);
  });

  it("keeps the model's own size with neither", () => {
    expect(lighthouseScale(0, 1e6, 1e6)).toBe(1);
  });
});

describe("a landmark lighthouse", () => {
  it("stands on every place it's given, and a lit one's light shines from its own model's lamp", () => {
    expect(LANDMARK_LIGHTHOUSES.map(({ id }) => id).sort()).toEqual(Object.keys(LIGHTHOUSES).sort());
    const market = LANDMARK_LIGHTHOUSES.find(({ id }) => id === "market");
    if (!market?.mark || LIGHTHOUSES.market.lampM === null) throw new Error("Märket takes over its mark, and is lit");
    expect(lampAt(market.x, market.z)).toMatchObject({ upM: LIGHTHOUSES.market.lampM, onWater: true });
  });
});
