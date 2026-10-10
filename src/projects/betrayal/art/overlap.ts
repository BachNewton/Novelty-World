import * as THREE from "three";
import type { Edge } from "../types";
import { PALETTE, type PaletteKey } from "./palette";
import { DOOR_APPROACH, DOOR_HEIGHT, DOOR_WIDTH, INNER, TILE, pieceLabel, pieceName, standingSpots, waypoints, type FloorOpening, type PropPlacement, type RoomDefinition } from "./room";
import { buildRoom, disposeTree, EDGES, OUTWARD, pieceOf, roomTile, type RoomPart } from "./stage";
import { CATALOG } from "../data";
import type { Layout } from "../engine/board";
import type { FloorId } from "../types";
import { definition, roomMarks } from "./house";
import { closedDoors, falseWindows, printedEdge, tileTurn, wallIsCut } from "./house-layout";
import { zFights, type PlaneFace, type ZFight } from "./zfight";

/*
 * The overlap check: builds a room and finds where its pieces meet badly.
 *
 * - A solid passing too far (`PASS_INTO`) into another piece, a wall, the
 *   floor, or a keep-clear zone (a doorway and the lane the house walks
 *   through it, and the six standing spots). The small overlaps that
 *   hide cracks between neighbours stay under it. A wall is its body: a
 *   piece may stand into the dressing (skirting, wainscot, casings), which
 *   it hides. Light (beams and pools, which write no depth) is not solid.
 * - A standing spot a figure can't walk to from the doors, one crowding
 *   another, or one standing in a doorway's lane (see `floorPlan`), and a
 *   walk the house makes across the room that a figure's base can't follow
 *   (see `walkFindings`).
 * - Two faces lying in one plane, facing the same way and sharing area,
 *   which z-fight (see `zfight.ts`), with the walls standing, cut, and cut on
 *   alternate edges, as the house shows them. Any two faces count, the
 *   shell's own included, and two of one piece: its boxes fight like any
 *   two pieces'. A face buried in a solid, or turned down, never shows.
 *
 * Geometry is exact: every mesh is split into its separate solids (each box
 * of a batch, each book), and each solid is tested as its convex hull with
 * the separating-axis test, so a piece lying at an angle is judged by its
 * real shape, not its bounding box. Solids that touch share corners; where
 * that joins them into something that isn't convex (a frame of four strips,
 * a lining round a hole), it is split again along its convex edges, so its
 * hull never fills the hole. A piece's own parts are built into each
 * other on purpose (a candle in its holder), so a piece is never tested
 * against itself for passing into, only for z-fighting.
 */

/** How far a solid may pass into another before it counts: this far, or a
 *  third of the thinner one's thickness (a book half sunk in the floor counts),
 *  but never less than `PASS_ALWAYS`, the overlap that hides a crack. */
export const PASS_INTO = 0.02;
const PASS_ALWAYS = 0.005;
/** The least area two owners' faces may share in one plane before they count as fighting, in m². */
const FIGHT_AREA = 1e-4;
/** How far round a standing spot is kept clear. */
const SPOT_CLEAR = 0.45;
/** The radius of a figure's base (`figureBase`): a walker needs this much clear floor round it. */
export const BASE_RADIUS = 0.36;
/** Anything solid between these heights blocks a walker: lower (scree, bones
 *  trodden flat), it is stepped over; higher, walked under. */
const STEP = 0.07;
const HEAD = 1.8;
/** The floor plan's grid, in metres. */
const CELL = 0.05;

/** What a solid or face belongs to: a prop, part of the shell, or a keep-clear zone. */
interface Owner {
  /** What a contact's `with` names it by. */
  name: string;
  /** How a finding names it. */
  label: string;
  prop?: PropPlacement;
  kind: "prop" | "shell" | "zone";
  /** In a house of rooms, the room it is in. */
  room?: string;
}

/** One separate solid (or flat sheet) of a mesh, in room coordinates. */
interface Part {
  id: number;
  owner: Owner;
  mesh: THREE.Object3D;
  points: THREE.Vector3[];
  normals: THREE.Vector3[];
  edges: THREE.Vector3[];
  box: THREE.Box3;
  /** Matter with volume, not a flat sheet or a volume of light. */
  solid: boolean;
  /** Its least thickness, across any of its faces. */
  thickness: number;
  /** Counts for passing into: for the shell, only the floor and the walls' bodies. */
  body: boolean;
}

interface Face extends PlaneFace<Owner> {
  mesh: THREE.Object3D;
  /** The full wall it is turned towards, if any: while that wall stands, it is seen only from beyond it, where the camera never is. */
  towards?: THREE.Object3D;
}

export interface Finding {
  /** Names the pieces and the kind of overlap, not its size: what a baseline lists. */
  key: string;
  /** The key with how much they overlap. */
  text: string;
  /** For a finding about the floor (a standing spot, a walk), where on it, in room metres. */
  at?: [x: number, z: number][];
}

export interface OverlapReport {
  findings: Finding[];
  /** The largest circle of open floor a walker can reach: room for a big monster. Reported, never failed on. */
  openFloor: { radius: number; at: [x: number, z: number] };
  /** Findings a piece declares as a contact. */
  accepted: Finding[];
  /** Declared contacts that match no finding: stale, or naming nothing. */
  unusedContacts: string[];
}

const HEX_TO_KEY = new Map(Object.entries(PALETTE).map(([key, hex]) => [hex.slice(1), key as PaletteKey]));

function colourName(colour: THREE.Color): string {
  return HEX_TO_KEY.get(colour.getHexString()) ?? `#${colour.getHexString()}`;
}

