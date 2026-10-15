import { TUNING } from "../tuning";
import { pose, READ, READ_SLOW, type DesignedCourse } from "./design";

// Two Ts on a road eight lanes wide, and the two ways a T fits a T: nested
// on the road, one pointing up and one down, a lane apart; and the lean, one
// standing on its side and the other leaning its nose on its nose from a cell
// up. The rows come in mirrored pairs, each frog taking each part in turn.

export const TEA_FOR_TWO: DesignedCourse = {
  id: "tea-for-two",
  name: "Tea for Two",
  description: "Two Ts that fit together: one points up and one points down, then one leans its nose on the other's.",
  lanes: 8,
  kinds: ["T", "T"],
  length: 129,
  // Provisional (see Courses and medals in the project's CLAUDE.md).
  medals: { gold: 30, silver: 40, bronze: 50 },
  rows: [
    {
      lesson: "jump together",
      answer: [pose(0, 0), pose(4, 0)],
      gap: TUNING.firstWallDepth,
      vehicles: [{ id: "I1", lane: 3 }, { id: "I1", lane: 7 }],
    },
    {
      lesson: "hop together",
      answer: [pose(0, 0, 1), pose(4, 0, 1)],
      gap: READ_SLOW,
      vehicles: [{ id: "I0", lane: 0 }, { id: "I0", lane: 4 }],
    },
    {
      lesson: "each stands up",
      answer: [pose(1, 1), pose(5, 3)],
      gap: READ_SLOW,
      vehicles: [{ id: "I1", lane: 0 }, { id: "I1", lane: 3 }, { id: "I1", lane: 4 }, { id: "I1", lane: 7 }],
    },
    {
      lesson: "Splash points down",
      answer: [pose(2, 0), pose(4, 2)],
      gap: READ_SLOW,
      vehicles: [{ id: "I1", lane: 0 }, { id: "Z1", lane: 1 }, { id: "J3", lane: 6 }],
    },
    {
      lesson: "Sprout points down",
      answer: [pose(1, 2), pose(3, 0)],
      gap: READ_SLOW,
      vehicles: [{ id: "L1", lane: 0 }, { id: "S1", lane: 5 }, { id: "I1", lane: 7 }],
    },
    {
      lesson: "Splash leans in",
      answer: [pose(2, 1), pose(3, 3, 1)],
      gap: READ,
      vehicles: [{ id: "I1", lane: 0 }, { id: "J3", lane: 4 }, { id: "I1", lane: 7 }],
    },
    {
      lesson: "Sprout leans in",
      answer: [pose(3, 1, 1), pose(4, 3)],
      gap: READ,
      vehicles: [{ id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "L1", lane: 2 }, { id: "I1", lane: 6 }, { id: "I1", lane: 7 }],
    },
    {
      lesson: "the lean",
      answer: [pose(2, 1), pose(3, 3, 1)],
      gap: READ,
      vehicles: [{ id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "J3", lane: 4 }, { id: "I1", lane: 6 }, { id: "I1", lane: 7 }],
    },
  ],
};
