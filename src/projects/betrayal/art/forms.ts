import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { paletteHex, type PaletteKey } from "./palette";
import {
  drum,
  gradient,
  occlusion as occlusionAt,
  outsideBox,
  settle,
  smoothMin,
  surfaceNet,
  union,
  type Distance,
  type Net,
  type Solid,
  type Vec3,
} from "@/shared/lib/three/sdf";

export {
  ball,
  chain,
  drum,
  ellipsoid,
  intersect,
  ring,
  rod,
  roughened,
  roundBox,
  skin,
  smoothMin,
  stretched,
  surfaceNet,
  union,
  type Distance,
  type Net,
  type Solid,
  type Vec3,
} from "@/shared/lib/three/sdf";

/*
 * Smooth, organic forms built from maths, for figures: solids described by
 * signed distance and meshed once at build time (heads, hands, a coat, a
 * spider's body), and lofts, rings swept along a spine (limbs, legs, tails).
 * Every form is coloured per triangle from palette keys, so a whole rigid
 * part, however many colours it wears, is one mesh in one draw call, and
 * its colours stay exactly the palette's while its shading stays smooth.
 *
 * A signed distance is negative inside a solid and positive outside; most of
 * the primitives and blends are Inigo Quilez's.
 */


/**
 * Keeps the solid a geometry was meshed from with it, so a figure's parts can
 * be asked how deep a point lies inside them (the figures' clipping check).
 * Sculptures and lofts keep theirs; explicit geometry is given one here.
 */
export function shaped<T extends THREE.BufferGeometry>(geometry: T, solid: Solid): T {
  geometry.userData.solid = solid;
  return geometry;
}

export function solidOf(geometry: THREE.BufferGeometry): Solid | undefined {
  return (geometry.userData as { solid?: Solid }).solid;
}

/** Marks a geometry whose vertices a figure moves (cloth draped over the
 *  legs), its solid moving with them. The figure calls `reshaped` after each
 *  move, so the clipping check knows which shape it last saw. */
export function deforming<T extends THREE.BufferGeometry>(geometry: T): T {
  geometry.userData.shape = 0;
  return geometry;
}

export function reshaped(geometry: THREE.BufferGeometry) {
  (geometry.userData as { shape: number }).shape += 1;
}

/** Which shape a geometry is in: "" for one whose vertices never move. */
export function shapeOf(geometry: THREE.BufferGeometry): string {
  const { shape } = geometry.userData as { shape?: number };
  return shape === undefined ? "" : `~${shape}`;
}

type Step =
  | { kind: "add"; solid: Solid; colour: PaletteKey; blend: number }
  | { kind: "carve"; solid: Solid; colour?: PaletteKey; blend: number }
  | { kind: "paint"; region: Distance; colour: PaletteKey };

/**
 * A sculpture built up from solids in order: each `add` joins one on, with a
 * smooth fillet `blend` wide, `carve` cuts one away, and `paint` recolours
 * the surface inside a region without changing its shape. Where solids meet,
 * the surface takes the colour of the one nearest. `geometry` meshes it.
 */
