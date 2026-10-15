import { TUNING } from "../tuning";
import { pose, READ, READ_SLOW, type DesignedCourse } from "./design";

// An I and an O on a road nine lanes wide: two pieces with different jobs.
// The I stands tall in a lane of its own, lies low under a roof, or hops up
// as a bridge, and the O, too tall to go under anything, steps up onto the
// flat I. Nothing is mirrored: who goes where is the question each row asks.

export const LONG_AND_SHORT: DesignedCourse = {
  id: "long-and-short",
  name: "Long and Short",
  description: "A plank and a block with different jobs: the I stands tall or lies low, and the O steps up onto it.",
  lanes: 9,
  kinds: ["I", "O"],
  length: 130,
  // Provisional (see Courses and medals in the project's CLAUDE.md).
  medals: { gold: 30, silver: 40, bronze: 55 },
  rows: [
    {
      lesson: "jump together",
      answer: [pose(0, 0), pose(5, 0)],
      gap: TUNING.firstWallDepth,
      vehicles: [{ id: "I1", lane: 4 }, { id: "I1", lane: 8 }],
    },
    {
      lesson: "hop together",
      answer: [pose(0, 0, 1), pose(5, 0, 1)],
      gap: READ_SLOW,
      vehicles: [{ id: "I0", lane: 0 }, { id: "I1", lane: 4 }, { id: "I0", lane: 5 }],
    },
    {
      lesson: "Sprout stands up to make room",
      answer: [pose(2, 1), pose(3, 0)],
      gap: READ_SLOW,
      vehicles: [
        { id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "I1", lane: 5 },
        { id: "I1", lane: 6 }, { id: "I1", lane: 7 }, { id: "I1", lane: 8 },
      ],
    },
    {
      lesson: "Splash steps onto the plank",
      answer: [pose(2, 0), pose(3, 0, 1)],
      gap: READ_SLOW,
      vehicles: [{ id: "S0", lane: 0 }, { id: "I1", lane: 6 }, { id: "I1", lane: 7 }, { id: "I1", lane: 8 }],
    },
    {
      lesson: "Sprout hops, Splash ducks",
      answer: [pose(0, 0, 1), pose(4, 0)],
      gap: READ_SLOW,
      vehicles: [{ id: "I0", lane: 0 }, { id: "L3", lane: 5 }, { id: "I1", lane: 7 }, { id: "I1", lane: 8 }],
    },
    {
      lesson: "Splash makes room to lie low",
      answer: [pose(2, 0), pose(7, 0)],
      gap: READ,
      vehicles: [{ id: "I1", lane: 0 }, { id: "L2", lane: 1 }, { id: "J2", lane: 4 }],
    },
    {
      lesson: "stand tall, hop high",
      answer: [pose(2, 1), pose(5, 0, 1)],
      gap: READ,
      vehicles: [{ id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "I1", lane: 3 }, { id: "J0", lane: 4 }, { id: "I1", lane: 7 }, { id: "I1", lane: 8 }],
    },
    {
      lesson: "the plank and the block",
      answer: [pose(2, 0), pose(3, 0, 1)],
      gap: READ,
      vehicles: [{ id: "S0", lane: 0 }, { id: "Z0", lane: 5 }, { id: "I1", lane: 8 }],
    },
  ],
};
