import type { Rng } from "@/shared/lib/seeded-random";
import { GROUND_DROP, box, boxArea, overlaps, sideX, type Side, type Vec3, type WorldBox } from "./geometry";
import type { WorldPaint } from "./paints";
import { between, tileRange, tileRng, type WorldPlan } from "./road";

// The land beyond the roadside, in layers further and further from the road:
// grassy knolls, then ridges, then snowy peaks. Every hill is a stack of
// terraces, blocky like the fleet. The further a layer, the paler and bluer
// its paints, and the fog carries that on into the haze, so the background
// recedes and the road and traffic stand out. The camera only ever travels
// along the road, so each layer's distance from it sets how slowly it drifts
// by: that is the parallax.

export const SCENERY_TILE = 60;
export const SCENERY_BEHIND_CAMERA = 60;
export const SCENERY_AHEAD_OF_CAMERA = 600;

interface HillLayer {
  name: string;
  // How far beyond the road edge a hill's near side is, per side.
  offset: Record<Side, readonly [number, number]>;
  // The gap along the road from one hill to the next.
  step: readonly [number, number];
  width: readonly [number, number];
  length: readonly [number, number];
  height: readonly [number, number];
  tiers: readonly [number, number];
  // Terrace paints from the bottom up; the last repeats.
  paints: readonly WorldPaint[];
  // Hills taller than this get a snowcap.
  snowAbove: number;
}

const LAYERS: readonly HillLayer[] = [
  {
    name: "knolls",
    offset: { left: [8, 14], right: [10, 20] },
    step: [10, 18],
    width: [5, 10],
    length: [5, 10],
    height: [1.5, 4.5],
    tiers: [2, 3],
    paints: ["meadow-deep", "meadow", "shrub"],
    snowAbove: Infinity,
  },
  {
    name: "ridges",
    offset: { left: [26, 44], right: [32, 55] },
    step: [18, 30],
    width: [16, 30],
    length: [14, 26],
    height: [8, 18],
    tiers: [3, 4],
    paints: ["ridge", "ridge", "ridge-high", "rock"],
    snowAbove: 14,
  },
  {
    name: "peaks",
    offset: { left: [75, 130], right: [85, 150] },
    step: [36, 58],
    width: [40, 70],
    length: [30, 60],
    height: [26, 58],
    tiers: [4, 5],
    paints: ["peak", "peak", "ridge-high"],
    snowAbove: 34,
  },
];

// How much each terrace narrows, as a share of the hill's footprint.
const TERRACE_NARROWING = 0.75;
const TERRACE_JITTER = 0.08;
const SNOWCAP_SHARE = 0.18;
const HILL_YAW = 0.3;

function terraces(rng: Rng, layer: HillLayer, x: number, depth: number, yaw: number): WorldBox[] {
  const [width, length] = [between(rng, ...layer.width), between(rng, ...layer.length)];
  const height = between(rng, ...layer.height);
  const tiers = layer.tiers[0] + Math.floor(rng.next() * (layer.tiers[1] - layer.tiers[0] + 1));
  const boxes: WorldBox[] = [];
  let [cx, cz] = [x, -depth];
  for (let tier = 0; tier < tiers; tier++) {
    const shrink = 1 - (TERRACE_NARROWING * tier) / tiers;
    const top = (height * (tier + 1)) / tiers;
    if (tier > 0) {
      cx += between(rng, -TERRACE_JITTER, TERRACE_JITTER) * width;
      cz += between(rng, -TERRACE_JITTER, TERRACE_JITTER) * length;
    }
    const paint = layer.paints[Math.min(tier, layer.paints.length - 1)];
    boxes.push(box([cx, (top - GROUND_DROP) / 2, cz], [width * shrink, top + GROUND_DROP, length * shrink], paint, 0, yaw));
  }
  if (height > layer.snowAbove) {
    const shrink = 1 - TERRACE_NARROWING * ((tiers - 1) / tiers);
    const cap = height * SNOWCAP_SHARE;
    boxes.push(box([cx, height + cap / 2, cz], [width * shrink * 0.8, cap, length * shrink * 0.8], "snow", 0, yaw));
  }
  return boxes;
}

function hillsOnSide(rng: Rng, layer: HillLayer, side: Side, near: number, far: number): WorldBox[] {
  const boxes: WorldBox[] = [];
  for (let depth = near + between(rng, 0, layer.step[0]); depth < far; depth += between(rng, ...layer.step)) {
    const width = layer.width[1];
    const offset = between(rng, ...layer.offset[side]) + width / 2;
    boxes.push(...terraces(rng, layer, sideX(side, offset), depth, between(rng, -HILL_YAW, HILL_YAW)));
  }
  return boxes;
}

// Faint darker patches on the meadow, so the ground isn't one flat colour.
// Patches all lie at one height, so one that would overlap another, or reach
// into the next tile's, is left out rather than fight it for the same plane.
function meadowPatches(rng: Rng, near: number, far: number): WorldBox[] {
  const boxes: WorldBox[] = [];
  for (const side of ["left", "right"] as const) {
    for (let i = 0; i < 6; i++) {
      const [w, l] = [between(rng, 2, 7), between(rng, 2, 7)];
      const x = sideX(side, between(rng, 5, 30) + w / 2);
      const depth = between(rng, near, far);
      const patch = box([x, -GROUND_DROP + 0.02, -depth], [w, 0.04, l], "meadow-deep", 0, between(rng, -0.4, 0.4));
      const area = boxArea(patch);
      const inTile = area.minDepth >= near && area.maxDepth <= far;
      if (inTile && boxes.every((other) => !overlaps(area, boxArea(other)))) boxes.push(patch);
    }
  }
  return boxes;
}

