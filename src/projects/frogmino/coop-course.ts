import type { Row } from "./traffic";
import { TUNING } from "./tuning";
import type { Frog, TetrominoKind } from "./types";

// Local co-op's course, designed by hand for Sprout's L and Splash's J on a
// road ten lanes wide: a teaching ramp, one idea a row, then the ideas
// combined. Ten lanes split the road into two even halves of five, so the
// frogs start mirror images of each other, and a row mirrored about the
// middle gives each frog the same task mirrored; the L and the J are mirror
// images too. See Co-op in the project's CLAUDE.md for the ramp.

// A frog's pose on the row's face; its piece is the course's.
export type Pose = Omit<Frog, "kind">;

export interface DesignedRow {
  // What the row teaches, in a few words: the prove CLI prints it.
  lesson: string;
  vehicles: Row;
  // The pose each frog is meant to pass in, one per player: the answer the
  // row was designed around, which the proof plays. Others may pass too.
  answer: readonly Pose[];
  // From the back of the row before to this row's front, in units; for the
  // first row, where its front starts. Early rows get more reading room.
  gap: number;
}

export interface DesignedCourse {
  lanes: number;
  // One starting piece per player.
  kinds: readonly TetrominoKind[];
  rows: readonly DesignedRow[];
  // How many of the last rows go round again, in order, for as long as the
  // run goes on: the stream never runs out, and a slow team meets more rows
  // before the finish than the course has.
  repeat: number;
}

function pose(col: number, rotation: Pose["rotation"], hop: Pose["hop"] = 0): Pose {
  return { col, rotation, hop };
}

const READ_SLOW = 18;
const READ = 16;
const PACE = 13;

export const COOP_COURSE: DesignedCourse = {
  lanes: 10,
  kinds: ["L", "J"],
  repeat: 8,
  rows: [
    // Side by side, each its own opening: the jump is the team's.
    {
      lesson: "jump together",
      answer: [pose(1, 0), pose(6, 0)],
      gap: TUNING.firstWallDepth,
      vehicles: [{ id: "I1", lane: 0 }, { id: "I1", lane: 4 }, { id: "I1", lane: 5 }, { id: "I1", lane: 9 }],
    },
    {
      lesson: "hop together",
      answer: [pose(1, 0, 1), pose(6, 0, 1)],
      gap: READ_SLOW,
      vehicles: [{ id: "I1", lane: 0 }, { id: "I0", lane: 1 }, { id: "I0", lane: 5 }, { id: "I1", lane: 9 }],
    },
    {
      lesson: "each stands up",
      answer: [pose(2, 1), pose(6, 3)],
      gap: READ_SLOW,
      vehicles: [
        { id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "S1", lane: 3 },
        { id: "Z1", lane: 5 }, { id: "I1", lane: 8 }, { id: "I1", lane: 9 },
      ],
    },
    // One opening for both, side by side.
    {
      lesson: "noses together",
      answer: [pose(2, 0), pose(5, 0)],
      gap: READ_SLOW,
      vehicles: [{ id: "I1", lane: 0 }, { id: "L2", lane: 1 }, { id: "J2", lane: 6 }, { id: "I1", lane: 9 }],
    },
    {
      lesson: "make room on the left",
      answer: [pose(0, 1), pose(2, 0)],
      gap: READ,
      vehicles: [{ id: "J2", lane: 3 }, { id: "I1", lane: 6 }, { id: "I1", lane: 7 }, { id: "I1", lane: 8 }, { id: "I1", lane: 9 }],
    },
    {
      lesson: "make room on the right",
      answer: [pose(5, 0), pose(8, 3)],
      gap: READ,
      vehicles: [{ id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "I1", lane: 2 }, { id: "I1", lane: 3 }, { id: "L2", lane: 4 }],
    },
    {
      lesson: "the bridge",
      answer: [pose(2, 2), pose(5, 2)],
      gap: READ,
      vehicles: [{ id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "I0", lane: 3 }, { id: "I1", lane: 8 }, { id: "I1", lane: 9 }],
    },
    // One up, one down: who goes up?
    {
      lesson: "Sprout goes up",
      answer: [pose(3, 1, 1), pose(4, 3)],
      gap: READ,
      vehicles: [{ id: "O0", lane: 0 }, { id: "L1", lane: 2 }, { id: "I1", lane: 6 }, { id: "J2", lane: 7 }],
    },
    {
      lesson: "Splash goes up",
      answer: [pose(4, 1), pose(5, 3, 1)],
      gap: PACE,
      vehicles: [{ id: "L2", lane: 0 }, { id: "I1", lane: 3 }, { id: "J3", lane: 6 }, { id: "O0", lane: 8 }],
    },
    {
      lesson: "Sprout up on the tractor",
      answer: [pose(3, 0, 1), pose(5, 3)],
      gap: PACE,
      vehicles: [{ id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "J0", lane: 2 }, { id: "I1", lane: 7 }, { id: "I1", lane: 8 }, { id: "I1", lane: 9 }],
    },
    {
      lesson: "Splash up on the garbage truck",
      answer: [pose(3, 1), pose(4, 0, 1)],
      gap: PACE,
      vehicles: [{ id: "I1", lane: 0 }, { id: "I1", lane: 1 }, { id: "I1", lane: 2 }, { id: "L0", lane: 5 }, { id: "I1", lane: 8 }, { id: "I1", lane: 9 }],
    },
    // Combined: one up, one down, away from where the frogs stand.
    {
      lesson: "Sprout up, far left",
      answer: [pose(1, 1, 1), pose(2, 3)],
      gap: PACE,
      vehicles: [{ id: "L1", lane: 0 }, { id: "I1", lane: 4 }, { id: "J2", lane: 5 }, { id: "O0", lane: 8 }],
    },
    {
      lesson: "Splash up, far right",
      answer: [pose(6, 1), pose(7, 3, 1)],
      gap: PACE,
      vehicles: [{ id: "O0", lane: 0 }, { id: "L2", lane: 2 }, { id: "I1", lane: 5 }, { id: "J3", lane: 8 }],
    },
    // Both up at once: the hops timed together, with nothing under either
    // frog until the row arrives.
    {
      lesson: "both up, each its own",
      answer: [pose(1, 3, 1), pose(7, 1, 1)],
      gap: READ,
      vehicles: [{ id: "Z0", lane: 0 }, { id: "S1", lane: 3 }, { id: "Z1", lane: 5 }, { id: "S0", lane: 7 }],
    },
    {
      lesson: "both up, back to back",
      answer: [pose(3, 3, 1), pose(5, 1, 1)],
      gap: READ,
      vehicles: [{ id: "J2", lane: 0 }, { id: "L1", lane: 3 }, { id: "J3", lane: 5 }, { id: "L2", lane: 7 }],
    },
  ],
};