export function sculpt() {
  const steps: Step[] = [];
  const shape = {
    add(solid: Solid, colour: PaletteKey, blend = 0) {
      steps.push({ kind: "add", solid, colour, blend });
      return shape;
    },
    carve(solid: Solid, { blend = 0, colour }: { blend?: number; colour?: PaletteKey } = {}) {
      steps.push({ kind: "carve", solid, colour, blend });
      return shape;
    },
    paint(region: Solid | Distance, colour: PaletteKey) {
      steps.push({ kind: "paint", region: typeof region === "function" ? region : region.distance, colour });
      return shape;
    },
    distance(x: number, y: number, z: number): number {
      let d = Infinity;
      for (const step of steps) {
        if (step.kind === "add") {
          // A solid further off than the surface so far, fillet included, can't change it.
          if (outsideBox(x, y, z, step.solid.min, step.solid.max) > d + step.blend) continue;
          d = smoothMin(d, step.solid.distance(x, y, z), step.blend);
        } else if (step.kind === "carve") {
          if (outsideBox(x, y, z, step.solid.min, step.solid.max) > step.blend - d) continue;
          d = -smoothMin(-d, step.solid.distance(x, y, z), step.blend);
        }
      }
      return d;
    },
    colourAt(x: number, y: number, z: number): PaletteKey {
      let d = Infinity;
      let colour: PaletteKey = "void";
      for (const step of steps) {
        if (step.kind === "add") {
          const s = step.solid.distance(x, y, z);
          if (s < d) colour = step.colour;
          d = smoothMin(d, s, step.blend);
        } else if (step.kind === "carve") {
          const cut = -step.solid.distance(x, y, z);
          if (step.colour && cut > d) colour = step.colour;
          d = -smoothMin(-d, -cut, step.blend);
        } else if (step.region(x, y, z) < 0) {
          colour = step.colour;
        }
      }
      return colour;
    },
    /** The box the sculpture lies inside. */
    bounds(): Pick<Solid, "min" | "max"> {
      const added = steps.flatMap((step) => (step.kind === "add" ? [step] : []));
      const pad = Math.max(0, ...added.map((step) => step.blend));
      return {
        min: [0, 1, 2].map((i) => Math.min(...added.map((step) => step.solid.min[i])) - pad) as unknown as Vec3,
        max: [0, 1, 2].map((i) => Math.max(...added.map((step) => step.solid.max[i])) + pad) as unknown as Vec3,
      };
    },
    /** The sculpture meshed on a grid of `cell`-sized cubes, smooth-shaded and coloured. */
    geometry(cell: number): THREE.BufferGeometry {
      const { min, max } = shape.bounds();
      const net = surfaceNet(shape.distance, min, max, cell);
      settle(net.positions, shape.distance, cell);
      return shaped(colouredGeometry(net, shape.distance, shape.colourAt, cell), { distance: shape.distance, ...shape.bounds() });
    },
  };
  return shape;
}
export type Sculpture = ReturnType<typeof sculpt>;

/** How many times a triangle a colour border crosses is split in four, so the border is drawn finer than the grid. */
const BORDER_SPLITS = 2;

/**
 * How a sculpture's own hollows shade it: the house lights a figure by an
 * ambient cube, light from every side and no shadow, so without this a carved
 * eye socket, the crease under a brow or a nose, or a collar's fold is lit as
 * brightly as a cheek and a pale face reads flat and chalky. Each corner is
 * darkened by how far its own surface closes in over it within `reach`,
 * stepping out along the normal (Inigo Quilez's distance-field occlusion), by
 * at most `deepest`, so the colour keeps its hue and only its light changes.
 */
const OCCLUSION = { reach: 0.03, steps: 5, strength: 2.2, deepest: 0.55 };


function occlusion(distance: Distance, x: number, y: number, z: number, normal: THREE.Vector3): number {
  return occlusionAt(distance, x, y, z, normal, OCCLUSION);
}

/**
 * A net as a non-indexed geometry: smooth normals from the distance's
 * gradient, and each triangle one flat palette colour, the colour at its
 * middle, darkened at each corner by the sculpture's own hollows
 * (`occlusion`). A triangle whose corners differ in colour straddles a border, so it
 * is split (its new corners left on its own edges, which keeps the surface
 * closed) until the border is drawn `BORDER_SPLITS` times finer.
 */
function colouredGeometry({ positions, triangles }: Net, distance: Distance, colourAt: (x: number, y: number, z: number) => PaletteKey, cell: number): THREE.BufferGeometry {
  const g = new THREE.Vector3();
  const position: number[] = [];
  const normal: number[] = [];
  const colour: number[] = [];
  const rgb = colourCache();
  type Corner = [number, number, number];
  const colourOf = (p: Corner) => colourAt(p[0], p[1], p[2]);
  const emit = (corners: [Corner, Corner, Corner], depth: number) => {
    const [a, b, c] = corners;
    const middle: Corner = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    const key = colourOf(middle);
    if (depth > 0 && corners.some((corner) => colourOf(corner) !== key)) {
      const half = (p: Corner, q: Corner): Corner => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
      const [ab, bc, ca] = [half(a, b), half(b, c), half(c, a)];
      for (const piece of [[a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]] as [Corner, Corner, Corner][]) emit(piece, depth - 1);
      return;
    }
    const { r, g: green, b: blue } = rgb(key);
    for (const corner of corners) {
      gradient(distance, corner[0], corner[1], corner[2], cell * 0.25, g).normalize();
      const light = occlusion(distance, corner[0], corner[1], corner[2], g);
      position.push(...corner);
      normal.push(g.x, g.y, g.z);
      colour.push(r * light, green * light, blue * light);
    }
  };
  const corner = (index: number): Corner => [positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]];
  for (let t = 0; t < triangles.length; t += 3) emit([corner(triangles[t]), corner(triangles[t + 1]), corner(triangles[t + 2])], BORDER_SPLITS);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colour, 3));
  return geometry;
}

