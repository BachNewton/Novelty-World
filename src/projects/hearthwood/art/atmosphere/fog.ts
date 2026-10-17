import { Color, Vector3, Vector4 } from "three";
import { REGIONS } from "../../engine/regions";
import type { FeatureArt } from "../feature-art";
import { REGION_AIR } from "../palette";
import { smoothstep } from "../../engine/noise";
import { blendByRegion, weatherColours } from "./colours";

/*
 * Fog: the air between the eye and what it sees, worked out per pixel along
 * the ray. Two kinds of air mix in it. The clear air scatters blue more than
 * red (as Rayleigh scattering does), so far land turns blue before it fades
 * into the horizon's colour, and it thins slowly with height. Mist and the
 * veil of rain are droplets, which scatter forward (as Mie scattering does),
 * so they glow white towards the sun; the mist lies in a shallow layer on
 * the valley floor round the camera, so it pools in the valleys and the
 * ridges stand out of it, and the rain's veil reaches higher. How thick each
 * is comes from the weather: a crisp clear day shows the land out to the
 * horizon, a damp dawn fills the valleys with mist that lifts by noon, and a
 * downpour closes the view in. The mist takes the colour of the region the
 * camera is in, blended across their borders.
 *
 * Each layer's density falls off exponentially with height, so its depth
 * along a ray has a closed form: correct from a hand's breadth to the
 * horizon, and on rays into the sky, whose depth the falling density keeps
 * finite. With the fog on, the plain haze every material ends in steps
 * aside (see `atmosphere.ts`) and this takes its place, after the grade.
 */

/** How far a ray into the sky is taken through the air, in metres. */
export const SKY_DISTANCE = 100_000;

/** The clear air's density at the valley floor on a crisp day (per metre), and how it thins with height (its scale height, in metres). */
export const AIR = { density: 1.4e-5, height: 1600 } as const;
/** The thickest valley mist (per metre: a hundred metres or so of sight) and the depth of its layer. */
export const MIST = { density: 0.03, height: 32 } as const;
/** The veil of rain or snow at its heaviest, and the depth of its layer. */
const VEIL = { density: 1.2e-3, height: 700 } as const;

export const FOG_GLSL = /* glsl */ `
uniform vec3 uHwFogAir;
uniform vec3 uHwFogSun;
uniform vec3 uHwFogMist;
// The clear air's, the mist's and the veil's density at their floors, per metre.
uniform vec3 uHwFogDensity;
// The clear air's scale height, the mist's floor, the mist's and the veil's scale heights, in metres.
uniform vec4 uHwFogLayers;

// The depth of a layer whose density falls off exponentially above its floor, along a ray from the eye to a point.
float hwFogLayer(float density, float floorY, float height, float eyeY, float pointY, float dist) {
  float h0 = max(eyeY - floorY, -height) / height;
  float h1 = max(pointY - floorY, -height) / height;
  float dh = h1 - h0;
  float e0 = exp(-h0);
  float mean = abs(dh) > 1e-4 ? (e0 - exp(-h1)) / dh : e0;
  return density * dist * mean;
}

// Forward scattering by droplets (Henyey-Greenstein), 1 for light scattered evenly.
float hwFogForward(float cosine, float g) {
  float gg = g * g;
  return (1.0 - gg) / pow(1.0 + gg - 2.0 * g * cosine, 1.5);
}

vec3 hwFog(vec3 colour, vec3 point, float dist) {
  vec3 eye = cameraPosition;
  vec3 dir = normalize(point - eye);
  float air = hwFogLayer(uHwFogDensity.x, 0.0, uHwFogLayers.x, eye.y, point.y, dist);
  float wet = hwFogLayer(uHwFogDensity.y, uHwFogLayers.y, uHwFogLayers.z, eye.y, point.y, dist)
    + hwFogLayer(uHwFogDensity.z, uHwFogLayers.y, uHwFogLayers.w, eye.y, point.y, dist);
  // The clear air takes the blue out first, so far land turns blue before it fades.
  vec3 airDepth = air * vec3(0.6, 0.85, 1.3);
  float cosine = dot(dir, uHwSunDir);
  vec3 airLight = uHwFogAir + uHwFogSun * 0.45 * pow(max(cosine, 0.0), 5.0);
  vec3 wetLight = uHwFogMist + uHwFogSun * 0.07 * hwFogForward(cosine, 0.62);
  vec3 depth = airDepth + vec3(wet);
  vec3 through = exp(-depth);
  vec3 scattered = (airDepth * airLight + wet * wetLight) / max(depth, vec3(1e-6));
  return colour * through + scattered * (1.0 - through);
}
`;

