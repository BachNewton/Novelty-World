import * as THREE from "three";
import type { Edge } from "../types";
import { animationOf, type Animation } from "./animate";
import { LIGHTMAP, type BakedLight } from "./lighting";
import { EDGES, OUTWARD, pieceOf, type RoomPart } from "./stage";
import type { PropPlacement } from "./room";

/*
 * Freezing a built room: everything in it that stands still is merged, by
 * how it draws, into a handful of meshes, so a room costs a few draw calls
 * rather than hundreds; and every lit surface gets a place in the room's
 * lightmap (a second set of UVs, `uv1`), which the bake fills. What moves
 * (the explorer, animated pieces) stays as it was, lit by light probes.
 *
 * Walls come and go as the camera cuts them, so every merged vertex carries
 * its role per edge (`cutRole`): shown always, hidden when that edge is cut
 * (a full wall, a piece hung on it), or shown only when it is cut (the
 * cut-down wall). The shader drops what the room's `cutEdges` hides, so
 * cutting a wall changes a uniform, never the meshes.
 *
 * Lightmap charts: each run of coplanar, connected triangles is one chart,
 * laid flat on its plane. A chart takes the lightmap's texel density, with
 * a one-texel border sampled from its own edge so filtering never reads a
 * neighbour; an axis shorter than a texel collapses to a single texel with
 * no border, so a book's spine costs a strip and its top one texel.
 * Axis-aligned charts snap to the room's texel grid.
 */

const ROLE_ALWAYS = 0;
const ROLE_HIDE_WHEN_CUT = 1;
const ROLE_SHOW_WHEN_CUT = 2;
type CutRole = [number, number, number, number];

/** Triangles nearer than this to one plane are coplanar. */
const SAME_PLANE = 1e-4;
/** A chart no longer than this each way, in metres, takes a single texel: a
 *  book, a candle, a chair's rail is lit by one value, as a flat-shaded face. */
const SMALL_CHART = 0.4;
/** A face turned further down than this (the y of its normal) faces away from every camera, as the overlap check holds. */
const FACING_DOWN = -0.5;

/** How a group of merged triangles draws. Lit groups read the lightmap. */
export interface DrawParams {
  lit: boolean;
  map: THREE.Texture | null;
  alphaTest: number;
  side: THREE.Side;
  transparent: boolean;
  opacity: number;
  blending: THREE.Blending;
  depthWrite: boolean;
  fog: boolean;
  toneMapped: boolean;
}

/** The merged geometry of one way of drawing, in the room's frame. */
export interface Bucket {
  params: DrawParams;
  geometry: THREE.BufferGeometry;
}

/** Where every lightmap texel lies on the room's surfaces, in the room's frame. */
export interface Texels {
  width: number;
  height: number;
  /** For each sample: its texel's index in the atlas (row by row). */
  index: Uint32Array;
  position: Float32Array;
  normal: Float32Array;
}

/** A moving piece, kept as built and lit by a probe at `at`. */
export interface Dynamic {
  holder: THREE.Object3D;
  /** Where its probe is read, in the room's frame (for a piece that never leaves it). */
  at: THREE.Vector3;
  explorer: boolean;
}

export interface FrozenRoom {
  id: string;
  buckets: Bucket[];
  texels: Texels;
  /** Triangles that stop light, nine floats each, in the room's frame. */
  casters: Float32Array;
  lights: BakedLight[];
  dynamics: Dynamic[];
  animations: Animation[];
  /** Each prop's bounds as built, for framing it. */
  bounds: Map<PropPlacement, THREE.Box3>;
  ready: Promise<void>;
}

function drawParams(material: THREE.Material): DrawParams {
  const lit = material instanceof THREE.MeshLambertMaterial;
  if (!lit && !(material instanceof THREE.MeshBasicMaterial)) throw new Error(`Rooms are built from Lambert and Basic materials, not ${material.type}`);
  return {
    lit,
    map: material.map,
    alphaTest: material.alphaTest,
    side: material.side,
    transparent: material.transparent,
    opacity: material.opacity,
    blending: material.blending,
    depthWrite: material.depthWrite,
    fog: material.fog,
    toneMapped: material.toneMapped,
  };
}

function paramsKey(p: DrawParams): string {
  return [p.lit, p.map?.uuid, p.alphaTest, p.side, p.transparent, p.opacity, p.blending, p.depthWrite, p.fog, p.toneMapped].join("|");
}

