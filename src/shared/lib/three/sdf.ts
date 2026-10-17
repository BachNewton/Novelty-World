import * as THREE from "three";

/*
 * Smooth solids described by signed distance, and their meshing: the toolkit
 * figures are sculpted with (Betrayal's figures, Hearthwood's cats). A signed
 * distance is negative inside a solid and positive outside; most of the
 * primitives and blends are Inigo Quilez's. Colour, rigging and materials are
 * each game's own, built on top.
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
export function orient(centre: Vec3, rotation: Vec3): (x: number, y: number, z: number, out: THREE.Vector3) => THREE.Vector3 {
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

/** Any solid turned by `rotation` (Euler, radians) about `centre`. Its box is
 *  widened to hold it at any turn. */
export function turned(solid: Solid, centre: Vec3, rotation: Vec3): Solid {
  const local = orient(centre, rotation);
  const p = new THREE.Vector3();
  const reach = Math.max(...[0, 1, 2].map((i) => Math.max(Math.abs(solid.min[i] - centre[i]), Math.abs(solid.max[i] - centre[i])))) * Math.sqrt(3);
  return {
    distance: (x, y, z) => {
      local(x, y, z, p);
      return solid.distance(p.x + centre[0], p.y + centre[1], p.z + centre[2]);
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
export function outsideBox(x: number, y: number, z: number, min: Vec3, max: Vec3): number {
  const dx = Math.max(min[0] - x, 0, x - max[0]);
  const dy = Math.max(min[1] - y, 0, y - max[1]);
  const dz = Math.max(min[2] - z, 0, z - max[2]);
  return Math.hypot(dx, dy, dz);
}

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
export function gradient(distance: Distance, x: number, y: number, z: number, h: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(
    distance(x + h, y, z) - distance(x - h, y, z),
    distance(x, y + h, z) - distance(x, y - h, z),
    distance(x, y, z + h) - distance(x, y, z - h),
  );
}

/** Moves each vertex onto the surface along the gradient (Newton steps,
 *  never further than a cell), so curves are true rather than averaged. */
export function settle(positions: Float32Array, distance: Distance, cell: number) {
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

/** How deep a sculpture's own hollows shade a surface point (see `occlusion`). */
export interface Occlusion {
  /** How far out along the normal the surface is looked for, in metres. */
  reach: number;
  steps: number;
  strength: number;
  /** The most a point is darkened, as a fraction of its light. */
  deepest: number;
}

/**
 * How much a point on a surface is closed in by its own surface within
 * `reach`, stepping out along the normal (Inigo Quilez's distance-field
 * occlusion): 1 in the open, down to `1 − deepest` deep in a hollow. Baked
 * into a mesh, it lets creases and sockets read without a light of their own.
 */
export function occlusion(distance: Distance, x: number, y: number, z: number, normal: THREE.Vector3, { reach, steps, strength, deepest }: Occlusion): number {
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
