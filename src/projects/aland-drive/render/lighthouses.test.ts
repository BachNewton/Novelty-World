import { describe, expect, it } from "vitest";
import { LIGHTHOUSE_LAMP_M, LIGHTHOUSE_TOP_M } from "../art/identity/index";
import { lampAt, lighthouseScale } from "./lighthouses";

/* A generic lighthouse is drawn at the real one's size, and its light shines from its own lamp. */

describe("a lighthouse drawn as the generic tower", () => {
  it("stands as tall as the register says: Sälskär's 32 m", () => {
    expect(LIGHTHOUSE_TOP_M * lighthouseScale(32, -17432.4, -30208.5)).toBeCloseTo(32, 6);
    expect(lampAt(-17432.4, -30208.5)?.upM).toBeCloseTo((32 / LIGHTHOUSE_TOP_M) * LIGHTHOUSE_LAMP_M, 6);
  });

  it("where the register gives no height, has its lamp at its light's: Salkobb's 11 m", () => {
    expect(lampAt(3314.9, 29069.2)?.upM).toBeCloseTo(11, 6);
  });

  it("keeps the model's own size with neither", () => {
    expect(lighthouseScale(0, 1e6, 1e6)).toBe(1);
  });
});
