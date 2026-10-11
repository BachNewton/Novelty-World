import { placeFigures, type Placed, type RoomFloors } from "../art/placement";
import type { GameView } from "../engine/view";
import type { Edge, FigureId } from "../types";

/*
 * Where each explorer stands in its room: a place on the room's free floor,
 * found by the placement solver (`art/placement.ts`). Places are
 * presentation, not game state: they follow from the sequence of views the
 * screen has shown, so they live with the presenter, never in the engine.
 *
 * A figure keeps its place until it moves; one arriving takes the prime
 * place if it is free, or else the best free floor. At the start of a turn
 * the active explorer steps onto the prime place, and whoever it crowds
 * there steps aside. At the start (or a resume) the active explorer stands
 * on the prime place and the rest follow in turn order.
 */

export interface Spot extends Placed {
  room: string;
  /** In a barrier room, the side it stands on: each side's floor is its own. */
  side: Edge | null;
}

export type Spots = Readonly<Partial<Record<FigureId, Spot>>>;

interface Standing {
  id: FigureId;
  room: string;
  side: Edge | null;
}

const samePlace = (a: { room: string; side: Edge | null }, b: { room: string; side: Edge | null }) => a.room === b.room && a.side === b.side;

/** The explorers standing in the house, in turn order from the seat whose turn it is. */
function standing(view: GameView): Standing[] {
  const seats = view.seats.length;
  const from = view.turn?.seat ?? 0;
  const order = (owner: number | null) => (owner === null ? seats : (owner - from + seats) % seats);
  return Object.values(view.figures)
    .flatMap((figure) => {
      const place = figure.place;
      if (figure.kind !== "explorer" || !figure.alive || place === null) return [];
      return [{ id: figure.id, room: place.room, side: place.side, order: order(figure.owner) }];
    })
    .sort((a, b) => a.order - b.order)
    .map(({ id, room, side }) => ({ id, room, side }));
}

/** The rooms explorers stand in: those whose floors placing them needs. */
export function standingRooms(view: GameView): string[] {
  return [...new Set(standing(view).map((figure) => figure.room))];
}

/** The rooms whose floors are read ahead: every room in the house, and a
 *  room tile waiting to be placed, so its floor is ready by the time anyone
 *  enters it. */
export function aheadRooms(view: GameView): string[] {
  const pending = view.pending;
  const placing = pending?.type === "decision" && (pending.kind === "rotation" || pending.kind === "place-tile") && pending.detail !== null ? (pending.detail.params as { tile: string }).tile : null;
  return [...new Set([...view.board.tiles.map((tile) => tile.tile), ...(placing === null ? [] : [placing])])];
}

/** Spots that figures stand round but never move: the clusters of objects on the floor (`things.ts`). */
export type Fixed = Readonly<Record<string, Spot & { reach: number }>>;

/** Places the figures standing at one place (in turn order), from where those already there stood, round what is fixed there. */
function placeAt(floors: RoomFloors, place: { room: string; side: Edge | null }, ids: readonly FigureId[], before: Spots, stepping: FigureId | null, fixed: Fixed): Map<FigureId, Spot> {
  const { floor, hints } = floors(place.room, place.side);
  const stood = Object.fromEntries(ids.flatMap((id) => {
    const was = before[id];
    return was && samePlace(was, place) ? [[id, was]] : [];
  }));
  const objects = Object.entries(fixed).filter(([, spot]) => spot.room === place.room && (spot.side === null || spot.side === place.side));
  const placement = placeFigures(floor, hints, [...objects.map(([id, spot]) => ({ id, size: "object" as const, reach: spot.reach })), ...ids.map((id) => ({ id, size: "person" as const }))], { ...Object.fromEntries(objects), ...stood }, stepping);
  return new Map(ids.map((id) => [id, { ...placement.figures[id], room: place.room, side: place.side }]));
}

/** The spots of a game first shown: in each room, turn order from the seat whose turn it is. */
export function firstSpots(view: GameView, floors: RoomFloors, fixed: Fixed = {}): Spots {
  return nextSpots({}, view, null, floors, fixed);
}

/** The spots after a view, from the spots before it: figures that stayed
 *  keep theirs, figures that moved are placed where they arrived, and
 *  `stepping` (the explorer whose turn just started) steps onto the prime
 *  place, anyone it crowds there stepping aside. A place no one arrived at
 *  (and no one steps up in) isn't placed again: those there stand still. */
export function nextSpots(before: Spots, view: GameView, stepping: FigureId | null, floors: RoomFloors, fixed: Fixed = {}): Spots {
  const here = standing(view);
  const places = new Map<string, { room: string; side: Edge | null; ids: FigureId[] }>();
  for (const figure of here) {
    const key = `${figure.room}|${figure.side ?? ""}`;
    const place = places.get(key);
    if (place) place.ids.push(figure.id);
    else places.set(key, { room: figure.room, side: figure.side, ids: [figure.id] });
  }
  const placed = new Map<FigureId, Spot>();
  for (const place of places.values()) {
    const changed = place.ids.some((id) => id === stepping || !before[id] || !samePlace(before[id], place));
    const spots = changed ? placeAt(floors, place, place.ids, before, stepping, fixed) : new Map(place.ids.map((id) => [id, before[id] as Spot]));
    for (const [id, spot] of spots) placed.set(id, spot);
  }
  return Object.fromEntries(here.map(({ id }) => [id, placed.get(id)]));
}

/** The spot a figure would take arriving at a place, as things stand. */
export function arrivalSpot(spots: Spots, figure: FigureId, room: string, side: Edge | null, floors: RoomFloors, fixed: Fixed = {}): Spot {
  const was = spots[figure];
  if (was && samePlace(was, { room, side })) return was;
  const there = Object.entries(spots).flatMap(([id, spot]) => (spot && id !== figure && samePlace(spot, { room, side }) ? [id] : []));
  const spot = placeAt(floors, { room, side }, [...there, figure], spots, null, fixed).get(figure);
  if (!spot) throw new Error(`${figure} wasn't placed in ${room}`);
  return spot;
}
