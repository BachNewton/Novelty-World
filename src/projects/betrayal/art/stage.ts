import * as THREE from "three";
import { ROOMS } from "../data/rooms";
import type { Edge, RoomTile } from "../types";
import type { Gait } from "./explorers/figure";
import { pawn } from "./kit/pawn";
import { animationOf } from "./animate";
import { anchoredLight } from "./light-anchor";
import { MAX_FLICKER, type BakedLight } from "./lighting";
import {
  CUT_HEIGHT,
  DOOR_HEIGHT,
  DOOR_WIDTH,
  FRONT_DOOR_HEIGHT,
  FRONT_DOOR_WIDTH,
  OUTDOOR,
  TILE,
  WAINSCOT_DEPTH,
  WAINSCOT_HEIGHT,
  WALL_HEIGHT,
  WALL_THICKNESS,
  WINDOW_SILL,
  WINDOW_TOP,
  WINDOW_WIDTH,
  wallTurn,
  type PropPlacement,
  type RoomDefinition,
} from "./room";
import type { PaletteKey } from "./palette";
import { batch, box, flat, glow, group, projectUvs, textured } from "./shapes";
import { pixelTexture, textureReady } from "./textures";

export const EDGES: Edge[] = ["top", "right", "bottom", "left"];
/** Baked lights cost load time, not frame time; this bounds the bake. */
const MAX_LIGHTS = 16;

/** Which way each edge's wall faces out of the room. */
export const OUTWARD: Record<Edge, THREE.Vector2> = {
  top: new THREE.Vector2(0, -1),
  right: new THREE.Vector2(1, 0),
  bottom: new THREE.Vector2(0, 1),
  left: new THREE.Vector2(-1, 0),
};

interface Opening {
  kind: "door" | "window";
  centre: number;
  width: number;
  bottom: number;
  top: number;
}

