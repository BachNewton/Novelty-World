import { describe, expect, it } from "vitest";
import { LONG_AND_SHORT } from "../coop-courses/long-and-short";
import { cellKey, frogCells } from "../logic";
import type { Frog } from "../types";
import { coopCourse, courseOf, designedAnswers, type Course } from "../courses";
import { playTo, replay } from "../run";
import { tickTiming } from "../ticks";
import { rowSolids, type Row } from "../traffic";
import { TUNING } from "../tuning";
import { passingPoses, reachablePoses } from "./analyse";
import { PERCH_COURSE, PERCH_ROW, PERCHER } from "./perch";
import { REPLAYS, findReplay } from "./replays";
import { describeProof, describeStep, drawFace } from "./route";
import { courseRun, DEFAULT_SLOT, proveCourse, replayVerdict } from "./solver";
import { planShape, type TeamPose } from "./team-plan";

const AIR_SLOTS = tickTiming(TUNING).hopAirtime / DEFAULT_SLOT;
const COURSE = coopCourse(LONG_AND_SHORT.id);
const answers = designedAnswers(LONG_AND_SHORT);

// The team as it starts the course, for the planner.
function courseStart(): TeamPose {
  return courseRun(COURSE).frogs.map((frog) => ({ kind: frog.kind, col: frog.col, rotation: frog.rotation, height: 0, air: 0 }));
}

describe("a designed course", () => {
  it("ramps from a first row with room to spare to a finale with few ways through, its answer among them", () => {
    const reachable = reachablePoses(courseStart(), LONG_AND_SHORT.lanes, AIR_SLOTS);
    const finale = LONG_AND_SHORT.rows.at(-1);
    if (finale === undefined) throw new Error("The course has no rows");
    const through = passingPoses(reachable, rowSolids(finale.vehicles));
    const cells = (frogs: readonly Frog[]) => frogs.map((frog) => frogCells(frog).map(cellKey).sort());
    expect(through.map((pose) => cells(pose.map(planShape)))).toContainEqual(cells(finale.answer.map((pose, i) => ({ kind: LONG_AND_SHORT.kinds[i], ...pose }))));
    const first = passingPoses(reachable, rowSolids(LONG_AND_SHORT.rows[0].vehicles));
    expect(first.length).toBeGreaterThan(2 * through.length);
  });
});

describe("the perch", () => {
  it("has Splash standing on Sprout, its hop long over, as the row arrives, and passes with no bonk", () => {
    const perch = findReplay("perch");
    const course = courseOf(perch.course);
    const verdict = replayVerdict(course, perch.log, perch.until);
    expect(verdict.bonked).toBe(false);
    expect(verdict.passes).toBe(PERCH_ROW + 1);
    let run = replay(courseRun(course), perch.log, 0);
    while (run.passes < PERCH_ROW + 1) {
      const next = playTo(run, run.tick + 1, perch.log);
      if (next.passes > PERCH_ROW) break;
      run = next;
    }
    const percher = run.frogs[PERCHER];
    expect(percher.height).toBe(1);
    expect(run.tick - (percher.latestHop?.startedAt ?? run.tick)).toBeGreaterThan(tickTiming(TUNING).hopAirtime);
    const answer = PERCH_COURSE.rows[PERCH_ROW].answer;
    expect(run.frogs.map((frog) => [frog.col, frog.rotation, frog.height])).toEqual(answer.map((pose) => [pose.col, pose.rotation, pose.height]));
  });
});

describe("the solver", () => {
  it("proves a designed course by any passing poses too, over the finish", () => {
    const result = proveCourse(COURSE);
    expect(result.ok && result.proof.finished).toBe(true);
  }, 30_000);

  it("stops after as many rows as asked", () => {
    const result = proveCourse(COURSE, { rows: 3 });
    expect(result.ok && result.proof.rows.length).toBe(3);
    expect(result.ok && result.proof.finished).toBe(false);
  });

  it("names the row no route passes, rather than hanging", () => {
    const wall: Row = [0, 1, 2, 3].map((lane) => ({ id: "I1", lane }));
    const blocked: Course = {
      seed: 1,
      lanes: 4,
      kinds: ["L"],
      row: (index) => ({ vehicles: wall, solids: rowSolids(wall), gap: index === 0 ? TUNING.firstWallDepth : TUNING.wallSpacing }),
      length: TUNING.courseLength,
      medals: { gold: 60, silver: 80, bronze: 100 },
    };
    const result = proveCourse(blocked);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stuck.index).toBe(0);
    expect(result.stuck.reason).toMatch(/no team pose reachable/);
    expect(describeProof(result, 4)).toMatch(/STUCK at course row 0/);
  });

  it("fails loudly when a row's search would look at more poses than allowed", () => {
    expect(() => proveCourse(COURSE, { maxPoses: 5 })).toThrow(/No route found within 5 team poses/);
  });
});

describe("a readable route", () => {
  it("draws the row's face with the team on it, a raised frog above it", () => {
    const row: Row = [{ id: "O0", lane: 0 }];
    const pose: TeamPose = [
      { kind: "I", col: 2, rotation: 0, height: 0, air: 0 },
      { kind: "O", col: 0, rotation: 0, height: 1, air: 3 },
    ];
    expect(drawFace(pose, rowSolids(row), 6)).toEqual(["22....", "xx....", "##1111"]);
  });

  it("says each step in words, landings included", () => {
    const route = describeProof(proveCourse(COURSE, { rows: 3, answers }), LONG_AND_SHORT.lanes);
    expect(route).toMatch(/Splash hops/);
    expect(route).toMatch(/Sprout slides right, carrying Splash/);
    expect(route).toMatch(/Sprout turns clockwise/);
    expect(route).toMatch(/PROVED: 3 rows passed with no bonk/);
  });

  it("says how far a turn kicked", () => {
    const standing: TeamPose = [
      { kind: "L", col: 2, rotation: 2, height: 1, air: 0 },
      { kind: "J", col: 3, rotation: 0, height: 0, air: 0 },
    ];
    const turned: TeamPose = [{ kind: "L", col: 3, rotation: 3, height: 1, air: 0 }, standing[1]];
    expect(describeStep(standing, { move: { kind: "act", player: 0, action: "rotateCw" }, pose: turned })).toBe(
      "Sprout turns clockwise, kicking 1 lane right",
    );
  });
});

describe("the replays", () => {
  it("each still plays its course with no bonk in the real rules, and every proof still finishes", () => {
    for (const [name, data] of Object.entries(REPLAYS)) {
      const verdict = replayVerdict(courseOf(data.course), data.log, data.until);
      expect(verdict.bonked, name).toBe(false);
      expect(verdict.passes, name).toBeGreaterThan(0);
      if (name.startsWith("proof-")) expect(verdict.finished, name).toBe(true);
    }
  }, 30_000);

  it("fails loudly on a replay that doesn't exist, naming those that do", () => {
    expect(findReplay("perch")).toBe(REPLAYS.perch);
    expect(() => findReplay("nope")).toThrow(`no replay "nope"; the replays are ${Object.keys(REPLAYS).join(", ")}`);
  });
});
