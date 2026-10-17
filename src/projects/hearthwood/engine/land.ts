import { createRng } from "@/shared/lib/seeded-random";
import { clamp, fbm, gradientNoise, ridged, smoothstep, type Noise2 } from "./noise";
import { makeRivers, type RiverReach } from "./rivers";

/*
 * The land of the whole endless world, as pure functions of a point: a few
 * large, slowly varying fields (how high the ground lies, how mountainous it
 * is, how wet) and the shapes they make (long winding ranges with passes
 * where their crests dip, rolling hills, hollows that hold lakes, and rivers
 * that carve their own valleys). Any point comes out the same every time,
 * with no knowledge of the rest of the map.
 *
 * Water stands on terraces: the water table is the broad lie of the land
 * rounded down to steps of TERRACE metres, so every lake and river reach is
 * level, and where a river crosses from one terrace to the next it drops
 * over a waterfall. Water therefore never runs uphill. Near the edge of a
 * terrace the land on the lower side is lifted into a sill, so the higher
 * water is always held in, except where a river cuts through as a fall.
 */

/** The height of a step between water terraces, in metres. */
export const TERRACE = 9;
/** How deep a river's water is at the middle of its channel: always shallow enough to wade. */
export const RIVER_DEPTH = 0.4;

/** Altitudes the land's bands sit at, before each band's own wobble. */
export const ALTITUDE = {
  /** The trees thin out to alpine grass. */
  treeline: 255,
  /** Grass gives way to bare rock. */
  rock: 420,
  /** Snow lies on whatever is flat enough to hold it. */
  snow: 610,
} as const;

/** Everything the land knows about one point. */
export interface LandSample {
  /** The ground, in metres. */
  height: number;
  /** The water table: water lies wherever it stands above the ground. */
  water: number;
  /** How much of a river channel the point lies in, 0 to 1. */
  river: number;
  /** 0 (flat lowland) to 1 (high ranges). */
  mountainous: number;
  /** 0 (dry) to 1 (wet). */
  wetness: number;
  /** 0 (flat) to 1 (hill country). */
  hilly: number;
}

export function emptySample(): LandSample {
  return { height: 0, water: 0, river: 0, mountainous: 0, wetness: 0, hilly: 0 };
}

/** The world is lowland round its origin, where camp is: the ranges begin some way out. */
const HOME_FLAT = [380, 1300] as const;

interface Noises {
  base: Noise2;
  mount: Noise2;
  chain: Noise2;
  style: Noise2;
  hilly: Noise2;
  wet: Noise2;
  warp: Noise2;
  range: Noise2;
  crest: Noise2;
  hills: Noise2;
  detail: Noise2;
  basin: Noise2;
  riverSize: Noise2;
}

export interface Land {
  /**
   * The land at a point, before camp and the places are levelled into it. Land seen from far off is sampled
   * every `spacing` metres, and features finer than that spacing can show are left out, so it never shimmers.
   */
  sample: (x: number, z: number, out?: LandSample, spacing?: number) => LandSample;
  /** The broad lie of the land (the water table before it is rounded to its terraces). */
  base: (x: number, z: number) => number;
  /** Which way a river flows at a point (a unit vector), or zero away from rivers. */
  flowAt: (x: number, z: number) => { x: number; z: number };
}

/** A smooth minimum: the lower of two values, rounded where they meet over about `k`. */
function smin(a: number, b: number, k: number): number {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return b + (a - b) * h - k * h * (1 - h);
}


