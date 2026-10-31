import type { InteriorPart, ViewPart } from "./paint";
import type { RoomMesh, V3 } from "./room-mesh";

/*
 * A room's box from inside: floor, ceiling and four walls, in cells so light can be
 * baked across them, and its openings. The room is centred on the origin with its
 * floor at y = 0. Rooms aren't joined up: each is its own view, so a door is closed
 * and a window looks at a picture of what's out there.
 */

export type WallName = "north" | "south" | "east" | "west";

export interface Opening {
  wall: WallName;
  /** Along the wall from its middle, to the right as you face it from inside. */
  at: number;
  wide: number;
  tall: number;
  /** The height of its foot. */
  sill: number;
  kind: "window" | "door" | "garage-door";
  /** Panes across and up. */
  panes?: readonly [across: number, up: number];
}

export interface ShellSpec {
  wide: number;
  deep: number;
  tall: number;
  floor: InteriorPart;
  ceiling: InteriorPart;
  walls: InteriorPart | (Partial<Record<WallName, InteriorPart>> & { rest: InteriorPart });
  skirting?: InteriorPart;
  openings: readonly Opening[];
  view: ViewPart;
  /** Beams across the ceiling, running along x. */
  beams?: number;
}

const FLOOR_CELL_M = 0.5;
const WALL_CELL_M = 0.55;
const WALL_THICK_M = 0.22;
const VIEW_AWAY_M = 5;
const VIEW_HALF_M = 30;

type WallPoint = (along: number, up: number, out?: number) => V3;

function cuts(from: number, to: number, cell: number, extra: readonly number[]): number[] {
  const count = Math.max(1, Math.ceil((to - from) / cell));
  const all = [...Array.from({ length: count + 1 }, (_, index) => from + ((to - from) * index) / count), ...extra.filter((value) => value > from && value < to)];
  return [...new Set(all.map((value) => Math.round(value * 1000) / 1000))].sort((a, b) => a - b);
}

/** A point on a wall, from inside: `along` to the right, `up` from the floor, `out` through the wall. */
function wallPoint(wall: WallName, wide: number, deep: number): WallPoint {
  return (along, up, out = 0) => {
    if (wall === "north") return [along, up, -deep / 2 - out];
    if (wall === "south") return [-along, up, deep / 2 + out];
    if (wall === "east") return [wide / 2 + out, up, along];
    return [-wide / 2 - out, up, -along];
  };
}

const wallLength = (wall: WallName, wide: number, deep: number) => (wall === "north" || wall === "south" ? wide : deep);

function windowFrame(mesh: RoomMesh, point: WallPoint, { at, wide, tall, sill, panes = [2, 2] }: Opening) {
  const [left, right, top] = [at - wide / 2, at + wide / 2, sill + tall];
  const bar = 0.05;
  const middle = WALL_THICK_M * 0.6;
  const quad = (a0: number, y0: number, a1: number, y1: number, out: number) => mesh.face([point(a0, y0, out), point(a1, y0, out), point(a1, y1, out), point(a0, y1, out)], "trim");
  // The reveal, through the wall's thickness, each face turned into the opening.
  mesh.face([point(left, sill), point(left, sill, WALL_THICK_M), point(left, top, WALL_THICK_M), point(left, top)], "trim", 0.95);
  mesh.face([point(right, top), point(right, top, WALL_THICK_M), point(right, sill, WALL_THICK_M), point(right, sill)], "trim", 0.95);
  mesh.face([point(left, top), point(left, top, WALL_THICK_M), point(right, top, WALL_THICK_M), point(right, top)], "trim", 0.9);
  mesh.face([point(right, sill), point(right, sill, WALL_THICK_M), point(left, sill, WALL_THICK_M), point(left, sill)], "trim");
  // The architrave round it.
  const edge = 0.08;
  quad(left - edge, sill - edge, left, top + edge, -0.012);
  quad(right, sill - edge, right + edge, top + edge, -0.012);
  quad(left, top, right, top + edge, -0.012);
  quad(left, sill - edge, right, sill, -0.012);
  // The panes' bars, in the middle of the wall.
  const [across, up] = panes;
  for (let bars = 1; bars < across; bars++) {
    const a = left + (wide * bars) / across;
    quad(a - bar / 2, sill, a + bar / 2, top, middle);
  }
  for (let bars = 1; bars < up; bars++) {
    const y = sill + (tall * bars) / up;
    quad(left, y - bar / 2, right, y + bar / 2, middle);
  }
  quad(left, sill, right, sill + bar, middle);
  quad(left, top - bar, right, top, middle);
  quad(left, sill, left + bar, top, middle);
  quad(right - bar, sill, right, top, middle);
}

