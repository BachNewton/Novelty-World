import type { Action, Edge, FloorId, Json } from "../types";
import { doorwaySpot, type Doorway } from "../engine/board";
import type { TurnChoice } from "../engine/exploration";
import type { PlaceChoice } from "../engine/tiles";
import { viewExplorer, type GameView } from "../engine/view";

// What the pending decision is about on the board, worked out from the
// choices it offers the viewing seat: the rooms a move can reach, the doorways that can be
// explored, the cells a new room can go on. The board highlights them, and a
// highlight that stands for exactly one choice answers it when clicked.

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

export function boardFocus(view: GameView): Focus {
  const pending = view.pending;
  const seat = view.viewer;
  if (pending?.type !== "decision" || pending.detail === null || seat === null)
    return NO_FOCUS;
  const { params, choices } = pending.detail;
  const act = (choice: Json): Action => ({
    kind: "choose",
    decision: pending.id,
    seat,
    choice,
  });
  const focus: Focus = { rooms: new Map(), doorways: [], cells: [] };
  const offerRoom = (room: string, choice: Json) => {
    focus.rooms.set(room, focus.rooms.has(room) ? null : act(choice));
  };

  if (pending.kind === "turn") {
    for (const { choice } of choices) {
      const turn = choice as TurnChoice;
      if (turn.act === "move") offerRoom(turn.to, choice);
      if (turn.act === "discover") {
        const room = viewExplorer(view, seat)?.place?.room;
        if (room === undefined)
          throw new Error(`Seat ${seat} has no explorer on the board to explore from`);
        focus.doorways.push({
          room,
          direction: turn.direction,
          action: act(choice),
        });
      }
    }
    return focus;
  }

  const tileParams = params as { tile?: string; doorway?: Doorway };
  if (pending.kind === "rotation" && tileParams.tile && tileParams.doorway) {
    const { spot } = doorwaySpot(view.board, tileParams.doorway);
    const only = choices.length === 1 ? choices[0].choice : null;
    focus.cells.push({
      ...spot,
      tile: tileParams.tile,
      action: only === null ? null : act(only),
    });
    return focus;
  }

  if (pending.kind === "place-tile" && tileParams.tile) {
    const tile = tileParams.tile;
    for (const { choice } of choices) {
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
  for (const { choice } of choices) {
    if (!isObject(choice)) continue;
    const room = typeof choice.to === "string" ? choice.to : choice.room;
    if (typeof room === "string" && view.board.tiles.some((t) => t.tile === room))
      offerRoom(room, choice);
  }
  return focus;
}
