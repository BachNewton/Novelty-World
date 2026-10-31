import type { V3 } from "../roadside/mesh";
import { lookup } from "../landmarks/hull";
import type { BoatMesh, BoatPart } from "./mesh";

/*
 * A hull as a stack of levels, each running between its own stern and stem, so a
 * raked stem, a counter or a canoe stern come from where the levels end, as the
 * landmark ships' do; but drawn bottom-up to a band's paint per level, with an
 * optional lap at each level for clinker. A station's place is its share of the way
 * from stern (0) to stem (1).
 *
 * Nothing is drawn far below the water: a level at about half a metre under stops a
 * heel lifting a bilge clear, and the keel and rudder are never seen.
 */

export type Table = readonly (readonly [number, number])[];

export interface Level {
  /** Height at this level, in metres from the water. Left out, the level is at `up` of the way to the sheer. */
  y?: number;
  up?: number;
  /** Where this level ends, in metres along the boat. */
  stern: number;
  stem: number;
  /** Its breadth, as a share of the sheer's. */
  beam: number;
  /** Over 1 draws the ends of this level in finer than the sheer's. */
  sharpen?: number;
}

export interface HullSpec {
  /** Half the greatest breadth, at the sheer. */
  halfBeamM: number;
  /** (share of the way along, share of the greatest breadth). */
  plan: Table;
  /** (share of the way along, height of the sheer). */
  sheer: Table;
  levels: readonly Level[];
  /** A flat transom closes the stern; a double-ender's plan comes to nothing there. */
  transom: boolean;
}

export const lerp = (a: number, b: number, share: number) => a + (b - a) * share;

export class Hull {
  readonly top: number;

  constructor(readonly spec: HullSpec) {
    this.top = spec.levels.length - 1;
  }

  /** Where a level lies at a share of the way along, on side 1 (+x) or -1. */
  point(level: number, share: number, side: number): V3 {
    const { y, up = 1, stern, stem, beam, sharpen = 1 } = this.spec.levels[level];
    const sheerY = lookup(this.spec.sheer, share);
    const below = this.spec.levels[0].y ?? 0;
    return [side * this.spec.halfBeamM * beam * lookup(this.spec.plan, share) ** sharpen, y ?? lerp(below, sheerY, up), lerp(stern, stem, share)];
  }

  /** The sheer at a place along the boat, in metres. */
  sheerAt(z: number): { x: number; y: number } {
    const share = this.shareAt(z);
    const [x, y] = this.point(this.top, share, 1);
    return { x, y };
  }

  shareAt(z: number): number {
    const { stern, stem } = this.spec.levels[this.top];
    return (z - stern) / (stem - stern);
  }

  /** The shell, a paint per band from the lowest level up, with `stations` lengths along. `shadeOf` tells one band's shade, for clinker's alternating strakes. */
  skin(mesh: BoatMesh, stations: number, bands: readonly BoatPart[], shadeOf: (band: number) => number = () => 1): this {
    for (let station = 0; station < stations; station++) {
      const [a, b] = [station / stations, (station + 1) / stations];
      for (const side of [-1, 1]) {
        bands.forEach((part, band) => {
          mesh.face([this.point(band, a, side), this.point(band, b, side), this.point(band + 1, b, side), this.point(band + 1, a, side)], part, shadeOf(band));
        });
      }
    }
    if (this.spec.transom) {
      bands.forEach((part, band) => {
        mesh.face([this.point(band, 0, -1), this.point(band, 0, 1), this.point(band + 1, 0, 1), this.point(band + 1, 0, -1)], part, 0.96);
      });
    }
    return this;
  }

  /** A deck inside the sheer, with a `well` cut from it by share along: the cockpit, of half-breadth `halfM`, down to `floorY`. */
  deck(mesh: BoatMesh, stations: number, part: BoatPart, well?: { from: number; to: number; halfM: number; floorY: number; floor: BoatPart; wall: BoatPart }): this {
    const edge = (share: number, side: number) => this.point(this.top, share, side);
    const inWell = (a: number, b: number) => well !== undefined && a >= well.from - 1e-6 && b <= well.to + 1e-6;
    for (let station = 0; station < stations; station++) {
      const [a, b] = [station / stations, (station + 1) / stations];
      if (!inWell(a, b)) {
        mesh.face([edge(a, -1), edge(b, -1), edge(b, 1), edge(a, 1)], part);
        continue;
      }
      if (well === undefined) continue;
      for (const side of [-1, 1]) {
        const [outerA, outerB] = [edge(a, side), edge(b, side)];
        const [innerA, innerB]: [V3, V3] = [[side * Math.min(well.halfM, Math.abs(outerA[0]) * 0.86), outerA[1], outerA[2]], [side * Math.min(well.halfM, Math.abs(outerB[0]) * 0.86), outerB[1], outerB[2]]];
        mesh.face([outerA, outerB, innerB, innerA], part);
        mesh.face([innerA, innerB, [innerB[0], well.floorY, innerB[2]], [innerA[0], well.floorY, innerA[2]]], well.wall, 0.8);
      }
      mesh.face([[-Math.min(well.halfM, Math.abs(edge(a, 1)[0]) * 0.86), well.floorY, edge(a, 1)[2]], [Math.min(well.halfM, Math.abs(edge(a, 1)[0]) * 0.86), well.floorY, edge(a, 1)[2]], [Math.min(well.halfM, Math.abs(edge(b, 1)[0]) * 0.86), well.floorY, edge(b, 1)[2]], [-Math.min(well.halfM, Math.abs(edge(b, 1)[0]) * 0.86), well.floorY, edge(b, 1)[2]]], well.floor, 0.78);
    }
    if (well !== undefined) {
      for (const share of [well.from, well.to]) {
        const [x, y, z] = edge(share, 1);
        const half = Math.min(well.halfM, x * 0.86);
        mesh.face([[-half, y, z], [half, y, z], [half, well.floorY, z], [-half, well.floorY, z]], well.wall, 0.86);
      }
    }
    return this;
  }

