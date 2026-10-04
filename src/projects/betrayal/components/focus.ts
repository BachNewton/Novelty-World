import type { Action, Edge, FloorId, GameState, Json } from "../types";
import { doorwaySpot, type Doorway } from "../engine/board";
import type { Choice } from "../engine/step-loop";
import type { TurnChoice } from "../engine/exploration";
import type { PlaceChoice } from "../engine/tiles";

// What the pending decision is about on the board, worked out from the
// choices it offers: the rooms a move can reach, the doorways that can be
// explored, the cells a new room can go on. The board highlights them, and a
// highlight that stands for exactly one choice answers it when clicked.

export interface Offer {
  seat: number;
  choices: Choice[];
}

export interface Spot {
  floor: FloorId;
  x: number;
  y: number;
}

export interface Focus {
  /** Rooms the decision offers, each with its action when one choice leads there. */
  rooms: Map<string, Action | null>;
  doorways: { room: string; direction: Edge; action: Action }[];
  /** Empty cells a room may go on, named by the room. */
  cells: (Spot & { tile: string; action: Action | null })[];
}

export const NO_FOCUS: Focus = { rooms: new Map(), doorways: [], cells: [] };

const isObject = (value: Json): value is { [key: string]: Json } =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function boardFocus(state: GameState, offer: Offer | null): Focus {
  const pending = state.pending;
  if (pending?.type !== "decision" || !offer) return NO_FOCUS;
  const act = (choice: Json): Action => ({
    kind: "choose",
    decision: pending.id,
    seat: offer.seat,
    choice,
  });
  const focus: Focus = { rooms: new Map(), doorways: [], cells: [] };
  const offerRoom = (room: string, choice: Json) => {
    focus.rooms.set(room, focus.rooms.has(room) ? null : act(choice));
  };

  if (pending.kind === "turn") {
    for (const { choice } of offer.choices) {
      const turn = choice as TurnChoice;
      if (turn.act === "move") offerRoom(turn.to, choice);
      if (turn.act === "discover") {
        const room = state.explorers[offer.seat].room;
        focus.doorways.push({
          room,
          direction: turn.direction,
          action: act(choice),
        });
      }
    }
    return focus;
  }

  const params = pending.params as { tile?: string; doorway?: Doorway };
  if (pending.kind === "rotation" && params.tile && params.doorway) {
    const { spot } = doorwaySpot(state.board, params.doorway);
    const only = offer.choices.length === 1 ? offer.choices[0].choice : null;
    focus.cells.push({
      ...spot,
      tile: params.tile,
      action: only === null ? null : act(only),
    });
    return focus;
  }

  if (pending.kind === "place-tile" && params.tile) {
    const tile = params.tile;
    for (const { choice } of offer.choices) {
      if (choice === null) continue;
      const at = choice as PlaceChoice;
      const same = focus.cells.find(
        (c) => c.floor === at.floor && c.x === at.x && c.y === at.y,
      );
      if (same) same.action = null;
      else focus.cells.push({ floor: at.floor, x: at.x, y: at.y, tile, action: act(choice) });
    }
    return focus;
  }

  // Any other decision: a choice that names a room ("to" or "room") points at it.
  for (const { choice } of offer.choices) {
    if (!isObject(choice)) continue;
    const room = typeof choice.to === "string" ? choice.to : choice.room;
    if (typeof room === "string" && state.board.tiles.some((t) => t.tile === room))
      offerRoom(room, choice);
  }
  return focus;
}
