import { TUNING } from "../tuning";
import { PACE, pose, READ, type DesignedCourse } from "./design";

// A medium co-op course for Sprout's S and Splash's Z on ten lanes. The S
// and the Z make few clean shapes with each other: a bridge, a V, and above
// all stacks, one frog standing up on the other's step, flat on flat or on a
// partner turned upright like a tower. So the course is mostly stacks, and
// who stands on whom keeps swapping: each row's answer leaves the frogs in the
// row before's pose as a selfish decoy, and moving into the new one needs one
// of them to make room first.

export const ZIG_ZAG_ALLEY: DesignedCourse = {
  id: "zig-zag-alley",
  name: "Zig Zag Alley",
  description: "Sprout's S and Splash's Z nest, stack and swap who stands on whom.",
  lanes: 10,
  kinds: ["S", "Z"],
  length: 166,
  medals: { gold: 45, silver: 55, bronze: 80 },
  rows: [
    // Nesting, side by side.
    {
      lesson: "the bridge",
      answer: [pose(2, 0), pose(5, 0)],
      gap: TUNING.firstWallDepth,
      vehicles: [{ id: "I1", lane: 0 }, { id: "Z1", lane: 1 }, { id: "S1", lane: 7 }, { id: "I1", lane: 9 }],
    },
    {
      lesson: "lean in",
      answer: [pose(3, 1), pose(5, 1)],
      gap: READ,
      vehicles: [{ id: "O0", lane: 0 }, { id: "L1", lane: 2 }, { id: "J3", lane: 6 }, { id: "O0", lane: 8 }],
    },
    // Stacks: one on the other's step, then swapped.
    {
      lesson: "Splash climbs",
      answer: [pose(2, 0), pose(4, 0, 1)],
      gap: READ,
      vehicles: [{ id: "I1", lane: 0 }, { id: "Z1", lane: 1 }, { id: "L3", lane: 6 }, { id: "J3", lane: 8 }],
    },
    {
      lesson: "Sprout climbs",
      answer: [pose(2, 0, 1), pose(4, 0)],
      gap: READ,
      vehicles: [{ id: "J1", lane: 1 }, { id: "S1", lane: 6 }, { id: "T1", lane: 8 }],
    },
    {
      lesson: "breather",
      answer: [pose(1, 0), pose(6, 0)],
      gap: READ,
      vehicles: [{ id: "Z1", lane: 0 }, { id: "L3", lane: 3 }, { id: "J1", lane: 5 }, { id: "S1", lane: 8 }],
    },
    // Towers: one stands upright and the other climbs it.
    {
      lesson: "Sprout on the tower",
      answer: [pose(2, 0, 1), pose(4, 1)],
      gap: 15,
      vehicles: [{ id: "J1", lane: 1 }, { id: "J3", lane: 5 }, { id: "J2", lane: 7 }],
    },
    {
      lesson: "Splash on the tower",
      answer: [pose(3, 1), pose(4, 0, 1)],
      gap: 15,
      vehicles: [{ id: "T3", lane: 0 }, { id: "L1", lane: 2 }, { id: "L3", lane: 6 }, { id: "T1", lane: 8 }],
    },
    // Moving the stack across the road: whoever is in the way goes first.
    {
      lesson: "make room on the right",
      answer: [pose(4, 0, 1), pose(6, 0)],
      gap: 14,
      vehicles: [{ id: "T2", lane: 0 }, { id: "J1", lane: 3 }, { id: "S1", lane: 8 }],
    },
    {
      lesson: "both up, leaning in",
      answer: [pose(3, 1, 1), pose(5, 1, 1)],
      gap: 14,
      vehicles: [{ id: "J2", lane: 0 }, { id: "S0", lane: 5 }, { id: "T3", lane: 8 }],
    },
    {
      lesson: "Splash on the tower, right",
      answer: [pose(5, 1), pose(6, 0, 1)],
      gap: PACE,
      vehicles: [{ id: "J3", lane: 0 }, { id: "S1", lane: 2 }, { id: "L1", lane: 4 }, { id: "L3", lane: 8 }],
    },
    {
      lesson: "make room on the left",
      answer: [pose(1, 1), pose(2, 0, 1)],
      gap: PACE,
      vehicles: [{ id: "L1", lane: 0 }, { id: "L3", lane: 4 }, { id: "L3", lane: 6 }, { id: "L1", lane: 8 }],
    },
    {
      lesson: "swap on top",
      answer: [pose(2, 0, 1), pose(4, 1)],
      gap: PACE,
      vehicles: [{ id: "J1", lane: 1 }, { id: "J3", lane: 5 }, { id: "T3", lane: 7 }],
    },
  ],
};
