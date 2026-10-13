import type { Target } from "../../art/house-scene";
import type { RoomFloors } from "../../art/placement";
import { onWall } from "../../art/room";
import { floorRead } from "../../art/room-floor";
import { MOOD_COLOUR } from "../../art/things/looks";
import { ENGINE } from "../../game";
import type { PlaceTarget } from "../../play/choices";
import { routeRooms } from "../../play/preview";
import { arrivalSpot, type Fixed, type Spots } from "../../play/spots";
import { clusterId, tokenMood, wallSpot } from "../../play/things";

/*
 * A move's target as the house draws it, with its route to preview: the
 * route ends on the place the figure would take there, worked out once the
 * route shows (and its room's floor has been read). The walk a committed route plays is the presenter's, from
 * the events the move made.
 */

/** A target as the house draws it: a room (or one side of it) or an empty
 *  cell to explore, with its route previewed when focused; a wall or corner
 *  of a room, with the token going there; a figure. A room on another floor
 *  shows as the stair its route takes there, where the room it leaves from has one. */
export function sceneTarget(target: PlaceTarget, spots: Spots, floors: RoomFloors, objects: Fixed = {}): Target {
  if (target.kind === "figure") return { id: target.id, kind: "figure", figure: target.figure };
  if (target.kind === "wall") {
    const preview = target.token === null ? null : { token: target.token, colour: MOOD_COLOUR[tokenMood(ENGINE, target.token)] };
    return { id: target.id, kind: "wall", room: target.room, wall: target.wall, preview };
  }
  if (target.kind === "through") return throughTarget(target, spots, floors, objects);
  const { preview } = target;
  const side = target.kind === "room" ? target.side : null;
  const route = preview && {
    figure: preview.figure,
    rooms: routeRooms(preview),
    end: () => {
      if (!floorRead(target.room)) return null;
      const spot = arrivalSpot(spots, preview.figure, target.room, side, floors, objects);
      return [spot.x, spot.z] as const;
    },
  };
  return target.kind === "room"
    ? { id: target.id, kind: "room", room: target.room, side, ...(route ? { route } : {}) }
    : { id: target.id, kind: "explore", ...target.cell, room: target.room, direction: target.direction, ...(route ? { route } : {}) };
}

/** Going through a connection, as the room it comes out in, with its route
 *  through the connection's mark: on its wall, or where it lies on its
 *  room's floor (in the room's cluster). */
function throughTarget(target: Extract<PlaceTarget, { kind: "through" }>, spots: Spots, floors: RoomFloors, objects: Fixed): Target {
  const { through } = target;
  const at = (): readonly [number, number] | null => {
    if (through.wall.length > 0) {
      const spot = wallSpot(through.wall);
      return onWall(spot.edge, spot.along).at;
    }
    const cluster = objects[clusterId(through.room, null)] as Fixed[string] | undefined;
    return cluster ? [cluster.x, cluster.z] : null;
  };
  const route = {
    figure: target.figure,
    rooms: [target.from, target.room],
    via: { room: through.room, at },
    end: () => {
      if (!floorRead(target.room)) return null;
      const spot = arrivalSpot(spots, target.figure, target.room, null, floors, objects);
      return [spot.x, spot.z] as const;
    },
  };
  return { id: target.id, kind: "room", room: target.room, side: null, route };
}
