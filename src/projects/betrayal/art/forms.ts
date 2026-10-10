import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { paletteHex, type PaletteKey } from "./palette";

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

export type Vec3 = readonly [number, number, number];

/** Signed distance to a surface, in metres. */
export type Distance = (x: number, y: number, z: number) => number;

/** A solid: its signed distance, and a box it lies inside. */
export interface Solid {
  distance: Distance;
  min: Vec3;
  max: Vec3;
}

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

function bounds(centre: Vec3, reach: Vec3): Pick<Solid, "min" | "max"> {
  return {
    min: [centre[0] - reach[0], centre[1] - reach[1], centre[2] - reach[2]],
    max: [centre[0] + reach[0], centre[1] + reach[1], centre[2] + reach[2]],
  };
}

export function ball(centre: Vec3, radius: number): Solid {
  const [cx, cy, cz] = centre;
  return { distance: (x, y, z) => Math.hypot(x - cx, y - cy, z - cz) - radius, ...bounds(centre, [radius, radius, radius]) };
}

/** An ellipsoid, by its three radii (a close bound, not an exact distance). */
export function ellipsoid(centre: Vec3, radii: Vec3): Solid {
  const [cx, cy, cz] = centre;
  const [rx, ry, rz] = radii;
  return {
    distance: (x, y, z) => {
      const px = x - cx;
      const py = y - cy;
      const pz = z - cz;
      const k0 = Math.hypot(px / rx, py / ry, pz / rz);
      const k1 = Math.hypot(px / (rx * rx), py / (ry * ry), pz / (rz * rz));
      return k1 === 0 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
    },
    ...bounds(centre, radii),
  };
}

/** A rod from `a` to `b` with rounded ends, tapering from radius `ra` to `rb`: a limb, a lock of hair, a fang. */
export function rod(a: Vec3, b: Vec3, ra: number, rb = ra): Solid {
  const [ax, ay, az] = a;
  const bax = b[0] - ax;
  const bay = b[1] - ay;
  const baz = b[2] - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = ra - rb;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const r = Math.max(ra, rb);
  return {
    distance: (x, y, z) => {
      const pax = x - ax;
      const pay = y - ay;
      const paz = z - az;
      const along = pax * bax + pay * bay + paz * baz;
      const beyond = along - l2;
      const qx = pax * l2 - bax * along;
      const qy = pay * l2 - bay * along;
      const qz = paz * l2 - baz * along;
      const x2 = qx * qx + qy * qy + qz * qz;
      const y2 = along * along * l2;
      const z2 = beyond * beyond * l2;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(beyond) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb;
      if (Math.sign(along) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra;
      return (Math.sqrt(x2 * a2 * il2) + along * rr) * il2 - ra;
    },
    min: [Math.min(ax, b[0]) - r, Math.min(ay, b[1]) - r, Math.min(az, b[2]) - r],
    max: [Math.max(ax, b[0]) + r, Math.max(ay, b[1]) + r, Math.max(az, b[2]) + r],
  };
}

/** Rods joined end to end through `points`, each point with its own radius: a tapering, bending limb. */
export function chain(points: readonly Vec3[], radii: readonly number[]): Solid {
  const rods = points.slice(1).map((point, i) => rod(points[i], point, radii[i], radii[i + 1]));
  return union(...rods);
}

/** Turns a point into a solid's own frame: rotated by `rotation` (Euler, radians) about `centre`. */
function orient(centre: Vec3, rotation: Vec3): (x: number, y: number, z: number, out: THREE.Vector3) => THREE.Vector3 {
  const inverse = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)).invert();
  const m = new THREE.Matrix4().makeRotationFromQuaternion(inverse).elements;
  return (x, y, z, out) => {
    const px = x - centre[0];
    const py = y - centre[1];
    const pz = z - centre[2];
    return out.set(m[0] * px + m[4] * py + m[8] * pz, m[1] * px + m[5] * py + m[9] * pz, m[2] * px + m[6] * py + m[10] * pz);
  };
}

/** A box with rounded edges, `half` its half-size before rounding, turned by `rotation` about its centre. */
export function roundBox(centre: Vec3, half: Vec3, round: number, rotation: Vec3 = [0, 0, 0]): Solid {
  const local = orient(centre, rotation);
  const p = new THREE.Vector3();
  const reach = Math.hypot(...half) + round;
  return {
    distance: (x, y, z) => {
      local(x, y, z, p);
      const qx = Math.abs(p.x) - half[0] + round;
      const qy = Math.abs(p.y) - half[1] + round;
      const qz = Math.abs(p.z) - half[2] + round;
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - round;
    },
    ...bounds(centre, [reach, reach, reach]),
  };
}

