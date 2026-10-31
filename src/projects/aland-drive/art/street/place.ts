import { seeded } from "../roadside/mesh";
import type { Placement } from "../roadside/material";

/*
 * Lines turned into places, with no renderer in them: what's left of placing is
 * done by whoever holds the lines, so a tile's worker can run these. A line's points
 * have their ground height; `heightAt` is asked for points off it.
 */

export interface LinePoint {
  x: number;
  y: number;
  z: number;
}

/** The ground under a place that isn't on the line. */
export type HeightAt = (x: number, z: number) => number;

interface Stop extends LinePoint {
  /** The way the line runs here, in ground metres per metre. */
  dx: number;
  dz: number;
}

/** Points every `spacingM` along a line, the first at `startM`. */
function walk(line: readonly LinePoint[], spacingM: number, startM = 0): Stop[] {
  const stops: Stop[] = [];
  let travelled = 0;
  let next = startM;
  for (let point = 0; point + 1 < line.length; point++) {
    const [a, b] = [line[point], line[point + 1]];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length === 0) continue;
    const [dx, dz] = [(b.x - a.x) / length, (b.z - a.z) / length];
    while (next <= travelled + length) {
      const share = (next - travelled) / length;
      stops.push({ x: a.x + (b.x - a.x) * share, y: a.y + (b.y - a.y) * share, z: a.z + (b.z - a.z) * share, dx, dz });
      next += spacingM;
    }
    travelled += length;
  }
  return stops;
}

/** The yaw that lays a model's +x along a way on the ground. */
export const yawAlong = (dx: number, dz: number) => Math.atan2(-dz, dx);

/** Beside a stop, `offsetM` to the line's right as it runs, on the ground there. */
function beside(stop: Stop, offsetM: number, heightAt?: HeightAt): LinePoint {
  const [x, z] = [stop.x - stop.dz * offsetM, stop.z + stop.dx * offsetM];
  return { x, y: heightAt === undefined ? stop.y : heightAt(x, z), z };
}

/** Sections of a run (a guard rail, a fence), each a chord fitted to the line by its stretch and shear, so they meet end to end on bends and slopes alike. Its model's +z is the line's right. */
export function runSections(line: readonly LinePoint[], sectionM: number, offsetM = 0, heightAt?: HeightAt): Placement[] {
  const ends = walk(line, sectionM).map((stop) => ({ ...stop, ...beside(stop, offsetM, heightAt) }));
  return ends.slice(0, -1).map((from, index) => {
    const to = ends[index + 1];
    const chord = Math.hypot(to.x - from.x, to.z - from.z);
    return { x: from.x, y: from.y, z: from.z, yaw: yawAlong((to.x - from.x) / chord, (to.z - from.z) / chord), stretch: chord / sectionM, shear: (to.y - from.y) / chord };
  });
}

/** Things at a regular spacing beside a line, each with its +z to the line: a bench, a lamp's arm. `turnRad` turns them from that, so a quarter turn faces a post down the road at the traffic coming towards it. */
export function rowAlong(line: readonly LinePoint[], spacingM: number, offsetM: number, heightAt?: HeightAt, turnRad = 0): Placement[] {
  const side = Math.sign(offsetM);
  return walk(line, spacingM, spacingM / 2).map((stop) => ({ ...beside(stop, offsetM, heightAt), yaw: Math.atan2(side * stop.dz, -side * stop.dx) + turnRad }));
}

export interface TreeRow {
  /** The height of a tree, and how far either way one differs from it. */
  heightM: number;
  heightSpreadM: number;
  seed: number;
}

/** A planted row: even spacing, as `natural=tree_row` is, with each tree turned and sized a little its own way. */
export function treeRow(line: readonly LinePoint[], spacingM: number, offsetM: number, { heightM, heightSpreadM, seed }: TreeRow, heightAt?: HeightAt): Placement[] {
  const random = seeded(seed);
  return rowAlong(line, spacingM, offsetM, heightAt).map((place) => ({ ...place, yaw: random() * 2 * Math.PI, scale: heightM + (random() * 2 - 1) * heightSpreadM }));
}

export interface VergeScatter {
  /** Clumps per metre of road, on each side. */
  perMetre: number;
  /** From the line, how far the band starts and how wide it is. */
  fromM: number;
  wideM: number;
  seed: number;
}

/** A verge's dressing down both sides of a road: seeded, thick by the road and thinning away from it, so the same road always grows the same grass. */
export function scatterVerge(line: readonly LinePoint[], { perMetre, fromM, wideM, seed }: VergeScatter, heightAt?: HeightAt): Placement[] {
  const random = seeded(seed);
  const places: Placement[] = [];
  for (const side of [-1, 1]) {
    for (const stop of walk(line, 1 / perMetre, random())) {
      const across = fromM + random() ** 1.6 * wideM;
      const jitter = (random() - 0.5) / perMetre;
      const moved = { ...stop, x: stop.x + stop.dx * jitter, z: stop.z + stop.dz * jitter };
      places.push({ ...beside(moved, side * across, heightAt), yaw: random() * 2 * Math.PI, scale: 0.75 + random() * 0.5 });
    }
  }
  return places;
}

/** Shares a seeded pick out among choices, so one scatter can be split between several models. */
export function shareOut<T>(places: readonly T[], kinds: number, seed: number): T[][] {
  const random = seeded(seed);
  const groups: T[][] = Array.from({ length: kinds }, () => []);
  for (const place of places) groups[Math.min(kinds - 1, Math.floor(random() * kinds))].push(place);
  return groups;
}
