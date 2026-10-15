import { describe, expect, it } from "vitest";
import { BLOCK_PARTY } from "../coop-courses/block-party";
import type { DesignedCourse } from "../coop-courses/design";
import { LONG_AND_SHORT } from "../coop-courses/long-and-short";
import { TEA_FOR_TWO } from "../coop-courses/tea-for-two";
import { tickTiming } from "../ticks";
import { rowSolids } from "../traffic";
import { TUNING } from "../tuning";
import { analyseCoopCourse, coordinationKinds, movesNeeded, passingPoses, reachablePoses, rowCoupling, simplestWay, soloReachable, stackReach, startPose } from "./analyse";
import { DEFAULT_SLOT } from "./solver";
import { applyPoseAction, carriedIn, stepStackMoves, type PlanFrog, type PoseAction, type TeamPose } from "./team-plan";

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
      stacked: 0,
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

  it("leaves the stacked ways out: two Ts stack in thousands of ways, which would read every row fully coupled", () => {
    // A T stands on a T in a great many ways, each with the frogs sharing
    // lanes. Side by side, an open road lets each T go its own way.
    const open = rowOf(TEA_FOR_TWO, "jump together").coupling;
    expect(open.stacked).toBeGreaterThan(10 * (open.inOrder + open.crossed));
    expect(open.label).toBe("parallel solo");
    // An O is two cells tall and a hop lifts it one, so two Os never stack.
    expect(rowOf(BLOCK_PARTY, "jump together").coupling.stacked).toBe(0);
  });

  it("reads a row only a stack passes as fully coupled", () => {
    // Six lanes, an ice-cream van two cells tall in lanes 1 and 2 and a bus
    // in lane 4: no two free lanes sit side by side, so the O fits nowhere
    // on the road, and its own hop lifts it one cell, into the van. It gets
    // through only up on the I.
    const kinds = ["I", "O"] as const;
    const start = startPose(kinds, 6);
    const row = rowSolids([
      { id: "O0", lane: 1 },
      { id: "I1", lane: 4 },
    ]);
    const coupling = rowCoupling(reachablePoses(start, 6, AIR_SLOTS), soloReachable(start, 6, AIR_SLOTS), row, 6);
    expect(coupling.inOrder + coupling.crossed).toBe(0);
    expect(coupling.stacked).toBeGreaterThan(0);
    expect(coupling.coupling).toBe(1);
    expect(coupling.label).toBe("fully coupled");
  });
});

