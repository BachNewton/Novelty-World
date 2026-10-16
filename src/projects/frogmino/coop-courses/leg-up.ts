import { TUNING } from "../tuning";
import { PACE, pose, READ, READ_SLOW, type DesignedCourse } from "./design";

// An L and a J on a road ten lanes wide: the mirror pair, climbing. Lying
// flat, each is a step with a foot up at one end, and its partner climbs on
// its back; standing up, each fits a slot shaped like it, and the partner
// hops off it, over a van. Every move comes in a mirrored pair, each frog
// taking each part. Then the slots swap sides, so the climber has to cross
// over its partner to reach its own, and cross back.

export const LEG_UP: DesignedCourse = {
  id: "leg-up",
  name: "Leg Up",
  description: "The mirror pair climbs: onto each other's backs, off each other over a van, and over to the other side and back.",
  lanes: 10,
  kinds: ["L", "J"],
  length: 127,
  // Provisional (see Courses and medals in the project's CLAUDE.md).
  medals: { gold: 30, silver: 40, bronze: 55 },
  rows: [
    {
      lesson: "jump together",
      answer: [pose(1, 0), pose(6, 0)],
      gap: TUNING.firstWallDepth,
      vehicles: [{ id: "I1", lane: 0 }, { id: "I1", lane: 4 }, { id: "I1", lane: 5 }, { id: "I1", lane: 9 }],
    },
    {
      lesson: "feet together",
      answer: [pose(2, 0), pose(5, 0)],
      gap: READ_SLOW,
      vehicles: [{ id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "I1", lane: 8 }, { id: "I1", lane: 9 }],
    },
    {
      lesson: "Splash climbs on Sprout's back",
      answer: [pose(3, 0), pose(4, 1, 1)],
      gap: READ_SLOW,
      vehicles: [
        { id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "T1", lane: 2 }, { id: "L3", lane: 5 },
        { id: "I1", lane: 7 }, { id: "I1", lane: 8 }, { id: "I1", lane: 9 },
      ],
    },
    {
      lesson: "Sprout climbs on Splash's back",
      answer: [pose(4, 3, 1), pose(4, 0)],
      gap: READ_SLOW,
      vehicles: [
        { id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "I1", lane: 2 }, { id: "J1", lane: 3 }, { id: "T3", lane: 6 },
        { id: "I1", lane: 8 }, { id: "I1", lane: 9 },
      ],
    },
    {
      lesson: "Splash hops off, over the van",
      answer: [pose(2, 1), pose(5, 3, 2)],
      gap: READ_SLOW,
      vehicles: [
        { id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "T3", lane: 3 }, { id: "O0", lane: 5 },
        { id: "I1", lane: 7 }, { id: "I1", lane: 8 }, { id: "I1", lane: 9 },
      ],
    },
    {
      lesson: "Sprout hops off, over the van",
      answer: [pose(3, 1, 2), pose(6, 3)],
      gap: READ,
      vehicles: [
        { id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "I1", lane: 2 }, { id: "O0", lane: 3 }, { id: "T1", lane: 5 },
        { id: "I1", lane: 8 }, { id: "I1", lane: 9 },
      ],
    },
    {
      lesson: "Sprout's slot is over the other side",
      answer: [pose(6, 1), pose(3, 3, 2)],
      gap: READ,
      vehicles: [
        { id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "I1", lane: 2 }, { id: "O0", lane: 3 }, { id: "I1", lane: 5 },
        { id: "T3", lane: 7 }, { id: "I1", lane: 9 },
      ],
    },
    {
      lesson: "and back again",
      answer: [pose(2, 1), pose(5, 3, 2)],
      gap: PACE,
      vehicles: [
        { id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "T3", lane: 3 }, { id: "O0", lane: 5 },
        { id: "I1", lane: 7 }, { id: "I1", lane: 8 }, { id: "I1", lane: 9 },
      ],
    },
  ],
};
