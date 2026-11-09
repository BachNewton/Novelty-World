import type { Point } from "../mesh";

/*
 * A cockpit's faces, each with what it is made of and what it does: a plain
 * surface, a dial's face, a readout of figures, a screen, a part of the wheel
 * that turns with the steering, a lamp that lights past some revs, or a vent.
 * The same smoothing as a car's shell (`mesh.ts`): faces of one group meeting
 * under the crease angle shade smooth. Pure numbers, so it can be counted and
 * tested with no renderer.
 */

/** What a face does in the cockpit's shader. The values are the attribute's, and the shader follows them. */
export const KIND = { plain: 0, dial: 1, readout: 2, screen: 3, wheel: 4, lamp: 5, vent: 6 } as const;
export type Kind = (typeof KIND)[keyof typeof KIND];

/** A finish: a token (null for the car's own paint), how much darker, and how it takes the light. */
export interface Paint {
  token: string | null;
  shade?: number;
  mirror: number;
  gloss: number;
  metal: number;
  /** How bright it lights after dark, over its colour; 0 for most. */
  glow: number;
}

export type Uv = readonly [u: number, v: number];

export interface FaceLook {
  paint: Paint;
  kind?: Kind;
  /** A dial's slot, a readout's source, a lamp's threshold. */
  param?: number;
  group?: number;
}

export interface CockpitSoup {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  /** Per vertex: the index into `paints`, the face's kind and its parameter. */
  paintOf: Uint8Array;
  kinds: Uint8Array;
  params: Float32Array;
  paints: readonly Paint[];
  triangles: number;
}

const MIN_AREA_M2 = 1e-8;
const WELD_PER_M = 5000;

const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Point, b: Point): Point => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

interface Face {
  corners: [Point, Point, Point];
  uvs: [Uv, Uv, Uv];
  normal: Point;
  area: number;
  paint: number;
  kind: Kind;
  param: number;
  group: number;
}

const NO_UV: [Uv, Uv, Uv] = [
  [0, 0],
  [0, 0],
  [0, 0],
];

export class CockpitBuilder {
  private readonly faces: Face[] = [];
  private readonly paints: Paint[] = [];
  private nextGroup = 1;

  newGroup() {
    return this.nextGroup++;
  }

  private paintIndex(paint: Paint) {
    const known = this.paints.indexOf(paint);
    if (known >= 0) return known;
    this.paints.push(paint);
    if (this.paints.length > 255) throw new Error("a cockpit with more than 255 finishes");
    return this.paints.length - 1;
  }

  triangle(a: Point, b: Point, c: Point, look: FaceLook, uvs: [Uv, Uv, Uv] = NO_UV) {
    const raw = cross(sub(b, a), sub(c, a));
    const doubleArea = Math.hypot(...raw);
    if (doubleArea < MIN_AREA_M2 * 2) return;
    this.faces.push({
      corners: [a, b, c],
      uvs,
      normal: [raw[0] / doubleArea, raw[1] / doubleArea, raw[2] / doubleArea],
      area: doubleArea,
      paint: this.paintIndex(look.paint),
      kind: look.kind ?? KIND.plain,
      param: look.param ?? 0,
      group: look.group ?? 0,
    });
  }

  /** Corners anticlockwise seen from the side the face shows. */
  quad(a: Point, b: Point, c: Point, d: Point, look: FaceLook, uvs?: readonly [Uv, Uv, Uv, Uv]) {
    const [ua, ub, uc, ud] = uvs ?? [NO_UV[0], NO_UV[0], NO_UV[0], NO_UV[0]];
    if (Math.hypot(...sub(a, c)) <= Math.hypot(...sub(b, d))) {
      this.triangle(a, b, c, look, [ua, ub, uc]);
      this.triangle(a, c, d, look, [ua, uc, ud]);
    } else {
      this.triangle(a, b, d, look, [ua, ub, ud]);
      this.triangle(b, c, d, look, [ub, uc, ud]);
    }
  }

  /**
   * Rows of points joined in order, each row open or closed round, the ends capped if closed. Faces show to the left
   * walking along a row, rows going the way the next one lies. `lookOf` gives a stretch between two points its own
   * look, by the index of the point it starts at and of the row.
   */
  sheet(rows: readonly (readonly Point[])[], look: FaceLook, closed = false, lookOf?: (at: number, row: number) => FaceLook) {
    const group = look.group ?? this.newGroup();
    const along = { ...look, group };
    const round = rows[0].length;
    const spans = closed ? round : round - 1;
    for (let row = 0; row + 1 < rows.length; row++) {
      for (let at = 0; at < spans; at++) {
        const next = (at + 1) % round;
        const own = lookOf ? { ...lookOf(at, row), group } : along;
        this.quad(rows[row][at], rows[row][next], rows[row + 1][next], rows[row + 1][at], own);
      }
    }
    if (!closed) return;
    this.cap(rows[0], rows[1], { ...look, group: 0 });
    this.cap(rows[rows.length - 1], rows[rows.length - 2], { ...look, group: 0 });
  }

  /** A loop closed with a fan from its middle, facing away from `beside`, the row next to it. */
  cap(loop: readonly Point[], beside: readonly Point[], look: FaceLook) {
    const middle = centroid(loop);
    const away = sub(middle, centroid(beside));
    loop.forEach((point, at) => {
      const next = loop[(at + 1) % loop.length];
      const facing = dot(cross(sub(point, middle), sub(next, middle)), away);
      if (facing >= 0) this.triangle(middle, point, next, look);
      else this.triangle(middle, next, point, look);
    });
  }

