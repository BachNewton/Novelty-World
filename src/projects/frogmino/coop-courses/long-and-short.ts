import { TUNING } from "../tuning";
import { pose, READ, READ_SLOW, type DesignedCourse } from "./design";

// An I and an O on a road nine lanes wide, the course that teaches stacking:
// the I is a plank the O stands on, and every stacking move comes in turn,
// one a row, each first where nothing simpler gets through. Standing on the
// partner; hopping off it, over a van; the partner's hop lifting the rider;
// and the double jump, the O hopping off the plank while the plank is still
// in the air. Then the moves again, mixed.

export const LONG_AND_SHORT: DesignedCourse = {
  id: "long-and-short",
  name: "Long and Short",
  description: "A plank and a block learn to stack: stand on the plank, hop off it, ride it up, and the double jump.",
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
      lesson: "Splash steps onto the plank",
      answer: [pose(2, 0), pose(3, 0, 1)],
      gap: READ_SLOW,
      vehicles: [{ id: "I1", lane: 0 }, { id: "T1", lane: 1 }, { id: "T3", lane: 5 }, { id: "I1", lane: 7 }, { id: "I1", lane: 8 }],
    },
    {
      lesson: "Splash hops off the plank",
      answer: [pose(4, 1), pose(6, 0, 2)],
      gap: READ_SLOW,
      vehicles: [
        { id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "I1", lane: 2 }, { id: "I1", lane: 3 },
        { id: "I1", lane: 5 }, { id: "O0", lane: 6 }, { id: "I1", lane: 8 },
      ],
    },
    {
      lesson: "Sprout lifts Splash",
      answer: [pose(2, 0, 1), pose(3, 0, 2)],
      gap: READ_SLOW,
      vehicles: [{ id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "I0", lane: 2 }, { id: "I1", lane: 6 }, { id: "I1", lane: 7 }, { id: "I1", lane: 8 }],
    },
    {
      lesson: "the double jump",
      answer: [pose(4, 1), pose(6, 0, 3)],
      gap: READ_SLOW,
      vehicles: [
        { id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "I1", lane: 2 }, { id: "I1", lane: 3 },
        { id: "I1", lane: 5 }, { id: "J1", lane: 6 }, { id: "I1", lane: 8 },
      ],
    },
    {
      lesson: "breather: hop together",
      answer: [pose(0, 0, 1), pose(5, 0, 1)],
      gap: READ,
      vehicles: [{ id: "I0", lane: 0 }, { id: "I1", lane: 4 }, { id: "I0", lane: 5 }],
    },
    {
      lesson: "Splash hops off to the left",
      answer: [pose(6, 1), pose(2, 0, 2)],
      gap: READ,
      vehicles: [
        { id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "O0", lane: 2 }, { id: "I1", lane: 4 },
        { id: "I1", lane: 5 }, { id: "I1", lane: 7 }, { id: "I1", lane: 8 },
      ],
    },
    {
      lesson: "the double jump, back to the right",
      answer: [pose(2, 1), pose(4, 0, 3)],
      gap: READ,
      vehicles: [
        { id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "I1", lane: 3 }, { id: "J1", lane: 4 },
        { id: "I1", lane: 6 }, { id: "I1", lane: 7 }, { id: "I1", lane: 8 },
      ],
    },
  ],
};
