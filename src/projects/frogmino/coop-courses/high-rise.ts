import { TUNING } from "../tuning";
import { PACE, pose, READ, READ_SLOW, type DesignedCourse } from "./design";

// Two Is on a road ten lanes wide: towers and double jumps. Standing upright,
// an I is a tower that fits a lane of its own; lying flat, it is a plank its
// partner can stand on. The double jump is the plank's way over a garage
// three cells tall: one I lifts the other, the top one hops off while the
// lifter is still in the air, and the lifter stands up in its own slot
// below. Then who flies swaps, and the flyer has to cross over to the far
// side and back.

export const HIGH_RISE: DesignedCourse = {
  id: "high-rise",
  name: "High Rise",
  description: "Two Is, towers and planks: stand tall in a slot, or lift your partner and double jump over the garage.",
  lanes: 10,
  kinds: ["I", "I"],
  length: 126,
  // Provisional (see Courses and medals in the project's CLAUDE.md).
  medals: { gold: 30, silver: 40, bronze: 55 },
  rows: [
    {
      lesson: "jump together",
      answer: [pose(0, 0), pose(5, 0)],
      gap: TUNING.firstWallDepth,
      vehicles: [{ id: "I1", lane: 4 }, { id: "I1", lane: 9 }],
    },
    {
      lesson: "two towers",
      answer: [pose(3, 1), pose(6, 1)],
      gap: READ_SLOW,
      vehicles: [
        { id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "I1", lane: 2 }, { id: "I1", lane: 4 }, { id: "I1", lane: 5 },
        { id: "I1", lane: 7 }, { id: "I1", lane: 8 }, { id: "I1", lane: 9 },
      ],
    },
    {
      lesson: "two towers, up a step",
      answer: [pose(3, 1, 1), pose(6, 1, 1)],
      gap: READ_SLOW,
      vehicles: [
        { id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "I1", lane: 2 }, { id: "J3", lane: 3 }, { id: "L1", lane: 5 },
        { id: "I1", lane: 7 }, { id: "I1", lane: 8 }, { id: "I1", lane: 9 },
      ],
    },
    {
      lesson: "Splash double jumps over the garage",
      answer: [pose(3, 1), pose(4, 0, 3)],
      gap: READ_SLOW,
      vehicles: [
        { id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "I1", lane: 2 }, { id: "J1", lane: 4 }, { id: "L3", lane: 6 },
        { id: "I1", lane: 8 }, { id: "I1", lane: 9 },
      ],
    },
    {
      lesson: "Sprout double jumps over the garage",
      answer: [pose(2, 0, 3), pose(6, 1)],
      gap: READ,
      vehicles: [
        { id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "J1", lane: 2 }, { id: "L3", lane: 4 },
        { id: "I1", lane: 7 }, { id: "I1", lane: 8 }, { id: "I1", lane: 9 },
      ],
    },
    {
      lesson: "breather: a tower and a plank",
      answer: [pose(0, 0), pose(6, 1)],
      gap: READ,
      vehicles: [{ id: "I1", lane: 4 }, { id: "I1", lane: 5 }, { id: "I1", lane: 7 }, { id: "I1", lane: 8 }, { id: "I1", lane: 9 }],
    },
    {
      lesson: "Sprout flies over to the right",
      answer: [pose(4, 0, 3), pose(3, 1)],
      gap: READ,
      vehicles: [
        { id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "I1", lane: 2 }, { id: "J1", lane: 4 }, { id: "L3", lane: 6 },
        { id: "I1", lane: 8 }, { id: "I1", lane: 9 },
      ],
    },
    {
      lesson: "and back to the left",
      answer: [pose(2, 0, 3), pose(6, 1)],
      gap: PACE,
      vehicles: [
        { id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "J1", lane: 2 }, { id: "L3", lane: 4 },
        { id: "I1", lane: 7 }, { id: "I1", lane: 8 }, { id: "I1", lane: 9 },
      ],
    },
  ],
};
