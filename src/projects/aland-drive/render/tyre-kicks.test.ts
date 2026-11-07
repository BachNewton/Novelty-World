import { describe, expect, it } from "vitest";
import { CONDITIONS, SURFACES, TYRES } from "../sim/surfaces";
import { kicksOf, type TyreRead } from "./tyre-kicks";

const kinds = (read: Omit<TyreRead, "tyres" | "spinMS"> & Partial<TyreRead>) => kicksOf({ tyres: "summer", spinMS: 0, ...read }).rates.map(([kick]) => kick);
const dryAsphalt = { surface: "asphalt", condition: "dry" } as const;

describe("what a tyre throws up", () => {
  it("throws nothing on a dry road while it grips: cruising, cornering at the limit, or braking at it", () => {
    expect(kinds({ ...dryAsphalt, rollMS: 60, slideMS: 0, demand: 0.3 })).toEqual([]);
    // 0.14 rad, the grippiest car's peak slip angle, at 30 m/s.
    expect(kinds({ ...dryAsphalt, rollMS: 30, slideMS: 30 * Math.tan(0.14), demand: 1 })).toEqual([]);
    expect(kinds({ ...dryAsphalt, rollMS: 30, slideMS: 0, demand: 1.1 })).toEqual([]);
  });

  it("smokes on a dry road only past the grip, sliding or locked", () => {
    expect(kinds({ ...dryAsphalt, rollMS: 20, slideMS: 12, demand: 0.9 })).toEqual(["smoke"]);
    expect(kinds({ ...dryAsphalt, rollMS: 30, slideMS: 0, demand: 2 })).toEqual(["smoke"]);
  });

  it("throws its ground from a wheel spinning on the spot, and smoke off a dry road", () => {
    expect(kinds({ ...dryAsphalt, rollMS: 0, slideMS: 0, demand: 1, spinMS: 20 })).toEqual(["smoke"]);
    expect(kinds({ surface: "grass", condition: "dry", rollMS: 0, slideMS: 0, demand: 1, spinMS: 20 })).toContain("clod");
    expect(kinds({ surface: "gravel", condition: "dry", rollMS: 0, slideMS: 0, demand: 1, spinMS: 20 })).toContain("stone");
  });

  it("throws a wheel's own ground just by rolling over loose or wet ground, and no smoke there", () => {
    expect(kinds({ surface: "gravel", condition: "dry", rollMS: 20, slideMS: 0, demand: 0.3 })).toContain("dust");
    expect(kinds({ surface: "asphalt", condition: "wet", rollMS: 20, slideMS: 0, demand: 0.3 })).toEqual(["spray"]);
    expect(kinds({ surface: "grass", condition: "snow", rollMS: 20, slideMS: 0, demand: 0.3 })).toContain("powder");
    for (const condition of CONDITIONS) for (const surface of SURFACES) if (condition !== "dry" || surface !== "asphalt") expect(kinds({ surface, condition, rollMS: 20, slideMS: 15, demand: 3 })).not.toContain("smoke");
  });

  it("throws nothing from a wheel that's still or off the ground, whatever it's on", () => {
    for (const tyres of TYRES) for (const condition of CONDITIONS) for (const surface of SURFACES) expect(kinds({ surface, condition, tyres, rollMS: 0, slideMS: 0, demand: 0 })).toEqual([]);
  });
});