function materialOf(mesh: THREE.Mesh, triangle: number, geometry: THREE.BufferGeometry): THREE.Material {
  if (!Array.isArray(mesh.material)) return mesh.material;
  const index = triangle * 3;
  const group = geometry.groups.find((g) => index >= g.start && index < g.start + g.count);
  if (!group) throw new Error(`Triangle ${triangle} of a multi-material mesh is in no group`);
  return (mesh.material as THREE.Material[])[group.materialIndex ?? 0];
}

/** How a face draws, for a finding: its palette colour, or a texture. */
function colourOf(material: THREE.Material, vertexColour: THREE.Color | null): string {
  if ("map" in material && material.map instanceof THREE.Texture) return "a texture";
  const colour = vertexColour ?? ("color" in material && material.color instanceof THREE.Color ? material.color : null);
  return colour ? colourName(colour) : material.type;
}

/** A direction as an axis: unit length, its sign fixed, rounded so near-equal axes merge. */
function axisKey(v: THREE.Vector3): string | null {
  const length = v.length();
  if (length < 1e-9) return null;
  const u = v.clone().divideScalar(length);
  const flip = u.x < -1e-6 || (Math.abs(u.x) <= 1e-6 && (u.y < -1e-6 || (Math.abs(u.y) <= 1e-6 && u.z < 0)));
  if (flip) u.negate();
  return `${u.x.toFixed(4)},${u.y.toFixed(4)},${u.z.toFixed(4)}`;
}

function addAxis(axes: Map<string, THREE.Vector3>, v: THREE.Vector3) {
  const key = axisKey(v);
  if (key && !axes.has(key)) axes.set(key, v.clone().normalize());
}

interface Triangle {
  /** Vertex indices, and the corners where they lie. */
  ids: [number, number, number];
  keys: [string, string, string];
  points: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  normal: THREE.Vector3;
}

/** Whether every point lies on or behind the plane of every triangle: the triangles bound a convex solid. */
function convex(triangles: Triangle[]): boolean {
  const points = triangles.flatMap((triangle) => triangle.points);
  return triangles.every(({ normal, points: [a] }) => {
    const offset = normal.dot(a);
    return points.every((point) => normal.dot(point) - offset <= 1e-5);
  });
}

function unionFind(size: number) {
  const parent = Array.from({ length: size }, (_, i) => i);
  const root = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  return { root, join: (a: number, b: number) => (parent[root(a)] = root(b)) };
}

/** Whether a point lies on or behind a triangle's plane. */
function behindPlane({ normal, points: [a] }: Triangle, point: THREE.Vector3): boolean {
  return normal.dot(point) - normal.dot(a) <= 1e-5;
}

/**
 * Splits triangles that touching solids joined into one non-convex lump back
 * into those solids. Each piece grows from a triangle across the edges it
 * shares, taking a neighbour that is part of the same face (they share its
 * vertices) or meets it at a convex edge (each behind the other's plane), and
 * only while the piece stays convex. Two boxes that only touch meet flush or
 * at a hollow edge, so they come apart. Returns null when a piece isn't a
 * closed convex solid (a lathe, a hull), which is then judged whole as before.
 */
function convexPieces(triangles: Triangle[]): Triangle[][] | null {
  const byEdge = new Map<string, number[]>();
  triangles.forEach(({ keys }, t) => {
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
      const key = [keys[a], keys[b]].sort().join("|");
      const list = byEdge.get(key);
      if (list) list.push(t);
      else byEdge.set(key, [t]);
    }
  });
  const strictlyBehind = (from: Triangle, other: Triangle) =>
    other.points.every((point) => behindPlane(from, point)) && other.points.some((point) => from.normal.dot(point) - from.normal.dot(from.points[0]) < -1e-6);
  const taken = new Set<number>();
  const pieces: Triangle[][] = [];
  for (let seed = 0; seed < triangles.length; seed++) {
    if (taken.has(seed)) continue;
    taken.add(seed);
    const piece = [triangles[seed]];
    const frontier = [seed];
    while (frontier.length) {
      const t = frontier.pop() as number;
      const triangle = triangles[t];
      for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
        for (const n of byEdge.get([triangle.keys[a], triangle.keys[b]].sort().join("|")) ?? []) {
          if (taken.has(n)) continue;
          const other = triangles[n];
          const sameFace = triangle.ids.filter((id) => other.ids.includes(id)).length >= 2;
          if (!sameFace && !(strictlyBehind(triangle, other) && strictlyBehind(other, triangle))) continue;
          const stays = piece.every((member) => other.points.every((point) => behindPlane(member, point)) && member.points.every((point) => behindPlane(other, point)));
          if (!stays) continue;
          taken.add(n);
          piece.push(other);
          frontier.push(n);
        }
      }
    }
    pieces.push(piece);
  }
  return pieces.every((piece) => piece.length >= 4) ? pieces : null;
}

