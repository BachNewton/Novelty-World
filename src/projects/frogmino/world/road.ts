import { createRng, type Rng } from "@/shared/lib/seeded-random";
import {
  GROUND_DROP,
  KERB_HEIGHT,
  ROAD_LEFT,
  ROAD_RIGHT,
  SHOULDER_WIDTH,
  TALL_OFFSET,
  VERGE,
  box,
  boxArea,
  overlaps,
  pullOffKeepOut,
  roadArea,
  sideX,
  type Area,
  type PullOffStretch,
  type Side,
  type WorldBox,
} from "./geometry";
import { RAIL_SEGMENT, propBoxes, type Prop, type PropKind } from "./props";
import { FINISH_LINE, finishMarkings, finishZone, gantryBoxes, mark, overpassBoxes, structureKeepOuts } from "./structures";
import type { WorldPaint } from "./paints";

// The road never ends, either way: whichever way the camera goes, the road
// around it is built from tiles, each laid out from the course seed and its
// own index alone, so a tile comes back the same every time it is rebuilt.

export interface WorldPlan {
  seed: number;
  courseLength: number;
  pullOffs: readonly PullOffStretch[];
}

export const ROAD_TILE = 24;

// The road is built this far behind the camera and ahead of it. Ahead, it
// reaches past the fog's far end, so it fades out rather than ending.
export const ROAD_BEHIND_CAMERA = 30;
export const ROAD_AHEAD_OF_CAMERA = 560;

// A pull-off's barriers stand this deep beyond each end of its stretch; the
// shoulder and kerb give way to them there too.
const PULL_OFF_BARRIER = 1;

const DASH_LENGTH = 1.1;
const DASH_PERIOD = 3;
const DASH_WIDTH = 0.06;
const EDGE_LINE_WIDTH = 0.08;
const EDGE_DASH = 0.5;
const KERB_BLOCK = 2;

const REFLECTOR_SPACING = 8;
const REFLECTOR_OFFSET = 1;
const RAIL_OFFSET = 0.95;

// The mountainside rises on the left and the valley falls away on the right:
// more rocks and trees up the slope, more guard rails along the drop.
const SIDE_STYLE: Record<Side, { railChance: number; treeChance: number; features: readonly [PropKind, number][] }> = {
  left: {
    railChance: 0.25,
    treeChance: 0.6,
    features: [
      ["rock", 5],
      ["shrub", 4],
      ["cone", 1],
    ],
  },
  right: {
    railChance: 0.55,
    treeChance: 0.4,
    features: [
      ["shrub", 4],
      ["rock", 2],
      ["cone", 2],
      ["mailbox", 1],
    ],
  },
};

export interface RoadTile {
  // The road's surfaces: the asphalt, shoulders and kerbs.
  surfaces: WorldBox[];
  // Flat paint on the road: lane dashes, edge lines, the finish.
  markings: WorldBox[];
  // Everything standing beside the road.
  props: WorldBox[];
}

