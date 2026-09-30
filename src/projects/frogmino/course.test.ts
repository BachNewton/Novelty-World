import { describe, it, expect } from "vitest";
import { DIFFICULTIES, fits, placementKey, type Difficulty, type Face } from "./composer";
import { COURSE_DIFFICULTIES, COURSE_SEED, PULL_OFF_ROWS, generateCourse, type Course, type CourseRow } from "./course";
import { VEHICLE_IDS } from "./fleet";
import { firstFit } from "./logic";
import { BARRIER_DEPTH, pullOffLanes } from "./pull-off";
import { VEHICLE_LENGTHS } from "./fleet";
import { lanesOf, rowBack, rowOpening, rowSolids } from "./traffic";
import { TUNING } from "./tuning";
import type { TetrominoKind } from "./types";

const FACE: Face = { cols: TUNING.corridorCols, rows: TUNING.wallRows };
const SEEDS = Array.from({ length: 150 }, (_, i) => i + 1);

function passes(kind: TetrominoKind, row: CourseRow): boolean {
  return fits(kind, FACE, row.opening).length > 0;
}

// Every pose of every piece the row is for that passes it.
function rowFits(row: CourseRow) {
  return row.pieces.pass.flatMap((kind) => fits(kind, FACE, row.opening));
}

function raised(row: CourseRow): boolean {
  return rowFits(row).every((p) => p.hop === 1);
}

// The rows after each pull-off, up to the next.
function stretchRows(course: Course, k: number): CourseRow[] {
  const to = k + 1 < course.pullOffs.length ? course.pullOffs[k + 1].firstRow : course.rows.length;
  return course.rows.slice(course.pullOffs[k].firstRow, to);
}

describe("generateCourse", () => {
  const course = generateCourse(COURSE_SEED, TUNING);
  const courses = SEEDS.map((seed) => generateCourse(seed, TUNING));
  const rows = courses.flatMap((c) => c.rows);

  it("makes the same course from the same seed", () => {
    expect(generateCourse(COURSE_SEED, TUNING)).toEqual(course);
    expect(generateCourse(COURSE_SEED + 1, TUNING)).not.toEqual(course);
  });

  it("ramps from easy through medium to hard over fifteen rows", () => {
    expect(COURSE_DIFFICULTIES).toHaveLength(15);
    for (const c of courses) expect(c.rows.map((row) => row.difficulty)).toEqual(COURSE_DIFFICULTIES);
  });

  it("builds every row from the 19 vehicles, one per lane, with the opening they leave", () => {
    for (const row of rows) {
      const lanes = row.vehicles.flatMap(lanesOf);
      expect(new Set(lanes).size).toBe(lanes.length);
      for (const v of row.vehicles) expect(VEHICLE_IDS).toContain(v.id);
      expect(row.opening).toEqual(rowOpening(row.vehicles, FACE.cols, FACE.rows));
      expect(row.solids).toEqual(rowSolids(row.vehicles));
      expect(row.solids.map((solid) => solid.length)).toEqual(row.vehicles.map((v) => VEHICLE_LENGTHS[v.id]));
    }
  });

  it("makes every row passable by each piece it is for, their answers among the fits", () => {
    for (const row of rows) {
      expect(row.answers.map((a) => a.kind)).toEqual(row.pieces.pass);
      for (const answer of row.answers) expect(fits(answer.kind, FACE, row.opening)).toContainEqual(answer);
    }
  });

  it("keeps each piece's number of fits in its difficulty's range", () => {
    for (const row of rows) {
      const [fewest, most] = DIFFICULTIES[row.difficulty].fits;
      for (const kind of row.pieces.pass) {
        const count = fits(kind, FACE, row.opening).length;
        expect(count).toBeGreaterThanOrEqual(fewest);
        expect(count).toBeLessThanOrEqual(most);
      }
    }
  });

  it("lets through none of the pieces a row refuses", () => {
    for (const row of rows) for (const kind of row.pieces.refuse) expect(passes(kind, row)).toBe(false);
  });

  it("raises a row exactly when its answers hop", () => {
    for (const row of rows) for (const answer of row.answers) expect(raised(row)).toBe(answer.hop === 1);
  });

  it("raises rows more often as the difficulty climbs, at about the rate the analysis found", () => {
    const rate = (difficulty: Difficulty): number => {
      const of = rows.filter((row) => row.difficulty === difficulty);
      return of.filter(raised).length / of.length;
    };
    expect(rate("easy")).toBeLessThan(0.1);
    expect(rate("medium")).toBeGreaterThan(0.05);
    expect(rate("medium")).toBeLessThan(0.3);
    expect(rate("hard")).toBeGreaterThan(0.2);
    expect(rate("hard")).toBeLessThan(0.55);
  });

  it("makes every hard row need something the row before didn't allow", () => {
    for (const c of courses) {
      c.rows.forEach((row, i) => {
        if (row.difficulty !== "hard") return;
        const before = new Set(rowFits(c.rows[i - 1]).map(placementKey));
        for (const p of rowFits(row)) expect(before.has(placementKey(p))).toBe(false);
      });
    }
  });

  it("spaces the rows back to front: the gap from one row's longest vehicle's back to the next row's front", () => {
    for (const c of courses) {
      expect(c.rows[0].depth).toBeGreaterThanOrEqual(TUNING.firstWallDepth - TUNING.wallJitter);
      expect(c.rows[0].depth).toBeLessThanOrEqual(TUNING.firstWallDepth + TUNING.wallJitter);
      c.rows.slice(1).forEach((row, i) => {
        const gap = row.depth - rowBack(c.rows[i]);
        expect(gap).toBeGreaterThanOrEqual(TUNING.wallSpacing - TUNING.wallJitter);
        expect(gap).toBeLessThanOrEqual(TUNING.wallSpacing + TUNING.wallJitter);
      });
    }
  });

  it("brings every row to the frog before the finish line, however fast it goes", () => {
    // The fastest frog holds a jump the whole way.
    const fastest = TUNING.depthStep / TUNING.jumpRepeatInterval;
    for (const c of courses) {
      for (const row of c.rows) expect((row.depth * fastest) / (fastest + TUNING.wallSpeed)).toBeLessThan(TUNING.courseLength);
    }
  });
});

