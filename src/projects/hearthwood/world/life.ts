import { createRng, uniform } from "@/shared/lib/seeded-random";
import { type Grid, forEachNear, makeGrid, sample, slopeAt, vertexPosition } from "./grid";
import { ALTITUDE } from "./land";
import { fbm, gradientNoise, smoothstep, type Noise2 } from "./noise";
import type { Camp, Place } from "./places";
import { type Lake, lakeDistance } from "./water";

/*
 * What grows where: how thick the woods are at each point, and a scatter of
 * plants and stones placed by it. The woods fill the band between the
 * meadow floor and the treeline, stand in groves out on the meadow, open into
 * glades, and keep back from water, trails, camp and the places.
 */

export type PlantKind = "conifer" | "broadleaf" | "birch" | "bush" | "rock" | "flowers";
export const PLANT_KINDS: readonly PlantKind[] = ["conifer", "broadleaf", "birch", "bush", "rock", "flowers"];
/** How many shapes each kind comes in. */
export const PLANT_VARIANTS = 3;

export interface Plant {
  kind: PlantKind;
  x: number;
  /** The ground under it. */
  y: number;
  z: number;
  /** Its overall size, in metres for trees (height) and roughly so for the rest. */
  size: number;
  /** How much taller than wide it grows than its kind usually does, about 1. */
  stretch: number;
  /** Its turn about the vertical, in radians. */
  turn: number;
  /** How far it leans, in radians, and towards which way. */
  lean: number;
  leanToward: number;
  /** Its shift from its kind's colour, -1 to 1. */
  tint: number;
  /** Which of its kind's shapes it is. */
  variant: number;
}

export interface LifeSurroundings {
  heights: Grid;
  lake: Lake;
  streamDistance: Grid;
  trailDistance: Grid;
  camp: Camp;
  places: readonly Place[];
}

/** How far the band edges wander up and down the slopes, in metres. */
const BAND_WOBBLE = 11;
const SCATTER_SPACING = 3.4;
/** Kept open round where each place's trail ends, so there is room to stand and look. */
const VIEWPOINT_CLEARING = 6;

export function bandWobble(noise: Noise2, x: number, z: number): number {
  return BAND_WOBBLE * fbm(noise, x / 90, z / 90, 3);
}

/** How thick the woods grow at each vertex, 0 (open) to 1. */
export function woodland(seed: string, s: LifeSurroundings): Grid {
  const wobble = gradientNoise(`${seed}/bands`);
  const groves = gradientNoise(`${seed}/groves`);
  const glades = gradientNoise(`${seed}/glades`);
  const density = makeGrid(s.heights.side, s.heights.spacing);
  const clearings = [{ x: s.camp.x, z: s.camp.z, r: s.camp.clearing }, ...s.places.flatMap((p) => [{ x: p.x, z: p.z, r: p.clearing }, { x: p.visitX, z: p.visitZ, r: VIEWPOINT_CLEARING }])];
  for (let i = 0; i < density.values.length; i++) {
    const { x, z } = vertexPosition(density, i);
    const h = s.heights.values[i];
    const w = bandWobble(wobble, x, z);
    const band = smoothstep(ALTITUDE.forest - 6 + w, ALTITUDE.forest + 3 + w, h) * (1 - smoothstep(ALTITUDE.treeline - 7 + w, ALTITUDE.treeline + 3 + w, h));
    const grove = 0.9 * smoothstep(0.05, 0.35, fbm(groves, x / 65, z / 65, 3));
    const glade = smoothstep(0.22, 0.5, fbm(glades, x / 42, z / 42, 3));
    let d = Math.max(band, grove) * (1 - 0.92 * glade);
    for (const c of clearings) d *= smoothstep(c.r, c.r + 9, Math.hypot(x - c.x, z - c.z));
    d *= smoothstep(2.5, 7, s.streamDistance.values[i]) * smoothstep(1.2, 1.6, lakeDistance(s.lake, x, z));
    d *= smoothstep(2.2, 5.5, s.trailDistance.values[i]);
    d *= 1 - smoothstep(0.8, 1.1, slopeAt(s.heights, x, z));
    density.values[i] = d;
  }
  return density;
}

