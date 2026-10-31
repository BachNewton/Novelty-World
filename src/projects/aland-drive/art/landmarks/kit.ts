import { ShapeUtils, Vector2 } from "three/webgpu";
import { LANDMARK_COLOURS, type LandmarkColour } from "./palette";

/*
 * A small kit for building landmarks in code, in the vertex format of the 3D buildings (`render/solids.ts`), so a
 * landmark draws with `buildingMaterial`, for one mesh and no new pipeline. That material shades every face flat from
 * its screen derivatives, so nothing here carries a normal, and it draws both sides, so nothing depends on winding.
 *
 * A paint is a vertex's four tint bytes as that material reads them, all of them its "roof" style: a flat colour, with
 * the facade attribute left at zero. The shader's windows suit a house's rhythm; these buildings' are modelled instead.
 */

export type Vec3 = readonly [number, number, number];
export type Vec2 = readonly [number, number];
export type Paint = readonly [number, number, number, number];

export interface LandmarkMesh {
  positions: Float32Array;
  /** Unused by flat paints: there for `render/solids.ts`' format. */
  facades: Float32Array;
  tints: Uint8Array;
  indices: Uint16Array;
}

/** What the material does to a roof's colour, undone so a colour arrives as its token says. */
const ROOF_GAMMA = 2.2;
const ROOF_GAIN = 1.15;

export function flat(name: LandmarkColour, shade = 1): Paint {
  const hex = LANDMARK_COLOURS[name];
  const byte = (at: number) => {
    const linear = Math.pow(parseInt(hex.slice(at, at + 2), 16) / 255, 2.2);
    return Math.min(255, Math.round(255 * Math.pow((linear * shade) / ROOF_GAIN, 1 / ROOF_GAMMA)));
  };
  return [byte(1), byte(3), byte(5), 0];
}

export function blend(a: Paint, b: Paint, share: number): Paint {
  const part = (at: number) => Math.round(a[at] + (b[at] - a[at]) * share);
  return [part(0), part(1), part(2), a[3]];
}

/** The same every run: a landmark's roughness is part of its shape, not of the moment it was built. */
export function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** Local east and north, metres from a landmark's origin, as a plan point (x, z). The scene's north is -z. */
export const en = (east: number, north: number): Vec2 => [east, -north];

export type Frame = (point: Vec3) => Vec3;

/** Turns a model authored with its length along +x to a compass bearing, so +x points that way. +z, its right, stays on its right. */
export function headed(bearingDeg: number, at: Vec2 = [0, 0]): Frame {
  const bearing = (bearingDeg * Math.PI) / 180;
  const sin = Math.sin(bearing);
  const cos = Math.cos(bearing);
  return ([x, y, z]) => [at[0] + x * sin - z * cos, y, at[1] - x * cos - z * sin];
}

export type MeshBuilder = ReturnType<typeof createBuilder>;

