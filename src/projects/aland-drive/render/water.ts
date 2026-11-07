import { DataTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RGBAFormat, RepeatWrapping, type Node } from "three/webgpu";
import { cameraPosition, dot, float, max, mix, normalize, positionWorld, pow, reflect, smoothstep, texture, time, vec2, vec3 } from "three/tsl";
import { towardsSun, type Sun } from "../art/sun";
import type { IceLook } from "./sea-ice";

/*
 * The water, for the terrain's lakes and sea and the plane past the tiles alike: one
 * function of where a pixel is and where it's seen from, so they can't disagree.
 *
 * Calm archipelago water: dark, a little green, shallows paler towards land, and at a
 * low angle mostly the sky. Three reads of one tiling slope texture at different
 * scales drift across each other for ripples. The texture's mips average its slopes
 * away with distance, so far water is flat rather than shimmering. There's no
 * reflection of the world. How shallow it is comes from whoever draws it: the
 * water's depth over the tiles' seabed, or past them, how near land is in the
 * overview's image, blurred by its own mips.
 *
 * Frozen, it is the ice over it (`render/sea-ice.ts`), with no ripples or glints: new ice dark and glassy, a mirror of
 * the sky with the sun a broad sheen on it, and old ice that bears a car pale and matt, lit as the land is, with snow on
 * it, pressure ridges heaped across it in the snow's shade, and cracks.
 */

const SLOPE_PIXELS = 256;
const WAVES = 40;
/** Waves per tile of the texture, shortest and longest. */
const SHORTEST_WAVE = 18;
const LONGEST_WAVE = 3;
/** The texture's slopes run to this, scaled into a byte. */
const TALLEST_SLOPE = 0.9;

/** Each ripple layer: metres the texture covers, its share of the slope, and how it drifts in m/s. */
const RIPPLES: { tileM: number; share: number; drift: [number, number] }[] = [
  { tileM: 5.3, share: 0.3, drift: [0.21, 0.13] },
  { tileM: 17, share: 0.34, drift: [-0.29, 0.34] },
  { tileM: 61, share: 0.36, drift: [0.47, -0.31] },
];
const SLOPE_GAIN = 0.42;
/** Past this distance ripples leave only their brightness in the sun's path. */
const RIPPLES_FADE_FROM_M = 250;
const RIPPLES_FADE_TO_M = 2500;
const FLATTEST = 0.12;

/** Water reflects 2% head on. Ripples tilt some of every pixel away, so it never quite reaches a mirror at a low angle. */
const FRESNEL_HEAD_ON = 0.02;
const FRESNEL_MOST = 0.86;
const FRESNEL_POWER = 5;
const SUN_SHARP_NEAR = 420;
const SUN_SHARP_FAR = 60;
const SUN_BRIGHT_NEAR = 2.4;
const SUN_BRIGHT_FAR = 0.45;
/** The sun catches on the smallest ripples more than the eye sees them anywhere else, so it breaks into glints, not blobs. */
const GLINT_RIPPLE_GAIN = 2.6;
const SUN_FAR_M = 2500;
/** How near land the water starts to pale, and where it's as pale as it gets: shares of land in the blurred overview. */
const SHALLOW_FROM = 0.03;
const SHALLOW_TO = 0.85;
const SHORE_MIRRORS_TO = 0.75;
/** Water this deep over the seabed is as dark as open water. */
const SHALLOWS_DEPTH_M = 2.2;

/** How new ice mirrors the sky: less than calm water, since its face is never quite flat. */
const ICE_MIRRORS = 0.75;
const ICE_SHEEN_SHARP = 90;
const ICE_SHEEN = 0.5;
/** Matt ice and its snow, lit as the land is: the sky's share and the sun's. */
const ICE_AMBIENT = 0.62;
const ICE_SUN = 0.55;
/** How dark a crack is against its ice, and how deep a pressure ridge's shade is across the snow heaped on it. */
const CRACK_DARK = 0.35;
const RIDGE_SHADE = 0.55;

