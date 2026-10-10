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
  standingSpots,
  wallTurn,
  type FloorOpening,
  type PropPlacement,
  type RoomDefinition,
} from "./room";
import type { PaletteKey } from "./palette";
import { batch, box, flat, glow, group, projectUvs, textured } from "./shapes";
import { pixelTexture, textureReady } from "./textures";
import { boardedDoor, boardedWindow, capWindow, litThreshold, STUB_CAP, windowLight, type WallOpening } from "./wall-markings";

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

interface Opening extends WallOpening {
  kind: "door" | "window";
  /** A window against a neighbour's wall, drawn without its glass: the cutaway markings board it up. */
  blocked: boolean;
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

function openings(tile: RoomTile, edge: Edge, blockedWindow: boolean): Opening[] {
  const result: Opening[] = [];
  const door = tile.doors.includes(edge);
  if (door) {
    const front = tile.frontDoor === edge;
    result.push({ kind: "door", centre: 0, width: front ? FRONT_DOOR_WIDTH : DOOR_WIDTH, bottom: 0, top: front ? FRONT_DOOR_HEIGHT : DOOR_HEIGHT, blocked: false });
  }
  if (tile.windows.includes(edge)) {
    result.push({ kind: "window", centre: door ? 1.7 : 0, width: WINDOW_WIDTH, bottom: WINDOW_SILL, top: WINDOW_TOP, blocked: blockedWindow });
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

/** A wall's dressing, standing out from its inner face: the skirting, the
 *  chair rail (on top of the wainscot, when the wall has one) and the crown.
 *  The crown's top stops short of the wall's, so it never shares the plane of
 *  the cap of the wall it runs into at a corner. */
export const SKIRTING = { height: 0.16, depth: 0.05 };
export const RAIL = { y: WAINSCOT_HEIGHT - 0.03, height: 0.05, depth: 0.05 };
const CROWN = { height: 0.12, depth: 0.06, below: 0.005 };
const CASING = 0.1;
/** A window's sill, which stands a little above the wall it rests on, so their tops don't share a plane and fight. */
const SILL = { below: 0.04, height: 0.05 };

/** How a wall's dressing ends at one of the wall's two ends: `butt`, against
 *  the dressing of the wall across that end, at its face; `wall`, against the
 *  face of the wall across that end; or `free`, a tenth of its own depth
 *  short of the end, so the ends of strips of different depths never share a
 *  plane. */
type DressingEnd = "butt" | "wall" | "free";

/** One wall, built along x with its inner face towards +z, at a given height;
 *  `ends` says how its dressing ends at its −x end, then its +x end. */
function buildWall(length: number, holes: Opening[], height: number, parts: WallParts, ends: [DressingEnd, DressingEnd]): THREE.Group {
  const wall = group();
  const half = WALL_THICKNESS / 2;
  const face = half;
  const casing = CASING;
  /** The edges of the openings, each with the heights its casing covers: a door's from the floor, a window's from its sill. */
  const cased = holes.flatMap((hole) => {
    const covers = { low: hole.kind === "door" ? 0 : hole.bottom - SILL.below, high: hole.top + casing };
    return [hole.centre - hole.width / 2, hole.centre + hole.width / 2].map((x) => ({ x, ...covers }));
  });
  /** Where a strip of dressing `depth` deep, between two heights, ends at a
   *  span's end `x`, facing `out` along x: under an opening's casing, when
   *  the casing covers its height (ending flush with the opening, its end
   *  face would lie in the plane of the casing's inner face and fight it); or
   *  at the wall's end as `ends` says. */
  const stop = (x: number, out: 1 | -1, depth: number, y0: number, y1: number) => {
    if (cased.some((edge) => Math.abs(edge.x - x) < 1e-6 && y0 >= edge.low - 1e-6 && y1 <= edge.high + 1e-6)) return x - out * casing;
    if (Math.abs(Math.abs(x) - length / 2) > 1e-6) return x;
    const end = ends[out > 0 ? 1 : 0];
    return x - out * (end === "butt" ? depth : end === "wall" ? WALL_THICKNESS : depth / 10);
  };
  /** A strip of dressing along a span, between two heights. */
  const strip = (span: Span, y0: number, y1: number, depth: number, material: THREE.Material) => {
    const x0 = stop(span.x0, -1, depth, y0, y1);
    const x1 = stop(span.x1, 1, depth, y0, y1);
    wall.add(box([x1 - x0, y1 - y0, depth], material, [(x0 + x1) / 2, y0, face + depth / 2]));
  };
  for (const span of spans(length, holes, height)) {
    const w = span.x1 - span.x0;
    const h = span.y1 - span.y0;
    if (w <= 0.001 || h <= 0.001) continue;
    const cx = (span.x0 + span.x1) / 2;
    const body = box([w, h, WALL_THICKNESS], parts.wall, [cx, span.y0, 0]);
    body.userData.body = true;
    wall.add(body);
    if (span.y0 === 0) {
      if (parts.wainscot) {
        const railed = span.y1 > WAINSCOT_HEIGHT;
        // Under a rail the panelling stops at the rail's foot, so their ends never overlap in one plane.
        strip(span, 0, railed ? RAIL.y : Math.min(WAINSCOT_HEIGHT, span.y1), WAINSCOT_DEPTH, parts.wainscot);
        if (railed) strip(span, RAIL.y, RAIL.y + RAIL.height, RAIL.depth, parts.trim);
      }
      strip(span, 0, Math.min(SKIRTING.height, span.y1), SKIRTING.depth, parts.trim);
    }
    if (span.y1 === WALL_HEIGHT) strip(span, WALL_HEIGHT - CROWN.below - CROWN.height, WALL_HEIGHT - CROWN.below, CROWN.depth, parts.trim);
  }
  for (const hole of holes) {
    const left = hole.centre - hole.width / 2;
    const right = hole.centre + hole.width / 2;
    const headed = hole.top + casing <= height;
    // The jambs stand between the sill and the head, never overlapping either in one plane.
    const jambTop = headed ? hole.top : Math.min(hole.top + casing, height);
    const jambBottom = hole.bottom > 0 ? hole.bottom - SILL.below + SILL.height : 0;
    if (jambTop > jambBottom) {
      for (const x of [left - casing / 2, right + casing / 2]) {
        wall.add(box([casing, jambTop - jambBottom, 0.07], parts.trim, [x, jambBottom, face + 0.035]));
      }
    }
    if (headed) {
      wall.add(box([hole.width + casing * 2, casing, 0.07], parts.trim, [hole.centre, hole.top, face + 0.035]));
    }
    if (hole.kind === "window" && hole.bottom <= height) {
      wall.add(box([hole.width + casing * 2, SILL.height, WALL_THICKNESS + 0.1], parts.trim, [hole.centre, hole.bottom - SILL.below, 0.05]));
      const glassTop = Math.min(hole.top, height);
      if (glassTop > hole.bottom && !hole.blocked) {
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(hole.width, glassTop - hole.bottom), glow("moon", pixelTexture(LEADED_GLASS, { l: "soot", m: "moon", d: "moonDark", g: "moonLight" })));
        pane.position.set(hole.centre, (hole.bottom + glassTop) / 2, -half + 0.02);
        pane.userData.noShadow = true;
        wall.add(pane);
        wall.add(box([0.05, glassTop - hole.bottom, 0.05], parts.trim, [hole.centre, hole.bottom, 0]));
        // The transoms are a little shallower than the mullion they cross, so their faces never share its plane.
        for (const y of [hole.bottom + (glassTop - hole.bottom) * 0.4, hole.bottom + (glassTop - hole.bottom) * 0.75]) {
          if (y < glassTop) wall.add(box([hole.width, 0.04, 0.04], parts.trim, [hole.centre, y, 0]));
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
  const { pier } = OUTDOOR;
  const coping = 0.06;
  const holeEdges = holes.flatMap((hole) => [hole.centre - hole.width / 2, hole.centre + hole.width / 2]);
  const piers = holes.flatMap((hole) => [hole.centre - hole.width / 2 - pier / 2, hole.centre + hole.width / 2 + pier / 2]);
  if (corners) piers.push(-length / 2 + pier / 2, length / 2 - pier / 2);
  /** How far the wall and its railing stop short of a span's end: a pier there, or the corner pier of the edge it meets. */
  const inset = (x: number) => (holeEdges.some((at) => Math.abs(at - x) < 1e-6) || corners ? pier : pier - WALL_THICKNESS);
  const bars = batch();
  for (const span of spans(length, holes, CUT_HEIGHT)) {
    // The wall runs between the piers, never through them: inside one, its faces would lie in the pier's and fight them.
    const [x0, x1] = [span.x0 + inset(span.x0), span.x1 - inset(span.x1)];
    const w = x1 - x0;
    if (w <= 0.001) continue;
    const cx = (x0 + x1) / 2;
    const body = box([w, CUT_HEIGHT - coping, WALL_THICKNESS], stone, [cx, 0, 0]);
    // The coping overhangs the room side only, so it never reaches into the tile next door.
    const top = box([w, coping, WALL_THICKNESS + 0.03], stone, [cx, CUT_HEIGHT - coping, 0.015]);
    body.userData.body = true;
    top.userData.body = true;
    edge.add(body, top);
    if (full) railings(bars, x0, x1, iron);
  }
  for (const x of piers) edge.add(...buildPier(x, full ? 0 : null, stone, surface));
  if (full) edge.add(bars.mesh());
  return edge;
}

/** A stone pier on an outdoor edge, square and flush with the tile's edge
 *  (in the edge's frame, as `buildBoundary`), from `from` up to its capped
 *  top; null for one cut level with the low wall. */
function buildPier(x: number, from: number | null, stone: THREE.Material, surface: THREE.Texture): THREE.Mesh[] {
  const { pier, pierTop } = OUTDOOR;
  const capHeight = 0.16;
  const z = pier / 2 - WALL_THICKNESS / 2;
  const body = box([pier, from === null ? CUT_HEIGHT : pierTop - capHeight - from, pier], stone, [x, from ?? 0, z]);
  body.userData.body = true;
  if (from === null) return [body];
  const cap = new THREE.ConeGeometry(pier / Math.SQRT2, capHeight, 4).rotateY(Math.PI / 4).translate(x, pierTop - capHeight / 2, z);
  return [body, new THREE.Mesh(projectUvs(cap, surface), stone)];
}

/** A side wall's corner above the cut height (in the wall's frame, as
 *  `buildWall`), standing on the cut-down wall across its end; with the ends
 *  of the side wall's dressing, which butts against that wall's dressing
 *  while it stands. */
function cornerAbove(x: number, parts: WallParts): THREE.Mesh[] {
  const body = box([WALL_THICKNESS, WALL_HEIGHT - CUT_HEIGHT, WALL_THICKNESS], parts.wall, [x, CUT_HEIGHT, 0]);
  body.userData.body = true;
  const end = x - (Math.sign(x) * WALL_THICKNESS) / 2;
  const face = WALL_THICKNESS / 2;
  const piece = (y0: number, y1: number, depth: number, material: THREE.Material) =>
    box([depth, y1 - y0, depth], material, [end - (Math.sign(x) * depth) / 2, y0, face + depth / 2]);
  const dressing = [piece(WALL_HEIGHT - CROWN.below - CROWN.height, WALL_HEIGHT - CROWN.below, CROWN.depth, parts.trim)];
  if (parts.wainscot) dressing.push(piece(CUT_HEIGHT, RAIL.y, WAINSCOT_DEPTH, parts.wainscot), piece(RAIL.y, RAIL.y + RAIL.height, RAIL.depth, parts.trim));
  return [body, ...dressing];
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

/** The edge across a wall's end, `along` its own x (−1 or 1). */
function endOf(edge: Edge, along: number): Edge {
  const holder = placeOnEdge(group(), edge);
  holder.updateMatrixWorld(true);
  const end = holder.localToWorld(new THREE.Vector3(along, 0, 0));
  if (edge === "left" || edge === "right") return end.z < 0 ? "top" : "bottom";
  return end.x < 0 ? "left" : "right";
}

/** How a wall's dressing ends. A wall across the corners runs its dressing on
 *  into them, over the side walls' cut stubs, unless it is cut itself: then the
 *  side walls' stubs always stand across its ends, and it stops at their faces.
 *  A side wall's dressing butts against the dressing of each wall across its
 *  ends; where a passage leaves no wall there, it ends free. */
function dressingEnds(tile: RoomTile, edge: Edge, height: number): [DressingEnd, DressingEnd] {
  const across = edge === "top" || edge === "bottom" ? (height === WALL_HEIGHT ? "free" : "wall") : "butt";
  const end = (along: number): DressingEnd => (tile.passages.includes(endOf(edge, along)) ? "free" : across);
  return [end(-1), end(1)];
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

/** How thick the floor slab is. */
const SLAB = 0.2;
/** How far a polygonal opening's rectangle cut reaches past the polygon, so the infill round it never meets it. */
const INFILL_MARGIN = 0.1;

type Rect = [x0: number, x1: number, z0: number, z1: number];

/** The rectangle cut from the slab for an opening: a rectangle opening itself,
 *  or a polygon's bounds grown by `INFILL_MARGIN` (within the tile), which
 *  `polygonInfill` then floors back up to the polygon's edge. */
function openingRect(opening: FloorOpening, id: string): Rect {
  if (!("polygon" in opening)) return [opening.x[0], opening.x[1], opening.z[0], opening.z[1]];
  const half = TILE / 2;
  const xs = opening.polygon.map(([x]) => x);
  const zs = opening.polygon.map(([, z]) => z);
  if (opening.polygon.length < 3) throw new Error(`${id} has a floor opening with fewer than three corners`);
  if (Math.max(...xs.map(Math.abs), ...zs.map(Math.abs)) > half - 0.01) throw new Error(`${id} has a floor opening reaching within 1 cm of the tile's edge; keep it inside the tile`);
  return [Math.max(-half, Math.min(...xs) - INFILL_MARGIN), Math.min(half, Math.max(...xs) + INFILL_MARGIN), Math.max(-half, Math.min(...zs) - INFILL_MARGIN), Math.min(half, Math.max(...zs) + INFILL_MARGIN)];
}

/** The floor slab as rectangles [x0, x1, z0, z1] covering the tile around the
 *  openings' rectangles: the tile is cut on every rectangle's edges, and each
 *  cell outside them is kept. With no openings it is the whole tile. */
function floorPieces(holes: Rect[]): Rect[] {
  const half = TILE / 2;
  const cuts = (axis: 0 | 2) => [...new Set([-half, half, ...holes.flatMap((hole) => [hole[axis], hole[axis + 1]])])].sort((a, b) => a - b);
  const xs = cuts(0);
  const zs = cuts(2);
  const pieces: Rect[] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < zs.length - 1; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2;
      const cz = (zs[j] + zs[j + 1]) / 2;
      const open = holes.some(([x0, x1, z0, z1]) => cx > x0 && cx < x1 && cz > z0 && cz < z1);
      if (!open) pieces.push([xs[i], xs[i + 1], zs[j], zs[j + 1]]);
    }
  }
  return pieces;
}

/**
 * The slab between a polygonal opening and the rectangle cut round it: the
 * ring between them in triangles, each a closed prism of the slab's depth, so
 * every piece of the floor is convex. Tops take the floor's material, sides
 * and bottoms the slab's, and the tops come first, in one run, so they light
 * as one floor rather than as scattered scraps.
 */
function polygonInfill(rect: Rect, polygon: [number, number][], floorMaterial: THREE.Material, slab: THREE.Material, texture: THREE.Texture): THREE.Mesh {
  const [x0, x1, z0, z1] = rect;
  const outline = [new THREE.Vector2(x0, z0), new THREE.Vector2(x1, z0), new THREE.Vector2(x1, z1), new THREE.Vector2(x0, z1)];
  const hole = polygon.map(([x, z]) => new THREE.Vector2(x, z));
  // Earcut wants the outline clockwise and the hole anticlockwise, as three's ShapeGeometry gives them.
  if (!THREE.ShapeUtils.isClockWise(outline)) outline.reverse();
  if (THREE.ShapeUtils.isClockWise(hole)) hole.reverse();
  const points = [...outline, ...hole];
  const triangles = THREE.ShapeUtils.triangulateShape(outline, [hole]);
  /** Corners in the order that faces up: anticlockwise seen from above. */
  const upward = ([a, b, c]: number[]) => {
    const [pa, pb, pc] = [points[a], points[b], points[c]];
    const turn = (pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x);
    // x right and z towards the viewer: a positive turn in (x, z) is clockwise seen from above.
    return turn > 0 ? [a, c, b] : [a, b, c];
  };
  // Every face has corners of its own, so it lights flat; a side's two triangles share theirs, so they read as one face.
  const position: number[] = [];
  const tops: number[] = [];
  const rest: number[] = [];
  const corner = (i: number, y: number) => position.push(points[i].x, y, points[i].y) / 3 - 1;
  for (const triangle of triangles) {
    const [a, b, c] = upward(triangle);
    tops.push(corner(a, 0), corner(b, 0), corner(c, 0));
    rest.push(corner(a, -SLAB), corner(c, -SLAB), corner(b, -SLAB));
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      const [pTop, pFoot, qFoot, qTop] = [corner(p, 0), corner(p, -SLAB), corner(q, -SLAB), corner(q, 0)];
      rest.push(pTop, pFoot, qFoot, pTop, qFoot, qTop);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geometry.setIndex([...tops, ...rest]);
  geometry.computeVertexNormals();
  geometry.addGroup(0, tops.length, 0);
  geometry.addGroup(tops.length, rest.length, 1);
  return new THREE.Mesh(projectUvs(geometry, texture), [floorMaterial, slab]);
}

/**
 * Bake-only plugs across a room's doorways and passages, on the tile's edge.
 * In the house a doorway with no room beyond it leads into the dark of the
 * unexplored house, not out under the moon, so the bake shuts it there and
 * on the bench (see `bakeScene`). The front door leads outside, so it stays open.
 */
function doorwayPlugs(tile: RoomTile): THREE.Mesh[] {
  if (tile.outside) return [];
  const plugs: THREE.Mesh[] = [];
  for (const edge of EDGES) {
    const passage = tile.passages.includes(edge);
    if (!passage && (!tile.doors.includes(edge) || tile.frontDoor === edge)) continue;
    const [width, height] = passage ? [TILE, WALL_HEIGHT] : [DOOR_WIDTH + 0.02, DOOR_HEIGHT + 0.01];
    const plug = new THREE.Mesh(new THREE.PlaneGeometry(width, height).translate(0, height / 2, -TILE / 2), flat("void"));
    plug.rotation.y = THREE.MathUtils.degToRad(wallTurn(edge));
    plug.userData.bakeOnly = true;
    plug.userData.plug = edge;
    plugs.push(plug);
  }
  return plugs;
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
  /** Windows (by printed edge) against the room beyond: they are boarded up. */
  falseWindows?: Edge[];
}

/** The door among a wall's openings: the stage is told a door is shut only where the tile has one. */
function doorOf(holes: Opening[]): Opening {
  const door = holes.find((hole) => hole.kind === "door");
  if (!door) throw new Error("A door drawn shut on a wall with no door");
  return door;
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
  /**
   * The corners of the side walls above the cut height. A tile's corners
   * belong to its top and bottom walls, which run the tile's full width,
   * between which the side walls stand. Where a side wall stands and the
   * wall across its end is cut, its corner stands with it, so the side wall
   * still reaches the tile's edge and meets the wall of the next tile along.
   */
  corners: { side: Edge; end: Edge; object: THREE.Object3D }[];
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
  /** Where explorers stand (the pawn spot, then the second spot), if the room has a pawn spot. */
  spots: [x: number, z: number][];
  /** Resolves once every texture has its pixels (SVG decals decode asynchronously). */
  ready: Promise<void>;
  dispose: () => void;
}

export function buildRoom(def: RoomDefinition, { explorer: buildExplorer = () => pawn(), closedDoors = [], falseWindows = [] }: RoomOptions = {}): RoomPart {
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
  /** A cut-down wall's parts: its cap takes a colour of its own, so the cut reads as a line round the room. */
  const stubParts: WallParts = { ...parts, wall: [wallMaterial, wallMaterial, flat(STUB_CAP), cap, wallMaterial, wallMaterial] };

  const floorTexture = def.floor();
  const floorMaterial = textured(floorTexture);
  const slab = flat("sootLight");
  const holes = def.floorOpenings ?? [];
  const floor: THREE.Mesh[] = floorPieces(holes.map((hole) => openingRect(hole, def.id))).map(([x0, x1, z0, z1]) =>
    box([x1 - x0, SLAB, z1 - z0], [slab, slab, floorMaterial, slab, slab, slab], [(x0 + x1) / 2, -SLAB, (z0 + z1) / 2]),
  );
  for (const hole of holes) if ("polygon" in hole) floor.push(polygonInfill(openingRect(hole, def.id), hole.polygon, floorMaterial, slab, floorTexture));
  for (const piece of floor) {
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
  const plugs = doorwayPlugs(tile);
  if (plugs.length) root.add(...plugs);

  const walls: RoomPart["walls"] = [];
  for (const edge of EDGES) {
    if (tile.passages.includes(edge)) continue;
    const shut = closedDoors.includes(edge);
    const holes = openings(tile, edge, falseWindows.includes(edge));
    const wall = (height: number) => {
      const full = height === WALL_HEIGHT;
      const wallParts = full ? parts : stubParts;
      const built = tile.outside ? buildBoundary(edgeLength(edge), holes, full, edge === "top" || edge === "bottom", wallTexture, def.trim) : buildWall(edgeLength(edge), holes, height, wallParts, dressingEnds(tile, edge, height));
      if (shut) {
        if (tile.outside) built.add(shutGate(full, def.trim));
        else built.add(shutLeaf(height, parts.trim), boardedDoor(doorOf(holes), height));
      }
      if (!tile.outside) {
        for (const hole of holes.filter((opening) => opening.kind === "window")) {
          if (!full) built.add(capWindow(hole, parts.trim, hole.blocked));
          else if (hole.blocked) built.add(boardedWindow(hole));
        }
      }
      const placed = placeOnEdge(built, edge);
      placed.userData.piece = { shell: edge } satisfies Piece;
      return placed;
    };
    const full = wall(WALL_HEIGHT);
    const cut = wall(CUT_HEIGHT);
    root.add(full, cut);
    walls.push({ edge, full, cut });
    const floorMarks = holes.flatMap((hole): THREE.Object3D[] => {
      if (hole.kind === "window") return hole.blocked ? [] : [windowLight(hole)];
      return shut ? [] : [litThreshold(hole)];
    });
    if (floorMarks.length) {
      const placed = placeOnEdge(group(...floorMarks), edge);
      placed.userData.piece = { shell: edge } satisfies Piece;
      root.add(placed);
    }
  }

  const corners: RoomPart["corners"] = [];
  for (const side of ["left", "right"] as const) {
    if (tile.passages.includes(side)) continue;
    for (const along of [-1, 1]) {
      const x = along * (TILE / 2 - (tile.outside ? OUTDOOR.pier : WALL_THICKNESS) / 2);
      const built = tile.outside ? group(...buildPier(x, CUT_HEIGHT, textured(wallTexture), wallTexture)) : group(...cornerAbove(x, parts));
      const end = endOf(side, along);
      if (tile.passages.includes(end)) continue;
      const object = placeOnEdge(built, side);
      object.userData.piece = { shell: side } satisfies Piece;
      root.add(object);
      corners.push({ side, end, object });
    }
  }

  const hung: RoomPart["hung"] = [];
  for (const prop of def.props) {
    // A holder takes the placement, so a transform the build gives its piece is kept.
    const object = group(prop.build());
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
    corners,
    hung,
    cutWalls: (isCut) => {
      for (const { edge, full, cut } of walls) {
        const down = isCut(edge);
        full.visible = !down;
        cut.visible = down;
      }
      for (const { side, end, object } of corners) object.visible = !isCut(side) && isCut(end);
      for (const { edges, object } of hung) object.visible = !edges.some(isCut);
    },
    update: (seconds) => {
      root.traverse((object) => animationOf(object)?.(seconds));
    },
    explorer,
    lights,
    spots: standingSpots(def),
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
