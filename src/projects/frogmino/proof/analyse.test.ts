import { describe, expect, it } from "vitest";
import { TEACHING_RAMP } from "../coop-courses/teaching-ramp";
import { tickTiming } from "../ticks";
import { rowSolids } from "../traffic";
import { TUNING } from "../tuning";
import { analyseCoopCourse, coordinationKinds, reachablePoses, rowCoupling, soloReachable, startPose } from "./analyse";
import { DEFAULT_SLOT } from "./solver";
import type { TeamPose } from "./team-plan";

const AIR_SLOTS = tickTiming(TUNING).hopAirtime / DEFAULT_SLOT;

describe("coupling and decoys", () => {
  it("reads two Os on a narrow road: free either side of the middle, with spots that strand the partner", () => {
    // Five lanes, a tall bus in the last: the Os fit in lanes 0 to 3, both
    // at once only side by side, and an O can't kick past its partner.
    const start = startPose(["O", "O"], 5);
    const coupling = rowCoupling(reachablePoses(start, 5, AIR_SLOTS), soloReachable(start, 5, AIR_SLOTS), rowSolids([{ id: "I1", lane: 4 }]), 5, TUNING.wallRows);
    expect(coupling).toEqual({
      inOrder: 4,
      crossed: 0,
      // Lanes 0, 1 or 2, down or up.
      solo: [6, 6],
      line: { at: 2, left: 2, right: 2, free: 4 },
      coupling: 0,
      // Free, but an O alone in the middle, or on its partner's side, leaves
      // its partner nowhere.
      label: "partly coupled",
      decoys: [4, 4],
    });
  });

  it("reads the teaching ramp's side-by-side rows as parallel solo, and its one-up rows and finale as coupled or full of decoys", () => {
    const rows = analyseCoopCourse(TEACHING_RAMP, TUNING, AIR_SLOTS);
    const byLesson = (lesson: string) => {
      const row = rows.find((r) => r.lesson === lesson);
      if (row === undefined) throw new Error(`no row "${lesson}"`);
      return row;
    };
    expect(byLesson("jump together").coupling.label).toBe("parallel solo");
    expect(byLesson("each stands up").coupling.label).toBe("parallel solo");
    expect(byLesson("both up, each its own").coupling.label).toBe("parallel solo");
    for (const lesson of ["noses together", "make room on the left", "Sprout goes up", "Splash up, far right"]) {
      expect(byLesson(lesson).coupling.label, lesson).toBe("partly coupled");
      expect(byLesson(lesson).coupling.coupling, lesson).toBeGreaterThan(0.3);
    }
    const finale = byLesson("both up, back to back");
    expect(finale.passes).toBe(1);
    expect(finale.coupling.decoys).toEqual([2, 2]);
    expect(finale.coupling.label).toBe("partly coupled");
  });
});

describe("coordination kinds", () => {
  const rows = analyseCoopCourse(TEACHING_RAMP, TUNING, AIR_SLOTS);
  const kindsOf = (lesson: string) => rows.find((row) => row.lesson === lesson)?.answer;

  it("reads the teaching ramp's answers", () => {
    expect(kindsOf("jump together")).toEqual([]);
    expect(kindsOf("hop together")).toEqual(["both up"]);
    expect(kindsOf("noses together")).toEqual(["interlock"]);
    expect(kindsOf("make room on the left")).toEqual(["interlock", "order"]);
    expect(kindsOf("Sprout goes up")).toEqual(["perch", "interlock"]);
    expect(kindsOf("both up, back to back")).toEqual(["both up", "interlock"]);
  });

  it("sees the frogs swap sides", () => {
    const start: TeamPose = [
      { kind: "O", col: 0, rotation: 0, air: null },
      { kind: "O", col: 4, rotation: 0, air: null },
    ];
    const swapped: TeamPose = [
      { kind: "O", col: 4, rotation: 0, air: null },
      { kind: "O", col: 0, rotation: 0, air: null },
    ];
    expect(coordinationKinds(start, swapped, 6, AIR_SLOTS)).toEqual(["order", "crossing"]);
    expect(coordinationKinds(start, start, 6, AIR_SLOTS)).toEqual([]);
  });

  it("tells a perch from both frogs up with nothing under them", () => {
    const start: TeamPose = [
      { kind: "O", col: 0, rotation: 0, air: null },
      { kind: "O", col: 3, rotation: 0, air: null },
    ];
    // An O up one cell over a grounded O's top: standing on it.
    const perched: TeamPose = [
      { kind: "O", col: 0, rotation: 0, air: 0 },
      { kind: "O", col: 1, rotation: 0, air: null },
    ];
    expect(coordinationKinds(start, perched, 6, AIR_SLOTS)).toContain("perch");
    const bothUp: TeamPose = [
      { kind: "O", col: 0, rotation: 0, air: 0 },
      { kind: "O", col: 3, rotation: 0, air: 0 },
    ];
    expect(coordinationKinds(start, bothUp, 6, AIR_SLOTS)).toEqual(["both up"]);
  });
});