/** A solid rectangle of wall in the wall's own plane: x along it, y up. */
interface Span {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export function roomTile(id: string): RoomTile {
  const tile = ROOMS.find((room) => room.id === id);
  if (!tile) throw new Error(`No room tile with id "${id}"`);
  return tile;
}

function openings(tile: RoomTile, edge: Edge): Opening[] {
  const result: Opening[] = [];
  const door = tile.doors.includes(edge);
  if (door) {
    const front = tile.frontDoor === edge;
    result.push({ kind: "door", centre: 0, width: front ? FRONT_DOOR_WIDTH : DOOR_WIDTH, bottom: 0, top: front ? FRONT_DOOR_HEIGHT : DOOR_HEIGHT });
  }
  if (tile.windows.includes(edge)) {
    result.push({ kind: "window", centre: door ? 1.7 : 0, width: WINDOW_WIDTH, bottom: WINDOW_SILL, top: WINDOW_TOP });
  }
  return result.sort((a, b) => a.centre - b.centre);
}

function spans(length: number, holes: Opening[], height: number): Span[] {
  const result: Span[] = [];
  let x = -length / 2;
  for (const hole of holes) {
    const left = hole.centre - hole.width / 2;
    const right = hole.centre + hole.width / 2;
    result.push({ x0: x, x1: left, y0: 0, y1: height });
    if (hole.bottom > 0) result.push({ x0: left, x1: right, y0: 0, y1: Math.min(hole.bottom, height) });
    if (hole.top < height) result.push({ x0: left, x1: right, y0: hole.top, y1: height });
    x = right;
  }
  result.push({ x0: x, x1: length / 2, y0: 0, y1: height });
  return result;
}

interface WallParts {
  wall: THREE.Material[];
  wainscot: THREE.Material | null;
  trim: THREE.Material;
}

const LEADED_GLASS = leadedGlass();
function leadedGlass(): string[] {
  const rows: string[] = [];
  for (let y = 0; y < 48; y++) {
    let row = "";
    for (let x = 0; x < 32; x++) {
      const lead = x % 8 === 0 || y % 12 === 0 || (x + y) % 16 === 0 || (x - y + 64) % 16 === 0;
      const glint = !lead && (x * 7 + y * 13) % 29 === 0;
      row += lead ? "l" : glint ? "g" : y < 24 ? "m" : "d";
    }
    rows.push(row);
  }
  return rows;
}

/** One wall, built along x with its inner face towards +z, at a given height. */
function buildWall(length: number, holes: Opening[], height: number, parts: WallParts): THREE.Group {
  const wall = group();
  const half = WALL_THICKNESS / 2;
  const face = half;
  const casing = 0.1;
  const doorEdges = holes.filter((hole) => hole.kind === "door").flatMap((hole) => [hole.centre - hole.width / 2, hole.centre + hole.width / 2]);
  /** Panelling and skirting stop under a door's casing: ending flush with the
   *  opening, their end faces would lie in the plane of the casing's inner
   *  face and fight it. */
  const underCasing = (x: number) => (doorEdges.some((edge) => Math.abs(edge - x) < 1e-6) ? casing : 0);
  for (const span of spans(length, holes, height)) {
    const w = span.x1 - span.x0;
    const h = span.y1 - span.y0;
    if (w <= 0.001 || h <= 0.001) continue;
    const cx = (span.x0 + span.x1) / 2;
    const body = box([w, h, WALL_THICKNESS], parts.wall, [cx, span.y0, 0]);
    body.userData.body = true;
    wall.add(body);
    if (span.y0 === 0) {
      const x0 = span.x0 + underCasing(span.x0);
      const x1 = span.x1 - underCasing(span.x1);
      const dressed = x1 - x0;
      const dx = (x0 + x1) / 2;
      if (parts.wainscot) {
        const panel = Math.min(WAINSCOT_HEIGHT, span.y1);
        wall.add(box([dressed, panel, WAINSCOT_DEPTH], parts.wainscot, [dx, 0, face + WAINSCOT_DEPTH / 2]));
        if (span.y1 > WAINSCOT_HEIGHT) wall.add(box([dressed, 0.05, 0.05], parts.trim, [dx, WAINSCOT_HEIGHT - 0.03, face + 0.025]));
      }
      wall.add(box([dressed, Math.min(0.16, span.y1), 0.05], parts.trim, [dx, 0, face + 0.025]));
    }
    if (span.y1 === WALL_HEIGHT) {
      wall.add(box([w, 0.12, 0.06], parts.trim, [cx, WALL_HEIGHT - 0.12, face + 0.03]));
    }
  }
  for (const hole of holes) {
    const left = hole.centre - hole.width / 2;
    const right = hole.centre + hole.width / 2;
    const jambTop = Math.min(hole.top + casing, height);
    const jambBottom = hole.bottom > 0 ? hole.bottom - casing / 2 : 0;
    if (jambTop > jambBottom) {
      for (const x of [left - casing / 2, right + casing / 2]) {
        wall.add(box([casing, jambTop - jambBottom, 0.07], parts.trim, [x, jambBottom, face + 0.035]));
      }
    }
    if (hole.top + casing <= height) {
      wall.add(box([hole.width + casing * 2, casing, 0.07], parts.trim, [hole.centre, hole.top, face + 0.035]));
    }
    if (hole.kind === "window" && hole.bottom <= height) {
      // The sill stands a little above the wall it rests on, so their tops don't share a plane and fight.
      wall.add(box([hole.width + casing * 2, 0.05, WALL_THICKNESS + 0.1], parts.trim, [hole.centre, hole.bottom - 0.04, 0.05]));
      const glassTop = Math.min(hole.top, height);
      if (glassTop > hole.bottom) {
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(hole.width, glassTop - hole.bottom), glow("moon", pixelTexture(LEADED_GLASS, { l: "soot", m: "moon", d: "moonDark", g: "moonLight" })));
        pane.position.set(hole.centre, (hole.bottom + glassTop) / 2, -half + 0.02);
        pane.userData.noShadow = true;
        wall.add(pane);
        wall.add(box([0.05, glassTop - hole.bottom, 0.05], parts.trim, [hole.centre, hole.bottom, 0]));
        for (const y of [hole.bottom + (glassTop - hole.bottom) * 0.4, hole.bottom + (glassTop - hole.bottom) * 0.75]) {
          if (y < glassTop) wall.add(box([hole.width, 0.04, 0.05], parts.trim, [hole.centre, y, 0]));
        }
      }
    }
  }
  return wall;
}

/** Iron railings along x between `x0` and `x1`, standing on the low wall:
 *  bars with a knob at the top, held by two rails. */
function railings(bars: ReturnType<typeof batch>, x0: number, x1: number, iron: PaletteKey) {
  const { railing } = OUTDOOR;
  const length = x1 - x0;
  const count = Math.max(1, Math.round(length / 0.15));
  const step = length / count;
  const tall = railing - CUT_HEIGHT;
  for (let i = 0; i < count; i++) {
    const x = x0 + (i + 0.5) * step;
    bars.block([0.03, tall, 0.03], iron, [x, CUT_HEIGHT - 0.01, 0]);
    bars.add([0.05, 0.05, 0.05], iron, new THREE.Matrix4().compose(new THREE.Vector3(x, railing, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 4, Math.PI / 4)), new THREE.Vector3(1, 1, 1)));
  }
  for (const y of [CUT_HEIGHT + 0.1, railing - 0.17]) bars.block([length + 0.01, 0.04, 0.045], iron, [(x0 + x1) / 2, y, 0]);
}

