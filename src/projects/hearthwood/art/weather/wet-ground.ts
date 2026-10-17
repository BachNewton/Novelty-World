import { Color, Vector4 } from "three";
import type { FeatureArt } from "../feature-art";
import { weatherColours } from "../atmosphere/colours";

/*
 * Wet ground and puddles. In and after rain the open, level ground darkens
 * as it soaks, and water gathers in its hollows: puddles placed by noise,
 * on level ground only and never under the trees, filling as the weather's
 * standing water rises and shrinking back to their deepest middles as it
 * dries. A puddle is dark and still, mirrors the sky at a glance with a
 * glint of the sun, and while the rain falls its surface is broken by rings
 * spreading from where each drop lands.
 *
 * The darkening and the puddles are worked out in the `normal` hook, where
 * the ground's slope is known (the surface's colour is still to be lit
 * there), and the mirror in the `light` hook, where the light is.
 */

const uniforms = {
  /** How wet the ground is, how much standing water there is, how hard it rains, and the seconds of motion. */
  uHwWet: { value: new Vector4() },
  uHwWetSky: { value: new Color() },
  uHwWetSun: { value: new Color() },
  uHwPuddle: { value: new Color() },
};

const HEAD = /* glsl */ `
uniform vec4 uHwWet;
uniform vec3 uHwWetSky;
uniform vec3 uHwWetSun;
uniform vec3 uHwPuddle;
// How much of a puddle a pixel is, set where the normal is known and read where the light is.
float hwPuddleHere = 0.0;

float hwWetHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 15731.743); }

// Rings spreading from drops landing on still water: each cell of a grid takes a drop now and then.
vec2 hwRipples(vec2 p, float t) {
  vec2 slope = vec2(0.0);
  for (int layer = 0; layer < 3; layer++) {
    vec2 q = p * 2.2 + float(layer) * vec2(0.37, 0.71);
    vec2 cell = floor(q);
    vec2 inCell = fract(q) - 0.5;
    float seed = hwWetHash(cell + float(layer) * 13.0);
    vec2 at = (vec2(hwWetHash(cell + 3.1), hwWetHash(cell + 7.9)) - 0.5) * 0.5;
    float age = fract(t * (0.9 + 0.5 * seed) + seed);
    vec2 off = inCell - at;
    float d = length(off);
    float radius = age * 0.45;
    float ring = sin((d - radius) * 48.0) * smoothstep(0.09, 0.0, abs(d - radius)) * (1.0 - age) * (1.0 - age);
    slope += off / max(d, 1e-3) * ring;
  }
  return slope * 0.28;
}
`;

const NORMAL = /* glsl */ `
  float hwLevel = smoothstep(0.9, 0.985, hwNormal.y);
  float hwOpen = 1.0;
  #ifdef HW_LAND_FIELDS
    hwOpen = 1.0 - smoothstep(0.25, 0.55, vFields.x);
  #endif
  float hwSoak = uHwWet.x * mix(0.35, 1.0, hwLevel) * mix(0.55, 1.0, hwOpen);
  // Soaked earth and grass are darker and a little richer.
  diffuseColor.rgb = pow(diffuseColor.rgb, vec3(1.0 + 0.35 * hwSoak)) * (1.0 - 0.35 * hwSoak);
  // Puddles in the hollows: a noise field crossing a level that falls as the water rises.
  vec2 hwP = vHwWorld.xz;
  float hwHollow = hwValueNoise(hwP * 0.31) * 0.6 + hwValueNoise(hwP * 1.1 + 5.0) * 0.4;
  float hwFill = 0.88 - 0.17 * uHwWet.y;
  hwPuddleHere = smoothstep(hwFill, hwFill + 0.025, hwHollow) * hwLevel * hwOpen * step(0.01, uHwWet.y);
  diffuseColor.rgb = mix(diffuseColor.rgb, uHwPuddle * mix(vec3(1.0), diffuseColor.rgb * 2.0, 0.35), hwPuddleHere);
  vec2 hwRing = uHwWet.z > 0.01 ? hwRipples(hwP, uHwWet.w) * uHwWet.z : vec2(0.0);
  hwNormal = mix(hwNormal, normalize(vec3(hwRing.x, 1.0, hwRing.y)), hwPuddleHere);
`;

const LIGHT = /* glsl */ `
  if (hwPuddleHere > 0.0) {
    vec3 hwView = normalize(cameraPosition - vHwWorld);
    float hwFacing = max(dot(hwView, hwNormal), 0.0);
    float hwMirror = 0.06 + 0.94 * pow(1.0 - hwFacing, 5.0);
    float hwGlint = pow(max(dot(reflect(-hwView, hwNormal), uHwSunDir), 0.0), 220.0);
    // Still water barely takes light into itself: what shows is what it mirrors.
    hwDirect *= 1.0 - 0.6 * hwPuddleHere;
    hwIndirect = mix(hwIndirect, uHwWetSky, hwMirror * hwPuddleHere);
    hwIndirect += uHwWetSun * hwGlint * hwPuddleHere * 3.0;
  }
`;

export const WET_GROUND_ART: FeatureArt = {
  feature: "wetGround",
  uniforms,
  chunks: [
    { kinds: ["land"], fragmentHead: `#define HW_LAND_FIELDS\n${HEAD}`, normal: NORMAL, light: LIGHT },
    { kinds: ["ground"], fragmentHead: HEAD, normal: NORMAL, light: LIGHT },
  ],
  frame: ({ day, atmosphere, sky, weather }) => {
    const w = weather.weather;
    uniforms.uHwWet.value.set(w.wetness, w.puddles, w.precipitation * (1 - w.snow), day.motion);
    uniforms.uHwWetSky.value.copy(sky.uSky.value).lerp(atmosphere.uHwHaze.value, 0.35).multiplyScalar(0.55 + 0.45 * day.light.ambient);
    uniforms.uHwWetSun.value.copy(atmosphere.uHwSunColor.value).multiplyScalar(day.light.sun * day.sky.key.strength);
    uniforms.uHwPuddle.value.copy(weatherColours().puddle);
  },
};