/** A drum (a cylinder with rounded edges) round `centre`, its axis along its
 *  local y, `half` its half-height, turned by `rotation`: a coin, a candle, a shaft. */
export function drum(centre: Vec3, radius: number, half: number, round = 0, rotation: Vec3 = [0, 0, 0]): Solid {
  const local = orient(centre, rotation);
  const p = new THREE.Vector3();
  const reach = Math.hypot(radius, half);
  return {
    distance: (x, y, z) => {
      local(x, y, z, p);
      const dx = Math.hypot(p.x, p.z) - radius + round;
      const dy = Math.abs(p.y) - half + round;
      return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - round;
    },
    ...bounds(centre, [reach, reach, reach]),
  };
}

/** A ring (torus) round `centre`, lying across its local y axis, turned by `rotation`: spectacle rims, a scarf, a cuff. */
export function ring(centre: Vec3, major: number, minor: number, rotation: Vec3 = [0, 0, 0]): Solid {
  const local = orient(centre, rotation);
  const p = new THREE.Vector3();
  const reach = major + minor;
  return {
    distance: (x, y, z) => {
      local(x, y, z, p);
      return Math.hypot(Math.hypot(p.x, p.z) - major, p.y) - minor;
    },
    ...bounds(centre, [reach, reach, reach]),
  };
}

/** Any solid squashed or stretched along its own axes about `centre` (a close bound). */
export function stretched(solid: Solid, centre: Vec3, scale: Vec3): Solid {
  const least = Math.min(...scale);
  const at = (i: 0 | 1 | 2, v: number) => centre[i] + (v - centre[i]) * scale[i];
  return {
    distance: (x, y, z) => solid.distance(centre[0] + (x - centre[0]) / scale[0], centre[1] + (y - centre[1]) / scale[1], centre[2] + (z - centre[2]) / scale[2]) * least,
    min: [at(0, solid.min[0]), at(1, solid.min[1]), at(2, solid.min[2])],
    max: [at(0, solid.max[0]), at(1, solid.max[1]), at(2, solid.max[2])],
  };
}

/** A solid's surface raised and sunk in soft lumps about `wavelength` apart,
 *  at most `amount` either way: fur, a lumpy hide, rough-hewn stone. Smooth
 *  sine waves, warped by each other so the lumps don't line up. */
export function roughened(solid: Solid, amount: number, wavelength: number): Solid {
  const f = (Math.PI * 2) / wavelength;
  return {
    distance: (x, y, z) =>
      solid.distance(x, y, z) +
      amount * Math.sin(f * x + 1.7 * Math.sin(f * 0.71 * y)) * Math.sin(f * y + 1.3 * Math.sin(f * 0.93 * z)) * Math.sin(f * z + 1.1 * Math.sin(f * 1.27 * x)),
    min: solid.min.map((v) => v - amount) as unknown as Vec3,
    max: solid.max.map((v) => v + amount) as unknown as Vec3,
  };
}

/** The polynomial smooth minimum: two distances joined with a fillet `blend` wide. */
export function smoothMin(a: number, b: number, blend: number): number {
  if (blend <= 0) return Math.min(a, b);
  const h = Math.max(blend - Math.abs(a - b), 0) / blend;
  return Math.min(a, b) - h * h * blend * 0.25;
}

export function union(...solids: Solid[]): Solid {
  return {
    distance: (x, y, z) => {
      let d = Infinity;
      for (const solid of solids) d = Math.min(d, solid.distance(x, y, z));
      return d;
    },
    min: [0, 1, 2].map((i) => Math.min(...solids.map((s) => s.min[i]))) as unknown as Vec3,
    max: [0, 1, 2].map((i) => Math.max(...solids.map((s) => s.max[i]))) as unknown as Vec3,
  };
}

/** Where two solids overlap. */
export function intersect(a: Solid, b: Solid): Solid {
  return {
    distance: (x, y, z) => Math.max(a.distance(x, y, z), b.distance(x, y, z)),
    min: [0, 1, 2].map((i) => Math.max(a.min[i], b.min[i])) as unknown as Vec3,
    max: [0, 1, 2].map((i) => Math.min(a.max[i], b.max[i])) as unknown as Vec3,
  };
}

