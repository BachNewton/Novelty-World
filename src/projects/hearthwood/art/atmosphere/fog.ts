import { Color, Vector3, Vector4 } from "three";
import { abs, cameraPosition, exp, float, max, normalize, positionWorld, select, uniform, vec3 } from "three/tsl";
import type { Node } from "three/webgpu";
import { REGIONS } from "../../engine/regions";
import { smoothstep } from "../../engine/noise";
import { hazeColour, type AtmosphereUniforms } from "../atmosphere";
import type { FeatureArt, MaterialKind } from "../feature-art";
import type { DayState } from "../light/daylight";
import { REGION_AIR } from "../palette";
import { colourUniform } from "../tsl";
import type { WeatherNow } from "../weather/now";
import { blendByRegion, weatherColours } from "./colours";

/*
 * Fog: the air between the eye and what it sees, the weather's air in place
 * of the plain haze. Two kinds of air mix in it. The clear air scatters blue
 * more than red, so far land turns blue before it fades into the horizon's
 * colour, and it thins slowly with height. Mist and the veil of rain are
 * droplets, white and grey: the mist lies in a shallow layer on the valley
 * floor round the camera, so it pools in the valleys and the ridges stand
 * out of it, and the rain's veil reaches higher. How thick each is comes
 * from the weather: a crisp clear day shows the land out to the horizon, a
 * damp dawn fills the valleys with mist that lifts by noon, and a downpour
 * closes the view in. The mist takes the colour of the region the camera is
 * in, blended across their borders. The glow towards the sun, the moon and
 * the fire in this same air is its own feature (`sun-glow.ts`).
 *
 * Each layer's density falls off exponentially with height, so its depth
 * along a ray has a closed form: correct from a hand's breadth to the
 * horizon, and on rays into the sky, whose depth the falling density keeps
 * finite. Nothing is marched.
 */

/** How far a ray into the sky is taken through the air, in metres. */
export const SKY_DISTANCE = 100_000;

/** The clear air's density at the valley floor on a crisp day (per metre), and how it thins with height (its scale height, in metres). */
export const AIR = { density: 1.4e-5, height: 2000 } as const;
/** The thickest valley mist (per metre: a hundred metres or so of sight) and the depth of its layer. */
export const MIST = { density: 0.03, height: 45 } as const;
/** The veil of rain or snow at its heaviest, and the depth of its layer. */
const VEIL = { density: 1.2e-3, height: 1000 } as const;

/** How much more the clear air takes of each channel: blue first, so far land turns blue before it fades. */
const BLUE_FIRST = [0.6, 0.85, 1.3] as const;

/** The fog's uniforms, shared with anything that reads the same air (the glow in it). */
export const FOG = {
  /** The light the clear air and the mist glow with. */
  airLight: uniform(1),
  mist: colourUniform(),
  /** The clear air's, the mist's and the veil's density at their floors, per metre. */
  density: uniform(new Vector3()),
  /** The clear air's scale height, the mist's floor, the mist's and the veil's scale heights, in metres. */
  layers: uniform(new Vector4(AIR.height, 0, MIST.height, VEIL.height)),
};

/** The depth of a layer whose density falls off exponentially above its floor, along a ray: the same function as the shader's below. */
export function fogLayerDepth(density: number, floorY: number, height: number, eyeY: number, pointY: number, dist: number): number {
  const h0 = Math.max(eyeY - floorY, -height) / height;
  const h1 = Math.max(pointY - floorY, -height) / height;
  const dh = h1 - h0;
  const e0 = Math.exp(-h0);
  const mean = Math.abs(dh) > 1e-4 ? (e0 - Math.exp(-h1)) / dh : e0;
  return density * dist * mean;
}

function layerDepth(density: Node<"float">, floorY: Node<"float">, height: Node<"float">, eyeY: Node<"float">, pointY: Node<"float">, dist: Node<"float">): Node<"float"> {
  const h0 = max(eyeY.sub(floorY), height.negate()).div(height);
  const h1 = max(pointY.sub(floorY), height.negate()).div(height);
  const dh = h1.sub(h0);
  const e0 = exp(h0.negate());
  const safeDh = select(abs(dh).greaterThan(1e-4), dh, float(1));
const mean = select(abs(dh).greaterThan(1e-4), e0.sub(exp(h1.negate())).div(safeDh), e0);
  return density.mul(dist).mul(mean);
}

