import { RING_POINTS, surfaceHeight, type HeightGrid, type RoadSurface } from "./tile";

/*
 * What holds a span up: a kerb, a parapet, a fascia, the deck's underside and a
 * pier now and then, all flat strips built from the road's own cross-sections.
 * The road surface itself is the ribbon, as anywhere. `bridgeKit` is the one
 * function that says what a bridge looks like: replacing the kit is replacing it.
 */

/** The look of every span in a tile, as one mesh, with what the car can't drive through. */
export interface BridgeKit {
  positions: Float32Array;
  /** Each vertex's part: 0 concrete, 1 rail, 2 in shadow. */
  parts: Float32Array;
  /** Six numbers each: x and z at both ends, then the height at each that a wall stands from. */
  rails: Float32Array;
}

const [CONCRETE, RAIL, SHADOW] = [0, 1, 2];

const KERB_M = 0.18;
const DECK_DEPTH_M = 0.9;
const PARAPET_M = 0.85;
const RAIL_TOP_M = 1.0;
const PIER_EVERY_M = 26;
const PIER_THICK_M = 1.1;
const PIER_FROM_DROP_M = 2;
const PIER_SINK_M = 1;
/** A wall starts this far under the deck, so a car can't slip beneath it. */
const RAIL_BELOW_M = 1;

const JUNCTION_SECTIONS = 3;
const OUTER_LEFT = 0;
const EDGE_LEFT = 1;
const EDGE_RIGHT = 3;
const OUTER_RIGHT = 4;

type Point = [x: number, y: number, z: number];

/** Everything about a tile's bridges. `grid` is the ground, so a pier reaches it. */
export function bridgeKit(surface: RoadSurface, grid: HeightGrid): BridgeKit {
  const positions: number[] = [];
  const parts: number[] = [];
  const rails: number[] = [];

  const quad = (a: Point, b: Point, c: Point, d: Point, part: number) => {
    for (const point of [a, b, c, a, c, d]) {
      positions.push(...point);
      parts.push(part);
    }
  };
  const lifted = ([x, y, z]: Point, by: number): Point => [x, y + by, z];

  for (const chain of surface.chains) {
    for (const [first, last] of chain.spans ?? []) {
      const ringPoint = (section: number, point: number): Point => {
        const at = ((chain.first + section) * RING_POINTS + point) * 3;
        return [surface.rings[at], surface.rings[at + 1], surface.rings[at + 2]];
      };
      let fromPier = PIER_EVERY_M / 2;
      for (let section = first; section < last; section++) {
        for (const [outer, edge] of [[OUTER_LEFT, EDGE_LEFT], [OUTER_RIGHT, EDGE_RIGHT]]) {
          const [out0, out1] = [ringPoint(section, outer), ringPoint(section + 1, outer)];
          const [in0, in1] = [ringPoint(section, edge), ringPoint(section + 1, edge)];
          quad(lifted(in0, KERB_M), lifted(in1, KERB_M), lifted(out1, KERB_M), lifted(out0, KERB_M), CONCRETE);
          quad(in0, in1, lifted(in1, KERB_M), lifted(in0, KERB_M), CONCRETE);
          quad(lifted(out0, -DECK_DEPTH_M), lifted(out1, -DECK_DEPTH_M), lifted(out1, PARAPET_M), lifted(out0, PARAPET_M), CONCRETE);
          quad(lifted(out0, PARAPET_M), lifted(out1, PARAPET_M), lifted(out1, RAIL_TOP_M), lifted(out0, RAIL_TOP_M), RAIL);
          // At a chain's ends a road flares into the one it meets, and a wall there would stand across the junction.
          if (section >= JUNCTION_SECTIONS && section < chain.sections - 1 - JUNCTION_SECTIONS) rails.push(out0[0], out0[2], out1[0], out1[2], out0[1] - RAIL_BELOW_M, out1[1] - RAIL_BELOW_M);
        }
        const [left0, left1, right0, right1] = [ringPoint(section, OUTER_LEFT), ringPoint(section + 1, OUTER_LEFT), ringPoint(section, OUTER_RIGHT), ringPoint(section + 1, OUTER_RIGHT)];
        quad(lifted(left0, -DECK_DEPTH_M), lifted(left1, -DECK_DEPTH_M), lifted(right1, -DECK_DEPTH_M), lifted(right0, -DECK_DEPTH_M), SHADOW);

        const run = Math.hypot(left1[0] - left0[0], left1[2] - left0[2]);
        fromPier += run;
        if (fromPier < PIER_EVERY_M) continue;
        fromPier = 0;
        const along = [(left1[0] - left0[0]) / run, (left1[2] - left0[2]) / run];
        const deck = (left1[1] + right1[1]) / 2 - DECK_DEPTH_M;
        const ground = Math.min(surfaceHeight(grid, left1[0], -left1[2]), surfaceHeight(grid, right1[0], -right1[2]));
        if (deck - ground < PIER_FROM_DROP_M) continue;
        const foot = ground - PIER_SINK_M;
        const corner = ([x, , z]: Point, ahead: number, y: number): Point => [x + along[0] * ahead, y, z + along[1] * ahead];
        const half = PIER_THICK_M / 2;
        const inset = (point: Point, other: Point): Point => [point[0] + 0.15 * (other[0] - point[0]), point[1], point[2] + 0.15 * (other[2] - point[2])];
        const [left, right] = [inset(left1, right1), inset(right1, left1)];
        quad(corner(left, -half, foot), corner(right, -half, foot), corner(right, -half, deck), corner(left, -half, deck), SHADOW);
        quad(corner(left, half, foot), corner(right, half, foot), corner(right, half, deck), corner(left, half, deck), SHADOW);
        quad(corner(left, -half, foot), corner(left, half, foot), corner(left, half, deck), corner(left, -half, deck), SHADOW);
        quad(corner(right, -half, foot), corner(right, half, foot), corner(right, half, deck), corner(right, -half, deck), SHADOW);
      }
    }
  }
  return { positions: Float32Array.from(positions), parts: Float32Array.from(parts), rails: Float32Array.from(rails) };
}