interface Gathering {
  params: DrawParams;
  position: number[];
  normal: number[];
  colour: number[];
  uv: number[];
  role: number[];
  /** For a lit bucket, where each triangle's lightmap UVs go, set once the atlas is packed. */
  uv1: number[];
}

interface LitTriangle {
  bucket: Gathering;
  /** Index of its first vertex in the bucket. */
  vertex: number;
  points: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  normal: THREE.Vector3;
  /** Triangles of one mesh group form charts together; a new group starts new charts. */
  run: number;
  /** A face no camera sees, which needs only one texel of light. */
  unseen: boolean;
}

interface Chart {
  triangles: LitTriangle[];
  normal: THREE.Vector3;
  u: THREE.Vector3;
  v: THREE.Vector3;
  offset: number;
  /** Chart-plane coordinates of its origin, and its extent, in metres. */
  min: [number, number];
  max: [number, number];
  origin: [number, number];
  /** Texels per axis inside its border, or 0 for an axis collapsed to one texel. */
  texels: [number, number];
  /** Where it is packed in the atlas: its corner, border included. */
  at: [number, number];
}

/** A chart's plane basis: room axes for an axis-aligned face (as `projectUvs`
 *  lays textures), else one along its first edge. */
function basis(normal: THREE.Vector3, first: THREE.Vector3, second: THREE.Vector3): [THREE.Vector3, THREE.Vector3, boolean] {
  const [ax, ay, az] = [Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z)];
  if (ay > 0.9999) return [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), true];
  if (ax > 0.9999) return [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), true];
  if (az > 0.9999) return [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), true];
  const u = second.clone().sub(first).normalize();
  return [u, normal.clone().cross(u).normalize(), false];
}

function sharesEdge(a: LitTriangle, b: LitTriangle): boolean {
  let shared = 0;
  for (const p of a.points) if (b.points.some((q) => p.distanceToSquared(q) < 1e-12)) shared++;
  return shared >= 2;
}

function charts(triangles: LitTriangle[]): Chart[] {
  const result: Chart[] = [];
  const density = LIGHTMAP.texelsPerMetre;
  let current: Chart | null = null;
  let last: LitTriangle | null = null;
  for (const triangle of triangles) {
    const joins =
      current !== null &&
      last !== null &&
      last.run === triangle.run &&
      last.unseen === triangle.unseen &&
      current.normal.dot(triangle.normal) > 0.9999 &&
      Math.abs(triangle.points[0].dot(current.normal) - current.offset) < SAME_PLANE &&
      sharesEdge(last, triangle);
    if (!joins || !current) {
      const [u, v, aligned] = basis(triangle.normal, triangle.points[0], triangle.points[1]);
      current = { triangles: [], normal: triangle.normal.clone(), u, v, offset: triangle.points[0].dot(triangle.normal), min: [Infinity, Infinity], max: [-Infinity, -Infinity], origin: [0, 0], texels: [0, 0], at: [0, 0] };
      current.origin = aligned ? [NaN, NaN] : [Infinity, Infinity];
      result.push(current);
    }
    current.triangles.push(triangle);
    for (const p of triangle.points) {
      const pu = p.dot(current.u);
      const pv = p.dot(current.v);
      current.min = [Math.min(current.min[0], pu), Math.min(current.min[1], pv)];
      current.max = [Math.max(current.max[0], pu), Math.max(current.max[1], pv)];
    }
    last = triangle;
  }
  for (const chart of result) {
    const aligned = Number.isNaN(chart.origin[0]);
    const snap = (value: number) => (aligned ? Math.floor(value * density + 1e-6) / density : value);
    chart.origin = [snap(chart.min[0]), snap(chart.min[1])];
    const spans = [0, 1].map((axis) => (chart.max[axis] - chart.origin[axis]) * density);
    const single = chart.triangles[0].unseen || Math.max(...spans) <= SMALL_CHART * density;
    chart.texels = spans.map((span) => (single || span < 1 ? 0 : Math.ceil(span - 1e-6))) as [number, number];
  }
  return result;
}

/** Allocated size of a chart, border included. */
function footprint(chart: Chart): [number, number] {
  return [chart.texels[0] === 0 ? 1 : chart.texels[0] + 2, chart.texels[1] === 0 ? 1 : chart.texels[1] + 2];
}

