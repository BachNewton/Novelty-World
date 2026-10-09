import * as THREE from "three";
import type { Edge } from "../types";
import { PALETTE, type PaletteKey } from "./palette";
import { DOOR_HEIGHT, DOOR_WIDTH, TILE, explorerSpots, pieceLabel, pieceName, type PropPlacement, type RoomDefinition } from "./room";
import { buildRoom, pieceOf, roomTile } from "./stage";

/*
 * The overlap check: builds a room and finds where its pieces meet badly.
 *
 * - A solid passing too far (`PASS_INTO`) into another piece, a wall, the
 *   floor, or a keep-clear zone (a doorway and the lane the house walks
 *   through it, and the two spots explorers stand on). The small overlaps that
 *   hide cracks between neighbours stay under it. A wall is its body: a
 *   piece may stand into the dressing (skirting, wainscot, casings), which
 *   it hides. Light (beams and pools, which write no depth) is not solid.
 * - Two faces of different look lying in one plane, facing the same way and
 *   sharing area, which z-fight. A face buried in a solid (a foot on the
 *   floor, a back against a wall, a joint inside a neighbour), or turned
 *   down, away from every camera, never shows, so it doesn't count.
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
/** Faces nearer than this to one plane fight for the same depth. */
const SAME_PLANE = 0.001;
/** A face turned further down than this (the y of its normal) faces away from every camera. */
const FACING_DOWN = 0.5;
/** The least shared area of two faces in one plane that counts, in m². */
const FIGHT_AREA = 1e-4;
/** How far round the explorer's spot is kept clear. */
const PAWN_CLEAR = 0.45;
/** How far into the room the house lines a walker up with a doorway. */
const DOOR_APPROACH = 0.8;

/** What a solid or face belongs to: a prop, part of the shell, or a keep-clear zone. */
interface Owner {
  /** What a contact's `with` names it by. */
  name: string;
  /** How a finding names it. */
  label: string;
  prop?: PropPlacement;
  kind: "prop" | "shell" | "zone";
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

interface Face {
  id: number;
  owner: Owner;
  mesh: THREE.Object3D;
  corners: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  normal: THREE.Vector3;
  offset: number;
  /** Faces that look alike can share a plane unseen. */
  look: string;
  colour: string;
}

export interface Finding {
  /** Names the pieces and the kind of overlap, not its size: what a baseline lists. */
  key: string;
  /** The key with how much they overlap. */
  text: string;
}

export interface OverlapReport {
  findings: Finding[];
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

/** How a face draws, as far as z-fighting goes: two faces with the same key look the same. */
function lookOf(material: THREE.Material, vertexColour: THREE.Color | null): { look: string; colour: string } {
  const map = "map" in material && material.map instanceof THREE.Texture ? material.map : null;
  if (map) return { look: `map:${map.uuid}`, colour: "a texture" };
  const colour = vertexColour ?? ("color" in material && material.color instanceof THREE.Color ? material.color : null);
  const name = colour ? colourName(colour) : material.type;
  return { look: `${material.type}:${name}`, colour: name };
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
    const { look, colour } = lookOf(material, vertexColour);
    const faceCorners: Face["corners"] = [a, b, c];
    faces.push({ id: faces.length, owner, mesh, corners: faceCorners, normal, offset: normal.dot(a), look, colour });
    if (material.side === THREE.DoubleSide) {
      const back = normal.clone().negate();
      faces.push({ id: faces.length, owner, mesh, corners: [a, c, b], normal: back, offset: back.dot(a), look, colour });
    }
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

/** How far inside a solid a face is looked for, past the plane it shares. */
const BURIED = 0.003;

/** Whether a point lies inside a convex solid: within its extent along every face normal. */
function inside(part: Part, point: THREE.Vector3): boolean {
  if (!part.box.containsPoint(point)) return false;
  return part.normals.every((normal) => {
    const [low, high] = projection(part.points, normal);
    const d = point.dot(normal);
    return d > low && d < high;
  });
}

/** A face's corners in its plane's own 2D frame, anticlockwise seen from the front. */
function flatten(corners: THREE.Vector3[], normal: THREE.Vector3): THREE.Vector2[] {
  const [u, v] = basis(normal);
  return corners.map((p) => new THREE.Vector2(p.dot(u), p.dot(v)));
}

/** Two directions across a plane, square to each other and to its normal. */
function basis(normal: THREE.Vector3): [THREE.Vector3, THREE.Vector3] {
  const u = new THREE.Vector3().crossVectors(Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0), normal).normalize();
  return [u, new THREE.Vector3().crossVectors(normal, u)];
}

function area(polygon: THREE.Vector2[]): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

function anticlockwise(polygon: THREE.Vector2[]): THREE.Vector2[] {
  return area(polygon) < 0 ? polygon.reverse() : polygon;
}

/** The part of a convex polygon inside another convex polygon (both anticlockwise). */
function clip(subject: THREE.Vector2[], by: THREE.Vector2[]): THREE.Vector2[] {
  let output = subject;
  for (let i = 0; i < by.length && output.length; i++) {
    const a = by[i];
    const b = by[(i + 1) % by.length];
    const inside = (p: THREE.Vector2) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) >= -1e-12;
    const input = output;
    output = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j];
      const q = input[(j + 1) % input.length];
      const crossing = () => {
        const d1 = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
        const d2 = (b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x);
        return p.clone().lerp(q, d1 / (d1 - d2));
      };
      if (inside(p)) {
        output.push(p);
        if (!inside(q)) output.push(crossing());
      } else if (inside(q)) {
        output.push(crossing());
      }
    }
  }
  return output;
}

