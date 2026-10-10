import type { Pace } from "../../art/explorers/figure";
import type { Target } from "../../art/house-scene";
import type { GameView } from "../../engine/view";
import type { PlaceTarget } from "../../play/choices";
import { routeRooms } from "../../play/preview";

/*
 * Moves on the play screen: a target as the house draws it, with its route
 * to preview, and the walk a committed route plays once the state has moved
 * on. The state never waits for the walk: the figure is already where the
 * route took it, and the walk only shows how it got there.
 */

/** Where an explorer stands among the explorers in its room, in the order the
 *  screen fills a room's spots: the order of the view's figures. */
export function slotOf(view: GameView, figure: string, room: string): number {
  const here = Object.values(view.figures).filter((other) => other.kind === "explorer" && other.alive && (other.id === figure ? true : other.place?.room === room));
  return Math.max(0, here.findIndex((other) => other.id === figure));
}

/** A target as the house draws it: a room or a doorway, with its route
 *  previewed when focused. A room on another floor shows as the stair its
 *  route takes there, where the room it leaves from has one. */
export function sceneTarget(target: PlaceTarget, view: GameView): Target {
  const { preview } = target;
  const end = target.kind === "room" ? target.room : target.room;
  const route = preview && { figure: preview.figure, rooms: routeRooms(preview), slot: slotOf(view, preview.figure, end) };
  return target.kind === "room"
    ? { id: target.id, kind: "room", room: target.room, ...(route ? { route } : {}) }
    : { id: target.id, kind: "doorway", room: target.room, direction: target.direction, ...(route ? { route } : {}) };
}

/** How a figure crosses the house: before the haunt everyone walks; after it
 *  heroes run and the traitor walks calmly, and while a side is kept secret
 *  everyone runs, so a gait never gives a side away. */
export function paceOf(view: GameView, figure: string): Pace {
  if (view.status !== "haunt") return "walk";
  if (view.seats.some((seat) => seat.secret)) return "run";
  const owner = view.figures[figure].owner;
  return owner !== null && view.seats[owner].side === "traitor" ? "walk" : "run";
}

/** A route committed: who walks it, and the rooms it would walk through. */
export interface RouteWalk {
  figure: string;
  rooms: string[];
}

/** The rooms a committed route's walk goes through, now the state has moved
 *  on: as far as the room the figure stands in, where the route stopped
 *  early (a failed roll to leave), or the whole route, where something carried
 *  the figure on from its end (a room discovered at a doorway). Null when
 *  there is nothing to walk. */
export function walkedRooms(walk: RouteWalk, view: GameView): string[] | null {
  const room = view.figures[walk.figure].place?.room;
  if (room === undefined) return null;
  const at = walk.rooms.lastIndexOf(room);
  const rooms = at === -1 ? walk.rooms : walk.rooms.slice(0, at + 1);
  return rooms.length < 2 ? null : rooms;
}