function doorLeaf(mesh: RoomMesh, point: WallPoint, { at, wide, tall, sill, kind }: Opening, leaf: InteriorPart) {
  const [left, right, top] = [at - wide / 2, at + wide / 2, sill + tall];
  const edge = 0.09;
  const quad = (a0: number, y0: number, a1: number, y1: number, out: number, part: InteriorPart, shade = 1) => mesh.face([point(a0, y0, out), point(a1, y0, out), point(a1, y1, out), point(a0, y1, out)], part, shade);
  quad(left, sill, right, top, -0.005, leaf);
  quad(left - edge, sill, left, top + edge, -0.015, "trim");
  quad(right, sill, right + edge, top + edge, -0.015, "trim");
  quad(left, top, right, top + edge, -0.015, "trim");
  if (kind === "garage-door") {
    const ribs = 5;
    for (let rib = 1; rib < ribs; rib++) {
      const y = sill + (tall * rib) / ribs;
      quad(left, y - 0.02, right, y + 0.02, -0.012, "trim", 0.72);
    }
    return;
  }
  quad(left + 0.14, sill + 0.2, right - 0.14, sill + tall * 0.42, -0.012, leaf, 0.86);
  quad(left + 0.14, sill + tall * 0.5, right - 0.14, top - 0.2, -0.012, leaf, 0.86);
  quad(right - 0.19, sill + 1, right - 0.08, sill + 1.03, -0.05, "steel");
}

/** The room's box. Openings bring their own light and view with them. */
export function buildShell(mesh: RoomMesh, spec: ShellSpec) {
  const { wide, deep, tall, floor, ceiling, walls, skirting = "trim", openings, view, beams = 0 } = spec;
  const [halfX, halfZ] = [wide / 2, deep / 2];

  const xs = cuts(-halfX, halfX, FLOOR_CELL_M, []);
  const zs = cuts(-halfZ, halfZ, FLOOR_CELL_M, []);
  for (let i = 0; i + 1 < xs.length; i++) {
    for (let j = 0; j + 1 < zs.length; j++) {
      mesh.face([[xs[i], 0, zs[j + 1]], [xs[i + 1], 0, zs[j + 1]], [xs[i + 1], 0, zs[j]], [xs[i], 0, zs[j]]], floor);
      mesh.face([[xs[i], tall, zs[j]], [xs[i + 1], tall, zs[j]], [xs[i + 1], tall, zs[j + 1]], [xs[i], tall, zs[j + 1]]], ceiling);
    }
  }

  for (const wall of ["north", "south", "east", "west"] as const) {
    const length = wallLength(wall, wide, deep);
    const point = wallPoint(wall, wide, deep);
    const inWall = openings.filter((opening) => opening.wall === wall);
    const glazed = inWall.filter(({ kind }) => kind === "window");
    const part = typeof walls === "string" ? walls : walls[wall] ?? walls.rest;
    const us = cuts(-length / 2, length / 2, WALL_CELL_M, inWall.flatMap(({ at, wide: w }) => [at - w / 2, at + w / 2]));
    const ys = cuts(0, tall, WALL_CELL_M, inWall.flatMap(({ sill, tall: t }) => [sill, sill + t]));
    for (let i = 0; i + 1 < us.length; i++) {
      for (let j = 0; j + 1 < ys.length; j++) {
        const [u, y] = [(us[i] + us[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2];
        const cut = glazed.some((o) => Math.abs(u - o.at) < o.wide / 2 && y > o.sill && y < o.sill + o.tall);
        if (!cut) mesh.face([point(us[i], ys[j]), point(us[i + 1], ys[j]), point(us[i + 1], ys[j + 1]), point(us[i], ys[j + 1])], part);
      }
    }
    // A skirting board, broken by whatever reaches the floor.
    const stops = inWall.filter(({ sill }) => sill < 0.14).map(({ at, wide: w }) => [at - w / 2 - 0.09, at + w / 2 + 0.09]).sort((a, b) => a[0] - b[0]);
    let from = -length / 2;
    for (const [to, next] of [...stops, [length / 2, length / 2]]) {
      if (to > from) mesh.face([point(from, 0, -0.018), point(to, 0, -0.018), point(to, 0.1, -0.018), point(from, 0.1, -0.018)], skirting);
      from = next;
    }

    for (const opening of inWall) {
      if (opening.kind !== "window") {
        doorLeaf(mesh, point, opening, opening.kind === "garage-door" ? "paint-white" : "oak");
        continue;
      }
      windowFrame(mesh, point, opening);
      const { at, wide: w, sill, tall: t } = opening;
      const inner = point(at, sill);
      const inward = point(at, sill, -1);
      mesh.windowLight([point(at - w / 2, sill), point(at + w / 2, sill), point(at + w / 2, sill + t), point(at - w / 2, sill + t)], [inward[0] - inner[0], 0, inward[2] - inner[2]]);
    }
    if (glazed.length > 0) mesh.face([point(-VIEW_HALF_M, -6, VIEW_AWAY_M), point(VIEW_HALF_M, -6, VIEW_AWAY_M), point(VIEW_HALF_M, 16, VIEW_AWAY_M), point(-VIEW_HALF_M, 16, VIEW_AWAY_M)], view);
  }

  for (let beam = 0; beam < beams; beam++) {
    const z = -halfZ + (deep * (beam + 0.5)) / beams;
    mesh.solid([-halfX, tall - 0.2, z - 0.09], [halfX, tall, z + 0.09], "beam");
  }
}
