import type { Rng } from "@/shared/lib/seeded-random";
import { GROUND_DROP, box, overlaps, sideArea, sideX, type Area, type Side, type WorldBox } from "./geometry";
import { RAIL_SEGMENT, propBoxes } from "./props";

// Lay-bys: patches of packed gravel beside the road, as on a mountain road,
// where a driver might stop for the view. They are scenery, and plainly out
// of the frog's reach: each lies beyond the kerb, which runs on unbroken,
// behind a guard rail with no gap in it along its whole length, so nothing
// suggests the frog could go there. Each road tile may have one, placed from
// the seed like the rest of the roadside.

export interface LayBy {
  side: Side;
  // Its stretch along the course.
  near: number;
  far: number;
}

// The gravel's inner and outer edges, beyond the road's edge: just past the
// guard rail, which stands where the roadside's rails do.
export const LAY_BY_INNER = 1.1;
export const LAY_BY_OUTER = 3.6;
const RAIL_OFFSET = 0.95;
// The gravel stands a little proud of the land and the shoulder, in a plane
// of its own.
const GRAVEL_TOP = 0.04;
// A lay-by's length, a whole number of rail segments so its rail runs end to
// end without a gap, and how far it keeps from its tile's ends.
const RAIL_SEGMENTS = 4;
const LAY_BY_LENGTH = RAIL_SEGMENTS * RAIL_SEGMENT;
const TILE_MARGIN = 3;
// Decorations keep this far clear of a lay-by, along the road and across.
const CLEARANCE = { along: 1, across: 0.4 };

// The valley side, on the right, has the views.
const CHANCE = 0.3;
const RIGHT_CHANCE = 0.7;

// The tile's lay-by, if it has one, somewhere between `near` and `far` and
// clear of `blocked`.
export function layByIn(rng: Rng, near: number, far: number, blocked: readonly Area[]): LayBy | null {
  if (rng.next() >= CHANCE) return null;
  const side: Side = rng.next() < RIGHT_CHANCE ? "right" : "left";
  const start = near + TILE_MARGIN + rng.next() * (far - near - 2 * TILE_MARGIN - LAY_BY_LENGTH);
  const layBy: LayBy = { side, near: start, far: start + LAY_BY_LENGTH };
  return blocked.some((area) => overlaps(layByKeepOut(layBy), area)) ? null : layBy;
}

// The gravel.
export function layByArea(layBy: LayBy): Area {
  return sideArea(layBy.side, LAY_BY_INNER, LAY_BY_OUTER, layBy.near, layBy.far);
}

// The ground other decorations keep clear of: the gravel, its rail, and a
// margin round them.
export function layByKeepOut(layBy: LayBy): Area {
  return sideArea(layBy.side, RAIL_OFFSET - CLEARANCE.across, LAY_BY_OUTER + CLEARANCE.across, layBy.near - CLEARANCE.along, layBy.far + CLEARANCE.along);
}

// The gravel, as a surface.
export function layBySurface(layBy: LayBy): WorldBox {
  const area = layByArea(layBy);
  const height = GRAVEL_TOP + GROUND_DROP;
  return box(
    [(area.minX + area.maxX) / 2, GRAVEL_TOP - height / 2, -(area.minDepth + area.maxDepth) / 2],
    [area.maxX - area.minX, height, area.maxDepth - area.minDepth],
    "lay-by",
  );
}

// A bench on the gravel, facing out over the view: two legs, a seat and a
// back, low enough to stay under the near-height limit.
function bench(x: number, depth: number, side: Side): WorldBox[] {
  const out = side === "left" ? -1 : 1;
  const [legHeight, seat, back] = [0.2, 0.05, 0.22];
  const z = -depth;
  return [
    box([x, GRAVEL_TOP + legHeight / 2, z - 0.3], [0.3, legHeight, 0.06], "post"),
    box([x, GRAVEL_TOP + legHeight / 2, z + 0.3], [0.3, legHeight, 0.06], "post"),
    box([x, GRAVEL_TOP + legHeight + seat / 2, z], [0.34, seat, 0.8], "trunk"),
    box([x - out * 0.19, GRAVEL_TOP + legHeight + seat / 2 + back / 2 - 0.01, z], [0.04, back + seat, 0.8], "trunk"),
  ];
}

// Everything standing in a lay-by: the guard rail between it and the road,
// end to end along its whole length, and a bench or two looking out.
export function layByProps(layBy: LayBy): WorldBox[] {
  const rail = Array.from({ length: RAIL_SEGMENTS }, (_, i) =>
    propBoxes({ kind: "guardRail", x: sideX(layBy.side, RAIL_OFFSET), depth: layBy.near + (i + 0.5) * RAIL_SEGMENT, yaw: 0, scale: 1 }),
  ).flat();
  const benchX = sideX(layBy.side, (LAY_BY_INNER + LAY_BY_OUTER) / 2);
  const benches = [layBy.near + LAY_BY_LENGTH / 3, layBy.near + (2 * LAY_BY_LENGTH) / 3].flatMap((depth) => bench(benchX, depth, layBy.side));
  return [...rail, ...benches];
}
