import { ShapeUtils, Vector2 } from "three";
import type { Brand, Outline } from "./brands";
import { GLYPH_HEIGHT, lineStrokes, lineWidth } from "./glyphs";

/*
 * A way of writing a building as numbers, with no GPU in it, so triangle counts can be tested. Every face has its own
 * corners and a flat normal, the art direction's flat shading. Colours stay token names until `geometryOf` turns them
 * into a mesh, which only works in a browser.
 */

export type V3 = readonly [x: number, y: number, z: number];

/** A token without the `--color-aland-drive-` prefix. */
export const PAINTS = [
  "dealer-klippa", "dealer-klippa-ink", "dealer-vastan", "dealer-vastan-ink", "dealer-tarna", "dealer-tarna-ink",
  "dealer-concrete", "dealer-tile", "dealer-polish", "dealer-paving", "dealer-paving-dark", "dealer-gravel", "dealer-asphalt",
  "dealer-panel", "dealer-steel", "dealer-steel-dark", "dealer-timber", "dealer-timber-dark", "dealer-stone", "dealer-leather",
  "dealer-fabric", "dealer-rubber", "dealer-hazard", "dealer-glass", "dealer-shade", "dealer-light-warm", "dealer-light-cool", "dealer-ceiling",
  "wall-red", "wall-trim", "wall-grey", "wall-plinth", "wall-door", "wall-glass", "road-paint", "sky", "water", "tree-spruce", "tree-birch", "ground",
] as const;
export type Paint = (typeof PAINTS)[number];

/** What a fragment draws on a surface, in the near material. */
export const PATTERNS = ["plain", "boards", "ribs", "seams", "tiles", "speckle"] as const;
export type Pattern = (typeof PATTERNS)[number];

export interface Finish {
  /** Shines by itself: 1 ignores the light entirely. */
  glow?: number;
  /** Mirrors what it faces at a glancing angle. */
  gloss?: number;
  pattern?: Pattern;
  /** A brightness per corner, as baked shade; one value for all. */
  shade?: number | readonly number[];
}

export interface Soup {
  positions: Float32Array;
  normals: Float32Array;
  /** A paint index, a shade, a glow, a gloss and a pattern index, per vertex. */
  surface: Float32Array;
  triangles: number;
}

export const SURFACE_STRIDE = 5;

type Apply = (at: V3) => V3;

export interface Place {
  x?: number;
  y?: number;
  z?: number;
  yaw?: number;
  /** A turn about the local x, after the yaw: a tyre on its edge. */
  pitch?: number;
}

export type Side = "top" | "bottom" | "north" | "south" | "east" | "west";

