import { describe, expect, it } from "vitest";
import { BLOCK_PARTY } from "../coop-courses/block-party";
import type { DesignedCourse } from "../coop-courses/design";
import { LONG_AND_SHORT } from "../coop-courses/long-and-short";
import { TEA_FOR_TWO } from "../coop-courses/tea-for-two";
import { tickTiming } from "../ticks";
import { rowSolids } from "../traffic";
import { TUNING } from "../tuning";
import { analyseCoopCourse, coordinationKinds, reachablePoses, rowCoupling, soloReachable, startPose } from "./analyse";
import { DEFAULT_SLOT } from "./solver";
import type { TeamPose } from "./team-plan";

const AIR_SLOTS = tickTiming(TUNING).hopAirtime / DEFAULT_SLOT;

const ANALYSED = new Map([BLOCK_PARTY, TEA_FOR_TWO, LONG_AND_SHORT].map((course) => [course, analyseCoopCourse(course, AIR_SLOTS)]));

// A designed course's row, analysed, by its lesson.
function rowOf(course: DesignedCourse, lesson: string) {
  const row = ANALYSED.get(course)?.find((r) => r.lesson === lesson);
  if (row === undefined) throw new Error(`${course.id} has no row "${lesson}"`);
  return row;
}

describe("coupling and decoys", () => {
  it("reads two Os on a narrow road: free either side of the middle, with spots that strand the partner", () => {
    // Five lanes, a tall bus in the last: the Os fit in lanes 0 to 3, both
    // at once only side by side, and an O can't kick past its partner.
    const start = startPose(["O", "O"], 5);
    const coupling = rowCoupling(reachablePoses(start, 5, AIR_SLOTS), soloReachable(start, 5, AIR_SLOTS), rowSolids([{ id: "I1", lane: 4 }]), 5);
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

  it("reads the designed courses' rows each their own way: parallel solo or coupled", () => {
    expect(rowOf(TEA_FOR_TWO, "jump together").coupling.label).toBe("parallel solo");
    expect(rowOf(TEA_FOR_TWO, "each stands up").coupling.label).toBe("parallel solo");
    for (const lesson of ["Splash points down", "Sprout points down", "Splash leans in"]) {
      expect(rowOf(TEA_FOR_TWO, lesson).coupling.label, lesson).toBe("partly coupled");
      expect(rowOf(TEA_FOR_TWO, lesson).coupling.coupling, lesson).toBeGreaterThan(0.3);
    }
  });
});

describe("coordination kinds", () => {
  it("reads the designed courses' answers", () => {
    expect(rowOf(BLOCK_PARTY, "jump together").answer).toEqual([]);
    expect(rowOf(BLOCK_PARTY, "hop together").answer).toEqual(["both up"]);
    expect(rowOf(BLOCK_PARTY, "shoulder to shoulder").answer).toEqual(["interlock"]);
    expect(rowOf(BLOCK_PARTY, "make room on the right").answer).toEqual(["interlock", "order"]);
    expect(rowOf(TEA_FOR_TWO, "Splash points down").answer).toEqual(["interlock"]);
    expect(rowOf(LONG_AND_SHORT, "Splash steps onto the plank").answer).toEqual(["perch", "interlock", "order"]);
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
      { kind: "I", col: 0, rotation: 0, air: null },
      { kind: "O", col: 5, rotation: 0, air: null },
    ];
    // An O up one cell over a flat I: standing on it. (An O can't stand on
    // an O: it is two cells tall, and a hop lifts it one.)
    const perched: TeamPose = [
      { kind: "I", col: 0, rotation: 0, air: null },
      { kind: "O", col: 1, rotation: 0, air: 0 },
    ];
    expect(coordinationKinds(start, perched, 7, AIR_SLOTS)).toContain("perch");
    const bothUp: TeamPose = [
      { kind: "I", col: 0, rotation: 0, air: 0 },
      { kind: "O", col: 5, rotation: 0, air: 0 },
    ];
    expect(coordinationKinds(start, bothUp, 7, AIR_SLOTS)).toEqual(["both up"]);
  });
});
