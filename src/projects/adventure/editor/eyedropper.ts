import type { Cliff, Face } from "../cliffs";
import { kindAt, terrainOf, type GroundKind, type GroundLayer } from "../ground";
import type { Placement } from "../town";
import type { PaletteEntry } from "./palette";

/**
 * What the eyedropper picks up: whatever is under the pointer, as the editor's
 * way of making more of it. A placed piece is its palette entry, standing as
 * it stands; a ground tile is the brush of its kind, with the tile chosen for
 * it where one is; a cliff is the brush that makes it: its cell's face where
 * the face made it, or else the raise brush in the stone and edge of the
 * raised cell it stands against.
 */
export type Eyedropped =
  | { pick: "piece"; entry: PaletteEntry; turn: number; mirror: boolean; y: number }
  | { pick: "paint"; kind: Exclude<GroundKind, "empty">; tile: string | null }
  | { pick: "raise"; cliff: Cliff }
  | { pick: "face"; face: Face };

/** A piece placed on the map, picked up to place again as it stands. */
export function pieceDropped(p: Placement): Eyedropped {
  return { pick: "piece", entry: { piece: p.piece, texture: p.texture }, turn: (((p.turn ?? 0) % 4) + 4) % 4, mirror: p.mirror === true, y: p.y ?? 0 };
}

/** The pieces each face stands in its cell, at the cell's own level, in place of the plain face. */
const FACE_PIECES: Record<Face, RegExp> = {
  steps: /^cliff_(steps|blockSlopeHalfWalls)_/,
  ramp: /^cliff_blockSlope(Half)?Walls_/,
  cave: /^cliff_cave_/,
  cut: /^cliff_(top)?[dD]iagonal_|^cliff_blockDiagonal_/,
};

type Step = readonly [number, number];
const quarter = ([dx, dz]: Step): Step => [dz, -dx];
const turned = (own: Step, turn: number): Step => {
  let step = own;
  for (let i = 0; i < (((turn % 4) + 4) % 4); i++) step = quarter(step);
  return step;
};

/**
 * The raised cell a cliff piece stands against, as a step from its own cell:
 * a face backs onto the cell at its +z unturned, and a post or an inner corner
 * fills its −x, +z corner; an inner corner takes its stone from the side that
 * comes first round from +x (`cliffs.ts` names it so).
 */
function against(p: Placement): Step {
  const turn = p.turn ?? 0;
  if (!/[cC]orner/.test(p.piece)) return turned([0, 1], turn);
  const [dx, dz] = turned([-1, 1], turn);
  if (!/[iI]nner/.test(p.piece)) return [dx, dz];
  // Going round +x, −z, −x, +z, of two neighbouring sides the first, but +x before +z.
  if (dx > 0) return [dx, 0];
  return dz < 0 ? [0, dz] : [dx, 0];
}

/**
 * A tile or cliff the ground draws, picked up as the brush that makes it; null
 * for a tile on a cell a change has emptied since it was drawn, gone once the
 * change is drawn.
 */
export function groundDropped(ground: GroundLayer, p: Placement): Eyedropped | null {
  const { x, z } = p;
  if (p.piece.startsWith("ground_")) {
    const kind = kindAt(ground, x, z);
    if (kind === "empty") return null;
    return { pick: "paint", kind, tile: (ground.variants[`${x},${z}`] as string | undefined) ?? null };
  }
  const terrain = terrainOf(ground);
  const face = terrain.face(x, z);
  const own = Math.round((p.y ?? 0) * 2) === terrain.level(x, z);
  if (face !== undefined && (face === "cut" || own) && FACE_PIECES[face].test(p.piece)) return { pick: "face", face };
  const [dx, dz] = against(p);
  return { pick: "raise", cliff: terrain.cliff(x + dx, z + dz) };
}
