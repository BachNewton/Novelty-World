import { describe, expect, it } from "vitest";
import type { RoadsideModel } from "../roadside/models";
import { FLAGS } from "./flags";
import { buildBench, buildBikeRack, buildBin, buildCafeChair, buildCafeSet, buildCafeTable, buildParasol, buildPlanter, buildPlanterRound } from "./furniture";
import { buildBollard, buildHarbourCrane, buildSailboat } from "./harbour";
import { buildFlagpole } from "./flags";
import { buildLinden } from "./linden";
import { buildMidsummerPole } from "./midsummer";
import { rowAlong, runSections, treeRow } from "./place";
import { buildGuardRail, buildGuardRailEnd, buildGuardRailReturn, buildReflectorPost, buildSpeedCamera, GUARD_RAIL_M } from "./road";
import { buildGrassTuft, buildSeedGrass, buildWildflowers } from "./verge";

const triangles = (geometry: RoadsideModel["near"] | null) => (geometry?.index?.count ?? 0) / 3;

// The art direction's own limits: an object placed by the hundred mustn't creep past them as it's worked on.
describe("street triangle budgets", () => {
  const small: Record<string, RoadsideModel> = {
    rail: buildGuardRail(),
    railEnd: buildGuardRailEnd(),
    railReturn: buildGuardRailReturn(),
    reflector: buildReflectorPost(),
    camera: buildSpeedCamera(),
    grass: buildGrassTuft(),
    seedGrass: buildSeedGrass(),
    lupine: buildWildflowers("lupine"),
    daisy: buildWildflowers("daisy"),
    bench: buildBench(),
    bin: buildBin(),
    rack: buildBikeRack(),
    table: buildCafeTable(),
    chair: buildCafeChair(),
    set: buildCafeSet(),
    parasol: buildParasol(),
    planter: buildPlanter(),
    round: buildPlanterRound(),
    bollard: buildBollard(),
    finland: buildFlagpole("finland"),
    aland: buildFlagpole("aland"),
  };
  const large: Record<string, RoadsideModel> = { linden: buildLinden(), midsummer: buildMidsummerPole(), crane: buildHarbourCrane(), boat: buildSailboat() };

  it.each(Object.entries(small))("%s stays small", (_, model) => {
    expect(triangles(model.near)).toBeLessThan(150);
  });

  it.each(Object.entries(large))("%s stays within the large limit", (_, model) => {
    expect(triangles(model.near)).toBeLessThan(500);
    expect(triangles(model.far)).toBeLessThan(100);
  });
});

describe("flags", () => {
  const sum = (stops: readonly number[]) => stops[stops.length - 1];

  it("is Finland's by its act: 11 by 18, fields 5-3-10 and 4-3-4", () => {
    const { fly, hoist, field } = FLAGS.finland;
    expect([sum(hoist), sum(fly)]).toEqual([11, 18]);
    expect(fly).toEqual([0, 5, 8, 18]);
    expect(hoist).toEqual([0, 4, 7, 11]);
    expect(field(0, 0)).toBe("flag-white");
    expect(field(1, 0)).toBe("flag-fi-blue");
    expect(field(2, 1)).toBe("flag-fi-blue");
  });

  it("is Åland's: 17 by 26, a red cross inside a yellow one", () => {
    const { fly, hoist, field } = FLAGS.aland;
    expect([sum(hoist), sum(fly)]).toEqual([17, 26]);
    expect(field(0, 0)).toBe("flag-ax-blue");
    expect(field(4, 4)).toBe("flag-ax-blue");
    expect(field(1, 1)).toBe("flag-ax-yellow");
    expect(field(2, 0)).toBe("flag-ax-red");
    expect(field(1, 2)).toBe("flag-ax-red");
  });
});

describe("placing along a line", () => {
  const east = [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }];
  const facing = (yaw = 0) => [Math.sin(yaw), Math.cos(yaw)];

  it("turns what stands beside a line to face it, from either side", () => {
    const [right] = rowAlong(east, 10, 5);
    const [left] = rowAlong(east, 10, -5);
    expect(right.z).toBeCloseTo(5);
    expect(left.z).toBeCloseTo(-5);
    expect(facing(right.yaw)[1]).toBeCloseTo(-1);
    expect(facing(left.yaw)[1]).toBeCloseTo(1);
  });

  it("fits a run's sections end to end round a bend and up a slope", () => {
    const line = [{ x: 0, y: 0, z: 0 }, { x: 30, y: 3, z: 0 }, { x: 50, y: 3, z: 20 }];
    const sections = runSections(line, GUARD_RAIL_M);
    expect(sections.length).toBeGreaterThan(10);
    sections.slice(0, -1).forEach((section, index) => {
      const next = sections[index + 1];
      const length = GUARD_RAIL_M * (section.stretch ?? 1);
      const yaw = section.yaw ?? 0;
      expect(section.x + Math.cos(yaw) * length).toBeCloseTo(next.x);
      expect(section.z - Math.sin(yaw) * length).toBeCloseTo(next.z);
      expect(section.y + (section.shear ?? 0) * length).toBeCloseTo(next.y);
    });
  });

  it("gives a tree row the same trees every time", () => {
    const row = { heightM: 14, heightSpreadM: 1.5, seed: 4 };
    expect(treeRow(east, 9, 6, row)).toEqual(treeRow(east, 9, 6, row));
  });
});
