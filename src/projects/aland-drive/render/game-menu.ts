import type { ChallengeKind } from "../challenge/types";

/*
 * The game menu, as the game wants it: which items it holds, in order, and
 * whether opening it stops the drive. The game works it out each time the
 * menu opens, and the page draws each item by its id. After a challenge's
 * attempt it is the result card: how the attempt went, then Retry and Leave.
 */

/** Something the game menu can offer. Resume closes it. */
export type MenuItemId = "resume" | "sound" | "start-solo" | "retry" | "leave";

/** How an attempt went, as the result card shows it. */
export interface MenuResult {
  passed: boolean;
  kind: ChallengeKind;
  /** The time in seconds or the speed in km/h, null for a Route lost before the finish. */
  result: number | null;
  target: number;
  /** The best kept for this challenge, this attempt included. */
  best: number | null;
}

export interface GameMenu {
  /** The first is where the menu opens. */
  items: readonly MenuItemId[];
  /** What B, Menu and Esc press: Resume, or Leave on a result card. */
  back: MenuItemId;
  /** Whether the drive stops while the menu is open. When it doesn't, the clock and the cars run on and the car's controls let go. */
  pauses: boolean;
  /** The challenge the items are about: the one whose start the car is in, or the one being played. */
  challenge?: string;
  result?: MenuResult;
}

/** The menu while just driving. */
export const DRIVING_MENU: GameMenu = { items: ["resume", "sound"], back: "resume", pauses: true };