function colourCache() {
  const cache = new Map<PaletteKey, THREE.Color>();
  return (key: PaletteKey): THREE.Color => {
    let colour = cache.get(key);
    if (!colour) {
      colour = new THREE.Color(paletteHex(key));
      cache.set(key, colour);
    }
    return colour;
  };
}

/** One section of a loft: where the ring sits on the spine, its radii (across
 *  the spine's two side axes), and the colour of the band from it to the next. */
export interface Section {
  at: Vec3;
  radius: number | readonly [number, number];
  colour: PaletteKey;
}

/**
 * A tube swept through rings along a spine: each section's ring, `sides`
 * round, joined to the next with smooth normals and banded in its colour.
 * `side` is a direction across the spine that the first radius follows.
 * The ends close as a rounded cap or come to a point.
 */
export function loft(
  sections: readonly Section[],
  { sides = 12, side = [1, 0, 0], ends = ["round", "round"] }: { sides?: number; side?: Vec3; ends?: readonly ["round" | "point" | "flat", "round" | "point" | "flat"] } = {},
): THREE.BufferGeometry {
  const at = sections.map((s) => new THREE.Vector3(...s.at));
  const radii = sections.map((s) => (typeof s.radius === "number" ? [s.radius, s.radius] : s.radius));
  const tangents = at.map((p, i) => at[Math.min(i + 1, at.length - 1)].clone().sub(at[Math.max(i - 1, 0)]).normalize());
  // Frames carried along the spine without twisting (parallel transport).
  const across: THREE.Vector3[] = [];
  let carried = new THREE.Vector3(...side);
  for (const tangent of tangents) {
    carried = carried.clone().addScaledVector(tangent, -carried.dot(tangent));
    if (carried.lengthSq() < 1e-10) carried = new THREE.Vector3(0, 0, 1).cross(tangent);
    across.push(carried.normalize());
  }

  type RingSpec = { centre: THREE.Vector3; r: [number, number]; frame: number; colour: PaletteKey };
  const rings: RingSpec[] = sections.map((s, i) => ({ centre: at[i], r: [radii[i][0], radii[i][1]], frame: i, colour: s.colour }));
  // A rounded end: rings shrinking over a quarter circle, as far again as the end's radius.
  const capRings = (end: number, outward: number): RingSpec[] => {
    const [rx, rz] = radii[end];
    const reach = Math.min(rx, rz);
    return [0.5, 0.8, 0.95].map((angle) => {
      const theta = (angle * Math.PI) / 2;
      return {
        centre: at[end].clone().addScaledVector(tangents[end], outward * Math.sin(theta) * reach),
        r: [rx * Math.cos(theta), rz * Math.cos(theta)],
        frame: end,
        colour: sections[end].colour,
      };
    });
  };
  const last = sections.length - 1;
  const all = [...(ends[0] === "round" ? capRings(0, -1).reverse() : []), ...rings, ...(ends[1] === "round" ? capRings(last, 1) : [])];

  const positions: number[] = [];
  const point = new THREE.Vector3();
  const other = new THREE.Vector3();
  for (const ringSpec of all) {
    const n = across[ringSpec.frame];
    other.crossVectors(tangents[ringSpec.frame], n);
    for (let s = 0; s < sides; s++) {
      const angle = (s / sides) * Math.PI * 2;
      point.copy(ringSpec.centre).addScaledVector(n, Math.cos(angle) * ringSpec.r[0]).addScaledVector(other, Math.sin(angle) * ringSpec.r[1]);
      positions.push(point.x, point.y, point.z);
    }
  }
  const index: number[] = [];
  const triangleColour: PaletteKey[] = [];
  for (let r = 0; r < all.length - 1; r++) {
    for (let s = 0; s < sides; s++) {
      const a = r * sides + s;
      const b = r * sides + ((s + 1) % sides);
      const c = a + sides;
      const d = b + sides;
      index.push(a, c, b, b, c, d);
      triangleColour.push(all[r].colour, all[r].colour);
    }
  }
  const tip = (ringIndex: number, outward: number, kind: "round" | "point" | "flat") => {
    const ringSpec = all[ringIndex];
    const frame = ringSpec.frame;
    const length = kind === "point" ? Math.max(...ringSpec.r) * 2.5 : kind === "round" ? Math.min(...radii[frame]) * 0.05 : 0;
    const apex = ringSpec.centre.clone().addScaledVector(tangents[frame], outward * length);
    const apexIndex = positions.length / 3;
    positions.push(apex.x, apex.y, apex.z);
    for (let s = 0; s < sides; s++) {
      const a = ringIndex * sides + s;
      const b = ringIndex * sides + ((s + 1) % sides);
      index.push(...(outward > 0 ? [a, apexIndex, b] : [a, b, apexIndex]));
      triangleColour.push(ringSpec.colour);
    }
  };
  tip(0, -1, ends[0]);
  tip(all.length - 1, 1, ends[1]);

  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  indexed.setIndex(index);
  indexed.computeVertexNormals();
  const geometry = indexed.toNonIndexed();
  indexed.dispose();
  const rgb = colourCache();
  const colours = new Float32Array(geometry.getAttribute("position").count * 3);
  triangleColour.forEach((key, t) => {
    const { r, g, b } = rgb(key);
    for (let c = 0; c < 3; c++) colours.set([r, g, b], (t * 3 + c) * 3);
  });
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  return shaped(geometry, loftSolid(at, radii, across, tangents, sections.length === 1 ? ["round", "round"] : ends));
}