/** Splits a mesh into its separate solids and lists its faces, in room coordinates. */
function readMesh(mesh: THREE.Mesh, owner: Owner, parts: Part[], faces: Face[]) {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute("position");
  const colours = geometry.getAttribute("color") as THREE.BufferAttribute | undefined;
  const index = geometry.getIndex();
  const count = index ? index.count : position.count;
  const vertexAt = (i: number) => (index ? index.getX(i) : i);

  const world = Array.from({ length: position.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld));
  // Vertices at one place are one corner, so the faces of a box join into one solid.
  const cornerKey = world.map((point) => `${point.x.toFixed(5)},${point.y.toFixed(5)},${point.z.toFixed(5)}`);
  const first = new Map<string, number>();
  const corners = unionFind(position.count);
  cornerKey.forEach((key, i) => {
    const seen = first.get(key);
    if (seen === undefined) first.set(key, i);
    else corners.join(i, seen);
  });
  for (let t = 0; t < count; t += 3) {
    corners.join(vertexAt(t + 1), vertexAt(t));
    corners.join(vertexAt(t + 2), vertexAt(t));
  }

  const lumps = new Map<number, Triangle[]>();
  for (let t = 0; t < count; t += 3) {
    const ids: Triangle["ids"] = [vertexAt(t), vertexAt(t + 1), vertexAt(t + 2)];
    const [a, b, c] = ids.map((i) => world[i]);
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    if (normal.lengthSq() < 1e-14) continue;
    normal.normalize();
    const key = corners.root(ids[0]);
    const lump = lumps.get(key);
    const triangle: Triangle = { ids, keys: [cornerKey[ids[0]], cornerKey[ids[1]], cornerKey[ids[2]]], points: [a, b, c], normal };
    if (lump) lump.push(triangle);
    else lumps.set(key, [triangle]);

    const material = materialOf(mesh, t / 3, geometry);
    const vertexColour = colours && "vertexColors" in material && material.vertexColors ? new THREE.Color().fromBufferAttribute(colours, ids[0]) : null;
    const colour = colourOf(material, vertexColour);
    const writesDepth = material.depthWrite;
    faces.push({ owner, mesh, corners: [a, b, c], normal, writesDepth, colour });
    if (material.side === THREE.DoubleSide) faces.push({ owner, mesh, corners: [a, c, b], normal: normal.clone().negate(), writesDepth, colour });
  }

  const matter = [mesh.material].flat().every((material) => material.depthWrite);
  const body = owner.kind !== "shell" || owner.name === "floor" || (mesh.userData as { body?: boolean }).body === true;
  const solids = [...lumps.values()].flatMap((lump) => (convex(lump) ? [lump] : (convexPieces(lump) ?? [lump])));
  for (const solid of solids) {
    const pointMap = new Map<string, THREE.Vector3>();
    const normals = new Map<string, THREE.Vector3>();
    const edges = new Map<string, THREE.Vector3>();
    for (const { keys, points: [a, b, c], normal } of solid) {
      keys.forEach((key, k) => pointMap.set(key, [a, b, c][k]));
      addAxis(normals, normal);
      addAxis(edges, b.clone().sub(a));
      addAxis(edges, c.clone().sub(b));
      addAxis(edges, a.clone().sub(c));
    }
    const points = [...pointMap.values()];
    const axes = [...normals.values()];
    const thinnest = Math.min(...axes.map((n) => spread(points, n)));
    parts.push({
      id: parts.length,
      owner,
      mesh,
      points,
      normals: axes,
      edges: [...edges.values()],
      box: new THREE.Box3().setFromPoints(points),
      solid: matter && thinnest > 1e-4,
      thickness: thinnest,
      body,
    });
  }
}

function spread(points: THREE.Vector3[], axis: THREE.Vector3): number {
  let low = Infinity;
  let high = -Infinity;
  for (const point of points) {
    const d = point.dot(axis);
    low = Math.min(low, d);
    high = Math.max(high, d);
  }
  return high - low;
}

function projection(points: THREE.Vector3[], axis: THREE.Vector3): [number, number] {
  let low = Infinity;
  let high = -Infinity;
  for (const point of points) {
    const d = point.dot(axis);
    if (d < low) low = d;
    if (d > high) high = d;
  }
  return [low, high];
}

function passLimit(a: Part, b: Part): number {
  return Math.max(PASS_ALWAYS, Math.min(PASS_INTO, Math.min(a.thickness, b.thickness) / 3));
}

/** How far two convex solids pass into each other: the least overlap of their
 *  shadows on any separating axis, or 0 once it is known to be under `limit`. */
function depth(a: Part, b: Part, limit: number): number {
  let least = Infinity;
  const test = (axis: THREE.Vector3) => {
    const [a0, a1] = projection(a.points, axis);
    const [b0, b1] = projection(b.points, axis);
    least = Math.min(least, Math.min(a1, b1) - Math.max(a0, b0));
    return least > limit;
  };
  for (const axis of [...a.normals, ...b.normals]) if (!test(axis)) return 0;
  const cross = new THREE.Vector3();
  for (const ea of a.edges) {
    for (const eb of b.edges) {
      cross.crossVectors(ea, eb);
      if (cross.lengthSq() < 1e-10) continue;
      if (!test(cross.normalize())) return 0;
    }
  }
  return least;
}

function boxesOverlapBy(a: THREE.Box3, b: THREE.Box3, by: number): boolean {
  return (
    Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x) > by &&
    Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y) > by &&
    Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z) > by
  );
}

/** Whether a point lies inside a convex solid: within its extent along every face normal. */
function inside(part: Part, point: THREE.Vector3): boolean {
  if (!part.box.containsPoint(point)) return false;
  return part.normals.every((normal) => {
    const [low, high] = projection(part.points, normal);
    const d = point.dot(normal);
    return d > low && d < high;
  });
}

function zoneOwner(name: string): Owner {
  return { name, label: name.startsWith("spot ") ? `standing ${name}` : `the ${name}`, kind: "zone" };
}

/** The keep-clear zones as solid meshes in room coordinates: each doorway and
 *  passage with the lane the house walks straight through it, and the
 *  standing spots (`spot 1` to `spot 6`). The front door leads out of the
 *  house, so no one walks it. */
