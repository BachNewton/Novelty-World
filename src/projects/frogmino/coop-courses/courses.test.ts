import { describe, expect, it } from "vitest";
import { coopCourse, designedAnswers, designedCourse, designedRowAt, startRun } from "../courses";
import { heldJumpTicks } from "../medals";
import { tickTiming, toTicks } from "../ticks";
import { TUNING } from "../tuning";
import { analyseCoopCourse } from "../proof/analyse";
import { DEFAULT_SLOT, proveCourse } from "../proof/solver";
import { checkCoopCourse, flatOutMeeting, rowFronts } from "./check";
import { pose, type DesignedCourse } from "./design";
import { buildCoopRegistry, COOP_COURSES, coopCourseById, DEFAULT_COOP_COURSE, stepCoopCourse } from "./index";

const AIR_SLOTS = tickTiming(TUNING).hopAirtime / DEFAULT_SLOT;

// Two Os on a road five lanes wide, the narrowest that leaves a lane beside
// them: the same piece twice. The second row makes Splash move first, the
// third has both frogs up over a snowplough.
const O_PAIR: DesignedCourse = {
  id: "o-pair",
  name: "O Pair",
  tier: "easy",
  description: "Two Os on a narrow road.",
  lanes: 5,
  kinds: ["O", "O"],
  length: 80,
  medals: { gold: 20, silver: 30, bronze: 45 },
  rows: [
    { lesson: "stand still", answer: [pose(0, 0), pose(2, 0)], gap: TUNING.firstWallDepth, vehicles: [{ id: "I1", lane: 4 }] },
    { lesson: "shuffle right", answer: [pose(1, 0), pose(3, 0)], gap: 13, vehicles: [{ id: "I1", lane: 0 }] },
    { lesson: "both up", answer: [pose(0, 0, 1), pose(2, 0, 1)], gap: 13, vehicles: [{ id: "I0", lane: 0 }] },
  ],
};

// Two Ts on eight lanes; Sprout hops over a snowplough.
const T_PAIR: DesignedCourse = {
  id: "t-pair",
  name: "T Pair",
  tier: "medium",
  description: "Two Ts.",
  lanes: 8,
  kinds: ["T", "T"],
  length: 90,
  repeat: 1,
  medals: { gold: 20, silver: 30, bronze: 45 },
  rows: [
    { lesson: "stand still", answer: [pose(0, 0), pose(4, 0)], gap: TUNING.firstWallDepth, vehicles: [{ id: "I1", lane: 3 }, { id: "I1", lane: 7 }] },
    { lesson: "Sprout up", answer: [pose(0, 0, 1), pose(4, 0)], gap: 13, vehicles: [{ id: "I0", lane: 0 }, { id: "I1", lane: 7 }] },
  ],
};

// An I and an S on nine lanes, the road off-centre.
const I_AND_S: DesignedCourse = {
  id: "i-and-s",
  name: "I and S",
  tier: "hard",
  description: "Different pieces, an odd road.",
  lanes: 9,
  kinds: ["I", "S"],
  length: 70,
  medals: { gold: 20, silver: 30, bronze: 45 },
  rows: [{ lesson: "apart", answer: [pose(0, 0), pose(5, 0)], gap: TUNING.firstWallDepth, vehicles: [{ id: "I1", lane: 4 }] }],
};

describe("every registered co-op course", () => {
  it("is listed by tier, easiest first, with distinct ids", () => {
    const tiers = COOP_COURSES.map((course) => ["easy", "medium", "hard"].indexOf(course.tier));
    expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
    expect(new Set(COOP_COURSES.map((course) => course.id)).size).toBe(COOP_COURSES.length);
  });

  it.each(COOP_COURSES.map((course) => [course.id, course] as const))("%s passes the course checks", (_, course) => {
    expect(checkCoopCourse(course, TUNING)).toBe(course);
  });

  it.each(COOP_COURSES.map((course) => [course.id, course] as const))("%s has every designed answer within the team's reach", (_, course) => {
    for (const row of analyseCoopCourse(course, AIR_SLOTS)) expect(row.answerReachable, row.lesson).toBe(true);
  });

  it("lists the easy courses gentlest first, Block Party leading", () => {
    expect(COOP_COURSES.filter((course) => course.tier === "easy").map((course) => course.id)).toEqual(["block-party", "tea-for-two", "long-and-short"]);
    expect(DEFAULT_COOP_COURSE).toBe("block-party");
  });

  it("starts the picker on the first easy course", () => {
    expect(coopCourseById(DEFAULT_COOP_COURSE).tier).toBe("easy");
    expect(DEFAULT_COOP_COURSE).toBe(COOP_COURSES.find((course) => course.tier === "easy")?.id);
  });
});

describe("the registry", () => {
  it("finds a course by id, and fails loudly on one it doesn't have, naming those it does", () => {
    expect(coopCourseById("block-party").name).toBe("Block Party");
    expect(() => coopCourseById("nowhere")).toThrow(/no co-op course "nowhere"; the courses are block-party/);
  });

  it("refuses two courses with one id, or none at all", () => {
    expect(() => buildCoopRegistry([O_PAIR, { ...T_PAIR, id: "o-pair" }])).toThrow(/two co-op courses are called "o-pair"/);
    expect(() => buildCoopRegistry([])).toThrow(/no co-op courses/);
  });

  it("orders courses by tier and steps through them round and round", () => {
    const listed = buildCoopRegistry([I_AND_S, T_PAIR, O_PAIR]);
    expect(listed.map((course) => course.id)).toEqual(["o-pair", "t-pair", "i-and-s"]);
    const only = COOP_COURSES[0].id;
    expect(stepCoopCourse(only, 1)).toBe(COOP_COURSES[1 % COOP_COURSES.length].id);
    expect(stepCoopCourse(only, -1)).toBe(COOP_COURSES[COOP_COURSES.length - 1].id);
  });
});