/** Packs charts in shelves, tallest first, into an atlas about square. */
function pack(all: Chart[]): { width: number; height: number } {
  const area = all.reduce((sum, chart) => sum + footprint(chart)[0] * footprint(chart)[1], 0);
  const widest = Math.max(1, ...all.map((chart) => footprint(chart)[0]));
  const width = Math.max(widest, 16, Math.ceil(Math.sqrt(area * 1.1) / 4) * 4);
  const order = [...all].sort((a, b) => footprint(b)[1] - footprint(a)[1] || footprint(b)[0] - footprint(a)[0]);
  let x = 0;
  let y = 0;
  let shelf = 0;
  for (const chart of order) {
    const [w, h] = footprint(chart);
    if (x + w > width) {
      x = 0;
      y += shelf;
      shelf = 0;
    }
    chart.at = [x, y];
    x += w;
    shelf = Math.max(shelf, h);
  }
  return { width, height: Math.max(1, y + shelf) };
}

/** The texel-space coordinate of a point of a chart on one axis. */
function texelCoord(chart: Chart, axis: 0 | 1, value: number): number {
  if (chart.texels[axis] === 0) return chart.at[axis] + 0.5;
  return chart.at[axis] + 1 + (value - chart.origin[axis]) * LIGHTMAP.texelsPerMetre;
}

/** The point of a chart nearest a point of its plane, in plane coordinates. */
function clampToChart(chart: Chart, pu: number, pv: number): [number, number] {
  let best: [number, number] = [pu, pv];
  let bestDistance = Infinity;
  const p = new THREE.Vector2(pu, pv);
  const flat = (q: THREE.Vector3) => new THREE.Vector2(q.dot(chart.u), q.dot(chart.v));
  for (const { points } of chart.triangles) {
    const [a, b, c] = points.map(flat);
    const closest = closestOnTriangle(p, a, b, c);
    const distance = closest.distanceToSquared(p);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = [closest.x, closest.y];
      if (distance === 0) break;
    }
  }
  return best;
}

function closestOnTriangle(p: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2, c: THREE.Vector2): THREE.Vector2 {
  const cross = (o: THREE.Vector2, s: THREE.Vector2, t: THREE.Vector2) => (s.x - o.x) * (t.y - o.y) - (s.y - o.y) * (t.x - o.x);
  const d1 = cross(a, b, p);
  const d2 = cross(b, c, p);
  const d3 = cross(c, a, p);
  const negative = d1 < 0 || d2 < 0 || d3 < 0;
  const positive = d1 > 0 || d2 > 0 || d3 > 0;
  if (!(negative && positive)) return p.clone();
  let best = a.clone();
  let bestDistance = Infinity;
  for (const [s, t] of [[a, b], [b, c], [c, a]]) {
    const along = t.clone().sub(s);
    const length = along.lengthSq();
    const k = length > 0 ? THREE.MathUtils.clamp(p.clone().sub(s).dot(along) / length, 0, 1) : 0;
    const q = s.clone().addScaledVector(along, k);
    const distance = q.distanceToSquared(p);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = q;
    }
  }
  return best;
}

/** Every texel of every chart, with the point of the surface it lights. */
function sampleTexels(all: Chart[], width: number, height: number): Texels {
  const count = all.reduce((sum, chart) => sum + footprint(chart)[0] * footprint(chart)[1], 0);
  const index = new Uint32Array(count);
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const density = LIGHTMAP.texelsPerMetre;
  let n = 0;
  for (const chart of all) {
    const [w, h] = footprint(chart);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const along = (axis: 0 | 1, k: number) =>
          chart.texels[axis] === 0 ? (chart.min[axis] + chart.max[axis]) / 2 : chart.origin[axis] + (THREE.MathUtils.clamp(k - 1, 0, chart.texels[axis] - 1) + 0.5) / density;
        const [pu, pv] = clampToChart(chart, along(0, i), along(1, j));
        const point = chart.normal.clone().multiplyScalar(chart.offset).addScaledVector(chart.u, pu).addScaledVector(chart.v, pv);
        index[n] = (chart.at[1] + j) * width + chart.at[0] + i;
        position.set([point.x, point.y, point.z], n * 3);
        normal.set([chart.normal.x, chart.normal.y, chart.normal.z], n * 3);
        n++;
      }
    }
  }
  if (n !== count) throw new Error(`Sampled ${n} texels of ${count}`);
  return { width, height, index, position, normal };
}

