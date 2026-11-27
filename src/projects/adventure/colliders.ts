/**
 * What the world's pieces are to the players' bodies: each kind of piece is
 * met as a few simple stand-in shapes, measured once from its geometry as
 * fitted to the world, as games collide, never as its own triangles. So a
 * wall is a smooth slab to slide along, a fence a flat-topped bar to run
 * along, a flight of stairs a slope to glide up, and nothing is caught on the
 * edges between triangles or stepped over at every bump.
 *
 * Only what a player would expect to brush through has none: flowers, grass,
 * small plants, mushrooms, leafy crops, lilies on the water and moss trailing
 * down a face. Buildings are solid until they have insides: every door and
 * doorway, and the timber arch a barn's side is built of, is closed across
 * its cell by a box as tall as the piece, so a wide doorway's two halves
 * together close it. The stone arch is a way through a wall, not into a
 * building (the town wall's gate, a ruin's fallen side): it is its pier.
 */

import * as THREE from "three";
import type RAPIER from "@dimforge/rapier3d-compat";
import type { Rapier } from "@/shared/lib/physics/rapier";
import { box, boundsOf, cylinderOf, fitStandIns, hullOf, keeps, lipOf, ring, mergeBoxes, placeShape, shapeDesc, type Box, type Fitting, type Meshes, type Shape, type Walker } from "@/shared/lib/physics/stand-ins";
import { GROUND, heightAt, kindAt, type GroundLayer } from "./ground";
import type { KitPiece } from "./kit";
import { BODY_HEIGHT, BODY_RADIUS, MAX_SLOPE, PASS_MARGIN, SKIN } from "./physics";
import type { Placement } from "./town";

/** How a kind of piece is met: walked through, closed across a doorway, or as its stand-in shapes. */
export type Collider = "none" | "closed" | "solid";

/**
 * Walked through. Pumpkins and melons are solid fruit, and rocks, logs and
 * stumps are solid however low. The leafy crops (corn, wheat, greens, bamboo,
 * carrots, turnips) are pushed through, as a field is.
 */
const WALKED_THROUGH = /^(flower_|grass|plant_|mushroom_|crops_(corn|wheat|leafs|bamboo)|crop_(carrot|turnip)|lily_|hanging_moss)/;

export function colliderOf(piece: KitPiece): Collider {
  if (WALKED_THROUGH.test(piece)) return "none";
  if (piece.includes("door") || piece === "wall-wood-arch") return "closed";
  return "solid";
}

/** The grid a piece is read on: a twentieth of a cell, finer than a fence is thick. */
export const COLUMN = 1 / 20;

/**
 * The body every stand-in is fitted for: the player's capsule (`BODY_RADIUS`,
 * `BODY_HEIGHT`), a gap it passes being as wide as it is, its skin and a
 * margin (`PASS_MARGIN`).
 */
export const WALKER: Walker = { passing: BODY_RADIUS + SKIN + PASS_MARGIN, radius: BODY_RADIUS, height: BODY_HEIGHT + PASS_MARGIN, maxSlope: MAX_SLOPE };

/** How far a stand-in's top may lie from a drawn surface a player stands on: no further than the drawn feet follow the drawn surface (`player-view.ts`), so their feet are seen on it. */
const STANDING = 0.06;
/**
 * How far a climbed piece's slope may lie above its drawn steps: a riser, the
 * Nature Kit's cliff steps' the highest. The drawn feet follow the steps
 * themselves (`player-view.ts`), so a slope over them still reads as steps.
 */
const CLIMBED = 0.32;

/** Climbed: stairs, the Nature Kit's cliff steps and ramps, the town's sloped paving, and bridges, whose ends step up to their decks and whose arches rise and fall. */
const CLIMBED_PIECES = /^(stairs|cliff_steps|cliff_blockSlope|road-slope|road-edge-slope|bridge_)/;
/** No floor: a tree's crown is leaves, and only its trunk is met. */
const NO_FLOOR = /^tree/;

export function fittingOf(piece: KitPiece): Fitting {
  const climbed = CLIMBED_PIECES.test(piece);
  return { climbed, tolerance: NO_FLOOR.test(piece) ? Infinity : STANDING, steps: CLIMBED };
}

/**
 * The kinds whose stand-ins are set by hand, where the rule can't find them:
 * level-design data, each with its reason. A round basin's rim is a ring round
 * its water's face, which no box or hull over the grid's columns follows: so
 * a ring of hulls, three to a quarter of the circle, round a cylinder of water
 * (`fountain-round`), and the bowl standing in the middle of the detailed one
 * a cylinder more. Measured from the pieces: the rim's inside, its top and the
 * water's face, and the bowl's width and top.
 */
const OVERRIDES: Partial<Record<KitPiece, Shape[]>> = {
  "fountain-round": [...ring(0, 0, 0.69, 1, 0, 0.28, 12), { kind: "cylinder", x: 0, z: 0, radius: 0.7, bottom: 0, top: 0.14 }],
  "fountain-round-detail": [
    ...ring(0, 0, 0.69, 1, 0, 0.28, 12),
    { kind: "cylinder", x: 0, z: 0, radius: 0.7, bottom: 0, top: 0.14 },
    { kind: "cylinder", x: 0, z: 0, radius: 0.385, bottom: 0, top: 0.48 },
  ],
};

/**
 * The kinds whose stand-in is one curved shape or hull by what they are, tried
 * first and kept where it keeps the rule: a trunk, a post, a round fruit or
 * pot an upright cylinder, a tree's as wide as its trunk, not its crown; a
 * rock, a log, a boat, a tent or a statue its own hull, round and solid.
 */
