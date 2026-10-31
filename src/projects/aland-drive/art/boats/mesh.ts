import { BufferAttribute, BufferGeometry } from "three/webgpu";
import { Model, type BoxOptions, type Part, type TubeOptions, type V3 } from "../roadside/mesh";
import type { RoadsideModel } from "../roadside/models";

/*
 * The roadside kit's way of writing a model, with the boats' paints and the two
 * things a boat needs that a post doesn't. A model is a `RoadsideModel`, placed by
 * `placeModel` and drawn with `boatMaterials`.
 *
 * The origin is on the water, under the middle of the boat; the bow is +z, as a
 * `Placement`'s yaw reads a model, and starboard is -x.
 *
 * `tint` carries: r the part, g the shade, b how lively the whole boat rocks (one
 * value on every vertex, so hull, rig and lines rock as one), a the vertex's kind.
 * `lineSide` is the way a rigging ribbon widens with distance, and zero on the rest.
 */

export const PAINT = {
  gelcoat: { from: "boat-gelcoat" },
  "gelcoat-warm": { from: "boat-gelcoat-warm" },
  navy: { from: "boat-navy" },
  green: { from: "boat-green" },
  "hull-grey": { from: "boat-grey" },
  tar: { from: "boat-tar", gain: 1.2 },
  "antifoul-red": { from: "boat-antifoul-red" },
  "antifoul-blue": { from: "boat-antifoul-blue" },
  boot: { from: "boat-boot" },
  mahogany: { from: "boat-mahogany" },
  varnish: { from: "boat-varnish" },
  teak: { from: "boat-teak" },
  pine: { from: "boat-oiled-pine" },
  "pine-inside": { from: "boat-oiled-pine", gain: 0.72 },
  "non-skid": { from: "boat-non-skid" },
  glass: { from: "boat-glass" },
  alu: { from: "boat-alu" },
  "spar-black": { from: "boat-spar-black" },
  "spar-wood": { from: "boat-spar-wood" },
  rope: { from: "boat-rope" },
  wire: { from: "boat-wire" },
  rescue: { from: "boat-rescue" },
  pilot: { from: "boat-pilot" },
  "rib-tube": { from: "boat-rib-tube" },
  engine: { from: "boat-engine" },
  "fisher-blue": { from: "boat-fisher-blue" },
  beacon: { from: "boat-beacon" },
  "sail-white": { from: "boat-sail-white" },
  "sail-cream": { from: "boat-sail-cream" },
  "sail-tan": { from: "boat-sail-tan" },
  "sail-laminate": { from: "boat-sail-laminate" },
  "sail-red": { from: "boat-sail-red" },
  "sail-blue": { from: "boat-sail-blue" },
  "cover-navy": { from: "boat-cover-navy" },
  "cover-green": { from: "boat-cover-green" },
  "cover-red": { from: "boat-cover-red" },
  "cover-grey": { from: "boat-cover-grey" },
  "fender-white": { from: "boat-sail-white", gain: 0.96 },
  "fender-blue": { from: "boat-fender-blue" },
} as const satisfies Record<string, { from: string; to?: string; share?: number; gain?: number }>;

export type BoatPart = keyof typeof PAINT;
export const BOAT_PARTS = Object.keys(PAINT) as BoatPart[];

/** A vertex that rocks with the boat, a rigging ribbon, a mooring line's far end, which stays where it's made fast, and a sail's first flutter step. */
export const KIND = { solid: 0, line: 1, fast: 2, sail: 3 } as const;
/** Sail kinds run from `KIND.sail` to here, the flutter's weight rising with them. */
export const SAIL_KINDS = 252;

const STAND_IN: Part = "galvanised";
const SHADE_UNIT = 128;
const LINE_HALF_M = 0.009;