function zones(def: RoomDefinition): { owner: Owner; mesh: THREE.Mesh }[] {
  const tile = roomTile(def.id);
  const result: { owner: Owner; mesh: THREE.Mesh }[] = [];
  const depth = DOOR_APPROACH;
  const along: Record<Edge, (geometry: THREE.BufferGeometry) => void> = {
    top: (g) => g.translate(0, 0, -TILE / 2 + depth / 2),
    bottom: (g) => g.translate(0, 0, TILE / 2 - depth / 2),
    left: (g) => g.rotateY(Math.PI / 2).translate(-TILE / 2 + depth / 2, 0, 0),
    right: (g) => g.rotateY(Math.PI / 2).translate(TILE / 2 - depth / 2, 0, 0),
  };
  for (const edge of [...tile.doors, ...tile.passages]) {
    if (edge === tile.frontDoor) continue;
    const geometry = new THREE.BoxGeometry(DOOR_WIDTH, DOOR_HEIGHT, depth).translate(0, DOOR_HEIGHT / 2, 0);
    along[edge](geometry);
    result.push({ owner: zoneOwner(`doorway ${edge}`), mesh: new THREE.Mesh(geometry) });
  }
  standingSpots(def).forEach(([x, z], slot) => {
    // From a step up: a figure stands on a rug or a path, not in it.
    const geometry = new THREE.CylinderGeometry(SPOT_CLEAR, SPOT_CLEAR, HEAD - STEP, 8).translate(x, (HEAD + STEP) / 2, z);
    result.push({ owner: zoneOwner(`spot ${slot + 1}`), mesh: new THREE.Mesh(geometry) });
  });
  return result;
}

/** An edge a figure walks in by, and how wide its opening is. */
interface Entrance {
  edge: Edge;
  half: number;
}

/** Every doorway and passage but the front door, which leads out of the house. */
function entrances(def: RoomDefinition): Entrance[] {
  const tile = roomTile(def.id);
  return [
    ...tile.doors.filter((edge) => edge !== tile.frontDoor).map((edge) => ({ edge, half: DOOR_WIDTH / 2 })),
    ...tile.passages.map((edge) => ({ edge, half: INNER })),
  ];
}

/** A point `into` the room from the middle of an edge, in room metres. */
function edgePoint(edge: Edge, into: number): [x: number, z: number] {
  const at = TILE / 2 - into;
  const points: Record<Edge, [number, number]> = { top: [0, -at], bottom: [0, at], left: [-at, 0], right: [at, 0] };
  return points[edge];
}

function insideOpening(opening: FloorOpening, x: number, z: number): boolean {
  if ("x" in opening) return x > opening.x[0] && x < opening.x[1] && z > opening.z[0] && z < opening.z[1];
  let crossings = 0;
  const corners = opening.polygon;
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
    const [xi, zi] = corners[i];
    const [xj, zj] = corners[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) crossings++;
  }
  return crossings % 2 === 1;
}