function centroid(polygon: THREE.Vector2[]): THREE.Vector2 {
  return polygon.reduce((sum, p) => sum.add(p), new THREE.Vector2()).divideScalar(polygon.length);
}

/** Faces filed by plane, so faces in one plane are found without testing every pair. */
function planeIndex(faces: Face[]) {
  const files = new Map<string, Face[]>();
  const normalKey = (n: THREE.Vector3) => `${n.x.toFixed(3)},${n.y.toFixed(3)},${n.z.toFixed(3)}`;
  const slot = (offset: number) => Math.round(offset / SAME_PLANE);
  for (const face of faces) {
    const key = `${normalKey(face.normal)}@${slot(face.offset)}`;
    const file = files.get(key);
    if (file) file.push(face);
    else files.set(key, [face]);
  }
  /** Every face in the plane `normal`·p = `offset`, give or take `SAME_PLANE`. */
  const near = (normal: THREE.Vector3, offset: number): Face[] => {
    const at = slot(offset);
    return [at - 1, at, at + 1].flatMap((s) => files.get(`${normalKey(normal)}@${s}`) ?? []).filter(
      (face) => face.normal.dot(normal) > 0.9999 && Math.abs(face.offset - offset) <= SAME_PLANE,
    );
  };
  return { files, near };
}

const ZONE_LABELS: Record<string, string> = { pawn: "the pawn's spot", "second spot": "the second explorer's spot" };

function zoneOwner(name: string): Owner {
  return { name, label: ZONE_LABELS[name] ?? `the ${name}`, kind: "zone" };
}

/** The keep-clear zones as solid meshes in room coordinates: each doorway and
 *  passage with the lane the house walks straight through it, and the spots
 *  explorers stand on (`pawn`, and the `second spot` beside it). The front
 *  door leads out of the house, so no one walks it. */
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
  if (def.pawn) {
    explorerSpots(def.pawn).forEach(([x, z], slot) => {
      const geometry = new THREE.CylinderGeometry(PAWN_CLEAR, PAWN_CLEAR, 1.8, 8).translate(x, 0.9, z);
      result.push({ owner: zoneOwner(slot === 0 ? "pawn" : "second spot"), mesh: new THREE.Mesh(geometry) });
    });
  }
  return result;
}

