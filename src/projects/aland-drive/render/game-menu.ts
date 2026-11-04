/*
 * The game menu, as the game wants it: which items it holds, in order, and
 * whether opening it stops the drive. The game works it out each time the
 * menu opens, and the page draws each item by its id.
 */

/** Something the game menu can offer. Resume closes it. */
export type MenuItemId = "resume" | "sound";

export interface GameMenu {
  /** Resume first: the menu opens on it. */
  items: readonly MenuItemId[];
  /** Whether the drive stops while the menu is open. When it doesn't, the clock and the cars run on and the car's controls let go. */
  pauses: boolean;
}

/** The menu while just driving. */
export const DRIVING_MENU: GameMenu = { items: ["resume", "sound"], pauses: true };
