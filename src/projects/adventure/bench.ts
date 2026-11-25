import { FANTASY_TOWN_PIECES } from "./fantasy-town";
import type { Placement } from "./town";

/** Cells between pieces on the bench: room for the widest (the windmill's sails), and to walk between. */
const SPACING = 3;
const PER_ROW = 13;

/**
 * The piece bench (`?view=pieces`): every piece of the town kit on the grid,
 * unturned, in its name's order, a few cells apart, so a session building with
 * the kit sees each piece's shape, size and own axes before placing it. The
 * player starts on the cell between the first rows, which no piece takes.
 */
export const BENCH: readonly Placement[] = FANTASY_TOWN_PIECES.map((piece, i) => ({
  piece,
  x: (i % PER_ROW) * SPACING - 17,
  z: Math.floor(i / PER_ROW) * SPACING - 17,
}));
