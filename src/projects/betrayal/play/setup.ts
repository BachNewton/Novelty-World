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

/** The seats with `seat` moved `step` characters on, round the catalogue, past those taken. */
export function cycleCharacter(characters: readonly Character[], seats: readonly SeatChoice[], seat: number, step: 1 | -1): SeatChoice[] {
  const at = characters.findIndex((c) => c.id === seats[seat].character);
  for (let i = 1; i <= characters.length; i++) {
    const next = characters[(at + step * i + characters.length * 2) % characters.length];
    if (takenBy(characters, seats, seat, next.id) === null) return seats.map((s, j) => (j === seat ? { ...s, character: next.id } : s));
  }
  throw new Error(`No character is free for seat ${seat}`);
}

/** A character's portrait, as the page serves it: shot from the art bench by
 *  `tools/portraits.mjs`, their figure or the pawn in their card's colour. */
export function portraitSrc(character: string): string {
  return `/betrayal/portraits/${character}.jpg`;
}
