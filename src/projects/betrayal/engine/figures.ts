import type {
  Catalog,
  Figure,
  FigureDefinition,
  FigureId,
  FigureTraits,
  GameState,
  Place,
  Trait,
} from "../types";

export const TRAITS: readonly Trait[] = [
  "speed",
  "might",
  "sanity",
  "knowledge",
];
export const PHYSICAL: readonly Trait[] = ["might", "speed"];
export const MENTAL: readonly Trait[] = ["sanity", "knowledge"];

export function figureOf(state: GameState, id: FigureId): Figure {
  if (!(id in state.figures)) throw new Error(`There is no figure ${id}`);
  return state.figures[id];
}

/** Every figure, in a stable order: by owning seat in table order, figures
 *  no seat owns last, then by id. The order never depends on how the state's
 *  keys were stored. */
export function allFigures(state: GameState): Figure[] {
  const rank = (f: Figure) => f.owner ?? Number.MAX_SAFE_INTEGER;
  return Object.values(state.figures).sort(
    (a, b) => rank(a) - rank(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** The seat's own explorer, for the rules that mean exactly that. A seat
 *  may have none. It reads only the figures' kinds and owners, so it serves
 *  a game state and a seat's view alike. */
export function explorerOf(
  game: { figures: Record<FigureId, Pick<Figure, "id" | "kind" | "owner">> },
  seat: number,
): FigureId | null {
  return (
    Object.values(game.figures)
      .filter((f) => f.kind === "explorer" && f.owner === seat)
      .map((f) => f.id)
      .sort()
      .at(0) ?? null
  );
}

/** The seat's own explorer, where every seat has one. */
export function seatExplorer(state: GameState, seat: number): FigureId {
  const id = explorerOf(state, seat);
  if (id === null) throw new Error(`Seat ${seat} has no explorer`);
  return id;
}

/** Every seat's living explorer in table order, starting with the seat
 *  that owns this figure and passing left. A dead explorer takes no further
 *  part (p. 16). */
export function explorersFrom(state: GameState, id: FigureId): FigureId[] {
  const start = figureOf(state, id).owner;
  if (start === null) throw new Error(`${id} has no seat to pass left from`);
  const count = state.seats.length;
  return state.seats.flatMap((_seat, i) => {
    const explorer = explorerOf(state, (start + i) % count);
    return explorer !== null && figureOf(state, explorer).alive ? [explorer] : [];
  });
}

/** Where a figure on the board is. */
export function placeOf(state: GameState, id: FigureId): Place {
  const place = figureOf(state, id).place;
  if (place === null) throw new Error(`${id} isn't on the board`);
  return place;
}

/** The room a figure on the board is in. */
export function roomOf(state: GameState, id: FigureId): string {
  return placeOf(state, id).room;
}

/** Puts a figure in a place, with every token that follows it. */
export function putFigure(state: GameState, id: FigureId, place: Place): void {
  figureOf(state, id).place = { room: place.room, side: place.side };
  for (const token of state.tokens)
    if (token.holder === id) token.room = place.room;
}

/** Whether two figures are together: in one room, and on one side of a
 *  barrier room. Figures on opposite sides can't interact at all (p. 7). */
export function together(a: Figure, b: Figure): boolean {
  return (
    a.place !== null &&
    b.place !== null &&
    a.place.room === b.place.room &&
    a.place.side === b.place.side
  );
}

/** What a figure is, from the catalogue's figure definitions. */
export function figureDefinition(
  catalog: Catalog,
  state: GameState,
  id: FigureId,
): FigureDefinition {
  const definition = figureOf(state, id).definition;
  if (!(definition in catalog.figures))
    throw new Error(`There is no figure definition ${definition}`);
  return catalog.figures[definition];
}

/** Whether a figure takes damage on its traits: an explorer, whose traits
 *  are clips on tracks. A figure with fixed traits (a monster) has nothing
 *  to take it on, and is stunned instead (p. 18). */
export function takesDamage(
  catalog: Catalog,
  state: GameState,
  id: FigureId,
): boolean {
  return figureDefinition(catalog, state, id).traits.kind === "tracks";
}

/** A figure's traits as it comes into play: on tracks, each clip at its
 *  starting position, or its definition's fixed values. */
export function startingTraits(definition: FigureDefinition): FigureTraits {
  const source = definition.traits;
  if (source.kind === "fixed") return { kind: "fixed" };
  return {
    kind: "track",
    clips: Object.fromEntries(
      TRAITS.map((t) => [t, source.start[t]]),
    ) as Record<Trait, number>,
    overTop: [],
  };
}

/** A figure's tracks and its clips on them, for the rules that move clips. A
 *  figure with fixed traits has no clips to move. */
export function trackTraits(
  catalog: Catalog,
  state: GameState,
  id: FigureId,
): {
  tracks: Record<Trait, number[]>;
  start: Record<Trait, number>;
  live: Extract<FigureTraits, { kind: "track" }>;
} {
  const source = figureDefinition(catalog, state, id).traits;
  const live = figureOf(state, id).traits;
  if (source.kind !== "tracks" || live.kind !== "track")
    throw new Error(`${id}'s traits aren't on tracks`);
  return { tracks: source.tracks, start: source.start, live };
}

/** Moves a trait's clip by spaces. A clip stops at the track's lowest value
 *  and never passes the highest; whether going past the lowest means death
 *  is the caller's to ask (p. 5). A gain from a card past the maximum is
 *  noted against that card, and a loss from that card takes the noted spaces
 *  first (p. 11). Returns the spaces the clip actually moved, and whether the
 *  change would have taken it to the skull. */
export function moveClip(
  catalog: Catalog,
  state: GameState,
  id: FigureId,
  trait: Trait,
  spaces: number,
  card: string | null,
): { spaces: number; skull: boolean } {
  const { tracks, live: traits } = trackTraits(catalog, state, id);
  const top = tracks[trait].length - 1;
  const before = traits.clips[trait];
  let change = spaces;
  if (card !== null && change < 0) {
    const noted = traits.overTop.find(
      (o) => o.card === card && o.trait === trait,
    );
    if (noted) {
      const absorbed = Math.min(noted.spaces, -change);
      noted.spaces -= absorbed;
      change += absorbed;
      traits.overTop = traits.overTop.filter((o) => o.spaces > 0);
    }
  }
  const after = Math.min(Math.max(before + change, 0), top);
  const over = before + change - top;
  if (card !== null && over > 0) {
    const noted = traits.overTop.find(
      (o) => o.card === card && o.trait === trait,
    );
    if (noted) noted.spaces += over;
    else traits.overTop.push({ card, trait, spaces: over });
  }
  traits.clips[trait] = after;
  return { spaces: after - before, skull: before + change < 0 };
}

/** A figure's name: its definition's, and for one of several numbered
 *  from it (a haunt's monsters), its number too ("Nightmare 2"). */
export function figureName(
  catalog: Catalog,
  state: GameState,
  id: FigureId,
): string {
  const { definition } = figureOf(state, id);
  const { name } = figureDefinition(catalog, state, id);
  return id.startsWith(`${definition}-`)
    ? `${name} ${id.slice(definition.length + 1)}`
    : name;
}