/** The convex hull of points on the floor, anticlockwise (monotone chain). */
function hull2d(points: [number, number][]): [number, number][] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: [number, number][]) => {
    const chain: [number, number][] = [];
    for (const p of list) {
      while (chain.length >= 2 && cross(chain[chain.length - 2], chain[chain.length - 1], p) <= 0) chain.pop();
      chain.push(p);
    }
    chain.pop();
    return chain;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

function insideHull(hull: [number, number][], x: number, z: number): boolean {
  if (hull.length < 3) return false;
  for (let i = 0; i < hull.length; i++) {
    const [ax, az] = hull[i];
    const [bx, bz] = hull[(i + 1) % hull.length];
    if ((bx - ax) * (z - az) - (bz - az) * (x - ax) < 0) return false;
  }
  return true;
}

/** Squared distance to the nearest zero of `f` along a line, in cells (Felzenszwalb and Huttenlocher). */
function distance1d(f: Float64Array): Float64Array {
  const n = f.length;
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  let k = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  const meet = (q: number, r: number) => (f[q] + q * q - (f[r] + r * r)) / (2 * q - 2 * r);
  for (let q = 1; q < n; q++) {
    let s = meet(q, v[k]);
    while (s <= z[k]) {
      k--;
      s = meet(q, v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
  return d;
}

export interface FloorPlan {
  /** Cells per side; cell `j * size + i` is column i (along x) of row j (along z). */
  size: number;
  blocked: Uint8Array;
  /** How far each cell's centre is from anything blocked, in metres. */
  clearance: Float64Array;
  /** The cells a figure's base reaches, walking in from the doorways. */
  reached: Uint8Array;
  cellAt: (x: number, z: number) => number;
  centre: (cell: number) => [x: number, z: number];
}

/**
 * The floor as a figure walks it, on a grid of `CELL`: blocked by the walls
 * (open through each doorway and passage), by floor openings, and by any
 * solid a figure would walk into (between `STEP` and `HEAD` high). A base
 * fits where a cell is at least `BASE_RADIUS` clear of everything blocked,
 * and the walk floods in from every doorway.
 */
export function floorPlan(def: RoomDefinition, solids: Part[]): FloorPlan {
  const size = Math.round(TILE / CELL);
  const centre = (cell: number): [number, number] => [-TILE / 2 + ((cell % size) + 0.5) * CELL, -TILE / 2 + (Math.floor(cell / size) + 0.5) * CELL];
  const index = (value: number) => Math.min(size - 1, Math.max(0, Math.floor((value + TILE / 2) / CELL)));
  const cellAt = (x: number, z: number) => index(z) * size + index(x);
  const ways = entrances(def);
  const throughWall = (x: number, z: number) => {
    if (Math.abs(x) > INNER && Math.abs(z) > INNER) return false;
    if (Math.abs(z) > INNER) return ways.some((way) => way.edge === (z < 0 ? "top" : "bottom") && Math.abs(x) < way.half);
    return ways.some((way) => way.edge === (x < 0 ? "left" : "right") && Math.abs(z) < way.half);
  };
  const blocked = new Uint8Array(size * size);
  for (let cell = 0; cell < blocked.length; cell++) {
    const [x, z] = centre(cell);
    const inWall = Math.abs(x) > INNER || Math.abs(z) > INNER;
    if ((inWall && !throughWall(x, z)) || (def.floorOpenings ?? []).some((opening) => insideOpening(opening, x, z))) blocked[cell] = 1;
  }
  for (const part of solids) {
    if (part.box.max.y <= STEP || part.box.min.y >= HEAD) continue;
    const footprint = hull2d(part.points.map((point): [number, number] => [point.x, point.z]));
    for (let j = index(part.box.min.z); j <= index(part.box.max.z); j++) {
      for (let i = index(part.box.min.x); i <= index(part.box.max.x); i++) {
        const cell = j * size + i;
        if (!blocked[cell] && insideHull(footprint, ...centre(cell))) blocked[cell] = 1;
      }
    }
  }

  const far = size * size * 4;
  const columns = new Float64Array(size * size);
  const line = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) line[j] = blocked[j * size + i] ? 0 : far;
    const d = distance1d(line);
    for (let j = 0; j < size; j++) columns[j * size + i] = d[j];
  }
  const clearance = new Float64Array(size * size);
  for (let j = 0; j < size; j++) {
    const d = distance1d(columns.slice(j * size, (j + 1) * size));
    for (let i = 0; i < size; i++) clearance[j * size + i] = Math.max(0, Math.sqrt(d[i]) * CELL - CELL / 2);
  }

  const reached = new Uint8Array(size * size);
  const queue: number[] = [];
  for (const { edge } of ways) {
    for (let into = CELL / 2; into < DOOR_APPROACH; into += CELL) {
      const cell = cellAt(...edgePoint(edge, into));
      if (clearance[cell] < BASE_RADIUS) continue;
      reached[cell] = 1;
      queue.push(cell);
      break;
    }
  }
  for (let cell = queue.pop(); cell !== undefined; cell = queue.pop()) {
    const i = cell % size;
    const j = Math.floor(cell / size);
    for (const [ni, nj] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
      if (ni < 0 || nj < 0 || ni >= size || nj >= size) continue;
      const next = nj * size + ni;
      if (reached[next] || clearance[next] < BASE_RADIUS) continue;
      reached[next] = 1;
      queue.push(next);
    }
  }
  return { size, blocked, clearance, reached, cellAt, centre };
}

/** What is wrong with the standing spots: one out of reach of the doors, two crowding each other, or one in a doorway's lane. */
function spotFindings(def: RoomDefinition, plan: FloorPlan): Finding[] {
  const spots = standingSpots(def);
  const name = (slot: number) => `standing spot ${slot + 1} at (${spots[slot][0].toFixed(2)}, ${spots[slot][1].toFixed(2)})`;
  const findings: Finding[] = [];
  const add = (key: string, ...slots: number[]) => findings.push({ key, text: key, at: slots.map((slot) => spots[slot]) });
  spots.forEach(([x, z], slot) => {
    if (!plan.reached[plan.cellAt(x, z)]) add(`${name(slot)} can't be reached from the doors`, slot);
    spots.forEach(([ox, oz], other) => {
      if (other > slot && Math.hypot(ox - x, oz - z) < 2 * BASE_RADIUS) add(`${name(slot)} crowds ${name(other)}`, slot, other);
    });
    for (const { edge } of entrances(def)) {
      // The spot in the doorway's own frame: `along` across it, `into` the room from the tile's edge.
      const along = edge === "top" || edge === "bottom" ? x : z;
      const into = TILE / 2 - (edge === "top" ? -z : edge === "bottom" ? z : edge === "left" ? -x : x);
      const off = Math.hypot(Math.max(0, Math.abs(along) - DOOR_WIDTH / 2), Math.max(0, into - DOOR_APPROACH));
      if (off < BASE_RADIUS) add(`${name(slot)} stands in the doorway ${edge}'s lane`, slot);
    }
  });
  return findings;
}

type Point3 = readonly [x: number, y: number, z: number];

/** Where a walk across the room starts or ends; a doorway's walk carries on `out` through it. */
export interface WalkEnd {
  name: string;
  at: Point3;
  out?: Point3;
}

/** Where walks across the room start and end, besides the standing spots:
 *  each doorway's approach, and the foot of each stair. */
function walkEnds(def: RoomDefinition): WalkEnd[] {
  return [
    ...entrances(def).map(({ edge }) => {
      const [x, z] = edgePoint(edge, DOOR_APPROACH);
      const [ox, oz] = edgePoint(edge, 0);
      return { name: `the doorway ${edge}`, at: [x, 0, z] as Point3, out: [ox, 0, oz] as Point3 };
    }),
    ...Object.entries(def.stairs ?? {}).map(([toward, run]) => ({ name: `the stair to ${toward}`, at: run[0] })),
  ];
}

/** A walk the house makes across a room: the points it passes through, in
 *  room metres, a doorway's from the tile's edge. */
export interface RoomWalk {
  from: string;
  to: string;
  path: Point3[];
  /** The first place a figure's base can't follow it, or null where it can. */
  blockedAt: [x: number, z: number] | null;
}

/**
 * The walks the house makes across the room: from each standing spot to each
 * doorway and the foot of each stair, and from each of those to every other,
 * by the room's own `waypoints`. A walk is clear where a figure's base fits
 * at every step of it; along the crossing, the floor's openings (a gulf
 * bridged) don't count.
 */
function checkedWalks(def: RoomDefinition, ends: WalkEnd[], plan: FloorPlan, bridged: FloorPlan): RoomWalk[] {
  const crossing = new Set<Point3>(def.crossing ?? []);
  const spots = standingSpots(def).map(([x, z], slot) => ({ name: `standing spot ${slot + 1}`, at: [x, 0, z] as Point3 }));
  const blockedAt = (a: Point3, b: Point3, floor: FloorPlan): [number, number] | null => {
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / (CELL / 2)));
    for (let k = 0; k <= steps; k++) {
      const [x, z] = [a[0] + ((b[0] - a[0]) * k) / steps, a[2] + ((b[2] - a[2]) * k) / steps];
      if (floor.clearance[floor.cellAt(x, z)] < BASE_RADIUS) return [x, z];
    }
    return null;
  };
  const walk = (from: WalkEnd, to: WalkEnd): RoomWalk => {
    const path = [...(from.out ? [from.out] : []), from.at, ...waypoints(def, from.at, to.at), to.at, ...(to.out ? [to.out] : [])];
    for (let i = 1; i < path.length; i++) {
      const across = crossing.has(path[i - 1]) && crossing.has(path[i]);
      const at = blockedAt(path[i - 1], path[i], across ? bridged : plan);
      if (at) return { from: from.name, to: to.name, path, blockedAt: at };
    }
    return { from: from.name, to: to.name, path, blockedAt: null };
  };
  return [...spots.flatMap((spot) => ends.map((end) => walk(spot, end))), ...ends.flatMap((end, i) => ends.slice(i + 1).map((other) => walk(end, other)))];
}

