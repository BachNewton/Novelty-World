import type { Catalog, Explorer, GameState, Trait } from "../types";

export const TRAITS: readonly Trait[] = [
  "speed",
  "might",
  "sanity",
  "knowledge",
];
export const PHYSICAL: readonly Trait[] = ["might", "speed"];
export const MENTAL: readonly Trait[] = ["sanity", "knowledge"];

export function explorerAt(state: GameState, seat: number): Explorer {
  const explorer = state.explorers.find((e) => e.seat === seat);
  if (!explorer) throw new Error(`Seat ${seat} has no explorer`);
  return explorer;
}

export function traitValue(
  catalog: Catalog,
  state: GameState,
  seat: number,
  trait: Trait,
): number {
  const explorer = explorerAt(state, seat);
  return catalog.characters[explorer.character].tracks[trait][
    explorer.clips[trait]
  ];
}

/** Moves a trait's clip by spaces. Before the haunt a clip stops at the track's lowest
 *  value (p. 5), and it never passes the highest. A gain from a card past the
 *  maximum is noted against that card, and a loss from that card takes the
 *  noted spaces first (p. 11). Returns the spaces the clip actually moved. */
export function moveClip(
  catalog: Catalog,
  state: GameState,
  seat: number,
  trait: Trait,
  spaces: number,
  card: string | null,
): number {
  const explorer = explorerAt(state, seat);
  const top = catalog.characters[explorer.character].tracks[trait].length - 1;
  const before = explorer.clips[trait];
  let change = spaces;
  if (card !== null && change < 0) {
    const noted = explorer.overTop.find(
      (o) => o.card === card && o.trait === trait,
    );
    if (noted) {
      const absorbed = Math.min(noted.spaces, -change);
      noted.spaces -= absorbed;
      change += absorbed;
      explorer.overTop = explorer.overTop.filter((o) => o.spaces > 0);
    }
  }
  const after = Math.min(Math.max(before + change, 0), top);
  const over = before + change - top;
  if (card !== null && over > 0) {
    const noted = explorer.overTop.find(
      (o) => o.card === card && o.trait === trait,
    );
    if (noted) noted.spaces += over;
    else explorer.overTop.push({ card, trait, spaces: over });
  }
  explorer.clips[trait] = after;
  return after - before;
}