  /** A tube along a path, round in `sides`, its ends capped. */
  tube(path: readonly Point[], radius: number, sides: number, look: FaceLook, closed = false, lookAlong?: (row: number) => FaceLook) {
    const rings = path.map((point, at) => {
      const before = path[closed ? (at - 1 + path.length) % path.length : Math.max(at - 1, 0)];
      const after = path[closed ? (at + 1) % path.length : Math.min(at + 1, path.length - 1)];
      const tangent = normalize(sub(after, before));
      const side = normalize(cross(tangent, Math.abs(tangent[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
      const up = cross(side, tangent);
      return Array.from({ length: sides }, (_, step): Point => {
        const angle = -(step / sides) * Math.PI * 2;
        const [c, s] = [Math.cos(angle) * radius, Math.sin(angle) * radius];
        return [point[0] + side[0] * c + up[0] * s, point[1] + side[1] * c + up[1] * s, point[2] + side[2] * c + up[2] * s];
      });
    });
    if (closed) rings.push(rings[0]);
    this.sheet(rings, look, !closed, lookAlong && ((_, row) => lookAlong(row)));
  }

  finish(creaseDeg: number): CockpitSoup {
    const cosine = Math.cos((creaseDeg * Math.PI) / 180);
    // Faces of every group share a place's list, and only those of the face's own group are read from it.
    const key = ([x, y, z]: Point, _group: number) => weldKey(x, y, z);
    const atCorner = new Map<number, Face[]>();
    for (const face of this.faces) {
      for (const corner of face.corners) {
        const known = atCorner.get(key(corner, face.group));
        if (known) known.push(face);
        else atCorner.set(key(corner, face.group), [face]);
      }
    }
    const triangles = this.faces.length;
    const soup: CockpitSoup = {
      positions: new Float32Array(triangles * 9),
      normals: new Float32Array(triangles * 9),
      uvs: new Float32Array(triangles * 6),
      paintOf: new Uint8Array(triangles * 3),
      kinds: new Uint8Array(triangles * 3),
      params: new Float32Array(triangles * 3),
      paints: [...this.paints],
      triangles,
    };
    this.faces.forEach((face, faceAt) => {
      face.corners.forEach((corner, cornerAt) => {
        const sum: Point = [0, 0, 0];
        // Group 0 is faceted: each flat face keeps its own normal.
        for (const other of face.group === 0 ? [face] : (atCorner.get(key(corner, face.group)) ?? [])) {
          if (other.group !== face.group || dot(other.normal, face.normal) < cosine) continue;
          sum[0] += other.normal[0] * other.area;
          sum[1] += other.normal[1] * other.area;
          sum[2] += other.normal[2] * other.area;
        }
        const length = Math.hypot(...sum);
        const vertex = faceAt * 3 + cornerAt;
        soup.positions.set(corner, vertex * 3);
        soup.normals.set([sum[0] / length, sum[1] / length, sum[2] / length], vertex * 3);
        soup.uvs.set(face.uvs[cornerAt], vertex * 2);
        soup.paintOf[vertex] = face.paint;
        soup.kinds[vertex] = face.kind;
        soup.params[vertex] = face.param;
      });
    });
    return soup;
  }
}

/** A corner's place welded to a fifth of a millimetre, as one whole number: each axis within ±6.5 m of the car's middle. */
export function weldKey(x: number, y: number, z: number): number {
  const [i, j, k] = [Math.round(x * WELD_PER_M) + 32768, Math.round(y * WELD_PER_M) + 32768, Math.round(z * WELD_PER_M) + 32768];
  return (i * 65536 + j) * 65536 + k;
}

function centroid(points: readonly Point[]): Point {
  const sum: Point = [0, 0, 0];
  for (const point of points) for (const axis of [0, 1, 2]) sum[axis] += point[axis] / points.length;
  return sum;
}

export function normalize(v: Point): Point {
  const length = Math.hypot(...v);
  return length === 0 ? [0, 0, 0] : [v[0] / length, v[1] / length, v[2] / length];
}

/** A frame of three axes at an origin: a point in it is origin + right·a + up·b + back·c. */
export function axes(origin: Point, right: Point, up: Point, back: Point) {
  return (a: number, b: number, c: number): Point => [
    origin[0] + right[0] * a + up[0] * b + back[0] * c,
    origin[1] + right[1] * a + up[1] * b + back[1] * c,
    origin[2] + right[2] * a + up[2] * b + back[2] * c,
  ];
}

const signedPow = (value: number, power: number) => Math.sign(value) * Math.abs(value) ** power;

/**
 * A rounded box: a superellipsoid of half sizes (across, up, back) in a frame, as soft as `round` (near 0 a box,
 * 1 an ellipsoid), with `steps` round each way.
 */
export function pillow(builder: CockpitBuilder, at: ReturnType<typeof axes>, half: readonly [number, number, number], round: number, look: FaceLook, steps = 10) {
  const rows: Point[][] = [];
  for (let ring = 0; ring <= steps; ring++) {
    const v = -Math.PI / 2 + (ring / steps) * Math.PI;
    const row: Point[] = [];
    for (let step = 0; step < steps * 2; step++) {
      const u = (step / (steps * 2)) * Math.PI * 2;
      const across = signedPow(Math.cos(v), round) * signedPow(Math.cos(u), round);
      const back = signedPow(Math.cos(v), round) * signedPow(Math.sin(u), round);
      const up = signedPow(Math.sin(v), round);
      row.push(at(across * half[0], up * half[1], back * half[2]));
    }
    rows.push(row);
  }
  // Rows go from the bottom up; walking a row anticlockwise seen from above keeps the faces outward.
  builder.sheet(rows.map((row) => [...row].reverse()), look, true);
}
