import { describe, expect, it } from "vitest";
import { COOP_COURSE } from "../coop-course";
import { coopCourse, courseOf, designedAnswers, designedRowAt, soloCourse, type Course } from "../courses";
import { cellKey, frogCells } from "../logic";
import { fitsRow, hopHeight, playTo, replay } from "../run";
import { tickTiming } from "../ticks";
import { rowLength, rowSolids, type Row } from "../traffic";
import { TUNING } from "../tuning";
import { passingPoses, reachablePoses } from "./analyse";
import { PERCH_ROW } from "./perch";
import { REPLAYS, findReplay } from "./replays";
import { describeProof, describeStep, drawFace } from "./route";
import { courseRun, DEFAULT_SLOT, proveCourse, replayVerdict } from "./solver";
import { planShape, type TeamPose } from "./team-plan";

const answers = designedAnswers(COOP_COURSE);
const AIR_SLOTS = tickTiming(TUNING).hopAirtime / DEFAULT_SLOT;

// The team as it starts local co-op's course, for the planner.
function coopStart(): TeamPose {
  return courseRun(coopCourse()).frogs.map((frog) => ({ kind: frog.kind, col: frog.col, rotation: frog.rotation, air: null }));
}

describe("local co-op's course", () => {
  const { kinds, lanes } = COOP_COURSE;

  it("lets the team through every row in the answer it was designed around, the frogs clear of each other", () => {
    for (const [i, row] of COOP_COURSE.rows.entries()) {
      const frogs = row.answer.map((pose, player) => ({ kind: kinds[player], ...pose }));
      const solids = rowSolids(row.vehicles);
      expect(frogs.every((frog) => fitsRow(frog, solids, TUNING.wallRows)), row.lesson).toBe(true);
      expect(frogs.every((frog) => frogCells(frog).every((cell) => cell.col >= 0 && cell.col < lanes)), row.lesson).toBe(true);
      const cells = frogs.flatMap((frog) => frogCells(frog).map(cellKey));
      expect(new Set(cells).size, `${String(i)}: ${row.lesson}`).toBe(cells.length);
    }
  });

  it("is proved to the finish in its designed answers, meeting every row it was designed with", () => {
    const result = proveCourse(coopCourse(), { answers });
    if (!result.ok) throw new Error(`stuck at row ${String(result.stuck.index)}: ${result.stuck.reason}`);
    expect(result.proof.finished).toBe(true);
    const met = new Set(result.proof.rows.map((row) => row.index));
    COOP_COURSE.rows.forEach((row, i) => {
      expect(met.has(i), row.lesson).toBe(true);
    });
  }, 60_000);

  it("puts every designed row before the finish, even for a team jumping flat out", () => {
    let back = 0;
    let front = 0;
    COOP_COURSE.rows.forEach((row, i) => {
      front = i === 0 ? row.gap : back + row.gap;
      back = front + rowLength(rowSolids(row.vehicles));
    });
    const flatOut = TUNING.depthStep / TUNING.holdRepeatInterval;
    // Where a team that never stops jumping meets the last row, driving at it.
    expect((front * flatOut) / (flatOut + TUNING.wallSpeed)).toBeLessThan(TUNING.courseLength);
  });

  it("ramps to a finale with one way through, the frogs up back to back", () => {
    const reachable = reachablePoses(coopStart(), lanes, AIR_SLOTS);
    const finale = COOP_COURSE.rows.at(-1);
    if (finale === undefined) throw new Error("The course has no rows");
    const through = passingPoses(reachable, rowSolids(finale.vehicles), TUNING.wallRows);
    expect(through.map((pose) => pose.map(planShape).map(({ col, rotation, hop }) => ({ col, rotation, hop })))).toEqual([finale.answer]);
    const first = passingPoses(reachable, rowSolids(COOP_COURSE.rows[0].vehicles), TUNING.wallRows);
    expect(first.length).toBeGreaterThan(100);
  });

  it("goes round its last rows again once they are all met", () => {
    const { length } = COOP_COURSE.rows;
    expect(designedRowAt(COOP_COURSE, 0)).toBe(0);
    expect(designedRowAt(COOP_COURSE, length - 1)).toBe(length - 1);
    expect(designedRowAt(COOP_COURSE, length)).toBe(length - COOP_COURSE.repeat);
    expect(designedRowAt(COOP_COURSE, length + COOP_COURSE.repeat)).toBe(length - COOP_COURSE.repeat);
    expect(() => designedRowAt(COOP_COURSE, -1)).toThrow(/No row -1/);
  });
});