function plant(kind: PlantKind, x: number, y: number, z: number, size: number, rng: () => number): Plant {
  return {
    kind,
    x,
    y,
    z,
    size,
    stretch: 0.85 + 0.3 * rng(),
    turn: rng() * Math.PI * 2,
    lean: kind === "rock" || kind === "flowers" ? 0 : 0.07 * rng() * rng(),
    leanToward: rng() * Math.PI * 2,
    tint: rng() * 2 - 1,
    variant: Math.floor(rng() * PLANT_VARIANTS),
  };
}

export function scatterLife(seed: string, s: LifeSurroundings, density: Grid): Plant[] {
  const rng = createRng(`${seed}/life`);
  const next = () => rng.next();
  const kindNoise = gradientNoise(`${seed}/kinds`);
  const plants: Plant[] = [];
  const reach = -s.heights.origin - 4;
  const clearings = [{ x: s.camp.x, z: s.camp.z, r: s.camp.clearing - 3 }, ...s.places.map((p) => ({ x: p.x, z: p.z, r: p.clearing - 2 }))];
  for (let gz = -reach; gz <= reach; gz += SCATTER_SPACING) {
    for (let gx = -reach; gx <= reach; gx += SCATTER_SPACING) {
      const x = gx + (next() - 0.5) * SCATTER_SPACING * 0.9;
      const z = gz + (next() - 0.5) * SCATTER_SPACING * 0.9;
      const h = sample(s.heights, x, z);
      const roll = next();
      if (h > ALTITUDE.rock + 26) continue;
      const d = sample(density, x, z);
      const trail = sample(s.trailDistance, x, z);
      const stream = sample(s.streamDistance, x, z);
      const lake = lakeDistance(s.lake, x, z);
      const wet = lake < 1.05 || stream < 1.5;
      const cleared = clearings.some((c) => Math.hypot(x - c.x, z - c.z) < c.r);
      if (wet || cleared) continue;
      const slope = slopeAt(s.heights, x, z);

      if (roll < d * 0.8) {
        const high = smoothstep(ALTITUDE.forest, ALTITUDE.treeline - 10, h);
        const mix = 0.5 + 0.5 * fbm(kindNoise, x / 40, z / 40, 2);
        const nearWater = stream < 14 || lake < 1.9;
        let kind: PlantKind;
        if (next() < 0.12 + 0.8 * high + 0.25 * (mix - 0.5)) kind = "conifer";
        else if (nearWater || mix > 0.62) kind = "birch";
        else kind = "broadleaf";
        const shrink = kind === "conifer" ? 1 - 0.4 * smoothstep(ALTITUDE.treeline - 12, ALTITUDE.treeline + 4, h) : 1;
        const size = (kind === "conifer" ? uniform(rng, 7, 14) : kind === "birch" ? uniform(rng, 7, 11) : uniform(rng, 6, 10)) * shrink;
        plants.push(plant(kind, x, h, z, size, next));
        continue;
      }
      const edge = 4 * d * (1 - d);
      if (h < ALTITUDE.treeline + 4 && trail > 2.2 && roll < d * 0.8 + 0.035 + 0.12 * edge) {
        plants.push(plant("bush", x, h, z, uniform(rng, 0.8, 1.7), next));
        continue;
      }
      const stony = 0.015 + 0.13 * smoothstep(ALTITUDE.treeline, ALTITUDE.rock, h) + 0.12 * smoothstep(0.6, 1, slope);
      if (trail > 2 && next() < stony) {
        plants.push(plant("rock", x, h, z, uniform(rng, 0.5, 1.4) + 1.6 * smoothstep(ALTITUDE.forest, ALTITUDE.rock, h) * next(), next));
        continue;
      }
      if (d < 0.35 && h < ALTITUDE.treeline && trail > 1.6 && slope < 0.5 && next() < 0.22) {
        plants.push(plant("flowers", x, h, z, uniform(rng, 0.8, 1.3), next));
      }
    }
  }
  return plants;
}

/** How much the trees darken the ground under them, 0 to about 0.6, so the woods sit in their own shade. */
export function canopyShade(like: Grid, plants: readonly Plant[]): Grid {
  const shade = makeGrid(like.side, like.spacing);
  for (const p of plants) {
    if (p.kind !== "conifer" && p.kind !== "broadleaf" && p.kind !== "birch") continue;
    const radius = p.size * 0.42;
    forEachNear(shade, p.x, p.z, radius, (i, distance) => {
      shade.values[i] = Math.min(0.6, shade.values[i] + 0.3 * (1 - distance / radius));
    });
  }
  return shade;
}
