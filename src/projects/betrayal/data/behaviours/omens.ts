import { gain } from "../../engine/effects";
import type { Behaviour } from "../../engine/sources";

/** Omen cards, from content/cards/omens.md. Every omen also triggers the haunt roll, which the engine makes. */
export const OMENS: Record<string, Behaviour> = {
  book: {
    onGain: (_state, seat) => [
      gain(seat, "knowledge", 2, { source: "card", card: "book" }, "book"),
    ],
    onLose: (_state, seat) => [
      gain(seat, "knowledge", -2, { source: "card", card: "book" }, "book"),
    ],
  },
};