describe("the perch", () => {
  it("has Sprout standing on Splash, its hop long over, as the row arrives, and passes with no bonk", () => {
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
    const [sprout, splash] = run.frogs;
    expect(hopHeight(sprout)).toBe(1);
    expect(run.tick - (sprout.latestHop?.startedAt ?? run.tick)).toBeGreaterThan(tickTiming(TUNING).hopAirtime);
    const answer = COOP_COURSE.rows[PERCH_ROW].answer;
    expect([sprout.col, sprout.rotation, splash.col, splash.rotation, hopHeight(splash)]).toEqual([
      answer[0].col,
      answer[0].rotation,
      answer[1].col,
      answer[1].rotation,
      0,
    ]);
  });
});

describe("the solver", () => {
  it("proves local co-op's course by any passing poses too, over the finish", () => {
    const result = proveCourse(coopCourse());
    expect(result.ok && result.proof.finished).toBe(true);
  }, 30_000);

  it("proves solo's row stream to the finish, through the gates its needs-gate rows need", () => {
    const result = proveCourse(soloCourse());
    if (!result.ok) throw new Error(`stuck at row ${String(result.stuck.index)}: ${result.stuck.reason}`);
    expect(result.proof.finished).toBe(true);
    expect(result.proof.rows.some((row) => row.gates.some((gate) => gate !== null))).toBe(true);
  });

  it("stops after as many rows as asked", () => {
    const result = proveCourse(coopCourse(), { rows: 3 });
    expect(result.ok && result.proof.rows.length).toBe(3);
    expect(result.ok && result.proof.finished).toBe(false);
  });

  it("names the row no route passes, rather than hanging", () => {
    const wall: Row = [0, 1, 2, 3].map((lane) => ({ id: "I1", lane }));
    const blocked: Course = {
      seed: 1,
      lanes: 4,
      kinds: ["L"],
      row: (index) => ({ vehicles: wall, gates: [], solids: rowSolids(wall), gap: index === 0 ? TUNING.firstWallDepth : TUNING.wallSpacing }),
    };
    const result = proveCourse(blocked);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stuck.index).toBe(0);
    expect(result.stuck.reason).toMatch(/no team pose reachable/);
    expect(describeProof(result, 4, TUNING.wallRows)).toMatch(/STUCK at course row 0/);
  });

  it("fails loudly when a row's search would look at more poses than allowed", () => {
    expect(() => proveCourse(coopCourse(), { maxPoses: 5 })).toThrow(/No route found within 5 team poses/);
  });
});

describe("a readable route", () => {
  it("draws the row's face with the team on it, a raised frog above it", () => {
    const row: Row = [{ id: "O0", lane: 0 }];
    const pose: TeamPose = [
      { kind: "I", col: 2, rotation: 0, air: null },
      { kind: "O", col: 0, rotation: 0, air: 3 },
    ];
    expect(drawFace(pose, rowSolids(row), [], 6, 4)).toEqual(["......", "22....", "xx....", "##1111"]);
  });

  it("says each step in words, landings included", () => {
    const route = describeProof(proveCourse(coopCourse(), { rows: 3, answers }), COOP_COURSE.lanes, TUNING.wallRows);
    expect(route).toMatch(/Sprout hops/);
    expect(route).toMatch(/Splash turns anticlockwise/);
    expect(route).toMatch(/Sprout slides right/);
    expect(route).toMatch(/PROVED: 3 rows passed with no bonk/);
  });

  it("says how far a turn kicked", () => {
    const standing: TeamPose = [
      { kind: "L", col: 2, rotation: 2, air: 0 },
      { kind: "J", col: 3, rotation: 0, air: null },
    ];
    const turned: TeamPose = [{ kind: "L", col: 3, rotation: 3, air: 0 }, standing[1]];
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
    expect(() => findReplay("nope")).toThrow(/no replay "nope"; the replays are perch, proof-coop/);
  });
});
