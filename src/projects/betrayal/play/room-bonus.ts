import { explorerOfToken, isExplorerToken } from "../engine/describe";
import type { Engine } from "../engine/step-loop";
import type { GameView } from "../engine/view";
import type { FigureId, RoomTile, Edge, Trait } from "../types";

/*
 * Room bonuses, as the presentation sees them: a room whose bonus each
 * explorer may take once a game by ending a turn there (the Gymnasium's
 * Speed). The engine marks a bonus taken with the explorer's token in the
 * room; the screen never shows that token as a thing on the floor, but as
 * the room's badge, lit for an explorer who can still take it and dim with
 * a tick once they have, and as a row on each explorer's sheet. Which rooms
 * give a bonus, and in what, is the rules' data (a room behaviour's
 * `bonus`), never a list kept here.
 */

export interface BonusRoom {
  room: string;
  /** The traits it gains 1 in: one, or the explorer's pick of several. */
  traits: readonly Trait[];
}

/** Every room giving a bonus in the game's sets, in the catalog's order. */
export function bonusRooms(engine: Engine, view: Pick<GameView, "sets">): BonusRoom[] {
  return Object.values(engine.catalog.rooms).flatMap((room): BonusRoom[] => {
    const bonus = engine.behaviours.rooms[room.id]?.bonus;
    return bonus && view.sets.includes(room.set) ? [{ room: room.id, traits: bonus.traits }] : [];
  });
}

/** The bonus a room gives, or null for a room without one. */
export function bonusOf(engine: Engine, room: string): BonusRoom | null {
  const bonus = engine.behaviours.rooms[room]?.bonus;
  return bonus ? { room, traits: bonus.traits } : null;
}

/** The explorers who have taken a room's bonus, in seat order: those whose token lies in it. */
export function bonusTakers(engine: Engine, view: Pick<GameView, "tokens" | "figures">, room: string): FigureId[] {
  return view.tokens
    .filter((token) => token.room === room && isExplorerToken(token.token))
    .map((token) => explorerOfToken(engine, view, token.token))
    .sort((a, b) => (a.owner ?? 0) - (b.owner ?? 0))
    .map((figure) => figure.id);
}

/** A bonus for one explorer: still theirs to take, taken, or in a room not yet discovered. */
export type BonusState = "available" | "taken" | "undiscovered";

export function bonusState(engine: Engine, view: Pick<GameView, "tokens" | "figures" | "board">, figure: FigureId, room: string): BonusState {
  if (bonusTakers(engine, view, room).includes(figure)) return "taken";
  return view.board.tiles.some((tile) => tile.tile === room) ? "available" : "undiscovered";
}

/** An explorer sheet's Room bonuses row: each bonus room of the game, and what it is to this explorer. */
export function bonusRow(engine: Engine, view: Pick<GameView, "sets" | "tokens" | "figures" | "board">, figure: FigureId): (BonusRoom & { state: BonusState })[] {
  return bonusRooms(engine, view).map((bonus) => ({ ...bonus, state: bonusState(engine, view, figure, bonus.room) }));
}

/** A room's badge: its bonus, who has taken it, and what it is to the explorer whose turn it is (null between turns). */
export interface BonusBadge extends BonusRoom {
  id: string;
  takers: readonly FigureId[];
  state: Exclude<BonusState, "undiscovered"> | null;
  /** Where it lies on the room's floor, in the room's own frame. */
  at: readonly [x: number, z: number];
}

export const badgeId = (room: string) => `bonus:${room}`;

/** How far in from each wall a badge lies, in metres: clear of the doorways in the walls' middles. */
const BADGE_INSET = 1.1;
const CORNERS: readonly (readonly [Edge, Edge])[] = [
  ["top", "left"],
  ["top", "right"],
  ["bottom", "right"],
  ["bottom", "left"],
];
const OFFSET: Record<Edge, readonly [x: number, z: number]> = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };

/** Where a room's badge lies: in the first corner whose two walls have no doorway, or failing that the one with fewest, inset from both walls. */
export function badgeSpot(tile: Pick<RoomTile, "doors" | "passages">, half: number): readonly [x: number, z: number] {
  const doorways = (edge: Edge) => (tile.doors.includes(edge) || tile.passages.includes(edge) ? 1 : 0);
  const [best] = [...CORNERS].sort((a, b) => doorways(a[0]) + doorways(a[1]) - (doorways(b[0]) + doorways(b[1])));
  const reach = half - BADGE_INSET;
  const [one, two] = best.map((edge) => OFFSET[edge]);
  return [(one[0] + two[0]) * reach, (one[1] + two[1]) * reach];
}

/** The badge of every bonus room in the house. */
export function bonusBadges(engine: Engine, view: Pick<GameView, "tokens" | "figures" | "board">, active: FigureId | null, half: number): BonusBadge[] {
  return view.board.tiles.flatMap(({ tile }): BonusBadge[] => {
    const bonus = bonusOf(engine, tile);
    if (!bonus) return [];
    const takers = bonusTakers(engine, view, tile);
    const state = active === null ? null : takers.includes(active) ? "taken" : "available";
    return [{ ...bonus, id: badgeId(tile), takers, state, at: badgeSpot(engine.catalog.rooms[tile], half) }];
  });
}