/**
 * A loft's solid, close enough to judge clipping by: each band between two
 * rings an elliptic tube tapering from one to the next, and each end a
 * half-ellipsoid as long as the loft's cap or point (none for a flat end).
 */
function loftSolid(
  at: readonly THREE.Vector3[],
  radii: readonly (readonly number[])[],
  across: readonly THREE.Vector3[],
  tangents: readonly THREE.Vector3[],
  ends: readonly ["round" | "point" | "flat", "round" | "point" | "flat"],
): Solid {
  const last = at.length - 1;
  const capLength = (end: number, kind: "round" | "point" | "flat") =>
    kind === "point" ? Math.max(...radii[end]) * 2.5 : kind === "round" ? Math.min(...radii[end]) : 0;
  const caps = [capLength(0, ends[0]), capLength(last, ends[1])];
  const others = across.map((n, i) => tangents[i].clone().cross(n));
  const d = new THREE.Vector3();
  const band = (i: number, x: number, y: number, z: number): number => {
    const a = at[i];
    const j = Math.min(i + 1, last);
    const axis = at[j].clone().sub(a);
    const length = axis.length();
    d.set(x - a.x, y - a.y, z - a.z);
    const t = length > 0 ? d.dot(axis) / (length * length) : 0;
    // Past the loft's first or last ring, a point lies off its end.
    const cap = t < 0 && i === 0 ? caps[0] : t > 1 && j === last ? caps[1] : null;
    const along = t < 0 ? t * length : t > 1 ? (t - 1) * length : 0;
    const clamped = THREE.MathUtils.clamp(t, 0, 1);
    const rx = radii[i][0] + (radii[j][0] - radii[i][0]) * clamped;
    const ry = radii[i][1] + (radii[j][1] - radii[i][1]) * clamped;
    d.addScaledVector(axis, -clamped);
    const u = d.dot(across[i]) / rx;
    const v = d.dot(others[i]) / ry;
    const least = Math.min(rx, ry);
    if (along === 0) return (Math.hypot(u, v) - 1) * least;
    // Past a ring between two bands, the next band takes over: end this one flat.
    if (cap === null) return Math.max((Math.hypot(u, v) - 1) * least, Math.abs(along));
    if (cap === 0) return Math.max((Math.hypot(u, v) - 1) * least, Math.abs(along));
    return (Math.hypot(u, v, along / cap) - 1) * least;
  };
  const reach = Math.max(...radii.flat()) + Math.max(...caps);
  return {
    distance: (x, y, z) => {
      let nearest = Infinity;
      for (let i = 0; i < Math.max(1, last); i++) nearest = Math.min(nearest, band(i, x, y, z));
      return nearest;
    },
    min: [0, 1, 2].map((k) => Math.min(...at.map((p) => p.getComponent(k))) - reach) as unknown as Vec3,
    max: [0, 1, 2].map((k) => Math.max(...at.map((p) => p.getComponent(k))) + reach) as unknown as Vec3,
  };
}