/** The overview's mip level the shallows are read at: 160 m a texel, blurred, so a shore's tint needs no seams or detail. */
export const WATER_SHORE_MIP = 2;

/** A fixed sequence, so every run's water is the same. */
function sequence(): () => number {
  let state = 2024;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/** Slopes of a sum of waves with whole numbers of waves per tile, so it tiles. */
export function slopePixels(size: number): Uint8Array {
  const random = sequence();
  const waves = Array.from({ length: WAVES }, () => {
    const scale = LONGEST_WAVE + random() ** 2 * (SHORTEST_WAVE - LONGEST_WAVE);
    const heading = random() * 2 * Math.PI;
    const across = Math.round(Math.cos(heading) * scale);
    const down = Math.round(Math.sin(heading) * scale);
    return { across, down, phase: random() * 2 * Math.PI, strength: 1 / scale ** 0.7 };
  }).filter(({ across, down }) => across !== 0 || down !== 0);
  const total = waves.reduce((sum, { strength }) => sum + strength, 0);
  const pixels = new Uint8Array(size * size * 4);
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      let slopeX = 0;
      let slopeZ = 0;
      for (const { across, down, phase, strength } of waves) {
        const crest = Math.cos(((column * across + row * down) / size) * 2 * Math.PI + phase) * strength;
        slopeX += crest * across;
        slopeZ += crest * down;
      }
      const at = (row * size + column) * 4;
      const encode = (slope: number) => Math.round(127.5 + (127.5 * Math.max(-1, Math.min(1, ((slope / total) * 0.4) / TALLEST_SLOPE))));
      pixels[at] = encode(slopeX);
      pixels[at + 1] = encode(slopeZ);
      pixels[at + 3] = 255;
    }
  }
  return pixels;
}

export interface WaterInputs {
  colour: (name: string) => Node<"vec3">;
  sun: Sun;
  /** The sky along a direction, to reflect: `sky.clearAlong`, or `sky.colourAlong` for clouds at five more reads. Without one, the sky's flat colour. */
  skyAlong?: (direction: Node<"vec3">) => Node<"vec3">;
  /** Melts a colour into the sky's foot along a direction from the eye: `sky.seaToSky`. Open water takes it, so the sea has no line at the horizon, and shores don't. */
  meltAlong?: (colour: Node<"vec3">, direction: Node<"vec3">) => Node<"vec3">;
}

export interface Water {
  /** The water at this pixel, given how much land is about it: 0 in open water, 1 at the shore; and the ice on it, if any is drawn. */
  colorFor: (shore: Node<"float">, ice?: IceLook) => Node<"vec3">;
  dispose: () => void;
}

/** How near the shore water of this depth over the seabed is, for `colorFor`. */
export function shoreOfDepth(depthM: Node<"float">): Node<"float"> {
  return float(1).sub(smoothstep(float(0), float(SHALLOWS_DEPTH_M), depthM));
}

/** How near the shore a pixel past the tiles is, from the land in the overview's blurred image, for `colorFor`. */
export function shoreOfLand(landShare: Node<"float">): Node<"float"> {
  return smoothstep(float(SHALLOW_FROM), float(SHALLOW_TO), landShare);
}