// Two landmarks along the course, far off the road: a boulder with a frog's
// eyes, and a mesa shaped like a T. Both stand on the land.
function frogRock(x: number, depth: number): WorldBox[] {
  const [y, z] = [-GROUND_DROP, -depth];
  return [
    box([x, y + 6, z], [26, 12, 20], "rock"),
    box([x, y + 13, z], [20, 4, 16], "rock"),
    box([x - 6, y + 16.5, z + 4], [6, 5, 6], "snow"),
    box([x + 6, y + 16.5, z + 4], [6, 5, 6], "snow"),
    box([x - 6, y + 17, z + 7.1], [2.6, 2.6, 0.4], "sign-ink"),
    box([x + 6, y + 17, z + 7.1], [2.6, 2.6, 0.4], "sign-ink"),
    box([x, y + 9, z + 10.1], [14, 1.2, 0.4], "rock-dark"),
  ];
}

function tMesa(x: number, depth: number): WorldBox[] {
  const [y, z] = [-GROUND_DROP, -depth];
  return [
    box([x, y + 12, z], [12, 24, 12], "ridge-high"),
    box([x, y + 28, z], [40, 8, 14], "ridge-high"),
    box([x, y + 32.6, z], [36, 1.2, 12], "snow"),
  ];
}

function landmarks(plan: WorldPlan): { depth: number; boxes: WorldBox[] }[] {
  const frogDepth = plan.courseLength * 0.45;
  const mesaDepth = plan.courseLength * 0.85;
  return [
    { depth: frogDepth, boxes: frogRock(sideX("left", 62), frogDepth) },
    { depth: mesaDepth, boxes: tMesa(sideX("right", 80), mesaDepth) },
  ];
}

export function sceneryTile(plan: WorldPlan, index: number): WorldBox[] {
  const [near, far] = [index * SCENERY_TILE, (index + 1) * SCENERY_TILE];
  const boxes = LAYERS.flatMap((layer) => {
    const rng = tileRng(plan.seed, layer.name, index);
    return [...hillsOnSide(rng, layer, "left", near, far), ...hillsOnSide(rng, layer, "right", near, far)];
  });
  boxes.push(...meadowPatches(tileRng(plan.seed, "patches", index), near, far));
  for (const landmark of landmarks(plan)) {
    if (landmark.depth >= near && landmark.depth < far) boxes.push(...landmark.boxes);
  }
  return boxes;
}

export function sceneryTiles(cameraDepth: number): number[] {
  return tileRange(cameraDepth, SCENERY_BEHIND_CAMERA, SCENERY_AHEAD_OF_CAMERA, SCENERY_TILE);
}

// Chunky clouds, in a field that repeats along the road and drifts across it.
export const CLOUD_FIELD = { across: 520, along: 640, behind: 80 };
export const CLOUD_DRIFT = 1.2;
const CLOUD_COUNT = 18;

export interface Cloud {
  x: number;
  y: number;
  depth: number;
  // Its boxes, about its middle.
  boxes: WorldBox[];
}

export function clouds(seed: number): Cloud[] {
  const rng = tileRng(seed, "clouds", 0);
  return Array.from({ length: CLOUD_COUNT }, () => {
    const size = between(rng, 6, 14);
    const puffs = 2 + Math.floor(rng.next() * 3);
    const boxes: WorldBox[] = [box([0, 0, 0], [size * 2.2, size * 0.45, size * 1.2], "cloud")];
    for (let i = 0; i < puffs; i++) {
      const puff = size * between(rng, 0.5, 0.9);
      const center: Vec3 = [between(rng, -size * 0.7, size * 0.7), size * 0.25 + puff * 0.3, between(rng, -size * 0.3, size * 0.3)];
      boxes.push(box(center, [puff, puff * 0.7, puff * 0.8], "cloud"));
    }
    return {
      x: between(rng, -CLOUD_FIELD.across / 2, CLOUD_FIELD.across / 2),
      y: between(rng, 22, 48),
      depth: between(rng, 0, CLOUD_FIELD.along),
      boxes,
    };
  });
}

// Where a cloud is now: drifted across and wrapped around the field, and
// repeated along the road so the camera always has the field around it.
export function cloudPlace(cloud: Cloud, time: number, cameraDepth: number): { x: number; depth: number } {
  const wrap = (value: number, size: number): number => ((value % size) + size) % size;
  const x = wrap(cloud.x + CLOUD_DRIFT * time + CLOUD_FIELD.across / 2, CLOUD_FIELD.across) - CLOUD_FIELD.across / 2;
  const start = cameraDepth - CLOUD_FIELD.behind;
  return { x, depth: start + wrap(cloud.depth - start, CLOUD_FIELD.along) };
}