describe("a course's pull-offs", () => {
  const courses = SEEDS.map((seed) => generateCourse(seed, TUNING));

  it("come where the level design puts them, sized by the tuning, on either side as the seed chooses", () => {
    for (const c of courses) {
      expect(c.pullOffs.map((p) => p.firstRow)).toEqual(PULL_OFF_ROWS);
      for (const p of c.pullOffs) {
        expect(p.width).toBe(TUNING.pullOffWidth);
        expect(p.far - p.near).toBeCloseTo(TUNING.pullOffLength);
      }
    }
    const sides = courses.flatMap((c) => c.pullOffs.map((p) => p.side));
    expect(sides.filter((side) => side === "left").length / sides.length).toBeGreaterThan(0.35);
    expect(sides.filter((side) => side === "right").length / sides.length).toBeGreaterThan(0.35);
  });

  it("lie on the road, in order and apart, each where the frog would be between the rows either side", () => {
    for (const c of courses) {
      c.pullOffs.forEach((p, k) => {
        expect(p.near - BARRIER_DEPTH).toBeGreaterThan(0);
        expect(p.far + BARRIER_DEPTH).toBeLessThan(TUNING.courseLength);
        if (k > 0) expect(p.near - BARRIER_DEPTH).toBeGreaterThan(c.pullOffs[k - 1].far + BARRIER_DEPTH);
        // A frog at the course's pace meets a row starting at depth d at
        // d × pace / (pace + wall speed).
        const meet = (row: CourseRow): number => (row.depth * TUNING.pullOffPace) / (TUNING.pullOffPace + TUNING.wallSpeed);
        const centre = (p.near + p.far) / 2;
        expect(centre).toBeGreaterThan(meet(c.rows[p.firstRow - 1]));
        expect(centre).toBeLessThan(meet(c.rows[p.firstRow]));
      });
    }
  });

  it("fit every piece that may be swapped in them, in some pose", () => {
    for (const c of courses) {
      for (const p of c.pullOffs) {
        for (const kind of [...p.arriving, p.waiting]) {
          expect(firstFit(kind, pullOffLanes(p, TUNING.corridorCols))).not.toBeNull();
        }
      }
    }
  });

  it("lead to traffic that both the frog's piece and the waiting piece pass, unless forced", () => {
    for (const c of courses) {
      c.pullOffs.forEach((p, k) => {
        if (p.forced) return;
        for (const row of stretchRows(c, k)) {
          for (const kind of [...p.arriving, p.waiting]) expect(passes(kind, row)).toBe(true);
        }
      });
    }
  });

  it("force the swap on traffic that only the waiting piece passes, one pull-off in three", () => {
    for (const c of courses) {
      expect(c.pullOffs.map((p) => p.forced)).toEqual([false, true, false]);
      c.pullOffs.forEach((p, k) => {
        if (!p.forced) return;
        expect(p.arriving).not.toContain(p.waiting);
        for (const row of stretchRows(c, k)) {
          expect(passes(p.waiting, row)).toBe(true);
          for (const kind of p.arriving) expect(passes(kind, row)).toBe(false);
        }
      });
    }
  });

  it("never leave the frog without a piece that gets it through, tracking the pieces it could hold", () => {
    for (const c of courses) {
      // Before the first pull-off, the frog holds its start piece.
      let holding: TetrominoKind[] = [c.start];
      for (const row of c.rows.slice(0, c.pullOffs[0].firstRow)) for (const kind of holding) expect(passes(kind, row)).toBe(true);
      c.pullOffs.forEach((p, k) => {
        expect(p.arriving).toEqual(holding);
        // At a pull-off it may keep its piece or take the waiting one; the
        // pieces that get it through the traffic after are what it holds next.
        const choices = [...new Set([...holding, p.waiting])];
        const through = choices.filter((kind) => stretchRows(c, k).every((row) => passes(kind, row)));
        expect(through.length).toBeGreaterThan(0);
        expect(through).toEqual(p.forced ? [p.waiting] : choices);
        holding = through;
      });
    }
  });

  it("hand back the start piece after a forced stretch, so it passes every row outside one", () => {
    for (const c of courses) {
      c.pullOffs.forEach((p, k) => {
        if (k > 0 && c.pullOffs[k - 1].forced) expect(p.waiting).toBe(c.start);
      });
      const forcedRows = new Set(c.pullOffs.flatMap((p, k) => (p.forced ? stretchRows(c, k) : [])));
      for (const row of c.rows) if (!forcedRows.has(row)) expect(passes(c.start, row)).toBe(true);
    }
  });
});
