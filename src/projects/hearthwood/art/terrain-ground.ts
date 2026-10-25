import { Color, Vector2, Vector3, Vector4 } from "three";
import { attribute, dot, float, Fn, fwidth, If, length, max, mix, normalGeometry, positionGeometry, smoothstep, uniform, varying, vec2, vec3 } from "three/tsl";
import type { Node, UniformNode } from "three/webgpu";
import { ALTITUDE } from "../engine/land";
import { REGIONS } from "../engine/regions";
import { valueNoise } from "./atmosphere";
import { colourUniform, typed } from "./tsl";

/*
 * The land's ground, per pixel, as nodes every land tile shares: one graph
 * for every tile, which differ only in their attributes. Each vertex carries
 * how much of each region it is in, and the smooth fields the ground is read
 * from (the woods, the water table, the river, the bands' wobble); each
 * region's own grounds are uniforms, mixed by the region shares here.
 *
 * Which ground shows is decided per pixel: the forest floor, alpine grass,
 * rock, snow clinging to steeper ground higher up, the wet shore, the trodden
 * earth round the fire and the far woods' painted canopy each begin where
 * their field crosses a threshold, softened and set wavering by a little
 * noise, so an edge reads as a soft line at any angle. Every pattern fades
 * out before it is finer than the pixels can draw (read from how much ground
 * a pixel spans), so the far land never shimmers. Rock's beds, buttresses
 * and gullies are worked out only where there is rock.
 *
 * The intermediate grounds are exported as `LAND`, for the seasons' ground
 * (`art/features/seasons.ts`), which repaints them in the same graph, so it pays
 * only for what it adds.
 */

/** The camera the world is seen from: the land eases and curves by its distance from it, in the shadows' passes too, which draw from the light. */
export const viewer: UniformNode<"vec3", Vector3> = uniform(new Vector3());

/** Where the land is seen from, set once a frame before anything is drawn. */
export function followViewer(at: { x: number; y: number; z: number }): void {
  viewer.value.set(at.x, at.y, at.z);
}

/** The earth's radius, in metres: far land drops away below the horizon by the curve of the world. */
export const EARTH_RADIUS = 6_371_000;

/** A world-space point lowered by the curve of the world at its distance from the viewer. */
export function earthCurve(p: Node<"vec3">): Node<"vec3"> {
  const off = p.xz.sub(viewer.xz);
  return vec3(p.x, p.y.sub(dot(off, off).div(2 * EARTH_RADIUS)), p.z);
}

const regionColours = () => REGIONS.map(() => colourUniform());

/** Each region's own grounds and canopy, set from the palette by the land's material. */
export const REGION_GROUND = {
  meadow: regionColours(),
  lush: regionColours(),
  forest: regionColours(),
  alpine: regionColours(),
  canopy: regionColours(),
  /** The colour each region's woods turn (rgb) and its share of broadleaves (a): the seasons' ground sets them. */
  fall: REGIONS.map(() => uniform(new Vector4())),
};

/** The grounds every region shares, and where the bands lie. */
export const GROUND = {
  rock: colourUniform(),
  snow: colourUniform(),
  shore: colourUniform(),
  path: colourUniform(),
  riverBed: colourUniform(),
  /** The treeline, where rock begins and where snow begins, in metres. */
  bands: uniform(new Vector3(ALTITUDE.treeline, ALTITUDE.rock, ALTITUDE.snow)),
  /** Camp's fire, round which the ground is trodden. */
  fire: uniform(new Vector2(1e7, 1e7)),
  /** How far the trees themselves are drawn: past it, the woods are painted. */
  treeReach: uniform(1100),
};

export function setGround(colours: { rock: Color; snow: Color; shore: Color; path: Color; riverBed: Color }): void {
  for (const key of ["rock", "snow", "shore", "path", "riverBed"] as const) GROUND[key].value.copy(colours[key]);
}

/** The first four regions' shares at each vertex; the last is what they leave. */
const shares = attribute<"vec4">("regions", "vec4");