const subtract = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export class Shell {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly surface: number[] = [];
  private apply: Apply = (at) => at;

  /** Draws inside a moved frame: a kit's piece stands at its own origin. */
  within(place: Place, draw: () => void): this {
    const { x = 0, y = 0, z = 0, yaw = 0, pitch = 0 } = place;
    const outer = this.apply;
    const [c, s, pc, ps] = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch)];
    this.apply = ([px, py, pz]) => {
      const [ty, tz] = [py * pc - pz * ps, py * ps + pz * pc];
      return outer([x + px * c + tz * s, y + ty, z + tz * c - px * s]);
    };
    draw();
    this.apply = outer;
    return this;
  }

  tri(a: V3, b: V3, c: V3, paint: Paint, finish: Finish = {}, shades: readonly [number, number, number] = [1, 1, 1]): this {
    const [pa, pb, pc] = [this.apply(a), this.apply(b), this.apply(c)];
    const raw = cross(subtract(pb, pa), subtract(pc, pa));
    const length = Math.hypot(...raw);
    if (length === 0) return this;
    const normal = [raw[0] / length, raw[1] / length, raw[2] / length];
    const { glow = 0, gloss = 0, pattern = "plain" } = finish;
    const paintIndex = PAINTS.indexOf(paint);
    const patternIndex = PATTERNS.indexOf(pattern);
    [pa, pb, pc].forEach((corner, index) => {
      this.positions.push(...corner);
      this.normals.push(...normal);
      this.surface.push(paintIndex, shades[index], glow, gloss, patternIndex);
    });
    return this;
  }

  /** Four corners in order round the face. */
  quad(a: V3, b: V3, c: V3, d: V3, paint: Paint, finish: Finish = {}): this {
    const { shade = 1 } = finish;
    const [sa, sb, sc, sd] = typeof shade === "number" ? [shade, shade, shade, shade] : shade;
    return this.tri(a, b, c, paint, finish, [sa, sb, sc]).tri(a, c, d, paint, finish, [sa, sc, sd]);
  }

  /** A box. `open` leaves faces off that nothing sees; the underside is off by default. */
  box(low: V3, high: V3, paint: Paint, finish: Finish = {}, open: readonly Side[] = ["bottom"]): this {
    const [x0, y0, z0] = low;
    const [x1, y1, z1] = high;
    const wall = (a: V3, b: V3, c: V3, d: V3, side: Side) => {
      if (!open.includes(side)) this.quad(a, b, c, d, paint, finish);
    };
    wall([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], "south");
    wall([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], "north");
    wall([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], "east");
    wall([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], "west");
    wall([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], "top");
    wall([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], "bottom");
    return this;
  }

  /** A square bar from one point to another. */
  bar(from: V3, to: V3, thick: number, paint: Paint, finish: Finish = {}): this {
    const along = subtract(to, from);
    const side = Math.abs(along[1]) > Math.hypot(along[0], along[2]) ? ([1, 0, 0] as V3) : ([0, 1, 0] as V3);
    const raw1 = cross(along, side);
    const scale1 = thick / 2 / Math.hypot(...raw1);
    const u: V3 = [raw1[0] * scale1, raw1[1] * scale1, raw1[2] * scale1];
    const raw2 = cross(along, u);
    const scale2 = thick / 2 / Math.hypot(...raw2);
    const v: V3 = [raw2[0] * scale2, raw2[1] * scale2, raw2[2] * scale2];
    const corner = (base: V3, su: number, sv: number): V3 => [base[0] + u[0] * su + v[0] * sv, base[1] + u[1] * su + v[1] * sv, base[2] + u[2] * su + v[2] * sv];
    const rings: [number, number][] = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    rings.forEach(([su, sv], index) => {
      const [nu, nv] = rings[(index + 1) % 4];
      this.quad(corner(from, su, sv), corner(from, nu, nv), corner(to, nu, nv), corner(to, su, sv), paint, finish);
    });
    return this;
  }

  /** A shape turned round the local y: rings of radius and height, bottom to top. */
  lathe(profile: readonly (readonly [radius: number, y: number])[], sides: number, paint: Paint, finish: Finish = {}): this {
    const point = (radius: number, y: number, side: number): V3 => {
      const angle = (side * 2 * Math.PI) / sides;
      return [radius * Math.cos(angle), y, radius * Math.sin(angle)];
    };
    for (let ring = 0; ring < profile.length - 1; ring++) {
      const [[r0, y0], [r1, y1]] = [profile[ring], profile[ring + 1]];
      for (let side = 0; side < sides; side++) {
        if (r0 === 0) this.tri(point(0, y0, 0), point(r1, y1, side + 1), point(r1, y1, side), paint, finish);
        else if (r1 === 0) this.tri(point(r0, y0, side), point(r0, y0, side + 1), point(0, y1, 0), paint, finish);
        else this.quad(point(r0, y0, side), point(r0, y0, side + 1), point(r1, y1, side + 1), point(r1, y1, side), paint, finish);
      }
    }
    return this;
  }

  /** A filled outline flat on the local z, facing +z, scaled and moved. */
  outline(points: Outline, scale: number, z: number, paint: Paint, finish: Finish = {}): this {
    const contour = points.map(([x, y]) => new Vector2(x, y));
    const clockwise = ShapeUtils.isClockWise(contour);
    const ordered = clockwise ? [...contour].reverse() : contour;
    for (const [a, b, c] of ShapeUtils.triangulateShape(ordered, [])) {
      const corner = (index: number): V3 => [ordered[index].x * scale, ordered[index].y * scale, z];
      this.tri(corner(a), corner(b), corner(c), paint, finish);
    }
    return this;
  }

  /** A brand's logo, facing +z and centred, as big as `radius`. */
  logo(brand: Brand, radius: number, finish: Finish = {}): this {
    this.outline(brand.badge, radius, 0, brand.colour, finish);
    for (const mark of brand.marks) this.outline(mark, radius, Math.max(0.006, radius * 0.01), brand.ink, finish);
    return this;
  }

  /** A line of capitals, facing +z, centred on x, its feet on y 0. `tall` is a letter's height in metres. */
  text(line: string, tall: number, paint: Paint, finish: Finish = {}, align: "centre" | "left" = "centre"): this {
    const unit = tall / GLYPH_HEIGHT;
    const half = (0.42 * unit) / 2 + tall * 0.03;
    const left = align === "centre" ? (-lineWidth(line) * unit) / 2 : 0;
    for (const stroke of lineStrokes(line)) {
      for (let index = 0; index < stroke.length - 1; index++) {
        const [ax, ay] = [left + stroke[index][0] * unit, stroke[index][1] * unit];
        const [bx, by] = [left + stroke[index + 1][0] * unit, stroke[index + 1][1] * unit];
        const length = Math.hypot(bx - ax, by - ay);
        const [dx, dy] = [(bx - ax) / length, (by - ay) / length];
        const [nx, ny] = [-dy * half, dx * half];
        const [ex, ey] = [dx * half, dy * half];
        this.quad([ax - ex - nx, ay - ey - ny, 0], [bx + ex - nx, by + ey - ny, 0], [bx + ex + nx, by + ey + ny, 0], [ax - ex + nx, ay - ey + ny, 0], paint, finish);
      }
    }
    return this;
  }

  build(): Soup {
    return {
      positions: Float32Array.from(this.positions),
      normals: Float32Array.from(this.normals),
      surface: Float32Array.from(this.surface),
      triangles: this.positions.length / 9,
    };
  }
}