/** Gives a whole geometry one palette colour, for merging with others into one vertex-coloured mesh. */
export function painted(geometry: THREE.BufferGeometry, colour: PaletteKey): THREE.BufferGeometry {
  const flatGeometry = geometry.index ? geometry.toNonIndexed() : geometry;
  const { r, g, b } = new THREE.Color(paletteHex(colour));
  const count = flatGeometry.getAttribute("position").count;
  const colours = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colours.set([r, g, b], i * 3);
  flatGeometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  flatGeometry.deleteAttribute("uv");
  const solid = solidOf(geometry);
  return solid ? shaped(flatGeometry, solid) : flatGeometry;
}

/** A figure's lit, smooth-shaded material, coloured by its geometry's palette colours. */
export function figureMaterial(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ vertexColors: true });
}

/**
 * Shading for a form that glows rather than takes light (a spectre): an unlit
 * material would draw it as a flat silhouette, so its vertex colours are
 * darkened where its surface turns away from above, by up to `depth`, once,
 * when it is built. The glow keeps its colour, and its form still shows.
 */
export function glowShaded(geometry: THREE.BufferGeometry, depth = 0.45): THREE.BufferGeometry {
  const normals = geometry.getAttribute("normal");
  const colours = geometry.getAttribute("color");
  for (let i = 0; i < colours.count; i++) {
    const light = 1 - depth * (0.5 - normals.getY(i) * 0.5);
    colours.setXYZ(i, colours.getX(i) * light, colours.getY(i) * light, colours.getZ(i) * light);
  }
  return geometry;
}

/** Coloured geometries merged into one, the pieces freed. */
export function mergeAll(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const solids = geometries.map(solidOf);
  const merged = mergeGeometries(geometries);
  merged.userData = {};
  for (const geometry of geometries) geometry.dispose();
  return solids.every((solid): solid is Solid => solid !== undefined) ? shaped(merged, union(...solids)) : merged;
}

/** Where a surface lies at (x, y), marched in along z from the front
 *  (`facing` 1) or the back (−1): for laying something on a sculpted form. */
export function surfaceAt(distance: Distance, x: number, y: number, facing: 1 | -1 = 1, from = 0.5): number {
  let z = facing * from;
  for (let i = 0; i < 64; i++) {
    const d = distance(x, y, z);
    if (d < 1e-4) break;
    z -= facing * d;
  }
  return z;
}

/** The nearest point on a surface to `point`, found along its gradient, at most `reach` away. */
export function onSurface(distance: Distance, point: Vec3, reach = 0.1): Vec3 {
  const moved = new Float32Array(point);
  settle(moved, distance, reach);
  return [moved[0], moved[1], moved[2]];
}

/** Coloured geometries merged into one mesh: one rigid part, one draw. */
export function form(material: THREE.Material, ...geometries: THREE.BufferGeometry[]): THREE.Mesh {
  return new THREE.Mesh(geometries.length === 1 ? geometries[0] : mergeAll(geometries), material);
}

/** A round plinth, `top` above the floor, with a bevelled edge, smooth all
 *  round: a miniature's base, from `radius` at the floor to `topRadius`. */
export function plinth(radius: number, topRadius: number, top: number, colour: PaletteKey, sides = 64): THREE.BufferGeometry {
  const bevel = Math.min(0.015, top / 3);
  const profile = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(radius, 0),
    new THREE.Vector2(radius, top * 0.15),
    new THREE.Vector2(topRadius + bevel * 0.3, top - bevel),
    new THREE.Vector2(topRadius - bevel * 0.4, top - bevel * 0.1),
    new THREE.Vector2(topRadius - bevel, top),
    new THREE.Vector2(0, top),
  ];
  return shaped(painted(new THREE.LatheGeometry(profile, sides), colour), drum([0, top / 2, 0], radius, top / 2));
}