/** A skin over a solid's surface, from `inner` inside it to `outer` outside: for paint that stands proud, conforming to the curve. */
export function skin(solid: Solid, inner: number, outer: number): Solid {
  const middle = (outer - inner) / 2;
  const centre = (outer + inner) / 2;
  return {
    distance: (x, y, z) => Math.abs(solid.distance(x, y, z) - centre) - middle,
    min: solid.min.map((v) => v - outer) as unknown as Vec3,
    max: solid.max.map((v) => v + outer) as unknown as Vec3,
  };
}

/** How far a point lies outside a box, or 0 inside it. */
function outsideBox(x: number, y: number, z: number, min: Vec3, max: Vec3): number {
  const dx = Math.max(min[0] - x, 0, x - max[0]);
  const dy = Math.max(min[1] - y, 0, y - max[1]);
  const dz = Math.max(min[2] - z, 0, z - max[2]);
  return Math.hypot(dx, dy, dz);
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

export interface Net {
  /** Vertex positions, three floats each. */
  positions: Float32Array;
  /** Triangles, three vertex indices each, wound anticlockwise seen from outside. */
  triangles: Uint32Array;
}

/**
 * Meshes the surface where `distance` is zero inside the box from `min` to
 * `max` by surface nets: one vertex in each grid cell the surface crosses, at
 * the mean of its edge crossings, and one quad across each grid edge it
 * crosses. The mesh is closed wherever the surface lies inside the box.
 */
export function surfaceNet(distance: Distance, min: Vec3, max: Vec3, cell: number): Net {
  // Two cells of margin, so a surface touching the box still closes.
  const origin = min.map((v) => v - 2 * cell) as unknown as Vec3;
  const size = [0, 1, 2].map((i) => Math.ceil((max[i] - min[i]) / cell) + 5);
  const [nx, ny, nz] = size;
  const at = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  const values = sampleNearSurface(distance, origin, size, cell);

  const vertexOf = new Int32Array(nx * ny * nz).fill(-1);
  const positions: number[] = [];
  const corner = [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
    [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
  ];
  const edges = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const v = new Float64Array(8);
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        let inside = 0;
        for (let c = 0; c < 8; c++) {
          v[c] = values[at(i + corner[c][0], j + corner[c][1], k + corner[c][2])];
          if (v[c] < 0) inside++;
        }
        if (inside === 0 || inside === 8) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let crossings = 0;
        for (const [a, b] of edges) {
          if (v[a] < 0 === v[b] < 0) continue;
          const t = v[a] / (v[a] - v[b]);
          sx += corner[a][0] + (corner[b][0] - corner[a][0]) * t;
          sy += corner[a][1] + (corner[b][1] - corner[a][1]) * t;
          sz += corner[a][2] + (corner[b][2] - corner[a][2]) * t;
          crossings++;
        }
        vertexOf[at(i, j, k)] = positions.length / 3;
        positions.push(origin[0] + (i + sx / crossings) * cell, origin[1] + (j + sy / crossings) * cell, origin[2] + (k + sz / crossings) * cell);
      }
    }
  }

  const triangles: number[] = [];
  const point = (index: number) => [positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]];
  const gap = (a: number, b: number) => {
    const [ax, ay, az] = point(a);
    const [bx, by, bz] = point(b);
    return (ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2;
  };
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    const [p, q, r, s] = flip ? [a, d, c, b] : [a, b, c, d];
    // Split along the shorter diagonal, for the better-shaped pair.
    if (gap(p, r) <= gap(q, s)) triangles.push(p, q, r, p, r, s);
    else triangles.push(p, q, s, q, r, s);
  };
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const here = values[at(i, j, k)] < 0;
        // The edge along x: the four cells round it lie back along y and z.
        if (here !== values[at(i + 1, j, k)] < 0) {
          quad(vertexOf[at(i, j - 1, k - 1)], vertexOf[at(i, j, k - 1)], vertexOf[at(i, j, k)], vertexOf[at(i, j - 1, k)], !here);
        }
        if (here !== values[at(i, j + 1, k)] < 0) {
          quad(vertexOf[at(i - 1, j, k - 1)], vertexOf[at(i - 1, j, k)], vertexOf[at(i, j, k)], vertexOf[at(i, j, k - 1)], !here);
        }
        if (here !== values[at(i, j, k + 1)] < 0) {
          quad(vertexOf[at(i - 1, j - 1, k)], vertexOf[at(i, j - 1, k)], vertexOf[at(i, j, k)], vertexOf[at(i - 1, j, k)], !here);
        }
      }
    }
  }
  return { positions: new Float32Array(positions), triangles: new Uint32Array(triangles) };
}

