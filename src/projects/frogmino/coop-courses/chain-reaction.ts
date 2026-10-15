import { TUNING } from "../tuning";
import { PACE, pose, READ, READ_SLOW, type DesignedCourse } from "./design";

// Sprout's T and Splash's L on nine lanes: everything together, as the last
// course. The L leans on the T and the T climbs onto the L; the L is lifted
// onto the T's nose; each stands in a slot shaped like it while the other
// hops off it over a van; and the slots swap sides, so the team crosses
// over and back. The rows chain, each answer the natural start of the next,
// and the gaps shrink to a closing burst.

export const CHAIN_REACTION: DesignedCourse = {
  id: "chain-reaction",
  name: "Chain Reaction",
  description: "A T and an L lean, climb, lift and hop off each other, cross over and back, in a chain that speeds up.",
  lanes: 9,
  kinds: ["T", "L"],
  length: 148,
  // Provisional (see Courses and medals in the project's CLAUDE.md).
  medals: { gold: 40, silver: 50, bronze: 70 },
  rows: [
    {
      lesson: "shoulder to shoulder",
      answer: [pose(2, 0), pose(5, 0)],
      gap: TUNING.firstWallDepth,
      vehicles: [{ id: "I1", lane: 0 }, { id: "Z1", lane: 1 }, { id: "L3", lane: 7 }],
    },
    {
      lesson: "lean on me",
      answer: [pose(2, 0), pose(4, 2, 1)],
      gap: READ_SLOW,
      vehicles: [{ id: "I1", lane: 0 }, { id: "Z1", lane: 1 }, { id: "O0", lane: 5 }, { id: "T1", lane: 7 }],
    },
    {
      lesson: "Sprout on top",
      answer: [pose(3, 2, 1), pose(4, 0)],
      gap: READ_SLOW,
      vehicles: [{ id: "S1", lane: 0 }, { id: "O0", lane: 2 }, { id: "L3", lane: 6 }, { id: "I1", lane: 8 }],
    },
    {
      lesson: "Sprout lifts Splash onto the nose",
      answer: [pose(3, 0), pose(4, 1, 2)],
      gap: READ,
      vehicles: [{ id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "T1", lane: 2 }, { id: "T3", lane: 5 }, { id: "I1", lane: 7 }, { id: "I1", lane: 8 }],
    },
    {
      lesson: "Splash hops off, over the van",
      answer: [pose(2, 1), pose(5, 1, 2)],
      gap: READ,
      vehicles: [{ id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "L3", lane: 3 }, { id: "O0", lane: 5 }, { id: "I1", lane: 7 }, { id: "I1", lane: 8 }],
    },
    {
      lesson: "breather",
      answer: [pose(1, 0), pose(5, 0)],
      gap: READ,
      vehicles: [{ id: "Z1", lane: 0 }, { id: "T2", lane: 3 }, { id: "L3", lane: 7 }],
    },
    {
      lesson: "cross over: Sprout hops off to the right",
      answer: [pose(5, 1, 2), pose(2, 1)],
      gap: READ,
      vehicles: [{ id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "T3", lane: 3 }, { id: "O0", lane: 5 }, { id: "I1", lane: 7 }, { id: "I1", lane: 8 }],
    },
    {
      lesson: "and cross back",
      answer: [pose(2, 1), pose(5, 1, 2)],
      gap: PACE,
      vehicles: [{ id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "L3", lane: 3 }, { id: "O0", lane: 5 }, { id: "I1", lane: 7 }, { id: "I1", lane: 8 }],
    },
    {
      lesson: "Splash on the arm",
      answer: [pose(3, 0), pose(5, 1, 1)],
      gap: PACE,
      vehicles: [{ id: "J3", lane: 0 }, { id: "Z1", lane: 2 }, { id: "L3", lane: 6 }, { id: "I1", lane: 8 }],
    },
    {
      lesson: "hook on the post",
      answer: [pose(3, 3), pose(4, 3, 1)],
      gap: PACE,
      vehicles: [{ id: "L3", lane: 0 }, { id: "J1", lane: 2 }, { id: "J3", lane: 5 }, { id: "T1", lane: 7 }],
    },
  ],
};