/** A region's uniforms mixed by the vertex's shares, in the vertex stage: the shares change slowly across the land, so the fragments need not. */
function regionMix<T extends "vec3" | "vec4">(us: readonly Node<T>[]): Node<T> {
  const last = float(1).sub(shares.x).sub(shares.y).sub(shares.z).sub(shares.w);
  const weights = [shares.x, shares.y, shares.z, shares.w, last];
  return varying(typed<T>(us.slice(1).reduce((sum, u, i) => sum.add(u.mul(weights[i + 1])), us[0].mul(weights[0]))));
}

/** Woods (x), the water table (y), the river (z), the bands' wobble (w). */
const fields = attribute<"vec4">("fields", "vec4");
/** The parent tile's height (x), and from where to where the tile eases into it (y, z). */
const morph = attribute<"vec3">("morph", "vec3");

/** The vertex eased into its parent tile's shape towards the distance where the tile is swapped for it, so the swap shows no step; before the curve of the earth. */
const eased = vec3(positionGeometry.x, mix(positionGeometry.y, morph.x, smoothstep(morph.y, morph.z, length(positionGeometry.xz.sub(viewer.xz)))), positionGeometry.z);

/** The land's vertex in the world: eased, then lowered by the curve of the earth. */
export const landPosition = earthCurve(eased);

/** How much of a pattern shows whose cycles are this many to a pixel: fading out before they come closer than a couple of pixels. */
function shows(cyclesPerPixel: Node<"float">): Node<"float"> {
  return float(1).sub(smoothstep(0.18, 0.45, cyclesPerPixel));
}

/** Noise at a frequency, faded to its mean where it is finer than the pixels. */
function noiseAt(p: Node<"vec2">, frequency: number, pixel: Node<"float">, offset = 0): Node<"float"> {
  return mix(0.5, valueNoise(p.mul(frequency).add(offset)), shows(pixel.mul(frequency)));
}

/** A soft band of uneven width along `s` (one unit about one band), sharpened no more than the pixels allow; `w` is how far `s` moves across a pixel. */
function band(s: Node<"float">, seed: number, w: Node<"float">): Node<"float"> {
  const n = valueNoise(vec2(s, seed));
  const sharp = mix(n, smoothstep(0.3, 0.7, n), shows(w.mul(2)));
  return mix(0.5, sharp, shows(w));
}

/** The world point the ground is painted at: eased but not curved, so the bands keep their heights however far off. */
const world = varying(eased, "vHwLand");
const p = world.xz;
const h = world.y;
/** How much ground a pixel spans, in metres. */
const pixel = length(fwidth(p));
const up = normalGeometry.normalize();
const slope = length(up.xz).div(max(up.y, 0.05));
const wave = noiseAt(p, 0.31, pixel);
const fine = noiseAt(p, 1.7, pixel);
const wood = fields.x;
const wobble = fields.w.add(wave.sub(0.5).mul(7));
const bands = GROUND.bands;

/**
 * Mountain rock as a storybook paints it: beds of uneven width that dip and
 * wander across a face and are broken up along it, cut across on the walls
 * and only a speckle on scree, over pale and dark buttresses and darker
 * gullies running straight down the faces (across a steep face the land's
 * breadth hardly changes down it, so a pattern across it runs down it).
 * `across` is how far the beds' height moves across a pixel.
 */
function stone(across: Node<"float">): Node<"vec3"> {
  const bed = h.add(dot(p, vec2(0.09, -0.05))).add(valueNoise(p.div(700)).sub(0.5).mul(220)).add(valueNoise(p.div(170).add(3.7)).sub(0.5).mul(80));
  const broken = smoothstep(0.3, 0.7, valueNoise(p.div(190).add(11.3)));
  const beds = band(bed.div(55), 1.7, across.div(55))
    .sub(0.5)
    .mul(broken.mul(0.22).add(0.1))
    .add(band(bed.div(13).add(0.4), 7.3, across.div(13)).sub(0.5).mul(broken.mul(0.16)));
  const walls = smoothstep(0.45, 1.1, slope);
  const buttress = valueNoise(p.div(320).add(5.5)).mul(0.6).add(0.2);
  const gully = float(1).sub(smoothstep(0.15, 0.5, noiseAt(p, 1 / 26, pixel, 8.8))).mul(walls);
  const tone = buttress.mul(0.42).add(0.7).add(beds.mul(walls)).sub(gully.mul(0.2)).add(fine.sub(0.5).mul(0.3));
  return GROUND.rock.mul(tone).mul(mix(1.08, 0.9, smoothstep(0.8, 1.6, slope)));
}