/** Cells a side of the blocks `sampleNearSurface` skips whole. */
const BLOCK = 4;

/**
 * The distance at every grid point, measured exactly only near the surface:
 * a block of the grid whose middle is further from the surface than its own
 * reach can't contain any of it, so all its points take the middle's value,
 * which has the right sign. The distances here are close bounds rather than
 * exact, so the reach is padded by half.
 */
function sampleNearSurface(distance: Distance, origin: Vec3, [nx, ny, nz]: number[], cell: number): Float32Array {
  const values = new Float32Array(nx * ny * nz).fill(NaN);
  const at = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  const reach = BLOCK * cell * Math.sqrt(3) * 0.5 * 1.5;
  const far: { from: [number, number, number]; value: number }[] = [];
  for (let k0 = 0; k0 < nz - 1; k0 += BLOCK) {
    for (let j0 = 0; j0 < ny - 1; j0 += BLOCK) {
      for (let i0 = 0; i0 < nx - 1; i0 += BLOCK) {
        const middle = distance(origin[0] + (i0 + BLOCK / 2) * cell, origin[1] + (j0 + BLOCK / 2) * cell, origin[2] + (k0 + BLOCK / 2) * cell);
        if (Math.abs(middle) > reach) {
          far.push({ from: [i0, j0, k0], value: middle });
          continue;
        }
        for (let k = k0; k <= Math.min(k0 + BLOCK, nz - 1); k++) {
          for (let j = j0; j <= Math.min(j0 + BLOCK, ny - 1); j++) {
            for (let i = i0; i <= Math.min(i0 + BLOCK, nx - 1); i++) {
              const index = at(i, j, k);
              if (Number.isNaN(values[index])) values[index] = distance(origin[0] + i * cell, origin[1] + j * cell, origin[2] + k * cell);
            }
          }
        }
      }
    }
  }
  for (const { from: [i0, j0, k0], value } of far) {
    for (let k = k0; k <= Math.min(k0 + BLOCK, nz - 1); k++) {
      for (let j = j0; j <= Math.min(j0 + BLOCK, ny - 1); j++) {
        for (let i = i0; i <= Math.min(i0 + BLOCK, nx - 1); i++) {
          const index = at(i, j, k);
          if (Number.isNaN(values[index])) values[index] = value;
        }
      }
    }
  }
  return values;
}

/** The direction a distance grows fastest at a point: the surface's outward normal there. */
function gradient(distance: Distance, x: number, y: number, z: number, h: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(
    distance(x + h, y, z) - distance(x - h, y, z),
    distance(x, y + h, z) - distance(x, y - h, z),
    distance(x, y, z + h) - distance(x, y, z - h),
  );
}

/** Moves each vertex onto the surface along the gradient (Newton steps,
 *  never further than a cell), so curves are true rather than averaged. */
function settle(positions: Float32Array, distance: Distance, cell: number) {
  const g = new THREE.Vector3();
  const h = cell * 0.05;
  for (let i = 0; i < positions.length; i += 3) {
    for (let step = 0; step < 3; step++) {
      const [x, y, z] = [positions[i], positions[i + 1], positions[i + 2]];
      const d = distance(x, y, z);
      gradient(distance, x, y, z, h, g).divideScalar(2 * h);
      const length2 = g.lengthSq();
      if (length2 < 1e-12) break;
      g.multiplyScalar(-d / length2);
      if (g.length() > cell) g.setLength(cell);
      positions[i] += g.x;
      positions[i + 1] += g.y;
      positions[i + 2] += g.z;
    }
  }
}

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
export const OCCLUSION = { reach: 0.03, steps: 5, strength: 2.2, deepest: 0.55 };

function occlusion(distance: Distance, x: number, y: number, z: number, normal: THREE.Vector3): number {
  const { reach, steps, strength, deepest } = OCCLUSION;
  let closed = 0;
  let total = 0;
  for (let i = 1; i <= steps; i++) {
    const h = (reach * i) / steps;
    const weight = 1 / i;
    closed += weight * Math.max(0, h - distance(x + normal.x * h, y + normal.y * h, z + normal.z * h));
    total += weight * h;
  }
  return 1 - deepest * Math.min(1, (strength * closed) / total);
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
