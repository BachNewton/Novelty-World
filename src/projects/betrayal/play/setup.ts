import type { Character } from "../types";

/*
 * Choosing seats' characters at setup, by touch, mouse or a pad: one
 * character per card, so a character whose card another seat has is taken.
 */

export interface SeatChoice {
  character: string;
}

/** The seat whose character shares this character's card, or null when it is free for `seat`. */
export function takenBy(characters: readonly Character[], seats: readonly SeatChoice[], seat: number, character: string): number | null {
  const card = characters.find((c) => c.id === character)?.card;
  const other = seats.findIndex((s, i) => i !== seat && characters.find((c) => c.id === s.character)?.card === card);
  return other === -1 ? null : other;
}