/** A slow noise, tens of metres across: the meadow's lusher patches, and the woods' edge wavering where the finer noise has faded. */
const patches = noiseAt(p, 1 / 30, pixel);
const lushness = smoothstep(0.25, 0.75, patches.mul(0.75).add(wave.mul(0.25)));
const meadow = mix(regionMix(REGION_GROUND.meadow), regionMix(REGION_GROUND.lush), lushness);
const forested = mix(meadow, regionMix(REGION_GROUND.forest), smoothstep(0.28, 0.5, wood.add(fine.sub(0.5).mul(0.18)).add(patches.sub(0.5).mul(0.22))));
const alpine = mix(forested, regionMix(REGION_GROUND.alpine), smoothstep(bands.x.sub(6).add(wobble), bands.x.add(8).add(wobble), h));
const rock = max(smoothstep(bands.y.sub(5).add(wobble), bands.y.add(5).add(wobble), h), smoothstep(1, 1.35, slope.add(fine.sub(0.5).mul(0.3))));

// The rock's patterns are worked out only where there is rock. Everything they share with the rest is built before the branch, and the derivative they need is taken outside it.
const rocky = Fn(() => {
  const ground = vec3(alpine).toVar();
  const across = fwidth(h).add(pixel.mul(0.6)).toVar();
  If(rock.greaterThan(0.002), () => {
    ground.assign(mix(ground, stone(across), rock));
  });
  return ground;
})();

// Snow lies on the flatter ground at first, and the higher it goes above its line the steeper the ground it clings to.
const cling = smoothstep(0, 600, h.sub(bands.z).sub(wobble)).mul(0.7);
const snow = smoothstep(bands.z.sub(6).add(wobble), bands.z.add(3).add(wobble), h).mul(float(1).sub(smoothstep(cling.add(0.55), cling.add(0.85), slope.add(fine.sub(0.5).mul(0.2)))));
const above = h.sub(fields.y).add(wave.sub(0.5).mul(0.5));
const path = float(1).sub(smoothstep(3, 6, length(p.sub(GROUND.fire)).add(wave.sub(0.5).mul(2))));

const ground = mix(
  mix(mix(mix(rocky, GROUND.snow, snow), GROUND.shore, float(1).sub(smoothstep(0.3, 1.1, above))), GROUND.riverBed, smoothstep(0.35, 0.65, fields.z.add(fine.sub(0.5).mul(0.15))).mul(float(1).sub(smoothstep(0, 0.6, above)))),
  GROUND.path,
  path.mul(0.9),
).mul(float(1).sub(smoothstep(0.1, 0.9, wood).mul(0.3)));

// Out where the trees are no longer drawn, the woods are painted in as their canopy, mottled crown by crown, fading in before the last trees.
const far = smoothstep(GROUND.treeReach.mul(0.7), GROUND.treeReach.mul(0.95), length(p.sub(viewer.xz)));
const crowns = noiseAt(p, 0.45, pixel).mul(0.6).add(wave.mul(0.4));
const canopyShare = far.mul(smoothstep(0.2, 0.45, wood.add(crowns.sub(0.5).mul(0.3)).add(patches.sub(0.5).mul(0.3)).add(noiseAt(p, 1 / 140, pixel, 3.3).sub(0.5).mul(0.3)))).mul(float(1).sub(snow)).mul(float(1).sub(rock));
const canopy = regionMix(REGION_GROUND.canopy).mul(crowns.mul(0.45).add(0.62));

/** The land's own ground, before the material's grain and the features' stages. */
export const landSurface = mix(ground, canopy, canopyShare);

/** The land's locals, for a stage that repaints the ground (the seasons'). */
export const LAND = {
  p,
  h,
  pixel,
  slope,
  wave,
  fine,
  wood,
  wobble,
  rock,
  snow,
  above,
  path,
  ground,
  crowns,
  canopy,
  canopyShare,
  surface: landSurface,
  /** The region's autumn colour (rgb) and how much of its woods are broadleaves (a). */
  fall: regionMix(REGION_GROUND.fall),
  noiseAt: (frequency: number, offset = 0) => noiseAt(p, frequency, pixel, offset),
};