describe("coordination kinds", () => {
  it("reads the designed courses' answers", () => {
    expect(rowOf(BLOCK_PARTY, "jump together").answer).toEqual([]);
    expect(rowOf(BLOCK_PARTY, "hop together").answer).toEqual(["both up"]);
    expect(rowOf(BLOCK_PARTY, "shoulder to shoulder").answer).toEqual(["interlock"]);
    expect(rowOf(BLOCK_PARTY, "make room on the right").answer).toEqual(["interlock", "order"]);
    expect(rowOf(TEA_FOR_TWO, "the nest").answer).toEqual(["interlock", "order"]);
    expect(rowOf(LONG_AND_SHORT, "Splash steps onto the plank").answer).toEqual(["perch", "interlock", "order"]);
  });

  it("reads each stacking lesson of the course that teaches them, and nothing simpler through its row", () => {
    const lesson = (name: string) => {
      const row = rowOf(LONG_AND_SHORT, name);
      return { answer: row.answer, simplest: row.simplest?.level };
    };
    expect(lesson("Splash steps onto the plank")).toEqual({ answer: ["perch", "interlock", "order"], simplest: "perch" });
    expect(lesson("Splash hops off the plank")).toEqual({ answer: ["hop off"], simplest: "lift" });
    expect(lesson("Sprout lifts Splash").answer).toEqual(["stack", "interlock", "order"]);
    expect(lesson("the double jump")).toEqual({ answer: ["double jump", "order"], simplest: "double jump" });
  });

  it("sees the frogs swap sides", () => {
    const start: TeamPose = [
      { kind: "O", col: 0, rotation: 0, height: 0, air: 0 },
      { kind: "O", col: 4, rotation: 0, height: 0, air: 0 },
    ];
    const swapped: TeamPose = [
      { kind: "O", col: 4, rotation: 0, height: 0, air: 0 },
      { kind: "O", col: 0, rotation: 0, height: 0, air: 0 },
    ];
    expect(coordinationKinds(start, swapped, 6, AIR_SLOTS)).toEqual(["order", "crossing"]);
    expect(coordinationKinds(start, start, 6, AIR_SLOTS)).toEqual([]);
  });

  it("tells a perch from both frogs up with nothing under them", () => {
    const start: TeamPose = [
      { kind: "I", col: 0, rotation: 0, height: 0, air: 0 },
      { kind: "O", col: 5, rotation: 0, height: 0, air: 0 },
    ];
    // An O up one cell over a flat I: standing on it. (An O can't stand on
    // an O: it is two cells tall, and a hop lifts it one.)
    const perched: TeamPose = [
      { kind: "I", col: 0, rotation: 0, height: 0, air: 0 },
      { kind: "O", col: 1, rotation: 0, height: 1, air: 0 },
    ];
    expect(coordinationKinds(start, perched, 7, AIR_SLOTS)).toContain("perch");
    const bothUp: TeamPose = [
      { kind: "I", col: 0, rotation: 0, height: 1, air: 0 },
      { kind: "O", col: 5, rotation: 0, height: 1, air: 0 },
    ];
    expect(coordinationKinds(start, bothUp, 7, AIR_SLOTS)).toEqual(["both up"]);
  });

  it("tells a stack from a perch, and an overhang on the road from either", () => {
    const start: TeamPose = [
      { kind: "I", col: 0, rotation: 1, height: 0, air: 0 },
      { kind: "O", col: 5, rotation: 0, height: 0, air: 0 },
    ];
    // An O on an upright I: four cells up, higher than a hop off the road.
    const stacked: TeamPose = [start[0], { kind: "O", col: 0, rotation: 0, height: 4, air: 0 }];
    expect(coordinationKinds(start, stacked, 7, AIR_SLOTS)).toEqual(["stack", "interlock", "order"]);
    // A T pointing down beside a flat T, its arm over the flat T's end: on
    // the road, standing on nothing but the road.
    const overhang: TeamPose = [
      { kind: "T", col: 2, rotation: 0, height: 0, air: 0 },
      { kind: "T", col: 4, rotation: 2, height: 0, air: 0 },
    ];
    expect(coordinationKinds(overhang, overhang, 8, AIR_SLOTS)).toEqual(["interlock"]);
  });

  it("tells which stacking moves a pose can't be reached without", () => {
    const without = stackReach(startPose(["I", "O"], 7), 7, AIR_SLOTS);
    const team = (i: Omit<PlanFrog, "kind" | "air">, o: Omit<PlanFrog, "kind" | "air">): TeamPose => [
      { kind: "I", air: 0, ...i },
      { kind: "O", air: 0, ...o },
    ];
    // The O perched on a flat I, or lifted on it, which a hop off and a
    // hop of the I's beneath it reach as well as a carry does.
    expect(movesNeeded(team({ col: 0, rotation: 0, height: 0 }, { col: 1, rotation: 0, height: 1 }), without)).toEqual([]);
    expect(movesNeeded(team({ col: 0, rotation: 0, height: 1 }, { col: 1, rotation: 0, height: 2 }), without)).toEqual([]);
    // With the I standing upright apart, the O two cells up came off the
    // flat I, and three cells up off the I in the air.
    expect(movesNeeded(team({ col: 0, rotation: 1, height: 0 }, { col: 4, rotation: 0, height: 2 }), without)).toEqual(["hop off"]);
    expect(movesNeeded(team({ col: 0, rotation: 1, height: 0 }, { col: 4, rotation: 0, height: 3 }), without)).toEqual(["double jump"]);
  });

  it("reads how much stacking the simplest way through a row takes", () => {
    const start = startPose(["I", "O"], 7);
    const reach = stackReach(start, 7, AIR_SLOTS);
    const reachable = reachablePoses(start, 7, AIR_SLOTS);
    const simplest = (vehicles: Parameters<typeof rowSolids>[0]) => simplestWay(passingPoses(reachable, rowSolids(vehicles)), reach);
    // Open road: each frog its own way.
    expect(simplest([{ id: "I1", lane: 6 }])?.level).toBe("solo");
    // A wall of buses with a slot for the upright I in lane 2, and a crane
    // in lanes 4 and 5 three cells tall: the O clears it only off the I
    // in the air.
    const wall = [0, 1, 3, 6].map((lane) => ({ id: "I1" as const, lane }));
    expect(simplest([...wall, { id: "J1", lane: 4 }])).toEqual({ level: "double jump", ways: 2 });
    // Two cells tall instead: a hop off the flat I clears it.
    expect(simplest([...wall, { id: "O0", lane: 4 }])?.level).toBe("lift");
  });

  it("sees a carry in a step that slides a rider along or lifts a partner", () => {
    // Splash's O standing on Sprout's flat I.
    const stacked: TeamPose = [
      { kind: "I", col: 0, rotation: 0, height: 0, air: 0 },
      { kind: "O", col: 1, rotation: 0, height: 1, air: 0 },
    ];
    const step = (player: number, action: PoseAction) => ({
      move: { kind: "act" as const, player, action },
      pose: applyPoseAction(stacked, 7, player, action, AIR_SLOTS),
    });
    expect(carriedIn(stacked, step(0, "right"))).toEqual([1]);
    expect(carriedIn(stacked, step(0, "hop"))).toEqual([1]);
    expect(carriedIn(stacked, step(1, "right"))).toEqual([]);
    expect(carriedIn(stacked, step(0, "rotateCw"))).toEqual([]);
    expect(stepStackMoves(stacked, step(0, "hop"))).toEqual(["carry"]);
  });

  it("tells a hop off a partner on its support from a double jump off one in the air", () => {
    const perched: TeamPose = [
      { kind: "I", col: 0, rotation: 0, height: 0, air: 0 },
      { kind: "O", col: 1, rotation: 0, height: 1, air: 0 },
    ];
    const hop = (from: TeamPose, player: number) => ({
      move: { kind: "act" as const, player, action: "hop" as const },
      pose: applyPoseAction(from, 7, player, "hop", AIR_SLOTS),
    });
    expect(stepStackMoves(perched, hop(perched, 1))).toEqual(["hop off"]);
    const lifted = hop(perched, 0).pose;
    expect(stepStackMoves(lifted, hop(lifted, 1))).toEqual(["double jump"]);
    expect(hop(lifted, 1).pose[1].height).toBe(3);
  });

  it("refuses the stacking moves it is asked to leave out", () => {
    const perched: TeamPose = [
      { kind: "I", col: 0, rotation: 0, height: 0, air: 0 },
      { kind: "O", col: 1, rotation: 0, height: 1, air: 0 },
    ];
    expect(applyPoseAction(perched, 7, 0, "hop", AIR_SLOTS, ["carry"])).toBe(perched);
    expect(applyPoseAction(perched, 7, 0, "right", AIR_SLOTS, ["carry"])).toBe(perched);
    expect(applyPoseAction(perched, 7, 1, "hop", AIR_SLOTS, ["hop off"])).toBe(perched);
    expect(applyPoseAction(perched, 7, 1, "hop", AIR_SLOTS, ["carry", "double jump"])).not.toBe(perched);
  });
});