function walkFindings(walks: RoomWalk[]): Finding[] {
  return walks.flatMap(({ from, to, blockedAt: at }) => {
    if (!at) return [];
    const key = `the walk from ${from} to ${to} is blocked`;
    return [{ key, text: `${key} at (${at[0].toFixed(2)}, ${at[1].toFixed(2)})`, at: [at] }];
  });
}

/** The largest circle of the room's own floor a figure can walk to: its
 *  centre, and how far it is from anything blocked or the edge of the floor
 *  (an open passage leads on into the next room, which isn't this room's). */
function openFloor(plan: FloorPlan): OverlapReport["openFloor"] {
  let best: OverlapReport["openFloor"] = { radius: 0, at: [0, 0] };
  for (let cell = 0; cell < plan.clearance.length; cell++) {
    if (!plan.reached[cell]) continue;
    const [x, z] = plan.centre(cell);
    const radius = Math.min(plan.clearance[cell], INNER - Math.abs(x), INNER - Math.abs(z));
    if (radius > best.radius) best = { radius, at: [x, z] };
  }
  return best;
}

function ownerOf(object: THREE.Object3D, room?: string): Owner {
  const where = (label: string) => (room ? `${room}: ${label}` : label);
  for (let at: THREE.Object3D | null = object; at; at = at.parent) {
    const piece = pieceOf(at);
    if (!piece) continue;
    if ("prop" in piece) return { name: pieceName(piece.prop), label: where(pieceLabel(piece.prop)), prop: piece.prop, kind: "prop", room };
    return { name: piece.shell, label: where(piece.shell === "floor" ? "the floor" : `the ${piece.shell} wall`), kind: "shell", room };
  }
  throw new Error("A mesh of the room belongs to no piece");
}

/** The size of the grid solids are filed in, to find the ones round a point, in metres. */
const SOLID_CELL = 0.25;

/** Whether a point lies inside any of the solids, filed on a grid by their bounds so each point tests only its neighbours. */
function solidIndex(solids: Part[]): (point: THREE.Vector3) => boolean {
  const cells = new Map<string, Part[]>();
  const cell = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const index = (value: number) => Math.floor(value / SOLID_CELL);
  for (const part of solids) {
    const { min, max } = part.box;
    for (let x = index(min.x); x <= index(max.x); x++) {
      for (let y = index(min.y); y <= index(max.y); y++) {
        for (let z = index(min.z); z <= index(max.z); z++) {
          const key = cell(x, y, z);
          const list = cells.get(key);
          if (list) list.push(part);
          else cells.set(key, [part]);
        }
      }
    }
  }
  return (point) => (cells.get(cell(index(point.x), index(point.y), index(point.z))) ?? []).some((part) => inside(part, point));
}

/** A face by its corners, so one fight met in several cut states counts once. */
function faceKey({ corners }: PlaneFace<Owner>): string {
  return corners.map((p) => `${p.x.toFixed(5)},${p.y.toFixed(5)},${p.z.toFixed(5)}`).join(";");
}

function showing(object: THREE.Object3D): boolean {
  for (let at: THREE.Object3D | null = object; at; at = at.parent) if (!at.visible) return false;
  return true;
}

/** The ways the house shows a room's walls: all standing, all cut, and cut on
 *  alternate edges, which shows each corner piece that stands only between a
 *  standing wall and a cut one. */
const CUT_STATES: ((edge: Edge) => boolean)[] = [() => false, () => true, (edge) => edge === "top" || edge === "bottom", (edge) => edge === "left" || edge === "right"];

type Kind = "passes into" | "z-fights with";