const unit = (a: V3): V3 => {
  const length = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / length, a[1] / length, a[2] / length];
};
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export class BoatMesh {
  private readonly positions: number[] = [];
  private readonly tints: number[] = [];
  private readonly sides: number[] = [];
  private readonly indices: number[] = [];

  private take(draw: (model: Model) => Model, part: BoatPart): this {
    const geometry = draw(new Model()).build();
    const positions = geometry.getAttribute("position");
    const tints = geometry.getAttribute("tint");
    const first = this.positions.length / 3;
    for (let index = 0; index < positions.count; index++) {
      this.positions.push(positions.getX(index), positions.getY(index), positions.getZ(index));
      this.tints.push(BOAT_PARTS.indexOf(part), tints.array[index * 4 + 1], 0, KIND.solid);
      this.sides.push(0, 0, 0);
    }
    for (const index of geometry.index?.array ?? []) this.indices.push(first + index);
    return this;
  }

  private vertex(at: V3, part: BoatPart, shade: number, kind: number, side: V3 = [0, 0, 0]): number {
    this.positions.push(...at);
    this.tints.push(BOAT_PARTS.indexOf(part), Math.min(255, Math.round(shade * SHADE_UNIT)), 0, kind);
    this.sides.push(...side);
    return this.positions.length / 3 - 1;
  }

  face(corners: readonly V3[], part: BoatPart, shade = 1): this {
    return this.take((model) => model.face(corners, STAND_IN, shade), part);
  }

  tube(from: V3, to: V3, radius: number, sides: number, options: TubeOptions, part: BoatPart): this {
    return this.take((model) => model.tube(from, to, radius, sides, options, STAND_IN), part);
  }

  beam(from: V3, to: V3, wide: number, tall: number, part: BoatPart, shade = 1): this {
    return this.take((model) => model.beam(from, to, wide, tall, STAND_IN, shade), part);
  }

  box(low: V3, high: V3, part: BoatPart, options: BoxOptions = {}): this {
    return this.take((model) => model.box(low, high, STAND_IN, options), part);
  }

  /** A stay or a sheet: two crossed ribbons, which the material holds at a pixel's width and fades with distance. With `fast`, the far end stays still as the boat rocks. */
  line(from: V3, to: V3, part: BoatPart = "wire", { fast = false }: { fast?: boolean } = {}): this {
    const along = unit([to[0] - from[0], to[1] - from[1], to[2] - from[2]]);
    const first = unit(cross(along, Math.abs(along[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0]));
    for (const side of [first, cross(first, along)]) {
      const corner = (end: V3, sign: number, kind: number) => this.vertex([end[0] + side[0] * sign * LINE_HALF_M, end[1] + side[1] * sign * LINE_HALF_M, end[2] + side[2] * sign * LINE_HALF_M], part, 1, kind, [side[0] * sign, side[1] * sign, side[2] * sign]);
      const [a, b] = [corner(from, 1, KIND.line), corner(from, -1, KIND.line)];
      const [c, d] = [corner(to, 1, fast ? KIND.fast : KIND.line), corner(to, -1, fast ? KIND.fast : KIND.line)];
      this.indices.push(a, b, c, c, b, d);
    }
    return this;
  }

  /** A sheet of quads by rows and columns of corners: for a sail. `weight` is how far each corner flutters, 0 to 1. */
  sheet(rows: readonly (readonly V3[])[], part: BoatPart, shadeOfRow: (row: number) => number, weight: (row: number, column: number) => number): this {
    for (let row = 0; row + 1 < rows.length; row++) {
      const shade = shadeOfRow(row);
      const lower = rows[row].map((corner, column) => this.vertex(corner, part, shade, KIND.sail + Math.round(weight(row, column) * SAIL_KINDS)));
      const upper = rows[row + 1].map((corner, column) => this.vertex(corner, part, shade, KIND.sail + Math.round(weight(row + 1, column) * SAIL_KINDS)));
      for (let column = 0; column + 1 < lower.length; column++) this.indices.push(lower[column], lower[column + 1], upper[column], upper[column], lower[column + 1], upper[column + 1]);
    }
    return this;
  }

  /** The finished geometry. `rock` is 0 for a ship that barely stirs to 1 for a dinghy; `move` is applied to every corner, for a boat's heel. */
  build(rock: number, move: (corner: V3) => V3 = (corner) => corner): BufferGeometry {
    const positions = new Float32Array(this.positions.length);
    const sides = new Float32Array(this.sides.length);
    for (let index = 0; index < this.positions.length; index += 3) {
      positions.set(move([this.positions[index], this.positions[index + 1], this.positions[index + 2]]), index);
      const [ox, oy, oz] = move([0, 0, 0]);
      const [sx, sy, sz] = move([this.sides[index], this.sides[index + 1], this.sides[index + 2]]);
      sides.set([sx - ox, sy - oy, sz - oz], index);
    }
    const tints = Uint8Array.from(this.tints);
    for (let index = 2; index < tints.length; index += 4) tints[index] = Math.round(rock * 255);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("tint", new BufferAttribute(tints, 4, true));
    geometry.setAttribute("lineSide", new BufferAttribute(sides, 3));
    geometry.setIndex(this.indices);
    return geometry;
  }
}

/** A heel to `lee` (1 is the +x side), about the waterline. */
export function heeled(degrees: number, lee: number): (corner: V3) => V3 {
  const [cos, sin] = [Math.cos((degrees * Math.PI) / 180), Math.sin((degrees * Math.PI) / 180) * lee];
  return ([x, y, z]) => [x * cos + y * sin, y * cos - x * sin, z];
}

export interface Finish {
  near: BoatMesh;
  far: BoatMesh;
  swapM: number;
  reachM: number;
  rock: number;
  heelDeg?: number;
  lee?: number;
}

export function finished({ near, far, swapM, reachM, rock, heelDeg = 0, lee = 1 }: Finish): RoadsideModel {
  const move = heeled(heelDeg, lee);
  return { near: near.build(rock, move), far: far.build(rock, move), swapM, reachM };
}

/** How many triangles a geometry draws. */
export const triangles = (geometry: BufferGeometry | null) => (geometry?.index?.count ?? 0) / 3;