export function createWater({ colour, sun, skyAlong, meltAlong }: WaterInputs): Water {
  const map = new DataTexture(slopePixels(SLOPE_PIXELS), SLOPE_PIXELS, SLOPE_PIXELS, RGBAFormat);
  map.colorSpace = NoColorSpace;
  map.wrapS = map.wrapT = RepeatWrapping;
  map.magFilter = LinearFilter;
  map.minFilter = LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.needsUpdate = true;

  const toEye = cameraPosition.sub(positionWorld);
  const distance = toEye.length();
  const view = toEye.div(distance);
  const place = positionWorld.xz;
  const layers = RIPPLES.map(({ tileM, share, drift }) =>
    texture(map, place.add(vec2(drift[0], drift[1]).mul(time)).div(tileM))
      .rg.sub(0.5)
      .mul(2 * TALLEST_SLOPE * share),
  );
  const slope = layers[0].add(layers[1]).add(layers[2]);
  const calm = mix(float(1), float(FLATTEST), smoothstep(float(RIPPLES_FADE_FROM_M), float(RIPPLES_FADE_TO_M), distance));
  const tilt = slope.mul(SLOPE_GAIN).mul(calm);
  const normal = normalize(vec3(tilt.x.negate(), 1, tilt.y.negate()));

  const toSun = towardsSun(sun);

  const facing = max(dot(normal, view), 0);
  const fresnel = float(FRESNEL_HEAD_ON).add(float(FRESNEL_MOST - FRESNEL_HEAD_ON).mul(pow(float(1).sub(facing), float(FRESNEL_POWER))));
  const bounced = reflect(view.negate(), normal);
  // A ripple can tip a low ray under the horizon, where the sky has nothing to give.
  const upward = vec3(bounced.x, max(bounced.y, 0.002), bounced.z);
  const sky = skyAlong ? skyAlong(upward) : colour("sky");

  const farShare = smoothstep(float(0), float(SUN_FAR_M), distance);
  const brokenTilt = tilt.add(layers[0].mul(SLOPE_GAIN * GLINT_RIPPLE_GAIN).mul(float(1).sub(farShare)));
  const glintWay = reflect(view.negate(), normalize(vec3(brokenTilt.x.negate(), 1, brokenTilt.y.negate())));
  const glint = pow(max(dot(glintWay, toSun), 0), mix(float(SUN_SHARP_NEAR), float(SUN_SHARP_FAR), farShare));
  const sunlight = colour("sun").mul(glint).mul(mix(float(SUN_BRIGHT_NEAR), float(SUN_BRIGHT_FAR), farShare));

  // Ice is flat to the eye: the sky straight along the mirror, and the sun a broad sheen rather than glints.
  const flatFacing = max(view.y, 0);
  const flatFresnel = float(FRESNEL_HEAD_ON).add(float(FRESNEL_MOST - FRESNEL_HEAD_ON).mul(pow(float(1).sub(flatFacing), float(FRESNEL_POWER))));
  const flatBounce = vec3(view.x.negate(), max(view.y, 0.002), view.z.negate());
  const flatSky = skyAlong ? skyAlong(flatBounce) : colour("sky");
  const sheen = colour("sun").mul(pow(max(dot(flatBounce, toSun), 0), float(ICE_SHEEN_SHARP))).mul(ICE_SHEEN);
  const mattLight = float(ICE_AMBIENT).add(toSun.y.max(0).mul(ICE_SUN));

  const iceOver = (water: Node<"vec3">, { frozen, thick, snow, ridge, crack }: IceLook) => {
    const glassy = mix(colour("ice-new"), flatSky, flatFresnel.mul(ICE_MIRRORS)).add(sheen);
    const cracked = mix(colour("ice-old"), colour("ice-new"), crack.mul(CRACK_DARK)).mul(mattLight);
    const ice = mix(mix(glassy, colour("ice-new").mul(mattLight), crack.mul(CRACK_DARK)), cracked, thick);
    const snowed = mix(ice, colour("snow").mul(mattLight), snow.max(ridge));
    const ridged = mix(snowed, colour("snow-shade").mul(mattLight), ridge.mul(RIDGE_SHADE));
    return mix(water, ridged, frozen);
  };

  return {
    colorFor(shore, ice) {
      // Beside land the low reflection is the trees and rocks, not the sky.
      const mirrored = mix(sky, colour("tree-spruce"), shore.mul(SHORE_MIRRORS_TO));
      const body = mix(colour("water-deep"), colour("water-shallow"), shore);
      const water = mix(body, mirrored, fresnel).add(sunlight);
      const seen = ice ? iceOver(water, ice) : water;
      return meltAlong ? mix(meltAlong(seen, toEye.negate()), seen, shore) : seen;
    },
    dispose() {
      map.dispose();
    },
  };
}
