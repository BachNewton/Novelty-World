import { describe, it, expect } from "vitest";
import { COURSE_SEED, WALL_COUNT, generateCourse, type CourseWall } from "./course";
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

function needsHop(wall: CourseWall): boolean {
  return passingPlacements(wall.opening, 0).length === 0 && passingPlacements(wall.opening, 1).length > 0;
}

describe("generateCourse", () => {
  const course = generateCourse(COURSE_SEED, TUNING);

  it("makes the same walls from the same seed", () => {
    expect(generateCourse(COURSE_SEED, TUNING)).toEqual(course);
    expect(generateCourse(COURSE_SEED + 1, TUNING)).not.toEqual(course);
  });

  it("keeps every opening inside the wall", () => {
    for (const { opening } of course) {
      for (const cell of opening) {
        expect(cell.col).toBeGreaterThanOrEqual(0);
        expect(cell.col).toBeLessThan(TUNING.corridorCols);
        expect(cell.row).toBeGreaterThanOrEqual(0);
        expect(cell.row).toBeLessThan(TUNING.wallRows);
      }
    }
  });

  it("holds up across many seeds", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const walls = generateCourse(seed, TUNING);
      // Four walls an L can pass, and only the last one raised.
      expect(walls).toHaveLength(WALL_COUNT);
      expect(walls.slice(0, -1).every((w) => passingPlacements(w.opening, 0).length > 0)).toBe(true);
      expect(walls.map(needsHop)).toEqual([false, false, false, true]);
      // Spread along the course, in order, between the start and the end zone.
      walls.forEach((wall, i) => {
        expect(wall.depth).toBeGreaterThan(i === 0 ? 0 : walls[i - 1].depth);
        expect(wall.depth).toBeLessThan(TUNING.courseLength);
      });
    }
  });
});