/** The depth of a layer whose density falls off exponentially above its floor, along a ray: `hwFogLayer` in the GLSL above, the same function. */
export function fogLayerDepth(density: number, floorY: number, height: number, eyeY: number, pointY: number, dist: number): number {
  const h0 = Math.max(eyeY - floorY, -height) / height;
  const h1 = Math.max(pointY - floorY, -height) / height;
  const dh = h1 - h0;
  const e0 = Math.exp(-h0);
  const mean = Math.abs(dh) > 1e-4 ? (e0 - Math.exp(-h1)) / dh : e0;
  return density * dist * mean;
}

const uniforms = {
  uHwFogAir: { value: new Color() },
  uHwFogSun: { value: new Color() },
  uHwFogMist: { value: new Color() },
  uHwFogDensity: { value: new Vector3() },
  uHwFogLayers: { value: new Vector4(AIR.height, 0, MIST.height, VEIL.height) },
};

const tint = new Color();
const light = new Color();
const sun = new Color();

export const FOG_ART: FeatureArt = {
  feature: "fog",
  uniforms,
  chunks: [
    {
      kinds: ["land", "ground", "foliage", "solid", "water"],
      fragmentHead: FOG_GLSL,
      colour: /* glsl */ `hwColour = hwFog(hwColour, vHwWorld, length(vHwWorld - cameraPosition));`,
    },
    {
      kinds: ["sky"],
      fragmentHead: FOG_GLSL,
      colour: /* glsl */ `
        vec3 hwDir = normalize(vHwWorld - cameraPosition);
        hwColour = hwFog(hwColour, cameraPosition + hwDir * ${SKY_DISTANCE.toFixed(1)}, ${SKY_DISTANCE.toFixed(1)});
      `,
    },
  ],
  frame: ({ day, atmosphere, sky, weather }) => {
    const w = weather.weather;
    const regionAir = REGIONS.reduce((sum, region, i) => sum + weather.regions[i] * REGION_AIR[region], 0);
    // The moments' own haze (thicker at dawn, thinner at noon) moves it half as much as it moves the plain haze.
    const hour = 0.5 + 0.5 * day.light.haze;
    uniforms.uHwFogDensity.value.set(
      AIR.density * Math.pow(w.haze / 0.3, 1.2) * regionAir * hour,
      MIST.density * Math.pow(w.mist, 1.5) * (0.6 + 0.4 * regionAir),
      VEIL.density * w.precipitation * (1 + w.snow),
    );
    uniforms.uHwFogLayers.value.set(AIR.height, weather.floor, MIST.height * (1 + w.precipitation), VEIL.height);
    // The air glows the horizon's colour, a little bluer overhead; the mist is lit by the sky and the sun.
    uniforms.uHwFogAir.value.copy(atmosphere.uHwHaze.value).lerp(sky.uSky.value, 0.2);
    // Under a closing sky the sun no longer shines into the air: its glow fades as the cloud covers it.
    const through = 1 - 0.9 * smoothstep(0.6, 1, w.cloudCover);
    uniforms.uHwFogSun.value.copy(atmosphere.uHwSunColor.value).multiplyScalar(day.light.sun * day.sky.key.strength * 0.4 * through);
    light.copy(atmosphere.uHwSkyLight.value).multiplyScalar(0.85).add(sun.copy(atmosphere.uHwSunLight.value).multiplyScalar(0.9));
    uniforms.uHwFogMist.value.copy(light).multiply(blendByRegion(weatherColours().mist, weather.regions, tint));
  },
};
