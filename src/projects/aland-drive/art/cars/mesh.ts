/*
 * A triangle soup with a surface on every face, and its normals: faces meeting
 * under the crease angle shade smooth, sharper ones keep their edge. Pure
 * numbers, so the shapes can be counted and tested with no renderer.
 */

export type Point = [x: number, y: number, z: number];

/** What a face is made of. The order is the attribute's values, and the table in `material.ts` follows it. */
export const SURFACES = ["paint", "glass", "trim", "cladding", "gap", "under", "tyre", "rim", "rimDark", "grille", "plate", "lensTail", "lensReverse", "lensAmber", "lensHead", "seat", "seatTan", "interior", "disc", "rack", "plateBand", "stripe", "lensIndicator", "caliper"] as const;
export type Surface = (typeof SURFACES)[number];

export interface Soup {
  positions: Float32Array;
  normals: Float32Array;
  surfaces: Uint8Array;
  triangles: number;
}

/** The faces of a soup that pass a test, as a soup of their own. */
export function pick({ positions, normals, surfaces }: Soup, keep: (surface: Surface) => boolean): Soup {
  const kept: number[] = [];
  for (let face = 0; face < surfaces.length / 3; face++) if (keep(SURFACES[surfaces[face * 3]])) kept.push(face);
  const out: Soup = { positions: new Float32Array(kept.length * 9), normals: new Float32Array(kept.length * 9), surfaces: new Uint8Array(kept.length * 3), triangles: kept.length };
  kept.forEach((face, at) => {
    out.positions.set(positions.subarray(face * 9, face * 9 + 9), at * 9);
    out.normals.set(normals.subarray(face * 9, face * 9 + 9), at * 9);
    out.surfaces.set(surfaces.subarray(face * 3, face * 3 + 3), at * 3);
  });
  return out;
}

/** Two soups as one. */
export function joined(a: Soup, b: Soup): Soup {
  const out: Soup = { positions: new Float32Array(a.positions.length + b.positions.length), normals: new Float32Array(a.normals.length + b.normals.length), surfaces: new Uint8Array(a.surfaces.length + b.surfaces.length), triangles: a.triangles + b.triangles };
  out.positions.set(a.positions);
  out.positions.set(b.positions, a.positions.length);
  out.normals.set(a.normals);
  out.normals.set(b.normals, a.normals.length);
  out.surfaces.set(a.surfaces);
  out.surfaces.set(b.surfaces, a.surfaces.length);
  return out;
}

const MIN_AREA_M2 = 1e-7;
const WELD_PER_M = 5000;

const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Point, b: Point): Point => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mirrored = ([x, y, z]: Point): Point => [-x, y, z];

interface Face {
  corners: [Point, Point, Point];
  normal: Point;
  area: number;
  surface: number;
  /** Faces of different groups never shade together. */
  group: number;
  /** Normals the surface it lies on has at its corners, where the shape that made it knows them better than its faces do. */
  hints?: [Point | null, Point | null, Point | null];
}

/** A hinted normal further than this from its face's own is a mistake in the hint, and the face's neighbours decide instead. */
const HINT_LIMIT = Math.cos((60 * Math.PI) / 180);

export class SoupBuilder {
  private readonly faces: Face[] = [];
  private nextGroup = 1;

  /** A separate part: its faces won't smooth into anything else. */
  newGroup() {
    return this.nextGroup++;
  }

  triangle(a: Point, b: Point, c: Point, surface: Surface, group = 0, hints?: Face["hints"]) {
    const raw = cross(sub(b, a), sub(c, a));
    const doubleArea = Math.hypot(...raw);
    if (doubleArea < MIN_AREA_M2 * 2) return;
    this.faces.push({
      corners: [a, b, c],
      normal: [raw[0] / doubleArea, raw[1] / doubleArea, raw[2] / doubleArea],
      area: doubleArea,
      surface: SURFACES.indexOf(surface),
      group,
      hints,
    });
  }

  /** A quad on a surface whose normals are known at its corners, and its mirror across the car's middle. */
  mirroredSmoothQuad(corners: [Point, Point, Point, Point], normals: [Point | null, Point | null, Point | null, Point | null], surface: Surface, group = 0) {
    const [a, b, c, d] = corners;
    const [na, nb, nc, nd] = normals;
    const flip = (n: Point | null): Point | null => n && [-n[0], n[1], n[2]];
    const split = (p: [Point, Point, Point, Point], n: [Point | null, Point | null, Point | null, Point | null]) => {
      if (Math.hypot(...sub(p[0], p[2])) <= Math.hypot(...sub(p[1], p[3]))) {
        this.triangle(p[0], p[1], p[2], surface, group, [n[0], n[1], n[2]]);
        this.triangle(p[0], p[2], p[3], surface, group, [n[0], n[2], n[3]]);
      } else {
        this.triangle(p[0], p[1], p[3], surface, group, [n[0], n[1], n[3]]);
        this.triangle(p[1], p[2], p[3], surface, group, [n[1], n[2], n[3]]);
      }
    };
    split([a, b, c, d], [na, nb, nc, nd]);
    split([mirrored(d), mirrored(c), mirrored(b), mirrored(a)], [flip(nd), flip(nc), flip(nb), flip(na)]);
  }