describe("a co-op course of any pair of pieces, on any road", () => {
  it.each([O_PAIR, T_PAIR, I_AND_S].map((course) => [course.id, course] as const))("%s starts, passes its checks, and is proved in its answers to its own finish", (_, design) => {
    checkCoopCourse(design, TUNING);
    const course = designedCourse(design);
    const run = startRun(course);
    expect(run.frogs.map((frog) => frog.kind)).toEqual(design.kinds);
    expect(run.lanes).toBe(design.lanes);
    expect(run.tuning.courseLength).toBe(design.length);
    const result = proveCourse(course, { answers: designedAnswers(design) });
    if (!result.ok) throw new Error(`stuck at row ${String(result.stuck.index)}: ${result.stuck.reason}`);
    expect(result.proof.finished).toBe(true);
    for (const row of analyseCoopCourse(design, AIR_SLOTS)) expect(row.answerReachable, row.lesson).toBe(true);
  });

  it("reads the coordination a narrow road's rows ask for", () => {
    const [still, shuffle, up] = analyseCoopCourse(O_PAIR, AIR_SLOTS);
    expect(still.answer).toEqual(["interlock"]);
    expect(shuffle.answer).toEqual(["interlock", "order"]);
    expect(up.answer).toEqual(["both up", "interlock", "order"]);
  });

  it("fails loudly, naming the course, when its pieces can't start on its road", () => {
    expect(() => checkCoopCourse({ ...O_PAIR, id: "too-narrow", lanes: 3 }, TUNING)).toThrow(/"too-narrow".*O fits no share of 1.5 lanes/);
    expect(() => checkCoopCourse({ ...O_PAIR, kinds: ["O", "O", "O"] }, TUNING)).toThrow(/co-op is 2 frogs/);
  });
});

describe("a co-op course's checks", () => {
  const broken = (changes: Partial<DesignedCourse>) => () => checkCoopCourse({ ...O_PAIR, ...changes }, TUNING);
  const withRow = (index: number, changes: Partial<DesignedCourse["rows"][number]>) =>
    broken({ rows: O_PAIR.rows.map((row, i) => (i === index ? { ...row, ...changes } : row)) });

  it("passes a sound course", () => {
    expect(checkCoopCourse(O_PAIR, TUNING)).toBe(O_PAIR);
  });

  it("fails loudly on a bad id, name, tier or description", () => {
    expect(broken({ id: "O Pair" })).toThrow(/"O Pair": its id must be lower-case words/);
    expect(broken({ name: " " })).toThrow(/needs a name/);
    expect(broken({ description: "" })).toThrow(/needs a description/);
  });

  it("fails loudly on a row that isn't legal, or an answer that doesn't pass it", () => {
    expect(withRow(0, { vehicles: [{ id: "I0", lane: 3 }] })).toThrow(/row 0 \("stand still"\) isn't a legal row: I0 at lane 3 leaves the road/);
    expect(withRow(1, { answer: [pose(0, 0), pose(3, 0)] })).toThrow(/row 1 \("shuffle right"\): frog 1's answer doesn't pass it/);
    expect(withRow(0, { answer: [pose(1, 0), pose(2, 0)] })).toThrow(/the frogs overlap in its answer/);
    expect(withRow(0, { answer: [pose(0, 0)] })).toThrow(/needs an answer for each of the 2 frogs/);
    expect(withRow(0, { answer: [pose(0, 0), pose(4, 0)] })).toThrow(/frog 2's answer leaves the road/);
    expect(withRow(1, { gap: 0 })).toThrow(/needs a gap before it/);
  });

  it("fails loudly on medal times out of order, or a gold faster than a held jump down its own length", () => {
    expect(broken({ medals: { gold: 30, silver: 20, bronze: 45 } })).toThrow(/gold < silver < bronze/);
    expect(broken({ medals: { gold: 5, silver: 30, bronze: 45 } })).toThrow(/gold time of 5 s beats a held jump/);
    expect(toTicks(O_PAIR.medals.gold)).toBeGreaterThan(heldJumpTicks(TUNING, O_PAIR.length));
  });

  it("fails loudly on a finish a team jumping flat out would reach before the last row", () => {
    const fronts = rowFronts(O_PAIR);
    const meeting = flatOutMeeting(fronts[fronts.length - 1], TUNING);
    expect(meeting).toBeLessThan(O_PAIR.length);
    expect(broken({ length: Math.floor(meeting) })).toThrow(/"o-pair": a team jumping flat out meets its last row at .*past its finish/);
    expect(broken({ length: 10 })).toThrow(/comes before the drop lands/);
  });

  it("goes round every row again by default, or as many of its last rows as it says", () => {
    expect(designedRowAt(O_PAIR, 3)).toBe(0);
    expect(designedRowAt(O_PAIR, 5)).toBe(2);
    expect(designedRowAt(T_PAIR, 2)).toBe(1);
    expect(designedRowAt(T_PAIR, 9)).toBe(1);
    expect(broken({ repeat: 4 })).toThrow(/can't repeat its last 4 of 3 rows/);
    expect(broken({ repeat: 0 })).toThrow(/can't repeat its last 0 of 3 rows/);
  });

  it("plays a registered course as its data says", () => {
    const design = COOP_COURSES[0];
    const course = coopCourse(design.id);
    expect([course.lanes, course.kinds, course.length, course.medals]).toEqual([design.lanes, design.kinds, design.length, design.medals]);
  });
});