/**
 * One outdoor edge, built along x with its inner face towards +z (see
 * `OUTDOOR`): a low wall exactly the cut height tall, with stone piers either
 * side of each gate and, on an edge that holds the corners, at its ends.
 * Standing full, it adds iron railings and the piers' upper part with their
 * caps; cut, it is the low wall alone, the piers cut level with it.
 */
function buildBoundary(length: number, holes: Opening[], full: boolean, corners: boolean, surface: THREE.Texture, iron: PaletteKey): THREE.Group {
  const stone = textured(surface);
  const edge = group();
  const half = WALL_THICKNESS / 2;
  const { pier, pierTop } = OUTDOOR;
  const coping = 0.06;
  const capHeight = 0.16;
  const holeEdges = holes.flatMap((hole) => [hole.centre - hole.width / 2, hole.centre + hole.width / 2]);
  const piers = holes.flatMap((hole) => [hole.centre - hole.width / 2 - pier / 2, hole.centre + hole.width / 2 + pier / 2]);
  if (corners) piers.push(-length / 2 + pier / 2, length / 2 - pier / 2);
  /** How far a railing stops short of a span's end: a pier there, or the corner pier of the edge it meets. */
  const inset = (x: number) => (holeEdges.some((at) => Math.abs(at - x) < 1e-6) || corners ? pier : pier - WALL_THICKNESS);
  const bars = batch();
  for (const span of spans(length, holes, CUT_HEIGHT)) {
    const w = span.x1 - span.x0;
    if (w <= 0.001) continue;
    const cx = (span.x0 + span.x1) / 2;
    const body = box([w, CUT_HEIGHT - coping, WALL_THICKNESS], stone, [cx, 0, 0]);
    // The coping overhangs the room side only, so it never reaches into the tile next door.
    const top = box([w, coping, WALL_THICKNESS + 0.03], stone, [cx, CUT_HEIGHT - coping, 0.015]);
    body.userData.body = true;
    top.userData.body = true;
    edge.add(body, top);
    if (full) railings(bars, span.x0 + inset(span.x0), span.x1 - inset(span.x1), iron);
  }
  for (const x of piers) {
    const body = box([pier, full ? pierTop - capHeight : CUT_HEIGHT, pier], stone, [x, 0, pier / 2 - half]);
    body.userData.body = true;
    edge.add(body);
    if (full) {
      const cap = new THREE.ConeGeometry(pier / Math.SQRT2, capHeight, 4).rotateY(Math.PI / 4).translate(x, pierTop - capHeight / 2, pier / 2 - half);
      edge.add(new THREE.Mesh(projectUvs(cap, surface), stone));
    }
  }
  if (full) edge.add(bars.mesh());
  return edge;
}

/** An iron gate shut in a gateway, in the middle of the low wall's thickness. */
function shutGate(full: boolean, iron: PaletteKey): THREE.Mesh {
  const bars = batch();
  const top = full ? OUTDOOR.railing : CUT_HEIGHT;
  const count = 7;
  const step = DOOR_WIDTH / count;
  for (let i = 0; i < count; i++) bars.block([0.03, top - 0.05, 0.03], iron, [-DOOR_WIDTH / 2 + (i + 0.5) * step, 0.05, 0]);
  for (const y of full ? [0.12, top - 0.17] : [0.12]) bars.block([DOOR_WIDTH + 0.01, 0.04, 0.045], iron, [0, y, 0]);
  return bars.mesh();
}

function edgeLength(edge: Edge): number {
  return edge === "top" || edge === "bottom" ? TILE : TILE - WALL_THICKNESS * 2;
}

function placeOnEdge(object: THREE.Object3D, edge: Edge): THREE.Group {
  object.position.z = -(TILE / 2 - WALL_THICKNESS / 2);
  const holder = group(object);
  holder.rotation.y = THREE.MathUtils.degToRad(wallTurn(edge));
  return holder;
}

/**
 * Where a room's moon fakes are built from: high beyond its first window (or
 * its top edge), shining towards the middle of the floor. A piece lined up
 * with it (a shaft of light through a window) follows it. The baked moon
 * comes from a fixed corner of the board instead, so such a fake lies off
 * the real moonlight by the tile's turn and the corner's angle.
 */