export function tileRange(cameraDepth: number, behind: number, ahead: number, tile: number): number[] {
  const first = Math.floor((cameraDepth - behind) / tile);
  const last = Math.floor((cameraDepth + ahead) / tile);
  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

export function roadTiles(cameraDepth: number): number[] {
  return tileRange(cameraDepth, ROAD_BEHIND_CAMERA, ROAD_AHEAD_OF_CAMERA, ROAD_TILE);
}

export function tileRng(seed: number, layer: string, index: number): Rng {
  return createRng(`frogmino-world:${String(seed)}:${layer}:${String(index)}`);
}

export function between(rng: Rng, min: number, max: number): number {
  return min + rng.next() * (max - min);
}

function pick<T>(rng: Rng, weighted: readonly [T, number][]): T {
  const total = weighted.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng.next() * total;
  for (const [item, weight] of weighted) {
    roll -= weight;
    if (roll < 0) return item;
  }
  return weighted[weighted.length - 1][0];
}

// The stretches of one side's edge that pull-offs (and their barriers) take.
function edgeGaps(plan: WorldPlan, side: Side): [number, number][] {
  return plan.pullOffs
    .filter((p) => p.side === side)
    .map((p): [number, number] => [p.near - PULL_OFF_BARRIER, p.far + PULL_OFF_BARRIER]);
}

// What is left of near..far once the gaps are cut out of it.
function cutGaps(near: number, far: number, gaps: readonly [number, number][]): [number, number][] {
  let pieces: [number, number][] = [[near, far]];
  for (const [g0, g1] of gaps) {
    pieces = pieces.flatMap(([a, b]): [number, number][] => {
      if (g1 <= a || g0 >= b) return [[a, b]];
      return [
        ...(g0 > a ? [[a, g0] as [number, number]] : []),
        ...(g1 < b ? [[g1, b] as [number, number]] : []),
      ];
    });
  }
  return pieces;
}

function surfaceBox(x0: number, x1: number, top: number, near: number, far: number, paint: WorldPaint): WorldBox {
  return box([(x0 + x1) / 2, (top - GROUND_DROP) / 2, -(near + far) / 2], [x1 - x0, top + GROUND_DROP, far - near], paint);
}

function roadSurfaces(plan: WorldPlan, near: number, far: number): WorldBox[] {
  const surfaces = [surfaceBox(ROAD_LEFT, ROAD_RIGHT, 0, near, far, "asphalt")];
  for (const side of ["left", "right"] as const) {
    const [edge, shoulder, kerb] = [sideX(side, 0), sideX(side, SHOULDER_WIDTH), sideX(side, VERGE)];
    for (const [a, b] of cutGaps(near, far, edgeGaps(plan, side))) {
      surfaces.push(surfaceBox(Math.min(edge, shoulder), Math.max(edge, shoulder), 0, a, b, "shoulder"));
      // Kerb blocks alternate light and dark on a fixed rhythm along the road.
      for (let k = Math.floor(a / KERB_BLOCK); k * KERB_BLOCK < b; k++) {
        const [k0, k1] = [Math.max(a, k * KERB_BLOCK), Math.min(b, (k + 1) * KERB_BLOCK)];
        if (k1 - k0 < 1e-6) continue;
        surfaces.push(
          surfaceBox(Math.min(shoulder, kerb), Math.max(shoulder, kerb), KERB_HEIGHT, k0, k1, k % 2 === 0 ? "kerb" : "kerb-dark"),
        );
      }
    }
  }
  return surfaces;
}

function roadMarkings(plan: WorldPlan, near: number, far: number): WorldBox[] {
  const finish = finishZone(plan.courseLength);
  const marks: WorldBox[] = [];
  // Faint dashes between the lanes, stopping for the finish.
  for (let lane = 1; lane < ROAD_RIGHT - ROAD_LEFT; lane++) {
    const x = ROAD_LEFT + lane;
    for (let n = Math.floor(near / DASH_PERIOD); n * DASH_PERIOD < far; n++) {
      const [d0, d1] = [n * DASH_PERIOD, n * DASH_PERIOD + DASH_LENGTH];
      if (d0 < near || d1 > far) continue;
      if (d1 > finish.near && d0 < finish.far) continue;
      marks.push(mark(x, (d0 + d1) / 2, DASH_WIDTH, DASH_LENGTH, "lane-dash"));
    }
  }
  // Solid edge lines, dashed where a pull-off opens beside the road, and
  // stopping for the chequered finish line painted from edge to edge.
  const finishLine: [number, number] = [plan.courseLength + FINISH_LINE.near, plan.courseLength + FINISH_LINE.far];
  for (const side of ["left", "right"] as const) {
    const x = sideX(side, 0);
    const gaps = edgeGaps(plan, side);
    for (const [a, b] of cutGaps(near, far, [...gaps, finishLine])) marks.push(mark(x, (a + b) / 2, EDGE_LINE_WIDTH, b - a, "edge-line"));
    for (const [g0, g1] of gaps) {
      for (let n = Math.floor(g0 / (2 * EDGE_DASH)); n * 2 * EDGE_DASH < g1; n++) {
        const [d0, d1] = [Math.max(g0, near, n * 2 * EDGE_DASH), Math.min(g1, far, n * 2 * EDGE_DASH + EDGE_DASH)];
        if (d1 - d0 > 1e-6) marks.push(mark(x, (d0 + d1) / 2, EDGE_LINE_WIDTH, d1 - d0, "edge-line"));
      }
    }
  }
  if (plan.courseLength >= near && plan.courseLength < far) marks.push(...finishMarkings(plan.courseLength));
  return marks;
}

// Where the roadside may not put anything: the road, the pull-offs, and the
// structures' footprints.
export function keepOuts(plan: WorldPlan, near: number, far: number): Area[] {
  return [roadArea(near - 1, far + 1), ...plan.pullOffs.map(pullOffKeepOut), ...structureKeepOuts(plan.courseLength)];
}

function allowed(boxes: readonly WorldBox[], blocked: readonly Area[]): boolean {
  return boxes.every((b) => {
    const area = boxArea(b);
    return blocked.every((keepOut) => !overlaps(area, keepOut));
  });
}

function placeProps(rng: Rng, near: number, far: number): Prop[] {
  const props: Prop[] = [];
  const at = (kind: PropKind, side: Side, offset: number, depth: number, scale = 1, yaw = 0): void => {
    props.push({ kind, x: sideX(side, offset), depth, yaw, scale });
  };

  // Frogs crossing: every so often a sign, on either side.
  if (rng.next() < 0.3) at("frogSign", rng.next() < 0.5 ? "left" : "right", 1.4, between(rng, near, far));
  if (rng.next() < 0.15) at("blockSign", "left", 1.4, between(rng, near, far));

  for (const side of ["left", "right"] as const) {
    const style = SIDE_STYLE[side];
    const railDepths: number[] = [];
    if (rng.next() < style.railChance) {
      const start = near + between(rng, 0, ROAD_TILE / 3);
      const segments = 3 + Math.floor(rng.next() * 4);
      for (let i = 0; i < segments; i++) {
        const depth = start + (i + 0.5) * RAIL_SEGMENT;
        if (depth >= far) break;
        railDepths.push(depth);
        at("guardRail", side, RAIL_OFFSET, depth);
      }
    }
    // Reflector posts keep a steady rhythm, standing aside for guard rails.
    for (let depth = near + REFLECTOR_SPACING / 2; depth < far; depth += REFLECTOR_SPACING) {
      if (railDepths.some((rail) => Math.abs(rail - depth) < RAIL_SEGMENT)) continue;
      at("reflectorPost", side, REFLECTOR_OFFSET, depth);
    }
    for (let depth = near + between(rng, 0, 6); depth < far; depth += between(rng, 5, 11)) {
      const kind = pick(rng, style.features);
      const offset = between(rng, 1.6, 3);
      const yaw = between(rng, -0.6, 0.6);
      if (kind === "cone") {
        const count = 2 + Math.floor(rng.next() * 2);
        for (let i = 0; i < count; i++) at("cone", side, 1.5, depth + i * 0.7);
      } else if (kind === "mailbox") {
        at("mailbox", side, 1.5, depth);
      } else {
        at(kind, side, offset, depth, between(rng, 0.75, 1), yaw);
        if (rng.next() < 0.4) at(kind, side, offset + 0.5, depth + between(rng, 0.5, 1), between(rng, 0.5, 0.75), yaw);
      }
    }
    // Trees stand back from the road, beyond the tall offset.
    for (let depth = near + between(rng, 0, 3); depth < far; depth += between(rng, 1.5, 5)) {
      if (rng.next() > style.treeChance) continue;
      const scale = between(rng, 0.8, 1.5);
      at(rng.next() < 0.6 ? "pine" : "roundTree", side, TALL_OFFSET + 1 + between(rng, 0, 9), depth, scale, between(rng, -0.5, 0.5));
    }
  }
  return props;
}

export function roadTile(plan: WorldPlan, index: number): RoadTile {
  const [near, far] = [index * ROAD_TILE, (index + 1) * ROAD_TILE];
  const blocked = keepOuts(plan, near, far);
  const props = placeProps(tileRng(plan.seed, "road", index), near, far)
    .map(propBoxes)
    .filter((boxes) => allowed(boxes, blocked))
    .flat();
  return { surfaces: roadSurfaces(plan, near, far), markings: roadMarkings(plan, near, far), props };
}

// The structures, when the road around the camera reaches them.
export function structuresNear(plan: WorldPlan, tiles: readonly number[]): WorldBox[] {
  const [near, far] = [tiles[0] * ROAD_TILE, (tiles[tiles.length - 1] + 1) * ROAD_TILE];
  return [
    ...(near <= 0 && far >= 0 ? overpassBoxes() : []),
    ...(near <= plan.courseLength && far >= plan.courseLength ? gantryBoxes(plan.courseLength) : []),
  ];
}
