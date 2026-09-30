import { describe, it, expect } from "vitest";
import { DIFFICULTIES, fits, type Difficulty, type Face } from "./composer";
import { COURSE_DIFFICULTIES, COURSE_SEED, generateCourse, type CourseRow } from "./course";
import { VEHICLE_IDS } from "./fleet";
import { lanesOf, rowOpening } from "./traffic";
import { TUNING } from "./tuning";

const FACE: Face = { cols: TUNING.corridorCols, rows: TUNING.wallRows };
const SEEDS = Array.from({ length: 150 }, (_, i) => i + 1);

function raised(row: CourseRow): boolean {
  return fits("L", FACE, row.opening).every((p) => p.hop === 1);
}

describe("generateCourse", () => {
  const course = generateCourse(COURSE_SEED, TUNING);
  const courses = SEEDS.map((seed) => generateCourse(seed, TUNING));
  const rows = courses.flat();

  it("makes the same rows from the same seed", () => {
    expect(generateCourse(COURSE_SEED, TUNING)).toEqual(course);
    expect(generateCourse(COURSE_SEED + 1, TUNING)).not.toEqual(course);
  });

  it("ramps from easy through medium to hard over fifteen rows", () => {
    expect(COURSE_DIFFICULTIES).toHaveLength(15);
    for (const c of courses) expect(c.map((row) => row.difficulty)).toEqual(COURSE_DIFFICULTIES);
  });

  it("builds every row from the 19 vehicles, one per lane, with the opening they leave", () => {
    for (const row of rows) {
      const lanes = row.vehicles.flatMap(lanesOf);
      expect(new Set(lanes).size).toBe(lanes.length);
      for (const v of row.vehicles) expect(VEHICLE_IDS).toContain(v.id);
      expect(row.opening).toEqual(rowOpening(row.vehicles, FACE.cols, FACE.rows));
    }
  });

  it("makes every row passable by the L, its answer among the fits", () => {
    for (const row of rows) {
      const passing = fits("L", FACE, row.opening);
      expect(passing).toContainEqual(row.answer);
    }
  });

  it("keeps each difficulty's number of fits in its range", () => {
    for (const row of rows) {
      const [fewest, most] = DIFFICULTIES[row.difficulty].fits;
      const count = fits("L", FACE, row.opening).length;
      expect(count).toBeGreaterThanOrEqual(fewest);
      expect(count).toBeLessThanOrEqual(most);
    }
  });

  it("raises a row exactly when its answer hops", () => {
    for (const row of rows) expect(raised(row)).toBe(row.answer.hop === 1);
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
      c.forEach((row, i) => {
        if (row.difficulty !== "hard") return;
        const before = new Set(fits("L", FACE, c[i - 1].opening).map((p) => `${String(p.rotation)},${String(p.col)}`));
        for (const p of fits("L", FACE, row.opening)) expect(before.has(`${String(p.rotation)},${String(p.col)}`)).toBe(false);
      });
    }
  });

  it("spreads the rows along the course, in order, between the start and the end zone", () => {
    for (const c of courses) {
      c.forEach((row, i) => {
        expect(row.depth).toBeGreaterThan(i === 0 ? 0 : c[i - 1].depth);
        expect(row.depth).toBeLessThan(TUNING.courseLength);
      });
    }
  });
});
