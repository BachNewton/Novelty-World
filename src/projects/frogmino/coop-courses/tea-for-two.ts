import { TUNING } from "../tuning";
import { PACE, pose, READ, READ_SLOW, type DesignedCourse } from "./design";

// Two Ts on a road eight lanes wide, and who climbs on whom. A T pointing up
// is a staircase: its arm is a step a cell up, and its nose a step two up,
// which only a lift reaches. The pieces are the same, so the read is whose
// turn it is to climb, and the rows swap it, each after a row that sets the
// habit the other way.

export const TEA_FOR_TWO: DesignedCourse = {
  id: "tea-for-two",
  name: "Tea for Two",
  description: "Two Ts and a staircase: one points up and the other climbs it, onto the arm, or lifted onto the nose.",
  lanes: 8,
  kinds: ["T", "T"],
  length: 124,
  // Provisional (see Courses and medals in the project's CLAUDE.md).
  medals: { gold: 30, silver: 40, bronze: 55 },
  rows: [
    {
      lesson: "jump together",
      answer: [pose(0, 0), pose(4, 0)],
      gap: TUNING.firstWallDepth,
      vehicles: [{ id: "I1", lane: 3 }, { id: "I1", lane: 7 }],
    },
    {
      lesson: "Splash climbs Sprout's stair",
      answer: [pose(2, 0), pose(2, 1, 1)],
      gap: READ_SLOW,
      vehicles: [{ id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "T3", lane: 4 }, { id: "I1", lane: 6 }, { id: "I1", lane: 7 }],
    },
    {
      lesson: "Sprout climbs Splash's stair",
      answer: [pose(4, 3, 1), pose(3, 0)],
      gap: READ_SLOW,
      vehicles: [{ id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "T1", lane: 2 }, { id: "I1", lane: 6 }, { id: "I1", lane: 7 }],
    },
    {
      lesson: "the nest",
      answer: [pose(2, 0), pose(4, 2)],
      gap: READ_SLOW,
      vehicles: [{ id: "I1", lane: 0 }, { id: "Z1", lane: 1 }, { id: "J3", lane: 6 }],
    },
    {
      lesson: "Sprout lifts Splash onto the nose",
      answer: [pose(3, 0), pose(3, 2, 2)],
      gap: READ,
      vehicles: [{ id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "T1", lane: 2 }, { id: "T3", lane: 5 }, { id: "I1", lane: 7 }],
    },
    {
      lesson: "Splash lifts Sprout onto the nose",
      answer: [pose(2, 2, 2), pose(2, 0)],
      gap: READ,
      vehicles: [{ id: "I1", lane: 0 }, { id: "T1", lane: 1 }, { id: "T3", lane: 4 }, { id: "I1", lane: 6 }, { id: "I1", lane: 7 }],
    },
    {
      lesson: "Splash climbs, quick",
      answer: [pose(3, 0), pose(3, 1, 1)],
      gap: PACE,
      vehicles: [{ id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "I1", lane: 2 }, { id: "T3", lane: 5 }, { id: "I1", lane: 7 }],
    },
    {
      lesson: "and swap: Splash lifts Sprout",
      answer: [pose(3, 2, 2), pose(3, 0)],
      gap: PACE,
      vehicles: [{ id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "T1", lane: 2 }, { id: "T3", lane: 5 }, { id: "I1", lane: 7 }],
    },
  ],
};
