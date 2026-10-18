import { createRng } from "@/shared/lib/seeded-random";
import { clamp, fbm, gradientNoise, gullyNoise, lerp, ridged, smoothstep, type Noise2, type Stripes } from "./noise";
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

/**
 * Altitudes the land's bands sit at in a high alpine range, before the land's own shift of them (`LandSample.bands`) and
 * each band's wobble. The lowlands lie at about 30 to 70 m, so the woods reach some 700 m up a range and most of a big
 * mountain stands above them.
 */
export const ALTITUDE = {
  /** The trees thin out to alpine grass. */
  treeline: 780,
  /** Grass gives way to scree and bare rock. */
  rock: 1150,
  /** Snow lies on whatever is flat enough to hold it. */
  snow: 1650,
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
  /** How far the altitude bands sit above (or below) ALTITUDE here, in metres. */
  bands: number;
}

export function emptySample(): LandSample {
  return { height: 0, water: 0, river: 0, mountainous: 0, wetness: 0, hilly: 0, bands: 0 };
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
  peaks: Noise2;
  crest: Noise2;
  climate: Noise2;
  hills: Noise2;
  detail: Noise2;
  basin: Noise2;
  riverSize: Noise2;
  massif: Noise2;
  horn: Noise2;
  profile: Noise2;
  plateau: Noise2;
  ice: Noise2;
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

/** How high a big alpine range rises above the lowlands at its highest, and how far its flanks reach out from its crest, in metres. */
const RANGE_HEIGHT = 2500;
const RANGE_REACH = 5000;
/** The size of the broad field the alpine crests follow, in metres. */
const ALPINE_FIELD = 10000;
/** The spacing of the glacial valleys down a range's flanks, and of the side valleys down their walls, in metres. */
const VALLEY = 2200;
/** How far the crest is rounded over, as a share of how far the flanks reach. */
const CREST_ROUND = 0.03;
/** How high the cols at the valley heads lie, as a share of the crest's height. */
const COL = 0.7;
const SIDE_VALLEY = 900;
/** How deep the side valleys cut into the walls, as a share of the wall. */
const SIDE_DEPTH = 0.3;
/** How much of the way from a valley's middle to the spur beside it is the valley's flat floor. */
const TROUGH_FLOOR = 0.16;
/** The spacing of the ribs and gullies that flute a range's faces, and how high they stand, in metres. */
const RIBS = 260;
const RIB_HEIGHT = 55;
/** The flutes' octaves: how much finer than RIBS each is, how strong, and an offset so no two line up. */
const FLUTES = [
  [1, 1, 0],
  [2.7, 0.3, 9.1],
  [6.5, 0.1, -2.3],
] as const;
/** How high crags and horns stand off a range's walls and ridges, in metres. */
const CRAGS = 190;
/** How high the horns rise from where the spurs meet the crest at most, in metres, and the size of the field that shapes
 * each one (its height, how sharp, flat-topped or split it is): about one valley's spacing, so each horn has its own. */
const HORNS = 400;
const HORN_FIELD = 1900;
/** The spacing of the massifs along a crest, each with its own summit, and how much lower the spurs stand between two
 * massifs' summits than at them, as a share. */
const MASSIF = 4400;
const MASSIF_DIP = 0.3;
/** How far the valleys wander from an even spacing, and the size of that wandering, in metres. */
const VALLEY_WARP = 0.28 * VALLEY;
const VALLEY_WARP_FIELD = 3000;
/** How much nearer to the crest a range's ice side comes, and how much further its other side reaches, as a share of the reach. */
const ICE_SIDE = 0.16;
/** The size of the field that sets how a range's spurs rise (straight, steepening or easing, with a bench partway or none),
 * and how wide a bench is, as a share of the way up. */
const PROFILE_FIELD = 2800;
const BENCH_WIDTH = 0.08;
/** The size of the field that lays high plateaus over some massifs, their level as a share of the crest's height, and how
 * much higher a plateau massif stands so its plateau is high fjell. */
const PLATEAU_FIELD = 9000;
const PLATEAU_LEVEL = 0.8;
const PLATEAU_LIFT = 1.12;
/** How high the fells rise. */
const FELL_HEIGHT = 430;
/** Folded country: the spacing of its ridges, the swell of upland they stand on and how high they rise from it, in metres. */
const FOLD = 2300;
const FOLD_SWELL = 260;
const FOLD_RIDGE = 420;
/** How far the bands sit from ALTITUDE on the fells and in folded country, how far they wander with the climate, and how far
 * down the ice reaches into a range's high valleys, in metres. */
const BANDS_FELL = -480;
const BANDS_FOLDED = 260;
const BANDS_CLIMATE = 150;
const BANDS_ICE = 420;

/** What an alpine range makes of a point. */
interface RangeSample {
  height: number;
  mountainous: number;
  /** How much the point lies in a high valley's head, where the snow and ice reach down, 0 to 1. */
  ice: number;
}

const NO_RANGE: RangeSample = { height: 0, mountainous: 0, ice: 0 };

/** What land sampled every `spacing` metres can show. */
interface Sampling {
  /** How many octaves of noise whose first is `scale` metres across it can show. */
  octaves: (scale: number, most: number) => number;
  /** How much of a feature `wavelength` metres across it can show: all of it, fading to none. */
  shows: (wavelength: number) => number;
}

const FULL_DETAIL = makeSampling(0);

function samplingAt(spacing: number): Sampling {
  return spacing === 0 ? FULL_DETAIL : makeSampling(spacing);
}

function makeSampling(spacing: number): Sampling {
  return {
    octaves: (scale, most) => Math.max(1, Math.min(most, Math.floor(Math.log2(scale / Math.max(1, 2 * spacing))) + 1)),
    shows: (wavelength) => 1 - smoothstep(wavelength / 5, wavelength / 2.5, spacing),
  };
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
    peaks: gradientNoise(`${seed}/peaks`),
    crest: gradientNoise(`${seed}/crest`),
    climate: gradientNoise(`${seed}/climate`),
    hills: gradientNoise(`${seed}/hills`),
    detail: gradientNoise(`${seed}/detail`),
    basin: gradientNoise(`${seed}/basin`),
    riverSize: gradientNoise(`${seed}/river-size`),
    massif: gradientNoise(`${seed}/massif`),
    horn: gradientNoise(`${seed}/horn`),
    profile: gradientNoise(`${seed}/spur-profile`),
    plateau: gradientNoise(`${seed}/plateau`),
    ice: gradientNoise(`${seed}/ice-side`),
  };

  const base = (x: number, z: number): number => 32 + 38 * fbm(n.base, x / 2700, z / 2700, 3);

  const riverAt = makeRivers(seed);
  const foldAngle = createRng(`${seed}/folds`).next() * Math.PI;
  const foldX = Math.cos(foldAngle);
  const foldZ = Math.sin(foldAngle);
  const reach: RiverReach = { distance: 0, size: 0, alongX: 0, alongZ: 0 };
  const gullies = gullyNoise(`${seed}/gullies`);
  const valleys: Stripes = { value: 0, dx: 0, dy: 0 };
  const sideValleys: Stripes = { value: 0, dx: 0, dy: 0 };
  const ribs: Stripes = { value: 0, dx: 0, dy: 0 };
  const ranged: RangeSample = { height: 0, mountainous: 0, ice: 0 };

  /** The broad field whose zero lines the ranges run along. */
  const rangeField = (x: number, z: number): number => {
    const wx = x + 500 * fbm(n.warp, x / 2600 + 7.7, z / 2600, 2);
    const wz = z + 500 * fbm(n.warp, x / 2600, z / 2600 - 3.3, 2);
    return fbm(n.mount, wx / 6000, wz / 6000, 3);
  };
  /** The broader, smoother field the alpine ranges' crests follow: they are big enough to need the room. */
  const alpineField = (x: number, z: number): number => {
    const wx = x + 700 * fbm(n.warp, x / 3400 - 2.1, z / 3400 + 5.5, 2);
    const wz = z + 700 * fbm(n.warp, x / 3400 + 4.4, z / 3400 - 8.8, 2);
    return n.mount(wx / ALPINE_FIELD + 31.7, wz / ALPINE_FIELD - 17.3);
  };

  /**
   * A horn, where a spur meets the crest (on a plateau, at the plateau's edge), in metres at a range's full height. Each
   * is its own, from slow fields about a valley's spacing across: anything from a knoll to a tower, a sharp horn or a broad
   * dome, some flat-topped, some split into two summits. Sampled from far off, sharp horns broaden into domes, which keep
   * their bulk without shimmering.
   */
  const horn = (x: number, z: number, a: number, t: number, plateau: number, summit: number, shows: number, sampling: Sampling): number => {
    const hx = x / HORN_FIELD;
    const hz = z / HORN_FIELD;
    const height = HORNS * smoothstep(-0.55, 0.65, n.horn(hx, hz)) * (1 - 0.5 * summit);
    if (height === 0) return 0;
    const sharp = smoothstep(-0.7, 0.35, n.horn(hx + 5.7, hz - 3.1)) * sampling.shows(3000);
    const along = Math.max(0, 1 - Math.abs(t - 0.3 * plateau) / lerp(0.3, 0.16, sharp));
    if (along === 0) return 0;
    // Across the spur, its point; where the valleys and spurs are too fine to show, a horn's mean across them, so a far
    // range keeps its horns' bulk along its crest.
    const width = lerp(0.45, 0.2, sharp);
    const across = shows > 0 ? clamp((a - (1 - width)) / width, 0, 1) ** lerp(0.6, 2.2, sharp) : 0;
    let rise = height * lerp(0.4, across, shows) * along ** lerp(0.8, 1.6, sharp);
    const table = smoothstep(0.35, 0.6, n.horn(hx - 8.2, hz + 4.4));
    if (table > 0) rise = lerp(rise, smin(rise, 0.45 * height, 0.1 * height), table);
    const split = smoothstep(0.2, 0.5, n.horn(hx + 2.2, hz + 9.9)) * sampling.shows(500);
    if (split > 0) rise *= 1 - 0.4 * split * (1 - smoothstep(0, 0.22, Math.abs(n.horn(x / 420 + 1.3, z / 420 - 6.6))));
    return rise;
  };

  /**
   * A high alpine range, like the Tetons, Jotunheimen or the Alps: a massif rising from its foot to a crest along a broad
   * field's zero line, its height wandering along the crest. Glacial valleys run down its flanks from the crest, flat-floored
   * between steep walls, their floors climbing to cirques under the crest, where valleys from either side meet at a col, the
   * pass over. Side valleys come down the walls and hang above the main valley's floor. The spurs between the valleys are
   * the ridges a walker climbs, and crags and horns stand off the upper walls and ridges. Where the range thins out along its
   * length (`chain`), it narrows as it lowers, so its ends are no steeper than its flanks.
   */
  const alpineRange = (x: number, z: number, chain: number, sampling: Sampling): RangeSample => {
    const e = 20;
    const field = alpineField(x, z);
    const fx = (alpineField(x + e, z) - field) / e;
    const fz = (alpineField(x, z + e) - field) / e;
    const steep = Math.max(Math.hypot(fx, fz), 1e-9);
    // Across the range, the way its flanks fall: the valleys and spurs run this way.
    const acrossX = fx / steep;
    const acrossZ = fz / steep;
    // Massifs along the crest: the spurs rise to a massif's summit and stand lower between, so each massif has its
    // dominant peak with lesser ones about it, which carry the taller horns. The valley floors and the cols keep their
    // heights, so the ways up the valleys to the passes are as easy beside a great peak as beside a lesser one.
    const summit = smoothstep(-0.7, 0.7, n.massif(x / MASSIF, z / MASSIF));
    const massif = 1 - MASSIF_DIP * (1 - summit);
    // High fjell: over some massifs the tops flatten into a plateau, standing a little higher.
    const plateau = smoothstep(0.3, 0.6, fbm(n.plateau, x / PLATEAU_FIELD, z / PLATEAU_FIELD, 2));
    // A plateau massif stands higher and reaches further, no steeper than the rest.
    const stature = lerp(1, PLATEAU_LIFT, plateau);
    // Each range has an ice side, the way its glaciers bit deepest, wandering slowly across the world: its faces that way
    // come nearer the crest and steeper, and its other side reaches further out and gentler, so a peak reads differently
    // from each side. (The reach changes across the crest, where the crest's distance is nothing on either side.)
    const iceAngle = 2.5 * Math.PI * n.ice(x / 20000 + 0.37, z / 20000 - 0.61);
    const facing = Math.sign(field) * (acrossX * Math.cos(iceAngle) + acrossZ * Math.sin(iceAngle));
    const reachOut = RANGE_REACH * (0.5 + 0.5 * chain) * stature * (1 - ICE_SIDE * facing);
    // How far the crest is, as a share of how far the flanks reach; where the field turns, between two crests, it is
    // read as no nearer than its usual steepness says, so the land between them comes down smoothly.
    const t = Math.hypot(Math.abs(field) / Math.max(steep, 0.75 / ALPINE_FIELD) / reachOut, CREST_ROUND) - CREST_ROUND;
    if (t >= 1) return NO_RANGE;
    const peaks = chain * (0.5 + 0.5 * smoothstep(-0.55, 0.5, fbm(n.peaks, x / 5200, z / 5200, sampling.octaves(5200, 3))));
    const top = RANGE_HEIGHT * peaks * stature;
    // The spurs climb from the range's foot to the crest, straight, steepening under the crest or easing to it, and here
    // and there with a bench partway up, a shoulder that eases before the climb goes on. The valley floors between them
    // stay low far into the range, then climb to cirques under the crest, where the valleys from either side meet at a
    // col; on a plateau they climb to the plateau instead, ending in cirques bitten into its edge.
    const climb = (1 - t) ** (0.97 + 0.2 * fbm(n.profile, x / PROFILE_FIELD, z / PROFILE_FIELD, 2));
    const bench = 0.8 * smoothstep(0.05, 0.45, n.profile(x / PROFILE_FIELD + 7.3, z / PROFILE_FIELD - 2.9)) * sampling.shows(4 * BENCH_WIDTH * RANGE_REACH);
    const fromBench = climb - (0.5 + 0.15 * n.profile(x / PROFILE_FIELD - 4.1, z / PROFILE_FIELD + 8.7));
    const spur = (climb - bench * fromBench * Math.exp(-0.5 * (fromBench / BENCH_WIDTH) ** 2)) * smoothstep(1, 0.7, t) * massif;
    const floor = lerp(COL * (1 - t) ** 2.3, spur, plateau * smoothstep(0.42, 0.12, t));

    // The valleys wander from an even spacing, so the spurs between them are uneven, and here and there two valleys merge.
    const vx = x + VALLEY_WARP * fbm(n.warp, x / VALLEY_WARP_FIELD + 13.1, z / VALLEY_WARP_FIELD - 6.2, 2);
    const vz = z + VALLEY_WARP * fbm(n.warp, x / VALLEY_WARP_FIELD - 9.4, z / VALLEY_WARP_FIELD + 3.8, 2);
    gullies(vx / VALLEY, vz / VALLEY, acrossX, acrossZ, valleys);
    // Where the field turns on itself the way across is lost, and the valleys fade out rather than meet in a star.
    const runs = smoothstep(0.25, 0.6, steep * ALPINE_FIELD);
    const showsValleys = sampling.shows(VALLEY) * runs;
    // Where a point lies between a valley's middle (0) and the crest of the spur beside it (1), evenly across.
    // (Kept a little short of the ends, where the arc's cosine turns infinitely steep: the crest would be a knife's edge.)
    const evenly = (1 - Math.acos(0.98 * clamp(valleys.value / 0.85, -1, 1)) / Math.PI) / 0.936;
    const a = 0.62 + (evenly - 0.62) * showsValleys;
    // A glacier's trough: a flat floor, walls steepening as they rise, and a narrow rounded crest along the spur above,
    // the ridge a walker follows up.
    const across = clamp((a - TROUGH_FLOOR) / (1 - TROUGH_FLOOR), 0, 1);
    const u = smoothstep(0, 1, across ** 0.85);
    // Up on the crest, from each col to the peaks either side, the walls ease into an even arête, a way along the crest.
    const wall = lerp(smin(u ** 1.6, 0.9, 0.24) / 0.8, across, smoothstep(0.16, 0, t));
    // Side valleys come down the main valleys' walls, the way the land falls there. That way turns about at the crest, so
    // what follows it fades out just short of the crest, to meet the other side's without a step.
    const offCrest = smoothstep(0, 0.03, t);
    const flank = (Math.sign(field) * (0.85 * (spur - floor) * wall + 2.3 * floor)) / Math.max(1 - t, 0.05) / reachOut;
    const wallFall = (1.6 * (spur - floor) * showsValleys) / VALLEY;
    const fallX = acrossX * flank + wallFall * valleys.dx;
    const fallZ = acrossZ * flank + wallFall * valleys.dy;
    const fall = Math.max(Math.hypot(fallX, fallZ), 1e-9);
    const fallsHere = smoothstep(0.05, 0.3, fall * VALLEY) * offCrest;
    // The finer patterns are only worked out where they show.
    const onWalls = smoothstep(0.1, 0.4, wall) * (1 - smoothstep(0.6, 0.85, wall));
    let shape = wall;
    if (onWalls * fallsHere > 0) {
      // Where the land hardly falls at all (a spur's crest, a valley's middle, up on the crest) the side valleys have no
      // way to run, and fade out rather than meet in a star.
      gullies(x / SIDE_VALLEY, z / SIDE_VALLEY, fallX / fall, fallZ / fall, sideValleys);
      const side = 0.5 + 0.5 * sideValleys.value * sampling.shows(SIDE_VALLEY) * fallsHere;
      shape = wall * (1 - SIDE_DEPTH * onWalls * (1 - smoothstep(0.2, 0.7, side)));
    }
    // Ribs and gullies flute the faces, running straight down them, so they roughen a face without steepening the way up it.
    // The way down turns about on a spur's crest, as on the range's, so they fade out before it.
    const faces = smoothstep(0.25, 0.7, spur) * smoothstep(0.08, 0.45, wall) * (1 - smoothstep(0.72, 0.93, wall)) * fallsHere * chain;
    let fluting = 0;
    for (const [scale, strength, shift] of FLUTES) {
      const shows = faces > 0 ? sampling.shows(RIBS / scale) : 0;
      if (shows === 0) continue;
      gullies((x * scale) / RIBS + shift, (z * scale) / RIBS - shift, fallX / fall, fallZ / fall, ribs);
      fluting += strength * RIB_HEIGHT * ribs.value * shows;
    }
    // Crags stand off the high walls in patches, leaving the spurs' crests and ways up between them clear.
    const patches = smoothstep(-0.15, 0.3, fbm(n.peaks, x / 1100 + 3.1, z / 1100 - 7.7, sampling.octaves(1100, 2)));
    const high = smoothstep(0.3, 0.75, spur) * smoothstep(0.1, 0.4, wall) * (1 - smoothstep(0.8, 0.97, wall)) * patches;
    const crags = CRAGS * ridged(n.range, x / 520, z / 520, sampling.octaves(520, 4)) ** 2 * high * chain;
    // On a plateau the land levels off below the crest's height, into the open high fjell.
    const rise = floor + (spur - floor) * shape;
    const level = lerp(rise, smin(rise, PLATEAU_LEVEL, 0.12), plateau);
    ranged.height = top * level + crags + peaks * horn(x, z, evenly, t, plateau, summit, sampling.shows(VALLEY), sampling) * runs + fluting * faces;
    ranged.mountainous = smoothstep(0, 0.5, spur) * Math.min(1, chain * 1.5);
    ranged.ice = (1 - u) * smoothstep(0.3, 0.75, floor / COL) * smoothstep(0.7, 0.95, peaks) * lerp(0.5, 1, smoothstep(-0.5, 0.5, facing));
    return ranged;
  };

  const sample = (x: number, z: number, out: LandSample = emptySample(), spacing = 0): LandSample => {
    const sampling = samplingAt(spacing);
    const { octaves, shows } = sampling;
    const home = smoothstep(HOME_FLAT[0], HOME_FLAT[1], Math.hypot(x, z));
    const wetness = smoothstep(-0.4, 0.45, fbm(n.wet, x / 1900, z / 1900, 2));
    // Ranges: long winding belts along the lines where a broad field crosses zero, each rising and falling along its length, so they
    // part in wide gaps here and there and the lowlands between them stay open. A slow field of its own sets each range's character.
    const field = rangeField(x, z);
    const belt = Math.max(0, 1 - Math.abs(field) / 0.3);
    const chain = home * smoothstep(-0.35, 0.15, fbm(n.chain, x / 4200, z / 4200, 2));
    const style = fbm(n.style, x / 9000, z / 9000, 2);
    const alpine = smoothstep(-0.14, 0.14, style);
    const layered = smoothstep(-0.16, -0.4, style);
    const fell = 1 - alpine - layered;
    // Along a crest its height wanders, and where it dips there is a pass.
    const crest = 0.35 + 0.65 * smoothstep(-0.55, 0.4, fbm(n.crest, x / 700, z / 700, octaves(700, 2)));

    // High alpine ranges: see `alpineRange`.
    const alpineChain = home * smoothstep(-0.55, 0.05, fbm(n.chain, x / 11000 - 5.2, z / 11000 + 9.4, 2));
    const range = alpine > 0 && alpineChain > 0 ? alpineRange(x, z, alpineChain, sampling) : NO_RANGE;
    // Fells: broad rounded tops rising bare above the trees.
    const fellHeight = FELL_HEIGHT * smoothstep(0, 1, belt) ** 1.5 * (0.7 + 0.3 * crest);
    // Folded country: long rounded ridges side by side, all running roughly one way across the world as folded country does,
    // bending as they go, on a broad swell of upland, layered into the distance and wooded to their tops.
    const zone = Math.max(0, 1 - Math.abs(field) / 0.45);
    const across = (x * foldX + z * foldZ) / FOLD + 1.2 * fbm(n.crest, x / 5200, z / 5200, 2);
    const folds = 0.5 + 0.5 * Math.cos(across * Math.PI * 2);
    const ribs = 0.5 + 0.5 * Math.cos(across * Math.PI * 6 + 1.3) * shows(FOLD / 3);
    const swell = smoothstep(0, 0.8, zone);
    const layeredHeight = swell * (FOLD_SWELL + FOLD_RIDGE * (folds ** 1.4 * (0.82 + 0.18 * ribs)) * (0.65 + 0.35 * crest));
    const mountains = alpine * range.height + chain * (fell * fellHeight + layered * layeredHeight);
    const mountainous = alpine * range.mountainous + chain * (fell * 0.6 * smoothstep(0, 0.7, belt) + layered * 0.5 * swell);
    // The bands sit lowest on the fells, as on Lapland's, highest in the folded country, wooded to its tops, and wander
    // up and down with the climate; up in an alpine range the snow and ice reach down its valley heads into the cirques.
    const bands =
      BANDS_FELL * fell + BANDS_FOLDED * layered + BANDS_CLIMATE * fbm(n.climate, x / 14000, z / 14000, 2) - alpine * BANDS_ICE * range.ice;
    const hilly = smoothstep(0.05, 0.6, mountainous * 0.8 + 0.45 * (0.5 + 0.5 * fbm(n.hilly, x / 1500, z / 1500, 2)) * (0.35 + 0.65 * home));
    // Up in an alpine range its own valleys and crags shape the land, and the hills' lumps would only roughen its ridges.
    const lumpy = 1 - 0.75 * alpine * range.mountainous;
    const hills = (2.5 + 26 * hilly * lumpy) * (0.5 + 0.5 * fbm(n.hills, x / 330, z / 330, octaves(330, 4)) * shows(330));
    const detail = spacing > 18 ? 0 : (0.8 + 1.4 * hilly * lumpy) * fbm(n.detail, x / 36, z / 36, 2) * shows(36);
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
    out.bands = bands;
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
