import { TUNING } from "../tuning";
import { PACE, pose, READ, READ_SLOW, type DesignedCourse } from "./design";

// Sprout's S and Splash's Z on ten lanes: the crossing and back. The S and
// the Z make few clean shapes with each other, a bridge and a lean, and
// stacks, one standing on the other's step. Standing up, each fits a slot
// shaped like it, and the other hops off it over a van. Then the slots swap
// sides: the S's slot is on the Z's side, so the team must cross over, the
// one in the air going over the other, and in the last row cross back. The
// pieces are mirror images, so the climb one way is not the climb the other.

export const ZIG_ZAG_ALLEY: DesignedCourse = {
  id: "zig-zag-alley",
  name: "Zig Zag Alley",
  description: "An S and a Z climb each other's steps, then cross over to the other side, and back.",
  lanes: 10,
  kinds: ["S", "Z"],
  length: 125,
  // Provisional (see Courses and medals in the project's CLAUDE.md).
  medals: { gold: 30, silver: 40, bronze: 55 },
  rows: [
    {
      lesson: "the bridge",
      answer: [pose(2, 0), pose(5, 0)],
      gap: TUNING.firstWallDepth,
      vehicles: [{ id: "I1", lane: 0 }, { id: "Z1", lane: 1 }, { id: "S1", lane: 7 }, { id: "I1", lane: 9 }],
    },
    {
      lesson: "lean in",
      answer: [pose(3, 1), pose(5, 1)],
      gap: READ_SLOW,
      vehicles: [{ id: "O0", lane: 0 }, { id: "L1", lane: 2 }, { id: "J3", lane: 6 }, { id: "O0", lane: 8 }],
    },
    {
      lesson: "Splash climbs Sprout's step",
      answer: [pose(2, 0), pose(4, 0, 1)],
      gap: READ_SLOW,
      vehicles: [{ id: "I1", lane: 0 }, { id: "Z1", lane: 1 }, { id: "L3", lane: 6 }, { id: "J3", lane: 8 }],
    },
    {
      lesson: "Sprout climbs Splash's step",
      answer: [pose(2, 0, 1), pose(4, 0)],
      gap: READ_SLOW,
      vehicles: [{ id: "J1", lane: 1 }, { id: "S1", lane: 6 }, { id: "T1", lane: 8 }],
    },
    {
      lesson: "Splash hops off, over the van",
      answer: [pose(2, 1), pose(5, 1, 2)],
      gap: READ,
      vehicles: [
        { id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "L3", lane: 3 }, { id: "O0", lane: 5 },
        { id: "I1", lane: 7 }, { id: "I1", lane: 8 }, { id: "I1", lane: 9 },
      ],
    },
    {
      lesson: "Sprout hops off, over the van",
      answer: [pose(3, 1, 2), pose(6, 1)],
      gap: READ,
      vehicles: [
        { id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "I1", lane: 2 }, { id: "O0", lane: 3 }, { id: "J1", lane: 5 },
        { id: "I1", lane: 8 }, { id: "I1", lane: 9 },
      ],
    },
    {
      lesson: "cross over: Sprout's slot is on the right",
      answer: [pose(6, 1), pose(3, 1, 2)],
      gap: READ,
      vehicles: [
        { id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "I1", lane: 2 }, { id: "O0", lane: 3 }, { id: "I1", lane: 5 },
        { id: "L3", lane: 7 }, { id: "I1", lane: 9 },
      ],
    },
    {
      lesson: "and cross back",
      answer: [pose(2, 1), pose(5, 1, 2)],
      gap: PACE,
      vehicles: [
        { id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "L3", lane: 3 }, { id: "O0", lane: 5 },
        { id: "I1", lane: 7 }, { id: "I1", lane: 8 }, { id: "I1", lane: 9 },
      ],
    },
  ],
};
