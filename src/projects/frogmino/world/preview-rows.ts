import { cellKey, frogCells, frogPasses } from "../logic";
import { startPlacements } from "../run";
import { rowOpening, type Row } from "../traffic";
import { TUNING } from "../tuning";
import type { Frog, HopHeight, Rotation, TetrominoKind } from "../types";

// The `?world` preview's traffic, independent of the course generator: a few
// fixed rows for each road width it shows, solo or for the co-op pair, each
// letting its frogs through together.

// The road widths the preview shows: the game's own first, then wider roads
// for co-op.
export const PREVIEW_LANES = [7, 9, 10] as const;
export type PreviewLanes = (typeof PREVIEW_LANES)[number];

export type PreviewTeam = "solo" | "coop";

// Each frog's piece, the first P1's and the second P2's.
export const PREVIEW_PIECES: Record<PreviewTeam, readonly TetrominoKind[]> = {
  solo: ["L"],
  coop: ["L", "J"],
};

// The co-op rows alternate a row with an opening for each frog and a row
// whose one opening lets the pair through only interlocked, one frog hopping
// over the other.
export const PREVIEW_ROWS: Record<PreviewTeam, Record<PreviewLanes, readonly Row[]>> = {
  solo: {
    7: [
      [{ id: "O0", lane: 0 }, { id: "T0", lane: 2 }, { id: "I1", lane: 6 }],
      [{ id: "J0", lane: 0 }, { id: "S0", lane: 4 }],
      [{ id: "I0", lane: 0 }, { id: "L2", lane: 4 }],
      [{ id: "Z1", lane: 0 }, { id: "T1", lane: 2 }, { id: "O0", lane: 5 }],
      [{ id: "L0", lane: 0 }, { id: "I1", lane: 3 }, { id: "T3", lane: 5 }],
    ],
    9: [
      [{ id: "T3", lane: 0 }, { id: "L2", lane: 2 }, { id: "L3", lane: 5 }, { id: "I1", lane: 8 }],
      [{ id: "T2", lane: 0 }, { id: "J2", lane: 3 }, { id: "J1", lane: 7 }],
      [{ id: "O0", lane: 0 }, { id: "L2", lane: 2 }, { id: "L3", lane: 5 }, { id: "Z1", lane: 7 }],
      [{ id: "S0", lane: 0 }, { id: "I1", lane: 3 }, { id: "S1", lane: 5 }, { id: "J1", lane: 7 }],
      [{ id: "O0", lane: 0 }, { id: "I1", lane: 2 }, { id: "J2", lane: 3 }, { id: "T1", lane: 6 }],
    ],
    10: [
      [{ id: "O0", lane: 0 }, { id: "T3", lane: 2 }, { id: "L2", lane: 4 }, { id: "L3", lane: 7 }],
      [{ id: "J1", lane: 0 }, { id: "T2", lane: 2 }, { id: "J1", lane: 6 }, { id: "J1", lane: 8 }],
      [{ id: "Z1", lane: 0 }, { id: "T1", lane: 3 }, { id: "L2", lane: 5 }, { id: "L3", lane: 8 }],
      [{ id: "T3", lane: 1 }, { id: "O0", lane: 3 }, { id: "T2", lane: 5 }, { id: "O0", lane: 8 }],
      [{ id: "J3", lane: 0 }, { id: "L2", lane: 2 }, { id: "Z1", lane: 5 }, { id: "S1", lane: 7 }],
    ],
  },
  coop: {
    7: [
      [{ id: "T3", lane: 1 }, { id: "Z1", lane: 3 }, { id: "I1", lane: 6 }],
      [{ id: "L3", lane: 0 }, { id: "T3", lane: 2 }, { id: "I1", lane: 6 }],
      [{ id: "J1", lane: 0 }, { id: "J2", lane: 2 }, { id: "I1", lane: 6 }],
      [{ id: "J1", lane: 0 }, { id: "T1", lane: 2 }, { id: "L3", lane: 5 }],
      [{ id: "L2", lane: 1 }, { id: "L3", lane: 4 }, { id: "I1", lane: 6 }],
    ],
    9: [
      [{ id: "I1", lane: 0 }, { id: "S1", lane: 2 }, { id: "Z1", lane: 4 }, { id: "T1", lane: 7 }],
      [{ id: "J1", lane: 0 }, { id: "T3", lane: 3 }, { id: "L3", lane: 5 }, { id: "L3", lane: 7 }],
      [{ id: "L2", lane: 1 }, { id: "L2", lane: 4 }, { id: "L3", lane: 7 }],
      [{ id: "O0", lane: 0 }, { id: "T3", lane: 2 }, { id: "T3", lane: 4 }, { id: "I1", lane: 8 }],
      [{ id: "T1", lane: 0 }, { id: "J1", lane: 3 }, { id: "J2", lane: 5 }, { id: "I1", lane: 8 }],
    ],
    10: [
      [{ id: "S1", lane: 1 }, { id: "Z1", lane: 3 }, { id: "T1", lane: 6 }, { id: "O0", lane: 8 }],
      [{ id: "S1", lane: 0 }, { id: "J1", lane: 2 }, { id: "T3", lane: 5 }, { id: "L3", lane: 7 }, { id: "I1", lane: 9 }],
      [{ id: "L3", lane: 0 }, { id: "J1", lane: 2 }, { id: "J2", lane: 4 }, { id: "T1", lane: 8 }],
      [{ id: "J1", lane: 0 }, { id: "O0", lane: 2 }, { id: "T1", lane: 4 }, { id: "L3", lane: 7 }, { id: "I1", lane: 9 }],
      [{ id: "L2", lane: 0 }, { id: "L3", lane: 3 }, { id: "T2", lane: 6 }, { id: "I1", lane: 9 }],
    ],
  },
};

const ROTATIONS: readonly Rotation[] = [0, 1, 2, 3];
const HOPS: readonly HopHeight[] = [0, 1];

// A pose for each piece in turn, on a road `lanes` wide, that passes the row
// with every frog clear of the others, as the frogs are solid to each other:
// the first found, each frog grounded before hopping.
export function passingPoses(row: Row, lanes: number, kinds: readonly TetrominoKind[]): Frog[] | null {
  const opening = rowOpening(row, lanes, TUNING.wallRows);
  const place = (placed: Frog[], taken: ReadonlySet<string>): Frog[] | null => {
    if (placed.length === kinds.length) return placed;
    const kind = kinds[placed.length];
    for (const hop of HOPS) {
      for (const rotation of ROTATIONS) {
        for (let col = 0; col < lanes; col++) {
          const frog: Frog = { kind, col, rotation, hop };
          const cells = frogCells(frog).map(cellKey);
          if (!frogPasses(frog, opening) || cells.some((cell) => taken.has(cell))) continue;
          const found = place([...placed, frog], new Set([...taken, ...cells]));
          if (found !== null) return found;
        }
      }
    }
    return null;
  };
  return place([], new Set());
}

// The frogs as they wait on the overpass, where the rules start them: each
// in the middle of its own share of the road.
export function startPoses(lanes: number, kinds: readonly TetrominoKind[]): Frog[] {
  return startPlacements(kinds, lanes).map((placement, i) => ({ kind: kinds[i], ...placement, hop: 0 }));
}
