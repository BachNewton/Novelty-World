import * as THREE from "three";
import type { Edge } from "../../types";
import type { PaletteKey } from "../palette";
import { CUT_HEIGHT, INNER, WAINSCOT_DEPTH, WAINSCOT_HEIGHT, WALL_HEIGHT, type PropPlacement, type Surface } from "../room";
import { box, flat, group, textured } from "../shapes";

/*
 * A block of solid wall standing inside a tile, so a room can take a shape
 * the square tile doesn't have: a cross of corridors, a narrow passage. It is
 * built as the stage builds a wall, dressed with skirting, wainscot, chair
 * rail and crown wherever it faces the room, and it cuts as a wall does: a
 * base no taller than the cut height stays, and the rest hides whenever any
 * wall it stands against is cut.
 */

/** A side of a mass, by the way its face looks. */
export type MassSide = "-x" | "+x" | "-z" | "+z";

export interface WallMassOptions {
  /** Its extent in room metres; an end at ±`INNER` stands against that wall. */
  x: [number, number];
  z: [number, number];
  /** The walls it stands against: its part above the cut height hides when any of them is cut. */
  walls: Edge[];
  wall: Surface;
  wainscot?: Surface;
  trim: PaletteKey;
  /** The sides that get the wall's dressing; by default every side not against a wall. */
  dressed?: MassSide[];
  /** Where it starts, for a lintel over an opening; from the floor by default. */
  from?: number;
  /** What the overlap check and the close-ups call its two parts. */
  name: string;
}

/** How far a mass reaches into the wall it stands against, so no crack shows between them. */
const INTO_WALL = 0.005;
/** The base's top, a little under the cut wall's, so the two never fight where they meet. */
const BASE_TOP = CUT_HEIGHT - 0.004;
const TOP = WALL_HEIGHT - 0.01;
const SKIRTING = { height: 0.16, depth: 0.05 };
const RAIL = { height: 0.05, depth: 0.05, y: WAINSCOT_HEIGHT - 0.03 };
const CROWN = { height: 0.12, depth: 0.06 };

interface Strip {
  y0: number;
  y1: number;
  depth: number;
  material: THREE.Material;
}

/** A strip of dressing along one side of a box, between two heights, wrapping
 *  round its free corners and stopping at the walls. Built in room metres. */
function strip(side: MassSide, [x0, x1]: [number, number], [z0, z1]: [number, number], { y0, y1, depth, material }: Strip): THREE.Mesh {
  const atWall = (value: number) => Math.abs(value) >= INNER - 1e-6;
  const reach = (from: number, to: number): [number, number] => [atWall(from) ? from : from - depth, atWall(to) ? to : to + depth];
  if (side === "-z" || side === "+z") {
    const [a, b] = reach(x0, x1);
    const face = side === "-z" ? z0 - depth / 2 : z1 + depth / 2;
    return box([b - a, y1 - y0, depth], material, [(a + b) / 2, y0, face]);
  }
  const [a, b] = reach(z0, z1);
  const face = side === "-x" ? x0 - depth / 2 : x1 + depth / 2;
  return box([depth, y1 - y0, b - a], material, [face, y0, (a + b) / 2]);
}

/** A block of wall inside the tile, as two placements: its base, and its part above the cut height. */
export function wallMass({ x, z, walls, wall, wainscot, trim, dressed, from = 0, name }: WallMassOptions): PropPlacement[] {
  const into = (value: number) => (Math.abs(value) >= INNER - 1e-6 ? value + Math.sign(value) * INTO_WALL : value);
  const body: { x: [number, number]; z: [number, number] } = { x: [into(x[0]), into(x[1])], z: [into(z[0]), into(z[1])] };
  const free: MassSide[] = dressed ?? (["-x", "+x", "-z", "+z"] as const).filter((side) => {
    const value = { "-x": x[0], "+x": x[1], "-z": z[0], "+z": z[1] }[side];
    return Math.abs(value) < INNER - 1e-6;
  });

  /** The block and its dressing between two heights, in room metres. */
  const slice = (y0: number, y1: number): THREE.Object3D[] => {
    if (y1 <= y0) return [];
    const [w, d] = [body.x[1] - body.x[0], body.z[1] - body.z[0]];
    const cap = flat("soot");
    const plaster = textured(wall());
    const block = box([w, y1 - y0, d], [plaster, plaster, cap, cap, plaster, plaster], [(body.x[0] + body.x[1]) / 2, y0, (body.z[0] + body.z[1]) / 2]);
    const parts: THREE.Object3D[] = [block];
    const band = (strips: Strip[]) => {
      for (const { y0: a, y1: b, ...rest } of strips) {
        const [lo, hi] = [Math.max(a, y0), Math.min(b, y1)];
        if (hi - lo > 0.001) for (const side of free) parts.push(strip(side, x, z, { y0: lo, y1: hi, ...rest }));
      }
    };
    const trimMaterial = flat(trim);
    const panels = wainscot ? textured(wainscot()) : null;
    band([
      ...(from === 0 ? [{ y0: 0, y1: SKIRTING.height, depth: SKIRTING.depth, material: trimMaterial }] : []),
      ...(panels ? [{ y0: from, y1: WAINSCOT_HEIGHT, depth: WAINSCOT_DEPTH, material: panels }] : []),
      ...(panels ? [{ y0: RAIL.y, y1: RAIL.y + RAIL.height, depth: RAIL.depth, material: trimMaterial }] : []),
      { y0: TOP - CROWN.height, y1: TOP, depth: CROWN.depth, material: trimMaterial },
    ]);
    return parts;
  };

  const placements: PropPlacement[] = [];
  if (from < BASE_TOP) placements.push({ build: () => group(...slice(from, BASE_TOP)), name, at: [0, 0] });
  placements.push({
    build: () => {
      // Built in room metres from the floor up, so its textures carry on from the base's, then lowered onto its placement.
      const upper = group(...slice(Math.max(from, BASE_TOP - 0.001), TOP));
      upper.position.y = -CUT_HEIGHT;
      return group(upper);
    },
    name: `${name} above`,
    at: [0, 0],
    y: CUT_HEIGHT,
    walls,
  });
  return placements;
}

/** The four corners of a tile filled with wall, leaving a cross of corridors
 *  `arm` metres either side of the middle, each running to a door. */
export function crossCorners({ arm, ...surfaces }: { arm: number } & Pick<WallMassOptions, "wall" | "wainscot" | "trim">): PropPlacement[] {
  const corners: [Edge, Edge, number, number][] = [
    ["top", "left", -1, -1],
    ["top", "right", 1, -1],
    ["bottom", "right", 1, 1],
    ["bottom", "left", -1, 1],
  ];
  return corners.flatMap(([end, side, sx, sz]) =>
    wallMass({
      ...surfaces,
      x: sx < 0 ? [-INNER, -arm] : [arm, INNER],
      z: sz < 0 ? [-INNER, -arm] : [arm, INNER],
      walls: [end, side],
      name: `${end}-${side} corner`,
    }),
  );
}
