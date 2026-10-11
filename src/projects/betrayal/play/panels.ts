import type { GameView } from "../engine/view";

/*
 * Which part of the status box answers what is pending for the seat holding
 * the device. Every decision of the game before the haunt has a part of its
 * own, and the reveal owns the haunt's ready wait; the old debug panel
 * answers only what nothing else does yet (the game's end, and a haunt not
 * built yet stopping the game), and a test holds that a game played through
 * its exploration and up to its reveal never needs it.
 */

export type BoxPart =
  /** The turn: places in the house, its actions as buttons, End turn. */
  | "turn"
  /** A room tile to place, as a ghost in the house. */
  | "ghost"
  /** A roll the holder decides about, before or after it is made. */
  | "roll"
  /** Damage the holder takes, on its stat tracks. */
  | "damage"
  /** Any other question: its choices as buttons, with the card that asks it. */
  | "choices"
  /** The haunt's reveal: its halves to read, and every seat's Ready. */
  | "reveal"
  /** The old debug panel. */
  | "debug";

const PARTS: Readonly<Record<string, BoxPart>> = {
  turn: "turn",
  rotation: "ghost",
  "place-tile": "ghost",
  "roll-before": "roll",
  "roll-after": "roll",
  "split-damage": "damage",
  "damage-kind": "damage",
};

export function boxPart(view: GameView): BoxPart {
  const pending = view.pending;
  if (pending?.type === "ready" && view.haunt !== null) return "reveal";
  if (pending?.type !== "decision" || pending.detail === null || pending.detail.answer !== null) return "debug";
  return PARTS[pending.kind] ?? "choices";
}