const SHAPED: readonly { pieces: RegExp; shapes: (meshes: Meshes) => Shape[] }[] = [
  { pieces: /^tree/, shapes: (m) => [cylinderOf(m, 0.25)] },
  { pieces: /^(lantern|pillar|crop_(pumpkin|melon)|pot_|stump_|cactus|statue_(column|obelisk))/, shapes: (m) => [cylinderOf(m)] },
  { pieces: /^(rock|stone_|log|statue_|canoe|tent_)/, shapes: (m) => [hullOf(m)] },
];

/**
 * A kind's stand-ins in its own frame. A piece no higher than a lip the
 * player's round foot rides over has none: the ground's stand-in holds them,
 * and their drawn feet still follow its surface. Anything not shaped by what
 * it is is fitted to the rule (`fitStandIns`): its surfaces matched where a
 * player stands, its gaps open where they pass, in the fewest shapes.
 */
function measure(piece: KitPiece, meshes: Meshes): Shape[] {
  const kind = colliderOf(piece);
  if (kind === "none") return [];
  const { min, max } = boundsOf(meshes);
  if (kind === "closed") {
    // A wall piece stands along its cell's +x edge: the box is as thick and as tall as the piece, and the cell's whole width.
    return [box([min.x, min.y, -0.5], [max.x, max.y, 0.5])];
  }
  if (max.y - min.y <= lipOf(WALKER)) return [];
  const set = OVERRIDES[piece];
  if (set !== undefined) return set;
  const fitting = fittingOf(piece);
  const shaped = SHAPED.find(({ pieces }) => pieces.test(piece))?.shapes(meshes);
  if (shaped !== undefined && keeps(meshes, shaped, WALKER, fitting, COLUMN)) return shaped;
  return fitStandIns(meshes, WALKER, fitting, COLUMN);
}

const measured = new WeakMap<Meshes, Map<KitPiece, Shape[]>>();

/** A kind's stand-ins, measured once from its meshes as fitted to the world. */
export function shapesOf(piece: KitPiece, meshes: Meshes): Shape[] {
  let byPiece = measured.get(meshes);
  if (byPiece === undefined) {
    byPiece = new Map();
    measured.set(meshes, byPiece);
  }
  let shapes = byPiece.get(piece);
  if (shapes === undefined) {
    shapes = measure(piece, meshes);
    byPiece.set(piece, shapes);
  }
  return shapes;
}

/** The meshes of a piece's file as fitted to the world, each placed in the piece's frame by its `matrixWorld`. */
export type MeshesOf = (piece: KitPiece) => Meshes;

const UP = new THREE.Vector3(0, 1, 0);

/** Where a placement puts its piece: its cell's middle, its height, its turns, and its mirror. */
export function placementMatrix(p: Placement): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(p.x + 0.5, p.y ?? 0, p.z + 0.5),
    new THREE.Quaternion().setFromAxisAngle(UP, ((p.turn ?? 0) * Math.PI) / 2),
    new THREE.Vector3(1, 1, p.mirror === true ? -1 : 1),
  );
}

/** A chunk's placements as stand-in shapes where each placement puts them, the boxes of one height that touch joined into one. */
export function chunkShapes(placements: readonly Placement[], meshesOf: MeshesOf): Shape[] {
  const boxes: Box[] = [];
  const others: Shape[] = [];
  for (const p of placements) {
    if (colliderOf(p.piece) === "none") continue;
    const matrix = placementMatrix(p);
    for (const shape of shapesOf(p.piece, meshesOf(p.piece))) {
      const placed = placeShape(shape, matrix);
      if (placed.kind === "box") boxes.push(placed);
      else others.push(placed);
    }
  }
  return [...mergeBoxes(boxes), ...others];
}

/** Shapes as colliders' descriptions. */
export function descsOf(rapier: Rapier, shapes: readonly Shape[]): RAPIER.ColliderDesc[] {
  return shapes.map((shape) => shapeDesc(rapier, shape));
}

/**
 * The height of the ground's top at the grid's level: the Nature Kit's grass
 * as fitted (`kit-fit.ts`), a hair under the town's y = 0. Paths, dirt and
 * water are met at the same height: a path's sunk bed and a stream's surface
 * are drawn a little lower, and walked across as the grass is, with no lip.
 */
const GROUND_TOP = -0.01;
/** How far under the grid the ground's columns reach. */
const GROUND_FOOT = -1;
/** The side of a chunk of the ground's columns, in cells. */
const GROUND_CHUNK = 5;

/**
 * The ground as boxes standing on the grid, by chunk: each cell with ground a
 * column to its top, at its height, and the columns of one height that touch
 * joined, so a stretch of level ground is one box, with no edge between cells
 * for a body to catch on. A cliff's face stands in the low cells round a rise,
 * as the drawn ground's pieces; the rise itself is its columns.
 */
export function groundShapes(ground: GroundLayer): Map<string, Box[]> {
  const chunks = new Map<string, Box[]>();
  for (let x = GROUND.min; x <= GROUND.max; x++) {
    for (let z = GROUND.min; z <= GROUND.max; z++) {
      if (kindAt(ground, x, z) === "empty") continue;
      const key = `${Math.floor(x / GROUND_CHUNK)},${Math.floor(z / GROUND_CHUNK)}`;
      const top = heightAt(ground, x, z) / 2 + GROUND_TOP;
      const cell = box([x, GROUND_FOOT, z], [x + 1, top, z + 1]);
      const held = chunks.get(key);
      if (held === undefined) chunks.set(key, [cell]);
      else held.push(cell);
    }
  }
  for (const [key, cells] of chunks) chunks.set(key, mergeBoxes(cells));
  return chunks;
}
