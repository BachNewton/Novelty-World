import type { Outline } from "./brands";
import type { Shell } from "./shell";

/*
 * The delivery hall's shape, shared by the building and its room, so the room's glass stands where the building's
 * does. In the exterior model's own metres: the hall runs along x, its glass front at z 0 faces the harbour (+z, the
 * street side), and the back of house stands behind it.
 */

/** The hall's outer walls and its roof's underside; its floor stands on a plinth. */
export const HALL = { x0: -20, x1: 20, z0: -20, z1: 0, floorY: 0.15, roofY: 8.6 } as const;
/** How thick a wall is: the room's faces stand this far inside the building's. */
export const WALL_M = 0.3;
/** The back of house, a low dark block behind the hall. */
export const BACK = { x0: -18.5, x1: 18.5, z0: -27, top: 5.8 } as const;
/**
 * The granite podium the hall stands on, its top the terrace in front of the glass: Västerhamn's sand terrace falls to
 * the terminal's road in front and northwards, so the podium shows where the ground is low and meets it at the south.
 */
export const PODIUM = { x0: -25, x1: 21.5, z0: BACK.z0 - 1.2, z1: 8, sink: -5 } as const;
/** The broad stair from the terrace down to the road, either side of x 0. */
export const STAIR = { half: 3, rise: 0.16, run: 0.32, foot: -4.6 } as const;
/** The ramp from the drive-out door down to the ground north of the podium: how far it runs and how far it falls. */
export const RAMP = { long: 11, drop: 1.9 } as const;
/** The way cars leave: a glazed door in the hall's -x end, towards the terminal, between these z, this tall over the floor. */
export const DRIVE_OUT = { z0: -13, z1: -7, tall: 4.6 } as const;
/** The way people come in: a glass door in the front, either side of x 0. */
export const DOOR_HALF_M = 1.2;
/** The front glass's bars: a mullion every this many metres, and the transom's height over the floor. */
export const MULLION_EVERY_M = 4;
export const TRANSOM_M = 4;

/** The importer's mark: a hull on a line of sea, in a rounded square. */
const SQUARE: Outline = [[-1, -0.8], [-0.8, -1], [0.8, -1], [1, -0.8], [1, 0.8], [0.8, 1], [-0.8, 1], [-1, 0.8]];
const HULL: Outline = [[-0.62, 0.02], [0.66, 0.02], [0.48, -0.32], [-0.5, -0.32]];
const BRIDGE: Outline = [[-0.2, 0.02], [0.3, 0.02], [0.3, 0.32], [-0.2, 0.32]];
const SEA: Outline = [[-0.72, -0.5], [0.72, -0.5], [0.72, -0.42], [-0.72, -0.42]];

/** The mark, facing +z, centred, as big as `radius`; its ink stands a little proud of its ground. */
export function importMark(s: Shell, radius: number, glow = 0): void {
  s.outline(SQUARE, radius, 0, "dealer-import", { glow: glow * 0.3 });
  for (const part of [HULL, BRIDGE, SEA]) s.outline(part, radius, Math.max(0.01, radius * 0.02), "dealer-white", { glow });
}
