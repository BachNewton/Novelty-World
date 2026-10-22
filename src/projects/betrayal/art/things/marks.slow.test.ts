import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import type { Edge } from "../../types";
import { stubCanvas } from "../headless";
import { intrusions, MARK_TOP } from "../overlap";
import { placementHints } from "../room-floor";
import { primePlaces, type RoomDefinition } from "../room";
import { BENCH_ROOMS } from "../rooms";
import { roomTile } from "../stage";
import { floorSpot, MARK_ICON, markSpot } from "./mark-spot";
import { FLOOR_MARK_REACH, FLOOR_MARKS, floorMark, WALL_MARKS, wallMark } from "./marks";

/*
 * Every connection mark, put on every wall and into every corner of every
 * built room (and anywhere, as a mark the game puts on no wall), and every
 * floor mark on each room's free floor, as the house places them: none may
 * pass into the room, and every icon must stand on clear floor. Where a
 * wall has no clear stretch the art gives way, as designed, and only the
 * icon is checked. The marks' spots are read off a grid of the built room,
 * so this checks that reading against the room's exact geometry, and the
 * art against its footprint.
 * It builds each room once, which is most of its cost (about 13 s across
 * the rooms, measured): the price of catching any room's art changing
 * under the marks, which no test on a stand-in floor can.
 */

const WALLS: (readonly Edge[] | null)[] = [["top"], ["right"], ["bottom"], ["left"], ["top", "right"], ["right", "bottom"], ["bottom", "left"], ["left", "top"], null];

/** The floor an icon's plate stands on, up to the height that hides a mark: a solid the check can test. */
function iconFoot(at: readonly [number, number]): THREE.Mesh {
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(MARK_ICON.radius, MARK_ICON.radius, MARK_TOP - 0.1, 12), new THREE.MeshBasicMaterial());
  foot.position.set(at[0], 0.1 + (MARK_TOP - 0.1) / 2, at[1]);
  return foot;
}

/** The sides a mark may lie on: each half of a barrier room, or the whole room. */
const sidesOf = (def: RoomDefinition): (Edge | null)[] => (primePlaces(def).length > 1 ? roomTile(def.id).doors.filter((edge): edge is Edge => edge !== roomTile(def.id).frontDoor) : [null]);

beforeAll(() => {
  stubCanvas();
});

describe("connection marks in every built room", () => {
  it.each(BENCH_ROOMS.map((def) => [def.id, def] as const))("stand clear of everything in the %s", (_id, def) => {
    const tile = roomTile(def.id);
    const found = intrusions(def, (plan) =>
      sidesOf(def).flatMap((side) => {
        const room = { floor: plan, hints: placementHints(def, side) };
        const onWalls = WALL_MARKS.flatMap((kind) =>
          WALLS.map((wall) => {
            const spot = markSpot(room, tile, kind, wall);
            const where = `${kind} on ${wall === null ? "any wall" : wall.join("-")}${side ? ` (${side} side)` : ""}`;
            return { name: where, object: new THREE.Group().add(wallMark(kind, "moonLight", spot, "ink", tile.outside), iconFoot(spot.icon)) };
          }),
        );
        const onFloor = FLOOR_MARKS.map((kind) => ({ name: `${kind}${side ? ` (${side} side)` : ""}`, object: floorMark(kind, "moonLight", floorSpot(room, FLOOR_MARK_REACH[kind]), "ink") }));
        return [...onWalls, ...onFloor];
      }),
    );
    expect(found.map(({ piece, into, depth }) => `${piece} passes ${(depth * 100).toFixed(1)} cm into ${into}`)).toEqual([]);
  });
});
