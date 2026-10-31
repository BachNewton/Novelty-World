import { SoupBuilder, SURFACES, type Point, type Soup, type Surface } from "../cars/mesh";
import { add, cross, dot, scale, sub, unit } from "./mat";

/*
 * The shapes bikes and riders are made of, on the cars' triangle soup. A soup
 * names a face's surface by index, and here those indexes mean the slots of one
 * palette, skin and shirt as much as paint, so one material draws a whole rider.
 */

export const SLOTS = ["frame", "accent", "tyre", "metal", "dark", "saddle", "bag", "basket", "lamp", "skin", "hair", "top", "bottom", "shoe", "helmet"] as const;
export type Slot = (typeof SLOTS)[number];

const surfaceOf = (slot: Slot): Surface => SURFACES[SLOTS.indexOf(slot)];

export interface Hoop {
  radius: number;
  /** Half the section across the radius and along the axle. */
  sectionR: number;
  sectionX: number;
  segments: number;
  sections: number;
  slot: Slot;
  /** Where round its section the first corner lies. */
  phase?: number;
  centre?: Point;
  /** From and to, round the axle: 0 is up, a quarter turn is back. */
  arc?: [from: number, to: number];
}

/** One rigid piece's faces. Every piece shades on its own. */
export class Piece {
  private readonly builder = new SoupBuilder();

  /** A round bar along a path, its radius given at each end. Rings stay square to the path as it bends. */
  tube(path: Point[], radius: number | [from: number, to: number], sides: number, slot: Slot, flat = 1) {
    const [from, to] = typeof radius === "number" ? [radius, radius] : radius;
    const tangents = path.map((_, at) => unit(sub(path[Math.min(at + 1, path.length - 1)], path[Math.max(at - 1, 0)])));
    const start: Point = Math.abs(tangents[0][0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
    let u = start;
    const rings = path.map((centre, at) => {
      u = unit(sub(u, scale(tangents[at], dot(u, tangents[at]))));
      const v = cross(tangents[at], u);
      const r = from + ((to - from) * at) / Math.max(1, path.length - 1);
      return Array.from({ length: sides }, (_, side): Point => {
        const angle = ((side + 0.5) / sides) * Math.PI * 2;
        return add(centre, add(scale(u, Math.cos(angle) * r * flat), scale(v, Math.sin(angle) * r)));
      });
    });
    this.builder.rings(rings, surfaceOf(slot));
  }

  /** A body turned round y: each station a height, half-widths in x and z and a shift in z, lowest first. */
  loft(stations: readonly (readonly [y: number, rx: number, rz: number, z?: number])[], sides: number, slot: Slot) {
    const rings = stations.map(([y, rx, rz, z]) =>
      Array.from({ length: sides }, (_, side): Point => {
        const angle = ((side + 0.5) / sides) * Math.PI * 2;
        return [Math.sin(angle) * rx, y, Math.cos(angle) * rz + (z ?? 0)];
      }),
    );
    this.builder.rings(rings, surfaceOf(slot));
  }

  /** Four-sided rings along z, furthest forward first; see `box` for a ring's order. */
  rings(rings: Point[][], slot: Slot) {
    this.builder.rings(rings, surfaceOf(slot));
  }

  box([x, y, z]: Point, [hx, hy, hz]: Point, slot: Slot) {
    const ring = (at: number): Point[] => [
      [x + hx, y + hy, at],
      [x - hx, y + hy, at],
      [x - hx, y - hy, at],
      [x + hx, y - hy, at],
    ];
    this.builder.rings([ring(z - hz), ring(z + hz)], surfaceOf(slot));
  }

  /** A ring round the x axis. Two sections with no width make a strip seen from both sides. */
  hoop({ radius, sectionR, sectionX, segments, sections, slot, phase = 0, centre = [0, 0, 0], arc = [0, Math.PI * 2] }: Hoop) {
    const group = this.builder.newGroup();
    const surface = surfaceOf(slot);
    const at = (segment: number, section: number): Point => {
      const around = arc[0] + ((arc[1] - arc[0]) * segment) / segments;
      const across = (section / sections) * Math.PI * 2 + phase;
      const r = radius + sectionR * Math.cos(across);
      return add(centre, [sectionX * Math.sin(across), Math.cos(around) * r, Math.sin(around) * r]);
    };
    for (let segment = 0; segment < segments; segment++) {
      for (let section = 0; section < sections; section++) {
        this.builder.quad(at(segment, section), at(segment + 1, section), at(segment + 1, section + 1), at(segment, section + 1), surface, group);
      }
    }
  }

  finish(creaseDeg: number): Soup {
    return this.builder.finish(creaseDeg);
  }
}

export function piece(make: (piece: Piece) => void): Piece {
  const made = new Piece();
  make(made);
  return made;
}
