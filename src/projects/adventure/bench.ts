import { KITS, type Kit } from "./kit";
import type { Placement } from "./town";

/** Cells between pieces on each kit's bench: room for its widest (the town's windmill sails), and to walk between. */
const LAYOUT: Record<Kit, { spacing: number; perRow: number }> = {
  town: { spacing: 3, perRow: 13 },
  nature: { spacing: 2, perRow: 19 },
};

/**
 * A kit's piece bench (`?view=pieces`, `&kit=nature` for the Nature Kit): every
 * piece of the kit on the grid, unturned, in its name's order, a few cells
 * apart, so a session building with the kit sees each piece's shape, size and
 * own axes before placing it. The player starts on a cell between the first
 * rows, which no piece takes.
 */
export function bench(kit: Kit): Placement[] {
  const { spacing, perRow } = LAYOUT[kit];
  const offset = -Math.floor((perRow * spacing) / 2) + 2;
  return KITS[kit].map((piece, i) => ({
    piece,
    x: (i % perRow) * spacing + offset,
    z: Math.floor(i / perRow) * spacing + offset,
  }));
}
