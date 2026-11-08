import type { Block, Decal } from "./body";

/*
 * Parts any car on the recipe can put on: what a sports car's or a hypercar's
 * body carries beyond its shell, each a few numbers. Every part is a block or a
 * decal, so it sits on the shell where the recipe puts it, is mirrored where a
 * car has two, and, unless it is marked fine, is kept by the far model too, so
 * the far version keeps the near one's dark shapes and lights.
 */

/** A blade of dark composite under the nose, from `z` forward by `long`, its top at `h`. */
export const splitter = ({ z, h, halfWidth, long = 0.2 }: { z: number; h: number; halfWidth: number; long?: number }): Block => ({
  at: [0, h - 0.012, z + long / 2],
  size: [halfWidth * 2, 0.024, long],
  surface: "trim",
  taper: [1.04, 1],
});

/** Upright fins under the tail, between `x`'s pairs, from `z` back to the tail: the diffuser's strakes. */
export const diffuser = ({ z, tailZ, h, x }: { z: number; tailZ: number; h: number; x: readonly number[] }): Block[] =>
  x.map((across) => ({ at: [across, h, (z + tailZ) / 2], size: [0.016, 0.16, tailZ - z], surface: "trim", mirror: across !== 0, taper: [1, 1.5] }));

/** A dark scoop on each flank, its middle at `z` and `h`: a mid-engined car's intake ahead of its rear wheels, or a vent behind the front ones. */
export const sideIntake = ({ z, h, long, tall }: { z: number; h: number; long: number; tall: number }): Decal => ({
  on: "side",
  at: [z, h],
  size: [long, tall],
  surface: "grille",
  mirror: true,
  cells: [5, 2],
  liftM: 0.01,
});

/** A line of light across the nose, mirrored: a car's daytime signature, lit as a headlamp at night. */
export const lightLine = ({ x, h, wide, thick = 0.018 }: { x: number; h: number; wide: number; thick?: number }): Decal => ({
  on: "front",
  at: [x, h],
  size: [wide, thick],
  surface: "lensHead",
  mirror: true,
  cells: [8, 1],
  liftM: 0.01,
});

/** Projector lenses in a row across one headlamp, mirrored, each a ring of trim round a bright lens. Fine: the far model keeps the lamp they sit in. */
export const projectors = ({ x, h, size }: { x: readonly number[]; h: number; size: number }): Decal[] =>
  x.flatMap((across): Decal[] => [
    { on: "front", at: [across, h], size: [size * 1.4, size * 1.4], surface: "trim", mirror: true, round: true, fine: true, liftM: 0.012 },
    { on: "front", at: [across, h], size: [size, size], surface: "lensReverse", mirror: true, round: true, fine: true, liftM: 0.016 },
  ]);

/** A bar of tail light the whole width of the tail, at `h`, with `segments` of dark between its cells read close up. */
export const tailLine = ({ h, wide, thick = 0.03 }: { h: number; wide: number; thick?: number }): Decal => ({
  on: "rear",
  at: [0, h],
  size: [wide, thick],
  surface: "lensTail",
  cells: [16, 1],
  liftM: 0.01,
});

/** Slats across a deck or a fender, from `z` back by `long`, each `wide` across, at `x` from the middle (mirrored when not zero). */
export const louvres = ({ x, z, long, wide, count, surface = "grille" }: { x: number; z: number; long: number; wide: number; count: number; surface?: Decal["surface"] }): Decal[] =>
  Array.from({ length: count }, (_, at): Decal => ({
    on: "top",
    at: [x, z + (long * (at + 0.5)) / count],
    size: [wide, (long / count) * 0.45],
    surface,
    mirror: x !== 0,
    cells: [4, 1],
    fine: true,
    liftM: 0.006,
  }));