/** Where a pixel's ray ends and how long it is: at the surface drawn, or far out along the sky's direction. */
export function rayOf(kind: MaterialKind): { point: Node<"vec3">; dist: Node<"float">; dir: Node<"vec3"> } {
  const dir = normalize(positionWorld.sub(cameraPosition));
  if (kind === "sky") return { point: cameraPosition.add(dir.mul(SKY_DISTANCE)), dist: float(SKY_DISTANCE), dir };
  return { point: positionWorld, dist: positionWorld.sub(cameraPosition).length(), dir };
}

/** The depth of the clear air and of the wet air (mist and the rain's veil) along a ray. */
export function airDepths(point: Node<"vec3">, dist: Node<"float">): { air: Node<"float">; wet: Node<"float"> } {
  const { density, layers } = FOG;
  const eyeY = cameraPosition.y;
  const air = layerDepth(density.x, float(0), layers.x, eyeY, point.y, dist);
  const wet = layerDepth(density.y, layers.y, layers.z, eyeY, point.y, dist).add(layerDepth(density.z, layers.y, layers.w, eyeY, point.y, dist));
  return { air, wet };
}

function fogged(colour: Node<"vec3">, kind: MaterialKind, air: AtmosphereUniforms): Node<"vec3"> {
  const { point, dist, dir } = rayOf(kind);
  const depths = airDepths(point, dist);
  const clear = vec3(...BLUE_FIRST).mul(depths.air);
  const depth = clear.add(depths.wet);
  const through = exp(depth.negate());
  const clearLight = hazeColour(air, dir).mul(FOG.airLight);
  const scattered = clear.mul(clearLight).add(FOG.mist.mul(depths.wet)).div(max(depth, vec3(1e-6)));
  return colour.mul(through).add(scattered.mul(vec3(1).sub(through)));
}

/**
 * The fog's layers now, from the weather: the clear air's, the mist's and the veil's densities at their floors (per
 * metre), and the air's scale height, the mist's floor and the mist's and the veil's scale heights (metres).
 */
export function fogLayers(day: DayState, weather: WeatherNow, density: Vector3, layers: Vector4): void {
  const w = weather.weather;
  const regionAir = REGIONS.reduce((sum, region, i) => sum + weather.regions[i] * REGION_AIR[region], 0);
  // The moments' own haze (thicker at dawn, thinner at noon) moves it half as much as it moves the plain haze.
  const hour = 0.5 + 0.5 * day.light.haze;
  density.set(AIR.density * Math.pow(w.haze / 0.3, 1.2) * regionAir * hour, MIST.density * Math.pow(w.mist, 1.5) * (0.6 + 0.4 * regionAir), VEIL.density * w.precipitation * (1 + w.snow));
  layers.set(AIR.height, weather.floor, MIST.height * (1 + w.precipitation), VEIL.height);
}

/** How much of the light a closed sky lets into the air: rain and overcast are grey, not glaring. */
export function gloomOf(weather: WeatherNow): number {
  const c = weather.weather.cloudCover;
  return 1 - 0.4 * c * c;
}

/** How much of the key light still shines into the air once the cloud covers it. */
export function sunThrough(weather: WeatherNow): number {
  return 1 - 0.9 * smoothstep(0.6, 1, weather.weather.cloudCover);
}

const tint = new Color();
const grey = new Color();

export const FOG_ART: FeatureArt = {
  feature: "fog",
  replacesAir: true,
  stages: [{ kinds: ["land", "ground", "foliage", "solid", "water", "sky"], colour: (colour, { kind, air }) => fogged(colour, kind, air) }],
  frame: ({ day, atmosphere, weather }) => {
    fogLayers(day, weather, FOG.density.value, FOG.layers.value);
    const gloom = gloomOf(weather);
    // The clear air glows the horizon's own colour, as the sky draws it, so the land melts into the sky; the mist is the same light, whiter.
    FOG.airLight.value = gloom;
    const haze = atmosphere.uHwHaze.value;
    grey.copy(haze).lerp(tint.setScalar(0.2126 * haze.r + 0.7152 * haze.g + 0.0722 * haze.b), 0.6).multiplyScalar(0.72 * gloom);
    FOG.mist.value.copy(grey).multiply(blendByRegion(weatherColours().mist, weather.regions, tint));
  },
};