/** Is the object, or anything above it up to the root, one of these? */
function within(object: THREE.Object3D, stop: THREE.Object3D, test: (o: THREE.Object3D) => boolean): boolean {
  for (let o: THREE.Object3D | null = object; o && o !== stop; o = o.parent) if (test(o)) return true;
  return false;
}

/**
 * Merges a built room's still pieces for drawing and lays out its lightmap.
 * The room as built is taken apart: its moving pieces move to the frozen
 * room's holders, and its still meshes are freed once merged.
 */
export function freezeRoom(id: string, part: RoomPart): FrozenRoom {
  const { root } = part;
  root.updateMatrixWorld(true);

  const roles = new Map<THREE.Object3D, CutRole>();
  const role = (edges: Edge[], value: number): CutRole => EDGES.map((edge) => (edges.includes(edge) ? value : ROLE_ALWAYS)) as CutRole;
  for (const { edge, full, cut } of part.walls) {
    roles.set(full, role([edge], ROLE_HIDE_WHEN_CUT));
    roles.set(cut, role([edge], ROLE_SHOW_WHEN_CUT));
  }
  for (const { edges, object } of part.hung) roles.set(object, role(edges, ROLE_HIDE_WHEN_CUT));
  const fullWalls = new Map(part.walls.map(({ edge, full }) => [full, OUTWARD[edge]] as const));
  /** The way a full wall's outside faces, for a mesh of one: the house never shows a standing wall from outside. */
  const outsideOf = (object: THREE.Object3D): THREE.Vector2 | undefined => {
    for (let o: THREE.Object3D | null = object; o && o !== root; o = o.parent) {
      const found = fullWalls.get(o);
      if (found) return found;
    }
    return undefined;
  };
  const roleOf = (object: THREE.Object3D): CutRole => {
    for (let o: THREE.Object3D | null = object; o && o !== root; o = o.parent) {
      const found = roles.get(o);
      if (found) return found;
    }
    return [0, 0, 0, 0];
  };

  // Moving pieces: the explorer, and anything animated that isn't inside it.
  const moving: { object: THREE.Object3D; explorer: boolean }[] = [];
  if (part.explorer) moving.push({ object: part.explorer, explorer: true });
  root.traverse((object) => {
    const inside = object.parent !== null && within(object.parent, root, (o) => o === part.explorer || animationOf(o) !== undefined);
    if (animationOf(object) && object !== part.explorer && !inside) moving.push({ object, explorer: false });
  });
  const isMoving = (object: THREE.Object3D) => within(object, root, (o) => moving.some((m) => m.object === o));

  const bounds = new Map<PropPlacement, THREE.Box3>();
  for (const child of root.children) {
    const piece = pieceOf(child);
    if (piece && "prop" in piece) bounds.set(piece.prop, new THREE.Box3().setFromObject(child));
  }

  const buckets = new Map<string, Gathering>();
  const lit: LitTriangle[] = [];
  const casters: number[] = [];
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object);
    else if ((object as Partial<THREE.Line>).isLine || (object as Partial<THREE.Points>).isPoints) throw new Error(`Rooms are built from meshes; ${object.type} found`);
  });

  let run = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const colour = new THREE.Color();
  for (const mesh of meshes) {
    const dynamic = isMoving(mesh);
    const explorer = part.explorer !== null && within(mesh, root, (o) => o === part.explorer);
    const geometry = mesh.geometry;
    const positions = geometry.getAttribute("position");
    const colours = geometry.getAttribute("color") as THREE.BufferAttribute | undefined;
    const uvs = geometry.getAttribute("uv") as THREE.BufferAttribute | undefined;
    const indices = geometry.index;
    const total = indices ? indices.count : positions.count;
    const groups = geometry.groups.length > 0 ? geometry.groups : [{ start: 0, count: total, materialIndex: 0 }];
    const mirrored = mesh.matrixWorld.determinant() < 0;
    const cutRole = roleOf(mesh);
    const outside = outsideOf(mesh);
    const castsInBake = mesh.castShadow && !explorer && !cutRole.includes(ROLE_SHOW_WHEN_CUT);
    const bakeOnly = (mesh.userData as { bakeOnly?: boolean }).bakeOnly === true;
    for (const group of groups) {
      const material = (Array.isArray(mesh.material) ? mesh.material[group.materialIndex ?? 0] : mesh.material) as THREE.Material;
      const params = drawParams(material);
      const key = paramsKey(params);
      let bucket = buckets.get(key);
      if (!bucket && !dynamic && !bakeOnly) {
        bucket = { params, position: [], normal: [], colour: [], uv: [], role: [], uv1: [] };
        buckets.set(key, bucket);
      }
      const base = (material as THREE.MeshBasicMaterial).color;
      const vertexColours = material.vertexColors && colours !== undefined;
      run++;
      const end = Math.min(group.start + group.count, total);
      for (let i = group.start; i + 2 < end; i += 3) {
        let ids = [0, 1, 2].map((k) => (indices ? indices.getX(i + k) : i + k));
        if (mirrored) ids = [ids[0], ids[2], ids[1]];
        const points = [a, b, c].map((p, k) => p.fromBufferAttribute(positions, ids[k]).applyMatrix4(mesh.matrixWorld).clone()) as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
        const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));
        if (normal.lengthSq() < 1e-14) continue;
        normal.normalize();
        if (castsInBake) for (const p of points) casters.push(p.x, p.y, p.z);
        if (dynamic || bakeOnly || !bucket) continue;
        const vertex = bucket.position.length / 3;
        ids.forEach((id, k) => {
          const p = points[k];
          bucket.position.push(p.x, p.y, p.z);
          bucket.normal.push(normal.x, normal.y, normal.z);
          colour.copy(base);
          if (vertexColours) colour.multiply(new THREE.Color().fromBufferAttribute(colours, id));
          bucket.colour.push(colour.r, colour.g, colour.b);
          if (params.map && uvs) bucket.uv.push(uvs.getX(id), uvs.getY(id));
          bucket.role.push(...cutRole);
        });
        const unseen = normal.y < FACING_DOWN || (outside !== undefined && normal.x * outside.x + normal.z * outside.y > 0.5);
        if (params.lit) lit.push({ bucket, vertex, points, normal, run, unseen });
      }
    }
  }

  const still = meshes.filter((mesh) => !isMoving(mesh));
  const allCharts = charts(lit);
  const { width, height } = pack(allCharts);
  for (const chart of allCharts) {
    for (const triangle of chart.triangles) {
      triangle.points.forEach((p, k) => {
        const at = (triangle.vertex + k) * 2;
        triangle.bucket.uv1[at] = texelCoord(chart, 0, p.dot(chart.u)) / width;
        triangle.bucket.uv1[at + 1] = texelCoord(chart, 1, p.dot(chart.v)) / height;
      });
    }
  }
  const texels = sampleTexels(allCharts, width, height);

  const frozenBuckets: Bucket[] = [...buckets.values()]
    .filter((bucket) => bucket.position.length > 0)
    .map((bucket) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(bucket.position, 3));
      geometry.setAttribute("normal", new THREE.Float32BufferAttribute(bucket.normal, 3));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(bucket.colour, 3));
      if (bucket.params.map) {
        if (bucket.uv.length * 3 !== bucket.position.length * 2) throw new Error("A textured piece has no UVs");
        geometry.setAttribute("uv", new THREE.Float32BufferAttribute(bucket.uv, 2));
      }
      if (bucket.params.lit) geometry.setAttribute("uv1", new THREE.Float32BufferAttribute(bucket.uv1, 2));
      geometry.setAttribute("cutRole", new THREE.Uint8BufferAttribute(bucket.role, 4));
      geometry.computeBoundingSphere();
      return { params: bucket.params, geometry };
    });

  const dynamics: Dynamic[] = moving.map(({ object, explorer }) => {
    const parent = object.parent;
    if (!parent) throw new Error("A moving piece has no parent");
    const holder = new THREE.Group();
    holder.matrixAutoUpdate = false;
    holder.matrix.copy(parent.matrixWorld);
    holder.add(object);
    return { holder, at: new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3()), explorer };
  });
  const animations: Animation[] = [];
  for (const { holder } of dynamics) {
    holder.traverse((object) => {
      const animation = animationOf(object);
      if (animation) animations.push(animation);
    });
  }

  for (const mesh of still) mesh.geometry.dispose();

  return { id, buckets: frozenBuckets, texels, casters: new Float32Array(casters), lights: part.lights, dynamics, animations, bounds, ready: part.ready };
}

