import { describe, expect, it } from "vitest";
import { designedAnswers, designedCourse } from "../courses";
import { proveCourse } from "../proof/solver";
import { COOP_COURSES } from "./index";

// Proving a course in its designed answers plays it to the finish in the
// real engine, a couple of seconds a course, so the sweep over every course
// is a slow test; the quick checks of every row's answer run with the unit
// tests (`courses.test.ts`).
describe("every registered co-op course", () => {
  it.each(COOP_COURSES.map((course) => [course.id, course] as const))(
    "%s is proved to its finish in its designed answers, meeting every row it was designed with",
    (_, design) => {
      const result = proveCourse(designedCourse(design), { answers: designedAnswers(design) });
      if (!result.ok) throw new Error(`stuck at row ${String(result.stuck.index)}: ${result.stuck.reason}`);
      expect(result.proof.finished).toBe(true);
      const met = new Set(result.proof.rows.map((row) => row.index));
      design.rows.forEach((row, i) => {
        expect(met.has(i), row.lesson).toBe(true);
      });
    },
    60_000,
  );
});
