import { describe, it, expect } from "vitest";
import { COURSE_SEED, WALL_COUNT, generateCourse } from "./course";
import { frogPasses, pieceSize } from "./logic";
import { TUNING } from "./tuning";
import type { Frog, HopHeight, Opening, Rotation } from "./types";

const ROTATIONS: Rotation[] = [0, 1, 2, 3];

// Every L placement in the corridor at the given hop height that passes.
function passingPlacements(opening: Opening, hop: HopHeight): Frog[] {
  return ROTATIONS.flatMap((rotation) => {
    const { width } = pieceSize("L", rotation);
    return Array.from({ length: TUNING.corridorCols - width + 1 }, (_, col): Frog => ({ kind: "L", col, rotation, hop }));
  }).filter((frog) => frogPasses(frog, opening));
}

describe("generateCourse", () => {
  const course = generateCourse(COURSE_SEED, TUNING);

  it("makes the same walls from the same seed", () => {
    expect(generateCourse(COURSE_SEED, TUNING)).toEqual(course);
    expect(generateCourse(COURSE_SEED + 1, TUNING)).not.toEqual(course);
  });

  it(`makes ${String(WALL_COUNT)} walls that an L can pass`, () => {
    expect(course).toHaveLength(WALL_COUNT);
    for (const opening of course) {
      expect(passingPlacements(opening, 0).length + passingPlacements(opening, 1).length).toBeGreaterThan(0);
    }
  });

  it("keeps every opening inside the wall", () => {
    for (const opening of course) {
      for (const cell of opening) {
        expect(cell.col).toBeGreaterThanOrEqual(0);
        expect(cell.col).toBeLessThan(TUNING.corridorCols);
        expect(cell.row).toBeGreaterThanOrEqual(0);
        expect(cell.row).toBeLessThan(TUNING.wallRows);
      }
    }
  });

  it("raises at least one opening so that only a hop passes it", () => {
    const raised = course.filter(
      (opening) => passingPlacements(opening, 0).length === 0 && passingPlacements(opening, 1).length > 0,
    );
    expect(raised.length).toBeGreaterThan(0);
  });

  it("holds up across many seeds", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const walls = generateCourse(seed, TUNING);
      expect(walls.every((o) => passingPlacements(o, 0).length + passingPlacements(o, 1).length > 0)).toBe(true);
      expect(walls.some((o) => passingPlacements(o, 0).length === 0)).toBe(true);
    }
  });
});