function ownerOf(object: THREE.Object3D): Owner {
  for (let at: THREE.Object3D | null = object; at; at = at.parent) {
    const piece = pieceOf(at);
    if (!piece) continue;
    if ("prop" in piece) return { name: pieceName(piece.prop), label: pieceLabel(piece.prop), prop: piece.prop, kind: "prop" };
    return { name: piece.shell, label: piece.shell === "floor" ? "the floor" : `the ${piece.shell} wall`, kind: "shell" };
  }
  throw new Error("A mesh of the room belongs to no piece");
}

function showing(object: THREE.Object3D): boolean {
  for (let at: THREE.Object3D | null = object; at; at = at.parent) if (!at.visible) return false;
  return true;
}

/** Builds a room, as the bench shows it with every wall standing, and finds its overlaps. */
export function checkRoom(def: RoomDefinition, at = 2): OverlapReport {
  const room = buildRoom(def, { explorer: null });
  room.cutWalls(() => false);
  room.update(at);
  room.root.updateMatrixWorld(true);

  const parts: Part[] = [];
  const faces: Face[] = [];
  room.root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !showing(object)) return;
    if ((object.userData as { bakeOnly?: boolean }).bakeOnly) return;
    readMesh(object, ownerOf(object), parts, faces);
  });
  const clearParts: Part[] = [];
  for (const { owner, mesh } of zones(def)) {
    mesh.updateMatrixWorld(true);
    readMesh(mesh, owner, clearParts, []);
  }

  const found = new Map<string, { a: Owner; b: Owner; kind: "passes into" | "z-fights with"; amount: number; detail: string }>();
  const record = (a: Owner, b: Owner, kind: "passes into" | "z-fights with", amount: number, detail: string) => {
    const [first, second] = a.label <= b.label ? [a, b] : [b, a];
    const key = first === second || first.prop === second.prop ? `${first.label} ${kind} itself` : `${first.label} ${kind} ${second.label}`;
    const seen = found.get(key);
    if (!seen) found.set(key, { a: first, b: second, kind, amount, detail });
    else if (kind === "passes into") seen.amount = Math.max(seen.amount, amount);
    else seen.amount += amount;
  };

  const solids = parts.filter((part) => part.solid);
  const props = solids.filter((part) => part.owner.kind === "prop");
  const others = [...solids.filter((part) => part.body), ...clearParts];
  for (const a of props) {
    for (const b of others) {
      if (b.owner.kind === "prop" && (b.owner.prop === a.owner.prop || b.id <= a.id)) continue;
      const limit = passLimit(a, b);
      if (!boxesOverlapBy(a.box, b.box, limit)) continue;
      const amount = depth(a, b, limit);
      if (amount > limit) record(a.owner, b.owner, "passes into", amount, "");
    }
  }

  const index = planeIndex(faces);
  for (const file of index.files.values()) {
    for (const face of file) {
      for (const other of index.near(face.normal, face.offset)) {
        if (other === face || other.mesh === face.mesh || other.look === face.look) continue;
        // The shell's own joints are the stage's, the same in every room.
        if (face.owner.kind === "shell" && other.owner.kind === "shell") continue;
        // Every camera looks down on the room, so a face turned down never shows.
        if (face.normal.y < -FACING_DOWN) continue;
        if (other.id < face.id) continue;
        const shared = clip(anticlockwise(flatten(face.corners, face.normal)), anticlockwise(flatten(other.corners, face.normal)));
        if (shared.length < 3) continue;
        const size = Math.abs(area(shared));
        if (size < 1e-7) continue;
        // A shared patch shows unless the solid in front of it buries it.
        const middle = centroid(shared);
        const [u, v] = basis(face.normal);
        const front = u.multiplyScalar(middle.x).addScaledVector(v, middle.y).addScaledVector(face.normal, face.offset + BURIED);
        const buried = solids.some((part) => inside(part, front));
        if (!buried) record(face.owner, other.owner, "z-fights with", size, `${face.colour} and ${other.colour}`);
      }
    }
  }

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
  room.dispose();
  return { findings, accepted, unusedContacts };
}