export function moonPosition(def: RoomDefinition): THREE.Vector3 {
  const outward = OUTWARD[roomTile(def.id).windows.at(0) ?? "top"];
  const elevation = THREE.MathUtils.degToRad(50);
  return new THREE.Vector3(outward.x * Math.cos(elevation) * 12 + 1, Math.sin(elevation) * 12, outward.y * Math.cos(elevation) * 12 + 0.6);
}

/** The floor slab as rectangles [x0, x1, z0, z1] covering the tile around its
 *  openings: the tile is cut on every opening's edges, and each cell outside
 *  the openings is kept. With no openings it is the whole tile. */
function floorPieces(holes: NonNullable<RoomDefinition["floorOpenings"]>): [number, number, number, number][] {
  const half = TILE / 2;
  const cuts = (axis: "x" | "z") => [...new Set([-half, half, ...holes.flatMap((hole) => hole[axis])])].sort((a, b) => a - b);
  const xs = cuts("x");
  const zs = cuts("z");
  const pieces: [number, number, number, number][] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cz = (zs[j] + zs[j + 1]) / 2;
      const open = holes.some(({ x, z }) => cx > x[0] && cx < x[1] && cz > z[0] && cz < z[1]);
      if (!open) pieces.push([xs[i], xs[i + 1], zs[j], zs[j + 1]]);
    }
  }
  return pieces;
}

/** Builds an explorer figure. The seed gives each figure its own phase, so
 *  several in one room never move in step; `gait` says when it walks, for a
 *  figure that can (on the bench, none does). */
export type ExplorerBuilder = (seed: string, gait?: Gait) => THREE.Object3D;

export interface RoomOptions {
  /** Who stands at the room's pawn spot (the scale pawn unless told
   *  otherwise); null leaves it empty. */
  explorer?: ExplorerBuilder | null;
  /** Doors (by printed edge) drawn shut: in the house, a door that opens onto
   *  the wall of the room beyond. */
  closedDoors?: Edge[];
}

/** A plain door leaf shut in a doorway, in the middle of the wall's thickness. */
function shutLeaf(height: number, material: THREE.Material): THREE.Mesh {
  return box([DOOR_WIDTH, Math.min(DOOR_HEIGHT, height), 0.06], material, [0, 0, 0]);
}

/** What a top-level piece of a built room is: part of the shell (the floor,
 *  or the wall on an edge, with all its dressing), or a placed prop. Tools
 *  that look at one piece at a time (the overlap check, the close-ups) read
 *  it. Within a wall, `userData.body` marks the wall itself, apart from its
 *  dressing (wainscot, skirting, crown, casings and sills). */
export type Piece = { shell: Edge | "floor" } | { prop: PropPlacement };

export function pieceOf(object: THREE.Object3D): Piece | undefined {
  return (object.userData as { piece?: Piece }).piece;
}

/** One room as built, in its own tile frame (centred on the origin,
 *  unturned): every piece as its own object, before `freezeRoom` merges what
 *  stands still for drawing and baking. The overlap check reads it as it is. */
export interface RoomPart {
  root: THREE.Group;
  /** The full and the cut-down wall on each edge that has one. */
  walls: { edge: Edge; full: THREE.Object3D; cut: THREE.Object3D }[];
  /** Pieces hung on walls above the cut height, which hide when any of their walls is cut. */
  hung: { edges: Edge[]; object: THREE.Object3D }[];
  /** Shows the full or the cut wall on each edge, for looking at the room as built. */
  cutWalls: (isCut: (edge: Edge) => boolean) => void;
  /** Poses its animated pieces for this moment. */
  update: (seconds: number) => void;
  /** The explorer standing where the room puts its pawn, if it has one. */
  explorer: THREE.Object3D | null;
  /** The room's own lights, all baked. */
  lights: BakedLight[];
  /** Resolves once every texture has its pixels (SVG decals decode asynchronously). */
  ready: Promise<void>;
  dispose: () => void;
}

