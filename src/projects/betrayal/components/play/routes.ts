import type { Target } from "../../art/house-scene";
import type { RoomFloors } from "../../art/placement";
import { floorRead } from "../../art/room-floor";
import type { PlaceTarget } from "../../play/choices";
import { routeRooms } from "../../play/preview";
import { arrivalSpot, type Spots } from "../../play/spots";

/*
 * A move's target as the house draws it, with its route to preview: the
 * route ends on the place the figure would take there, worked out once the
 * route shows (and its room's floor has been read). The walk a committed route plays is the presenter's, from
 * the events the move made.
 */

/** A target as the house draws it: a room or an empty cell to explore,
 *  with its route previewed when focused. A room on another floor shows as the stair its
 *  route takes there, where the room it leaves from has one. */
export function sceneTarget(target: PlaceTarget, spots: Spots, floors: RoomFloors): Target {
  const { preview } = target;
  const side = target.kind === "room" ? target.side : null;
  const route = preview && {
    figure: preview.figure,
    rooms: routeRooms(preview),
    end: () => {
      if (!floorRead(target.room)) return null;
      const spot = arrivalSpot(spots, preview.figure, target.room, side, floors);
      return [spot.x, spot.z] as const;
    },
  };
  return target.kind === "room"
    ? { id: target.id, kind: "room", room: target.room, ...(route ? { route } : {}) }
    : { id: target.id, kind: "explore", ...target.cell, room: target.room, direction: target.direction, ...(route ? { route } : {}) };
}