/** Where two owners fight worst: the biggest shared patch's plane, and how far apart their faces are there. */
function fightDetail({ a, b, at, gap }: ZFight<Owner>): string {
  const n = a.normal;
  const where = `(${at.x.toFixed(2)}, ${at.y.toFixed(3)}, ${at.z.toFixed(2)})`;
  return `${a.colour} and ${b.colour}, in the plane facing (${n.x.toFixed(2)}, ${n.y.toFixed(2)}, ${n.z.toFixed(2)}) through ${where}, ${(gap * 1000).toFixed(2)} mm apart`;
}

/**
 * Reads every mesh of a built room once, as it stands in the world (each way
 * of cutting the walls then shows some of them): its solids, and its faces
 * that can show. The house never shows a standing wall from outside (as
 * `freezeRoom` holds), since the camera is always on its room's side, so
 * those faces are left out. `room` names the room in a house of them.
 */
function readRoom(part: RoomPart, room?: string): { parts: Part[]; faces: Face[] } {
  const parts: Part[] = [];
  const read: Face[] = [];
  part.root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if ((object.userData as { bakeOnly?: boolean }).bakeOnly) return;
    readMesh(object, ownerOf(object, room), parts, read);
  });
  const outward = (edge: Edge) => new THREE.Vector3(OUTWARD[edge].x, 0, OUTWARD[edge].y).transformDirection(part.root.matrixWorld);
  const fullWalls = new Map([...part.walls.map(({ edge, full }) => [full, outward(edge)] as const), ...part.corners.map(({ side, object }) => [object, outward(side)] as const)]);
  const outsideOf = (object: THREE.Object3D): THREE.Vector3 | undefined => {
    for (let at: THREE.Object3D | null = object; at; at = at.parent) {
      const found = fullWalls.get(at);
      if (found) return found;
    }
    return undefined;
  };
  const faces = read.filter(({ mesh, normal }) => {
    const outside = outsideOf(mesh);
    return !outside || normal.dot(outside) <= 0.5;
  });
  for (const face of faces) face.towards = part.walls.find(({ edge }) => face.normal.dot(outward(edge)) > 0.5)?.full;
  return { parts, faces };
}

/** The pairs of faces that fight in any of `states` (each shows the rooms one
 *  way), a pair met in several counted once, by its largest patch in any. */
function fightsIn(states: (() => void)[], parts: Part[], faces: Face[], pairs?: (a: Owner, b: Owner) => boolean): ZFight<Owner>[] {
  const fights = new Map<string, ZFight<Owner>>();
  for (const show of states) {
    show();
    const within = solidIndex(parts.filter((part) => part.solid && showing(part.mesh)));
    const shownFaces = faces.filter((face) => showing(face.mesh) && !(face.towards && showing(face.towards)));
    for (const fight of zFights(shownFaces, { buried: within, pairs })) {
      const key = `${faceKey(fight.a)}|${faceKey(fight.b)}`;
      const seen = fights.get(key);
      if (!seen || fight.area > seen.area) fights.set(key, fight);
    }
  }
  return [...fights.values()];
}

/** A room built as the bench shows it, its walls standing, its clock at `at`. */
function standingRoom(def: RoomDefinition, at: number): RoomPart {
  const room = buildRoom(def, { explorer: null });
  room.cutWalls(() => false);
  room.update(at);
  room.root.updateMatrixWorld(true);
  return room;
}

/** The floor as a figure walks it, and what is wrong there: the standing
 *  spots and the walks across the room, and its largest open circle. */
export interface FloorReport {
  plan: FloorPlan;
  /** Where walks start and end, besides the standing spots. */
  ends: WalkEnd[];
  walks: RoomWalk[];
  findings: Finding[];
  openFloor: OverlapReport["openFloor"];
}

/** The floor checks, on the solids standing in the room. */
function floorReport(def: RoomDefinition, solids: Part[]): FloorReport {
  const blockers = solids.filter((part) => part.owner.kind === "prop" || (part.body && part.owner.name !== "floor"));
  const plan = floorPlan(def, blockers);
  const bridged = def.crossing ? floorPlan({ ...def, floorOpenings: [] }, blockers) : plan;
  const ends = walkEnds(def);
  const walks = checkedWalks(def, ends, plan, bridged);
  return { plan, ends, walks, findings: [...spotFindings(def, plan), ...walkFindings(walks)], openFloor: openFloor(plan) };
}

/** Builds a room, as the bench shows it, and runs the floor checks alone:
 *  quicker than `checkRoom`, which tests every piece against the others too. */
export function checkFloor(def: RoomDefinition, at = 2): FloorReport {
  const room = standingRoom(def, at);
  const { parts } = readRoom(room);
  const report = floorReport(def, parts.filter((part) => part.solid && showing(part.mesh)));
  room.dispose();
  return report;
}