  /** Corners anticlockwise from outside, cut along the shorter diagonal so a bent quad folds the clean way. */
  quad(a: Point, b: Point, c: Point, d: Point, surface: Surface, group = 0) {
    if (Math.hypot(...sub(a, c)) <= Math.hypot(...sub(b, d))) {
      this.triangle(a, b, c, surface, group);
      this.triangle(a, c, d, surface, group);
    } else {
      this.triangle(a, b, d, surface, group);
      this.triangle(b, c, d, surface, group);
    }
  }

  mirroredQuad(a: Point, b: Point, c: Point, d: Point, surface: Surface, group = 0) {
    this.quad(a, b, c, d, surface, group);
    this.quad(mirrored(d), mirrored(c), mirrored(b), mirrored(a), surface, group);
  }

  /** Rings of the same length joined in order, closed round each ring, and capped at both ends. */
  rings(rings: Point[][], surface: Surface, group = this.newGroup()) {
    const round = rings[0].length;
    for (let ring = 0; ring + 1 < rings.length; ring++) {
      for (let at = 0; at < round; at++) {
        const next = (at + 1) % round;
        this.quad(rings[ring][at], rings[ring][next], rings[ring + 1][next], rings[ring + 1][at], surface, group);
      }
    }
    const first = rings[0];
    const last = rings[rings.length - 1];
    for (let at = 1; at + 1 < round; at++) {
      this.triangle(first[0], first[at + 1], first[at], surface, group);
      this.triangle(last[0], last[at], last[at + 1], surface, group);
    }
  }

  /** Where a ray from `origin` along `direction` first meets a face. */
  raycast(origin: Point, direction: Point): Point | null {
    let nearest = Infinity;
    for (const { corners, normal } of this.faces) {
      const facing = dot(normal, direction);
      if (facing >= 0) continue;
      const along = dot(normal, sub(corners[0], origin)) / facing;
      if (along <= 0 || along >= nearest) continue;
      const hit: Point = [origin[0] + direction[0] * along, origin[1] + direction[1] * along, origin[2] + direction[2] * along];
      const inside = [0, 1, 2].every((edge) => {
        const from = corners[edge];
        const to = corners[(edge + 1) % 3];
        return dot(cross(sub(to, from), sub(hit, from)), normal) >= -1e-9;
      });
      if (inside) nearest = along;
    }
    return nearest === Infinity ? null : [origin[0] + direction[0] * nearest, origin[1] + direction[1] * nearest, origin[2] + direction[2] * nearest];
  }

  finish(creaseDeg: number): Soup {
    const cosine = Math.cos((creaseDeg * Math.PI) / 180);
    const key = ([x, y, z]: Point, group: number) => `${group}:${Math.round(x * WELD_PER_M)},${Math.round(y * WELD_PER_M)},${Math.round(z * WELD_PER_M)}`;
    const atCorner = new Map<string, Face[]>();
    for (const face of this.faces) {
      for (const corner of face.corners) {
        const known = atCorner.get(key(corner, face.group));
        if (known) known.push(face);
        else atCorner.set(key(corner, face.group), [face]);
      }
    }
    const triangles = this.faces.length;
    const positions = new Float32Array(triangles * 9);
    const normals = new Float32Array(triangles * 9);
    const surfaces = new Uint8Array(triangles * 3);
    this.faces.forEach((face, faceAt) => {
      face.corners.forEach((corner, cornerAt) => {
        const at = faceAt * 9 + cornerAt * 3;
        const hint = face.hints?.[cornerAt];
        if (hint) {
          const length = Math.hypot(...hint);
          const along = dot(hint, face.normal) / length;
          if (Math.abs(along) >= HINT_LIMIT) {
            const sign = along < 0 ? -1 : 1;
            positions.set(corner, at);
            normals.set([(sign * hint[0]) / length, (sign * hint[1]) / length, (sign * hint[2]) / length], at);
            surfaces[faceAt * 3 + cornerAt] = face.surface;
            return;
          }
        }
        const sum: Point = [0, 0, 0];
        for (const other of atCorner.get(key(corner, face.group)) ?? []) {
          if (dot(other.normal, face.normal) < cosine) continue;
          sum[0] += other.normal[0] * other.area;
          sum[1] += other.normal[1] * other.area;
          sum[2] += other.normal[2] * other.area;
        }
        const length = Math.hypot(...sum);
        positions.set(corner, at);
        normals.set([sum[0] / length, sum[1] / length, sum[2] / length], at);
        surfaces[faceAt * 3 + cornerAt] = face.surface;
      });
    });
    return { positions, normals, surfaces, triangles };
  }
}
