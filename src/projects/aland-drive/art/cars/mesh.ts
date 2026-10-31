/*
 * A triangle soup with a surface on every face, and its normals: faces meeting
 * under the crease angle shade smooth, sharper ones keep their edge. Pure
 * numbers, so the shapes can be counted and tested with no renderer.
 */

export type Point = [x: number, y: number, z: number];

/** What a face is made of. The order is the attribute's values, and the table in `material.ts` follows it. */
export const SURFACES = ["paint", "glass", "trim", "cladding", "gap", "under", "tyre", "rim", "rimDark", "grille", "plate", "lensTail", "lensReverse", "lensAmber", "lensHead"] as const;
export type Surface = (typeof SURFACES)[number];

export interface Soup {
  positions: Float32Array;
  normals: Float32Array;
  surfaces: Uint8Array;
  triangles: number;
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
}

export class SoupBuilder {
  private readonly faces: Face[] = [];
  private nextGroup = 1;

  /** A separate part: its faces won't smooth into anything else. */
  newGroup() {
    return this.nextGroup++;
  }

  triangle(a: Point, b: Point, c: Point, surface: Surface, group = 0) {
    const raw = cross(sub(b, a), sub(c, a));
    const doubleArea = Math.hypot(...raw);
    if (doubleArea < MIN_AREA_M2 * 2) return;
    this.faces.push({
      corners: [a, b, c],
      normal: [raw[0] / doubleArea, raw[1] / doubleArea, raw[2] / doubleArea],
      area: doubleArea,
      surface: SURFACES.indexOf(surface),
      group,
    });
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
        const sum: Point = [0, 0, 0];
        for (const other of atCorner.get(key(corner, face.group)) ?? []) {
          if (dot(other.normal, face.normal) < cosine) continue;
          sum[0] += other.normal[0] * other.area;
          sum[1] += other.normal[1] * other.area;
          sum[2] += other.normal[2] * other.area;
        }
        const length = Math.hypot(...sum);
        const at = faceAt * 9 + cornerAt * 3;
        positions.set(corner, at);
        normals.set([sum[0] / length, sum[1] / length, sum[2] / length], at);
        surfaces[faceAt * 3 + cornerAt] = face.surface;
      });
    });
    return { positions, normals, surfaces, triangles };
  }
}
