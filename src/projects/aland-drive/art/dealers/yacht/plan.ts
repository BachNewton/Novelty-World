/*
 * The yacht's measurements that its hull, its room and its place on the quay share, in the hull's own metres: bow
 * along +x, the quay side +z, y up from the water.
 */

/** The car deck: its floor's height above the water, and the room's length and the hull's lining either side. */
export const CAR_DECK = { floorY: 1.2, ceilingY: 3.8, aftX: -22, foreX: 8, liningZ: 5.6 } as const;
/** The car deck's windows in the hull, both sides: each pane's ends along the hull, and its foot and head above the water. */
export const CAR_DECK_PANES: readonly (readonly [from: number, to: number])[] = [[-17, -11.2], [-11, -5.2], [-5, 0.8], [1, 6.8]];
export const CAR_DECK_GLASS = { lowY: 1.95, highY: 3.3 } as const;
/** The shell door on the quay side, along the hull, and the passerelle from its sill to the quay. */
export const SHELL_DOOR = { fromX: -21.2, toX: -18.2, highY: 3.65 } as const;
/** Where the passerelle lands, out from the yacht's middle: the quay at its berth, measured on the island's ground. */
export const PASSERELLE_END = { z: 11.3, y: 1.95 } as const;