/** Builds a room, as the bench shows it, and finds its overlaps. */
export function checkRoom(def: RoomDefinition, at = 2): OverlapReport {
  const room = standingRoom(def, at);
  const { parts, faces } = readRoom(room);
  // The house's choice marks glow in the room, drawing no depth: a face in one of their planes fights them.
  const marks = roomMarks(def);
  marks.updateMatrixWorld(true);
  marks.traverse((object) => {
    if (object instanceof THREE.Mesh) readMesh(object, zoneOwner("choice marks"), [], faces);
  });
  const clearParts: Part[] = [];
  for (const { owner, mesh } of zones(def)) {
    mesh.updateMatrixWorld(true);
    readMesh(mesh, owner, clearParts, []);
  }

  const found = new Map<string, { a: Owner; b: Owner; kind: Kind; amount: number; detail: string; worst: number }>();
  const record = (a: Owner, b: Owner, kind: Kind, amount: number, detail: () => string, worst = amount) => {
    const [first, second] = a.label <= b.label ? [a, b] : [b, a];
    const same = first.prop === second.prop && first.name === second.name;
    const key = same ? `${first.label} ${kind} itself` : `${first.label} ${kind} ${second.label}`;
    const seen = found.get(key);
    if (!seen) found.set(key, { a: first, b: second, kind, amount, detail: detail(), worst });
    else if (kind === "passes into") seen.amount = Math.max(seen.amount, amount);
    else {
      seen.amount += amount;
      if (worst > seen.worst) [seen.worst, seen.detail] = [worst, detail()];
    }
  };

  const standing = new Set(parts.filter((part) => showing(part.mesh)));
  const solids = parts.filter((part) => part.solid && standing.has(part));
  const props = solids.filter((part) => part.owner.kind === "prop");
  const others = [...solids.filter((part) => part.body), ...clearParts];
  for (const a of props) {
    for (const b of others) {
      if (b.owner.kind === "prop" && (b.owner.prop === a.owner.prop || b.id <= a.id)) continue;
      const limit = passLimit(a, b);
      if (!boxesOverlapBy(a.box, b.box, limit)) continue;
      const amount = depth(a, b, limit);
      if (amount > limit) record(a.owner, b.owner, "passes into", amount, () => "");
    }
  }

  const fights = fightsIn(
    CUT_STATES.map((isCut) => () => room.cutWalls(isCut)),
    parts,
    faces,
  );
  room.cutWalls(() => false);
  for (const fight of fights) record(fight.a.owner, fight.b.owner, "z-fights with", fight.area, () => fightDetail(fight));

  const findings: Finding[] = [];
  const accepted: Finding[] = [];
  const used = new Set<string>();
  for (const [key, { a, b, kind, amount, detail }] of found) {
    if (kind === "z-fights with" && amount < FIGHT_AREA) continue;
    const size = kind === "passes into" ? `${(amount * 100).toFixed(1)} cm deep` : `over ${(amount * 1e4).toFixed(0)} cm² (${detail})`;
    const finding = { key, text: `${key}, ${size}` };
    const declared = [
      ...(a.prop?.contacts ?? []).filter((contact) => contact.with === b.name).map((contact) => `${a.label} with ${contact.with}`),
      ...(b.prop?.contacts ?? []).filter((contact) => contact.with === a.name).map((contact) => `${b.label} with ${contact.with}`),
    ];
    for (const contact of declared) used.add(contact);
    (declared.length ? accepted : findings).push(finding);
  }
  const unusedContacts = def.props.flatMap((prop) =>
    (prop.contacts ?? []).map((contact) => `${pieceLabel(prop)} with ${contact.with}`).filter((contact) => !used.has(contact)),
  );
  const floor = floorReport(def, solids);
  findings.push(...floor.findings);
  room.dispose();
  disposeTree(marks);
  return { findings, accepted, unusedContacts, openFloor: floor.openFloor };
}

/** The ways the house cuts its walls: for a camera looking from each side and each corner, and with every wall raised. */
const HOUSE_VIEWS: ({ x: number; z: number } | null)[] = [null, ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ x: Math.sin((i * Math.PI) / 4), z: Math.cos((i * Math.PI) / 4) }))];

/**
 * The z-fighting between the rooms of one floor of a house, built and laid as
 * the house lays them (doors onto a neighbour's wall shut, windows against one
 * boarded) and cut as the house cuts them from every side: where neighbouring
 * tiles each build their side of a shared edge, the faces of one room against
 * another's. A room's fights with itself are its own check's.
 */
export function checkHouseFloor(layout: Layout, floor: FloorId): Finding[] {
  const tiles = layout.tiles.filter((tile) => tile.floor === floor);
  const rooms = tiles.map((tile) => {
    const part = buildRoom(definition(tile.tile), { explorer: null, closedDoors: closedDoors(layout, CATALOG, tile), falseWindows: falseWindows(layout, CATALOG, tile) });
    part.root.position.set(tile.x * TILE, 0, tile.y * TILE);
    part.root.rotation.y = tileTurn(tile.rotation);
    part.root.updateMatrixWorld(true);
    return { tile, part, ...readRoom(part, tile.tile) };
  });
  const states = HOUSE_VIEWS.map((camera) => () => {
    for (const { tile, part } of rooms) {
      const direction = (printed: Edge) => EDGES.find((edge) => printedEdge(edge, tile.rotation) === printed) ?? printed;
      part.cutWalls((printed) => camera !== null && wallIsCut(layout, tile, direction(printed), camera, null));
    }
  });
  const fights = fightsIn(
    states,
    rooms.flatMap((room) => room.parts),
    rooms.flatMap((room) => room.faces),
    (a, b) => a.room !== b.room,
  );
  for (const { part } of rooms) part.dispose();
  const totals = new Map<string, { area: number; worst: ZFight<Owner> }>();
  for (const fight of fights) {
    const [first, second] = [fight.a.owner.label, fight.b.owner.label].sort();
    const key = `${first} z-fights with ${second}`;
    const seen = totals.get(key);
    if (!seen) totals.set(key, { area: fight.area, worst: fight });
    else {
      seen.area += fight.area;
      if (fight.area > seen.worst.area) seen.worst = fight;
    }
  }
  return [...totals].filter(([, { area }]) => area >= FIGHT_AREA).map(([key, { area, worst }]) => ({ key, text: `${key}, over ${(area * 1e4).toFixed(0)} cm² (${fightDetail(worst)})` }));
}