export function createBuilder(frame: Frame = (point) => point) {
  const positions: number[] = [];
  const facades: number[] = [];
  const tints: number[] = [];
  const indices: number[] = [];
  let current = frame;

  const vertex = (point: Vec3, paint: Paint) => {
    const placedAt = current(point);
    positions.push(placedAt[0], placedAt[1], placedAt[2]);
    facades.push(0, 0, 0, 0);
    tints.push(paint[0], paint[1], paint[2], paint[3]);
    return positions.length / 3 - 1;
  };
  const tri = (a: Vec3, b: Vec3, c: Vec3, paint: Paint) => {
    indices.push(vertex(a, paint), vertex(b, paint), vertex(c, paint));
  };
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, paint: Paint) => {
    const first = vertex(a, paint);
    vertex(b, paint);
    vertex(c, paint);
    vertex(d, paint);
    indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
  };

  /** An upright face between two plan points. */
  const wall = (a: Vec2, b: Vec2, bottom: number, top: number, paint: Paint) => {
    quad([a[0], bottom, a[1]], [b[0], bottom, b[1]], [b[0], top, b[1]], [a[0], top, a[1]], paint);
  };

  /** A flat polygon at a height. */
  const cap = (outline: readonly Vec2[], y: number, paint: Paint) => {
    const faces = ShapeUtils.triangulateShape(outline.map(([x, z]) => new Vector2(x, z)), []);
    const first = positions.length / 3;
    for (const [x, z] of outline) vertex([x, y, z], paint);
    for (const face of faces) indices.push(first + face[0], first + face[1], first + face[2]);
  };

  /** Upright walls round a closed outline, and a lid if it's given a paint. */
  const extrude = (outline: readonly Vec2[], bottom: number, top: number, paint: Paint, lid?: Paint) => {
    outline.forEach((point, at) => {
      wall(point, outline[(at + 1) % outline.length], bottom, top, paint);
    });
    if (lid) cap(outline, top, lid);
  };

  /** A box round a centre, turned in plan. */
  const box = (centre: Vec3, size: Vec3, paint: Paint, turnRad = 0, lid: Paint = paint) => {
    const [x, y, z] = centre;
    const cos = Math.cos(turnRad);
    const sin = Math.sin(turnRad);
    const corner = (u: number, v: number): Vec2 => [x + (u * cos - v * sin), z + (u * sin + v * cos)];
    const halfX = size[0] / 2;
    const halfZ = size[2] / 2;
    extrude([corner(-halfX, -halfZ), corner(halfX, -halfZ), corner(halfX, halfZ), corner(-halfX, halfZ)], y - size[1] / 2, y + size[1] / 2, paint, lid);
  };

  /** A turned form: rings of (radius, height) round an axis at a plan point, each band with its own paint or all with one. */
  const lathe = (centre: Vec2, rings: readonly Vec2[], sides: number, paints: Paint | readonly Paint[], fromRad = 0, spanRad = Math.PI * 2) => {
    const paintOf = (band: number): Paint => (typeof paints[0] === "number" ? (paints as Paint) : (paints as readonly Paint[])[band]);
    const at = (radius: number, angle: number, y: number): Vec3 => [centre[0] + radius * Math.cos(angle), y, centre[1] + radius * Math.sin(angle)];
    for (let band = 0; band + 1 < rings.length; band++) {
      const [lowR, lowY] = rings[band];
      const [highR, highY] = rings[band + 1];
      for (let side = 0; side < sides; side++) {
        const a = fromRad + (spanRad * side) / sides;
        const b = fromRad + (spanRad * (side + 1)) / sides;
        if (highR < 1e-6) tri(at(lowR, a, lowY), at(lowR, b, lowY), at(0, 0, highY), paintOf(band));
        else if (lowR < 1e-6) tri(at(0, 0, lowY), at(highR, b, highY), at(highR, a, highY), paintOf(band));
        else quad(at(lowR, a, lowY), at(lowR, b, lowY), at(highR, b, highY), at(highR, a, highY), paintOf(band));
      }
    }
  };

  /** A tapered pole between two points. */
  const tube = (a: Vec3, b: Vec3, radiusA: number, radiusB: number, sides: number, paint: Paint) => {
    const along = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const length = Math.hypot(along[0], along[1], along[2]);
    const unit = along.map((part) => part / length);
    const helper = Math.abs(unit[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const cross = (p: readonly number[], q: readonly number[]) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
    const raw = cross(unit, helper);
    const size = Math.hypot(raw[0], raw[1], raw[2]);
    const u = raw.map((part) => part / size);
    const v = cross(unit, u);
    const ring = (centre: Vec3, radius: number, side: number): Vec3 => {
      const angle = (side * Math.PI * 2) / sides;
      const c = Math.cos(angle) * radius;
      const s = Math.sin(angle) * radius;
      return [centre[0] + u[0] * c + v[0] * s, centre[1] + u[1] * c + v[1] * s, centre[2] + u[2] * c + v[2] * s];
    };
    for (let side = 0; side < sides; side++) quad(ring(a, radiusA, side), ring(a, radiusA, side + 1), ring(b, radiusB, side + 1), ring(b, radiusB, side), paint);
  };

  /** A rope or wire: the cheapest thing that keeps its width from every side. */
  const line = (a: Vec3, b: Vec3, width: number, paint: Paint) => {
    tube(a, b, width / 2, width / 2, 3, paint);
  };

  /** A pitched roof over a rectangle a, b, c, d, the ridge running from the middle of a–d to the middle of b–c, with its gable ends closed. */
  const gableRoof = (a: Vec2, b: Vec2, c: Vec2, d: Vec2, eaves: number, ridge: number, roof: Paint, gable: Paint, overhang = 0.3) => {
    const startMiddle: Vec2 = [(a[0] + d[0]) / 2, (a[1] + d[1]) / 2];
    const endMiddle: Vec2 = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2];
    const out = (from: Vec2, centre: Vec2): Vec3 => {
      const dx = from[0] - centre[0];
      const dz = from[1] - centre[1];
      const size = Math.hypot(dx, dz);
      return [from[0] + (dx / size) * overhang, eaves - overhang * 0.5, from[1] + (dz / size) * overhang];
    };
    quad(out(a, startMiddle), out(b, endMiddle), [endMiddle[0], ridge, endMiddle[1]], [startMiddle[0], ridge, startMiddle[1]], roof);
    quad(out(d, startMiddle), out(c, endMiddle), [endMiddle[0], ridge, endMiddle[1]], [startMiddle[0], ridge, startMiddle[1]], roof);
    tri([a[0], eaves, a[1]], [d[0], eaves, d[1]], [startMiddle[0], ridge, startMiddle[1]], gable);
    tri([b[0], eaves, b[1]], [c[0], eaves, c[1]], [endMiddle[0], ridge, endMiddle[1]], gable);
  };

  /** A block curved along a circle round a plan point: from radius `inner` to `outer`, between two angles. */
  const arcBlock = (centre: Vec2, inner: number, outer: number, fromRad: number, toRad: number, steps: number, bottom: number, top: number, side: Paint, lid: Paint) => {
    const at = (radius: number, angle: number, y: number): Vec3 => [centre[0] + radius * Math.cos(angle), y, centre[1] + radius * Math.sin(angle)];
    for (let step = 0; step < steps; step++) {
      const a = fromRad + ((toRad - fromRad) * step) / steps;
      const b = fromRad + ((toRad - fromRad) * (step + 1)) / steps;
      quad(at(outer, a, bottom), at(outer, b, bottom), at(outer, b, top), at(outer, a, top), side);
      quad(at(inner, a, bottom), at(inner, b, bottom), at(inner, b, top), at(inner, a, top), side);
      quad(at(inner, a, top), at(inner, b, top), at(outer, b, top), at(outer, a, top), lid);
    }
    quad(at(inner, fromRad, bottom), at(outer, fromRad, bottom), at(outer, fromRad, top), at(inner, fromRad, top), side);
    quad(at(inner, toRad, bottom), at(outer, toRad, bottom), at(outer, toRad, top), at(inner, toRad, top), side);
  };

  /** An upright wall of patches, each cell's colour picked for it: how stone and old brick read without a texture. */
  const patchWall = (a: Vec2, b: Vec2, bottom: number, top: number, cellWide: number, cellTall: number, pick: (along: number, up: number) => Paint) => {
    const width = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const columns = Math.max(1, Math.round(width / cellWide));
    const rows = Math.max(1, Math.round((top - bottom) / cellTall));
    const place = (along: number, y: number): Vec3 => [a[0] + (b[0] - a[0]) * along, y, a[1] + (b[1] - a[1]) * along];
    for (let column = 0; column < columns; column++) {
      for (let row = 0; row < rows; row++) {
        const y0 = bottom + ((top - bottom) * row) / rows;
        const y1 = bottom + ((top - bottom) * (row + 1)) / rows;
        const left = column / columns;
        const right = (column + 1) / columns;
        quad(place(left, y0), place(right, y0), place(right, y1), place(left, y1), pick(((left + right) / 2) * width, (y0 + y1) / 2 - bottom));
      }
    }
  };

  /** The same with its colour at the corners of the cells, shared and blending between them: mottled rather than chequered. */
  const mottledWall = (a: Vec2, b: Vec2, bottom: number, top: number, cellWide: number, cellTall: number, pick: (along: number, up: number) => Paint) => {
    const width = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const columns = Math.max(1, Math.round(width / cellWide));
    const rows = Math.max(1, Math.round((top - bottom) / cellTall));
    const first = positions.length / 3;
    for (let row = 0; row <= rows; row++) {
      const up = ((top - bottom) * row) / rows;
      for (let column = 0; column <= columns; column++) {
        const along = column / columns;
        vertex([a[0] + (b[0] - a[0]) * along, bottom + up, a[1] + (b[1] - a[1]) * along], pick(along * width, up));
      }
    }
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const low = first + row * (columns + 1) + column;
        const high = low + columns + 1;
        indices.push(low, low + 1, high + 1, low, high + 1, high);
      }
    }
  };

  return {
    arcBlock,
    mottledWall,
    patchWall,
    tri,
    quad,
    wall,
    cap,
    extrude,
    box,
    lathe,
    tube,
    line,
    gableRoof,
    /** Everything drawn in `draw` goes through a further frame first. */
    within(inner: Frame, draw: () => void) {
      const outer = current;
      current = (point) => outer(inner(point));
      draw();
      current = outer;
    },
    done(): LandmarkMesh {
      if (positions.length / 3 > 65535) throw new Error(`landmark: ${positions.length / 3} vertices won't fit a 16-bit index`);
      return { positions: new Float32Array(positions), facades: new Float32Array(facades), tints: new Uint8Array(tints), indices: new Uint16Array(indices) };
    },
  };
}