  /** An open boat's inside: the planking's inner face, and a floor. */
  hollow(mesh: BoatMesh, stations: number, part: BoatPart, floorY: number, floor: BoatPart): this {
    for (let station = 0; station < stations; station++) {
      const [a, b] = [station / stations, (station + 1) / stations];
      const inner = (share: number, side: number): V3 => {
        const [x, y, z] = this.point(this.top, share, side);
        return [x * 0.95, y, z];
      };
      const low = (corner: V3): V3 => [corner[0] * 0.82, floorY, corner[2]];
      for (const side of [-1, 1]) mesh.face([inner(a, side), inner(b, side), low(inner(b, side)), low(inner(a, side))], part, 0.86);
      mesh.face([low(inner(a, -1)), low(inner(b, -1)), low(inner(b, 1)), low(inner(a, 1))], floor, 0.78);
    }
    return this;
  }

  /** A toe rail or rubbing strake: a strip stood along the sheer, one face a length. */
  rail(mesh: BoatMesh, stations: number, part: BoatPart, tall = 0.05): this {
    for (let station = 0; station < stations; station++) {
      const [a, b] = [station / stations, (station + 1) / stations];
      for (const side of [-1, 1]) {
        const lift = (corner: V3): V3 => [corner[0], corner[1] + tall, corner[2]];
        const [from, to] = [this.point(this.top, a, side), this.point(this.top, b, side)];
        mesh.face([from, to, lift(to), lift(from)], part);
      }
    }
    return this;
  }
}

export interface House {
  /** Its after and forward ends, and its half-breadth at each. */
  fromZ: number;
  toZ: number;
  halfFrom: number;
  halfTo: number;
  baseY: number;
  topY: number;
  /** How far the top draws in from the base at the sides, and at the forward end. */
  tumbleM?: number;
  rakeM?: number;
  part: BoatPart;
  top?: BoatPart;
  /** A band of windows down each side, between these shares of its height and length. */
  window?: { low: number; high: number; from: number; to: number };
  /** Windows across the forward end, for a wheelhouse. */
  front?: { low: number; high: number };
}

/** A coachroof or a wheelhouse: a tapered, raked box, with its windows laid on it. */
export function house(mesh: BoatMesh, { fromZ, toZ, halfFrom, halfTo, baseY, topY, tumbleM = 0.08, rakeM = 0.2, part, top = part, window, front }: House): BoatMesh {
  const low = (share: number, side: number): V3 => [side * lerp(halfFrom, halfTo, share), baseY, lerp(fromZ, toZ, share)];
  const high = (share: number, side: number): V3 => [side * (lerp(halfFrom, halfTo, share) - tumbleM), topY, lerp(fromZ, toZ - rakeM, share)];
  for (const side of [-1, 1]) {
    mesh.face([low(0, side), low(1, side), high(1, side), high(0, side)], part, 0.98);
    if (window !== undefined) {
      const at = (along: number, up: number): V3 => {
        const [a, b] = [low(along, side), high(along, side)];
        return [lerp(a[0], b[0], up) + side * 0.012, lerp(a[1], b[1], up), lerp(a[2], b[2], up)];
      };
      mesh.face([at(window.from, window.low), at(window.to, window.low), at(window.to, window.high), at(window.from, window.high)], "glass");
    }
  }
  mesh.face([low(1, -1), low(1, 1), high(1, 1), high(1, -1)], part, 1.02);
  mesh.face([low(0, -1), low(0, 1), high(0, 1), high(0, -1)], part, 0.9);
  mesh.face([high(0, -1), high(0, 1), high(1, 1), high(1, -1)], top, 1.02);
  if (front !== undefined) {
    const at = (x: number, up: number): V3 => {
      const [a, b] = [low(1, x), high(1, x)];
      return [lerp(a[0], b[0], up), lerp(a[1], b[1], up), lerp(a[2], b[2], up) + 0.012];
    };
    mesh.face([at(-0.9, front.low), at(0.9, front.low), at(0.9, front.high), at(-0.9, front.high)], "glass");
  }
  return mesh;
}

/** The far hull: the sheer and the waterline at a few places, one band each side, with a deck. */
export function farHull(mesh: BoatMesh, hull: Hull, topside: BoatPart, deck: BoatPart, stations = 3): BoatMesh {
  const waterline = 1;
  const shares = Array.from({ length: stations + 1 }, (_, index) => index / stations);
  for (let station = 0; station < stations; station++) {
    const [a, b] = [shares[station], shares[station + 1]];
    for (const side of [-1, 1]) mesh.face([hull.point(hull.top, a, side), hull.point(hull.top, b, side), hull.point(waterline, b, side), hull.point(waterline, a, side)], topside, side > 0 ? 1 : 0.94);
    mesh.face([hull.point(hull.top, a, -1), hull.point(hull.top, b, -1), hull.point(hull.top, b, 1), hull.point(hull.top, a, 1)], deck);
  }
  if (hull.spec.transom) mesh.face([hull.point(hull.top, 0, -1), hull.point(hull.top, 0, 1), hull.point(waterline, 0, 1), hull.point(waterline, 0, -1)], topside, 0.9);
  return mesh;
}
