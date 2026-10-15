import { TUNING } from "../tuning";
import { PACE, pose, READ, type DesignedCourse } from "./design";

// A medium co-op course for Sprout's T and Splash's L on nine lanes, an
// asymmetric pair: the L leans and hooks onto the T far more readily than the
// T climbs onto the L. The rows chain, each answer the natural start of the
// next, and the gaps change: bursts of rows close together, where the chain
// is one move each, then room to regroup.

export const CHAIN_REACTION: DesignedCourse = {
  id: "chain-reaction",
  name: "Chain Reaction",
  description: "Sprout's T and Splash's L lean, climb and hook together, each pose setting up the next, as the traffic bunches up.",
  lanes: 9,
  kinds: ["T", "L"],
  length: 162,
  medals: { gold: 40, silver: 55, bronze: 75 },
  rows: [
    {
      lesson: "shoulder to shoulder",
      answer: [pose(2, 0), pose(5, 0)],
      gap: TUNING.firstWallDepth,
      vehicles: [{ id: "I1", lane: 0 }, { id: "Z1", lane: 1 }, { id: "L3", lane: 7 }],
    },
    // The L leans on the T: a perch with no way through side by side.
    {
      lesson: "lean on me",
      answer: [pose(2, 0), pose(4, 2, 1)],
      gap: READ,
      vehicles: [{ id: "I1", lane: 0 }, { id: "Z1", lane: 1 }, { id: "O0", lane: 5 }, { id: "T1", lane: 7 }],
    },
    {
      lesson: "Sprout on top",
      answer: [pose(3, 2, 1), pose(4, 0)],
      gap: READ,
      vehicles: [{ id: "S1", lane: 0 }, { id: "O0", lane: 2 }, { id: "L3", lane: 6 }, { id: "I1", lane: 8 }],
    },
    {
      lesson: "breather",
      answer: [pose(1, 0), pose(5, 0)],
      gap: READ,
      vehicles: [{ id: "Z1", lane: 0 }, { id: "T2", lane: 3 }, { id: "L3", lane: 7 }],
    },
    {
      lesson: "Splash on the arm",
      answer: [pose(3, 0), pose(5, 1, 1)],
      gap: 15,
      vehicles: [{ id: "J3", lane: 0 }, { id: "Z1", lane: 2 }, { id: "L3", lane: 6 }, { id: "I1", lane: 8 }],
    },
    // A burst: back to back, then a hop at a time.
    {
      lesson: "back to back",
      answer: [pose(2, 3), pose(4, 1)],
      gap: 15,
      vehicles: [{ id: "J1", lane: 1 }, { id: "S1", lane: 5 }, { id: "J1", lane: 7 }],
    },
    {
      lesson: "quick, Sprout hops",
      answer: [pose(2, 3, 1), pose(4, 1)],
      gap: 10,
      vehicles: [{ id: "T2", lane: 0 }, { id: "S1", lane: 5 }, { id: "Z1", lane: 7 }],
    },
    {
      lesson: "quick, both hop",
      answer: [pose(2, 3, 1), pose(4, 1, 1)],
      gap: 10,
      vehicles: [{ id: "I1", lane: 0 }, { id: "J0", lane: 2 }, { id: "L3", lane: 5 }, { id: "L3", lane: 7 }],
    },
    {
      lesson: "catch your breath, Splash hops",
      answer: [pose(2, 3), pose(4, 1, 1)],
      gap: 18,
      vehicles: [{ id: "J1", lane: 1 }, { id: "L3", lane: 5 }, { id: "T1", lane: 7 }],
    },
    // The climb: across the road, then the last two rows chained.
    {
      lesson: "lean on me, over there",
      answer: [pose(4, 0), pose(6, 2, 1)],
      gap: PACE,
      vehicles: [{ id: "T2", lane: 0 }, { id: "Z1", lane: 3 }, { id: "O0", lane: 7 }],
    },
    {
      lesson: "nose under the arm",
      answer: [pose(3, 1), pose(4, 3)],
      gap: PACE,
      vehicles: [{ id: "Z1", lane: 0 }, { id: "I1", lane: 2 }, { id: "I1", lane: 6 }, { id: "I1", lane: 8 }],
    },
    {
      lesson: "hook on the post",
      answer: [pose(3, 3), pose(4, 3, 1)],
      gap: 10,
      vehicles: [{ id: "L3", lane: 0 }, { id: "J1", lane: 2 }, { id: "J3", lane: 5 }, { id: "T1", lane: 7 }],
    },
  ],
};