export function makeLand(seed: string): Land {
  const n: Noises = {
    base: gradientNoise(`${seed}/base`),
    mount: gradientNoise(`${seed}/mountainous`),
    chain: gradientNoise(`${seed}/chain`),
    style: gradientNoise(`${seed}/mountain-style`),
    hilly: gradientNoise(`${seed}/hilly`),
    wet: gradientNoise(`${seed}/wet`),
    warp: gradientNoise(`${seed}/warp`),
    range: gradientNoise(`${seed}/range`),
    crest: gradientNoise(`${seed}/crest`),
    hills: gradientNoise(`${seed}/hills`),
    detail: gradientNoise(`${seed}/detail`),
    basin: gradientNoise(`${seed}/basin`),
    riverSize: gradientNoise(`${seed}/river-size`),
  };

  const base = (x: number, z: number): number => 32 + 38 * fbm(n.base, x / 2700, z / 2700, 3);

  const riverAt = makeRivers(seed);
  const foldAngle = createRng(`${seed}/folds`).next() * Math.PI;
  const foldX = Math.cos(foldAngle);
  const foldZ = Math.sin(foldAngle);
  const reach: RiverReach = { distance: 0, size: 0, alongX: 0, alongZ: 0 };

  const sample = (x: number, z: number, out: LandSample = emptySample(), spacing = 0): LandSample => {
    /** How many octaves of noise whose first is `scale` metres across a sampling this coarse can show. */
    const octaves = (scale: number, most: number) => Math.max(1, Math.min(most, Math.floor(Math.log2(scale / Math.max(1, 2 * spacing))) + 1));
    /** How much of a feature `wavelength` metres across a sampling this coarse can show: all of it, fading to none. */
    const shows = (wavelength: number) => 1 - smoothstep(wavelength / 5, wavelength / 2.5, spacing);
    const home = smoothstep(HOME_FLAT[0], HOME_FLAT[1], Math.hypot(x, z));
    const wetness = smoothstep(-0.4, 0.45, fbm(n.wet, x / 1900, z / 1900, 2));
    // Ranges: long winding belts along the lines where a broad field crosses zero, each rising and falling along its length, so they
    // part in wide gaps here and there and the lowlands between them stay open. A slow field of its own sets each range's character.
    const bx0 = x + 500 * fbm(n.warp, x / 2600 + 7.7, z / 2600, 2);
    const bz0 = z + 500 * fbm(n.warp, x / 2600, z / 2600 - 3.3, 2);
    const field = fbm(n.mount, bx0 / 6000, bz0 / 6000, 3);
    const belt = Math.max(0, 1 - Math.abs(field) / 0.3);
    const chain = home * smoothstep(-0.35, 0.15, fbm(n.chain, x / 4200, z / 4200, 2));
    const style = fbm(n.style, x / 9000, z / 9000, 2);
    const alpine = smoothstep(-0.14, 0.14, style);
    const layered = smoothstep(-0.16, -0.4, style);
    const fell = 1 - alpine - layered;
    // Along a crest its height wanders, and where it dips there is a pass.
    const crest = 0.35 + 0.65 * smoothstep(-0.55, 0.4, fbm(n.crest, x / 700, z / 700, octaves(700, 2)));

    // High alpine ranges: jagged peaks rising steeply out of the forest far above the treeline, their flanks cut by ridged spurs.
    const jagged = ridged(n.range, x / 560, z / 560, octaves(560, 4));
    const alpineHeight = 760 * belt ** 2.6 * crest + 210 * smoothstep(0.15, 0.95, belt) * jagged ** 1.8;
    // Fells: broad rounded tops rising bare above the trees.
    const fellHeight = 330 * smoothstep(0, 1, belt) ** 1.5 * (0.7 + 0.3 * crest);
    // Long rounded ridges side by side, all running roughly one way across the world as folded country does, bending as they go,
    // layered into the distance and wooded to their tops.
    const zone = Math.max(0, 1 - Math.abs(field) / 0.45);
    const across = (x * foldX + z * foldZ) / 720 + 2.4 * fbm(n.crest, x / 2600, z / 2600, 2);
    const folds = 0.5 + 0.5 * Math.cos(across * Math.PI * 2) * shows(720);
    const layeredHeight = 150 * smoothstep(0, 0.7, zone) * folds ** 1.6 * (0.7 + 0.3 * crest);
    const mountains = chain * (alpine * alpineHeight + fell * fellHeight + layered * layeredHeight);
    const mountainous = chain * (alpine * smoothstep(0, 0.7, belt) + fell * 0.6 * smoothstep(0, 0.7, belt) + layered * 0.45 * smoothstep(0, 0.6, zone));
    const hilly = smoothstep(0.05, 0.6, mountainous * 0.8 + 0.45 * (0.5 + 0.5 * fbm(n.hilly, x / 1500, z / 1500, 2)) * (0.35 + 0.65 * home));
    const hills = (2.5 + 26 * hilly) * (0.5 + 0.5 * fbm(n.hills, x / 330, z / 330, octaves(330, 4)) * shows(330));
    const detail = spacing > 18 ? 0 : (0.8 + 1.4 * hilly) * fbm(n.detail, x / 36, z / 36, 2) * shows(36);
    const floor = 2 + 3 * (1 - wetness);
    const basins = wetness * 15 * smoothstep(0.0, 0.5, fbm(n.basin, x / 340, z / 340, octaves(340, 2))) * shows(340);
    const b = base(x, z);
    const level = Math.floor(b / TERRACE) * TERRACE;
    let height = b + floor + hills + mountains + detail - basins;

    // Rivers: where the river noise crosses zero, a channel cut to the water table, in a valley whose sides rise gently from it.
    // Rivers keep to the lowlands and the hills, and fade out as the land rises far above their water.
    const above = height - level;
    let river = 0;
    const near = above < 60 ? riverAt(x, z, reach) : null;
    const presence = near ? smoothstep(0.05, 0.4, wetness + 0.3) * (1 - smoothstep(20, 50, above)) * (0.6 + 0.4 * smoothstep(-0.5, 0.3, n.riverSize(x / 2100, z / 2100))) : 0;
    if (near && presence > 0 && near.distance < 300) {
      const distance = near.distance;
      const halfWidth = (1.4 + 5.2 * near.size) * presence + 0.6;
      const bed = distance < halfWidth ? level - RIVER_DEPTH * (1 - (distance / halfWidth) ** 2) : level + (distance - halfWidth) * 0.13;
      height += (smin(height, bed, 3) - height) * smoothstep(0, 0.35, presence);
      river = (1 - smoothstep(halfWidth * 0.7, halfWidth + 0.8, distance)) * smoothstep(0.1, 0.35, presence);
    }

    // The sill: just below the edge of the terrace above, the land rises to hold that terrace's water in.
    const step = TERRACE - (b - level);
    if (height < level + TERRACE + 0.6) {
      const g = baseSlope(base, x, z);
      const toEdge = step / Math.max(g, 1e-4);
      const sill = (1 - smoothstep(6, 48, toEdge)) * (1 - river);
      if (sill > 0) height += (Math.max(height, level + TERRACE + 0.6) - height) * sill;
    }

    out.height = height;
    out.water = level;
    out.river = river;
    out.mountainous = mountainous;
    out.wetness = wetness;
    out.hilly = hilly;
    return out;
  };

  const flowAt = (x: number, z: number): { x: number; z: number } => {
    const near = riverAt(x, z, reach);
    if (!near) return { x: 0, z: 0 };
    // Along the river, the way the broad land falls.
    const bx = base(x + 20, z) - base(x - 20, z);
    const bz = base(x, z + 20) - base(x, z - 20);
    const sign = near.alongX * bx + near.alongZ * bz > 0 ? -1 : 1;
    return { x: near.alongX * sign, z: near.alongZ * sign };
  };

  return { sample, base, flowAt };
}

/** How steeply the broad lie of the land rises, in metres per metre. */
function baseSlope(base: (x: number, z: number) => number, x: number, z: number): number {
  const e = 4;
  return Math.hypot(base(x + e, z) - base(x - e, z), base(x, z + e) - base(x, z - e)) / (2 * e);
}
