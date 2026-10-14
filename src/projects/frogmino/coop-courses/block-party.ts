import { TUNING } from "../tuning";
import { pose, READ, READ_SLOW, type DesignedCourse } from "./design";

// The gentlest co-op course: two Os on a road eight lanes wide, so there is
// nothing to turn and the coordination is all there is to read. Each half of
// the road is four lanes, an O's width twice over, so a slot four lanes wide
// fits the pair only shoulder to shoulder, and one moved to a side makes one
// frog move first. An O can't stand on an O (it is two cells tall and a hop
// lifts it one), so one up and one down here is a step: the frogs side by
// side, one a cell higher than the other.

export const BLOCK_PARTY: DesignedCourse = {
  id: "block-party",
  name: "Block Party",
  tier: "easy",
  description: "Two blocks, nothing to turn: jump and hop together, squeeze in shoulder to shoulder, make room, and step up beside each other.",
  lanes: 8,
  kinds: ["O", "O"],
  length: 144,
  // Provisional (see Courses and medals in the project's CLAUDE.md).
  medals: { gold: 35, silver: 40, bronze: 55 },
  rows: [
    {
      lesson: "jump together",
      answer: [pose(1, 0), pose(5, 0)],
      gap: TUNING.firstWallDepth,
      vehicles: [{ id: "I1", lane: 3 }, { id: "I1", lane: 4 }],
    },
    {
      lesson: "hop together",
      answer: [pose(1, 0, 1), pose(5, 0, 1)],
      gap: READ_SLOW,
      vehicles: [{ id: "I0", lane: 0 }, { id: "I0", lane: 4 }],
    },
    {
      lesson: "shoulder to shoulder",
      answer: [pose(2, 0), pose(4, 0)],
      gap: READ_SLOW,
      vehicles: [{ id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "I1", lane: 6 }, { id: "I1", lane: 7 }],
    },
    {
      lesson: "make room on the right",
      answer: [pose(4, 0), pose(6, 0)],
      gap: READ_SLOW,
      vehicles: [{ id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "I1", lane: 2 }, { id: "I1", lane: 3 }],
    },
    {
      lesson: "make room on the left",
      answer: [pose(0, 0), pose(2, 0)],
      gap: READ_SLOW,
      vehicles: [{ id: "I1", lane: 4 }, { id: "I1", lane: 5 }, { id: "I1", lane: 6 }, { id: "I1", lane: 7 }],
    },
    {
      lesson: "Splash steps up",
      answer: [pose(2, 0), pose(4, 0, 1)],
      gap: READ_SLOW,
      vehicles: [{ id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "L0", lane: 5 }],
    },
    {
      lesson: "Sprout steps up",
      answer: [pose(1, 0, 1), pose(3, 0)],
      gap: READ,
      vehicles: [{ id: "J0", lane: 0 }, { id: "L3", lane: 4 }, { id: "I1", lane: 6 }, { id: "I1", lane: 7 }],
    },
    {
      lesson: "both up, each its own",
      answer: [pose(1, 0, 1), pose(5, 0, 1)],
      gap: READ,
      vehicles: [{ id: "I1", lane: 0 }, { id: "L0", lane: 1 }, { id: "J0", lane: 4 }, { id: "I1", lane: 7 }],
    },
    {
      lesson: "the staircase",
      answer: [pose(4, 0, 1), pose(6, 0)],
      gap: READ,
      vehicles: [{ id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "I1", lane: 2 }, { id: "J0", lane: 3 }],
    },
  ],
};