export function buildRoom(def: RoomDefinition, { explorer: buildExplorer = () => pawn(), closedDoors = [] }: RoomOptions = {}): RoomPart {
  const tile = roomTile(def.id);
  const root = group();
  const wallTexture = def.wall();
  const wallMaterial = textured(wallTexture);
  const cap = flat("soot");
  const parts: WallParts = {
    wall: [wallMaterial, wallMaterial, cap, cap, wallMaterial, wallMaterial],
    wainscot: def.wainscot ? textured(def.wainscot()) : null,
    trim: flat(def.trim),
  };

  const floorMaterial = textured(def.floor());
  const slab = flat("sootLight");
  for (const [x0, x1, z0, z1] of floorPieces(def.floorOpenings ?? [])) {
    const piece = box([x1 - x0, 0.2, z1 - z0], [slab, slab, floorMaterial, slab, slab, slab], [(x0 + x1) / 2, -0.2, (z0 + z1) / 2]);
    piece.userData.piece = { shell: "floor" } satisfies Piece;
    root.add(piece);
  }

  if (tile.outside && tile.windows.length > 0) throw new Error(`${def.id} is outdoors, with no wall to hold its windows`);
  // The unseen ceiling: it only stops light in the bake, so moonlight gets in through the windows alone.
  // Outdoors there is none, and the moon falls on the whole tile.
  if (!tile.outside) {
    const ceiling = box([TILE, 0.1, TILE], flat("void"), [0, WALL_HEIGHT, 0]);
    ceiling.userData.bakeOnly = true;
    root.add(ceiling);
  }

  const walls: RoomPart["walls"] = [];
  for (const edge of EDGES) {
    if (tile.passages.includes(edge)) continue;
    const holes = openings(tile, edge);
    const wall = (height: number) => {
      const full = height === WALL_HEIGHT;
      const built = tile.outside ? buildBoundary(edgeLength(edge), holes, full, edge === "top" || edge === "bottom", wallTexture, def.trim) : buildWall(edgeLength(edge), holes, height, parts);
      if (closedDoors.includes(edge)) built.add(tile.outside ? shutGate(full, def.trim) : shutLeaf(height, parts.trim));
      const placed = placeOnEdge(built, edge);
      placed.userData.piece = { shell: edge } satisfies Piece;
      return placed;
    };
    const full = wall(WALL_HEIGHT);
    const cut = wall(CUT_HEIGHT);
    root.add(full, cut);
    walls.push({ edge, full, cut });
  }

  const hung: RoomPart["hung"] = [];
  for (const prop of def.props) {
    const object = prop.build();
    object.position.set(prop.at[0], prop.y ?? 0, prop.at[1]);
    object.rotation.y = THREE.MathUtils.degToRad(prop.turn ?? 0);
    object.userData.piece = { prop } satisfies Piece;
    root.add(object);
    if (prop.walls && (prop.y ?? 0) >= CUT_HEIGHT) hung.push({ edges: prop.walls, object });
  }

  let explorer: THREE.Object3D | null = null;
  if (def.pawn && buildExplorer) {
    explorer = buildExplorer(`${def.id}:explorer`);
    explorer.position.set(def.pawn[0], 0, def.pawn[1]);
    root.add(explorer);
  }

  root.updateMatrixWorld(true);
  const lights: BakedLight[] = [];
  root.traverse((object) => {
    const spec = anchoredLight(object);
    if (spec) lights.push({ ...spec, flicker: spec.flicker ?? 0, at: object.getWorldPosition(new THREE.Vector3()) });
  });
  for (const { at, ...spec } of def.lights ?? []) lights.push({ ...spec, flicker: spec.flicker ?? 0, at: new THREE.Vector3(...at) });
  if (lights.length > MAX_LIGHTS) throw new Error(`${def.id} has ${lights.length} lights; the most a room may bake is ${MAX_LIGHTS}`);
  const deep = lights.find((light) => light.flicker > MAX_FLICKER);
  if (deep) throw new Error(`${def.id} has a light flickering by ${deep.flicker}; the most is ${MAX_FLICKER}`);

  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = (Array.isArray(object.material) ? object.material : [object.material]) as THREE.Material[];
    const unlit = materials.every((material) => material instanceof THREE.MeshBasicMaterial);
    const data = object.userData as { noShadow?: boolean; bakeOnly?: boolean };
    object.castShadow = data.bakeOnly === true || (!unlit && !data.noShadow);
    for (const material of materials) {
      if ("map" in material && material.map instanceof THREE.Texture) textures.add(material.map);
    }
  });

  return {
    root,
    walls,
    hung,
    cutWalls: (isCut) => {
      for (const { edge, full, cut } of walls) {
        const down = isCut(edge);
        full.visible = !down;
        cut.visible = down;
      }
      for (const { edges, object } of hung) object.visible = !edges.some(isCut);
    },
    update: (seconds) => {
      root.traverse((object) => animationOf(object)?.(seconds));
    },
    explorer,
    lights,
    dispose: () => disposeTree(root),
    ready: Promise.all([...textures].map(textureReady)).then(() => undefined),
  };
}

/** Frees the geometry and materials under a root. */
export function disposeTree(root: THREE.Object3D) {
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      for (const material of [object.material].flat() as THREE.Material[]) material.dispose();
    }
    if (object instanceof THREE.Light) object.dispose();
  });
}
