import { describe, expect, it } from "vitest";
import { NO_PASSES, readPasses, withOutcome } from "./passes";
import type { Challenge } from "./types";

const place = { x: 0, z: 0, heading: 0 };
const common = { title: "", car: "skerry-gt" as const, where: "", waypoints: [], starts: [place, place] as const, lengthM: 0 };
const ROUTE: Challenge = { ...common, id: "route", kind: "route", gates: [], parS: 60, targetS: 60 };
const TRAP: Challenge = { ...common, id: "trap", kind: "speed-trap", camera: { x: 0, z: 0, heading: 0, halfWidthM: 1 }, parKmh: 150, targetKmh: 150 };
const passed = (average: number) => ({ passed: true, results: [average], average });

describe("the passes kept", () => {
  it("keep each challenge's best, the lower time and the higher speed, and nothing from a failed attempt", () => {
    let passes = withOutcome(NO_PASSES, ROUTE, "solo", { passed: false, results: [70], average: 70 });
    expect(passes).toEqual(NO_PASSES);
    passes = withOutcome(passes, ROUTE, "solo", passed(58));
    passes = withOutcome(passes, ROUTE, "solo", passed(59));
    passes = withOutcome(passes, TRAP, "solo", passed(151));
    passes = withOutcome(passes, TRAP, "solo", passed(155));
    expect(passes).toEqual({ solo: { route: { best: 58 }, trap: { best: 155 } }, coop: {} });
  });

  it("keep solo and co-op apart, so a team's average never stands as a solo best", () => {
    let passes = withOutcome(NO_PASSES, ROUTE, "solo", passed(58));
    passes = withOutcome(passes, ROUTE, "coop", passed(54));
    passes = withOutcome(passes, ROUTE, "coop", passed(56));
    expect(passes).toEqual({ solo: { route: { best: 58 } }, coop: { route: { best: 54 } } });
  });

  it("drop what isn't a pass of a challenge on the list", () => {
    const saved = { solo: { route: { best: 58 }, gone: { best: 1 }, trap: { best: "fast" } }, coop: "none" };
    expect(readPasses(saved, [ROUTE, TRAP])).toEqual({ solo: { route: { best: 58 } }, coop: {} });
    expect(readPasses(null, [ROUTE])).toEqual(NO_PASSES);
  });
});
