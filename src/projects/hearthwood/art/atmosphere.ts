import { Color, Vector3 } from "three";
import { featureDefine } from "../features";

/*
 * The valley's air, shared by everything drawn in it: a haze that lies
 * thickest low in the valley and thins up the mountains, warmed towards the
 * sun. Every material in the valley ends in it (see `shading.ts`), so one
 * set of uniforms moves the whole scene's mood. The colour grade, shadows'
 * tint and all, is a pass over the finished frame (`light/grade.ts`).
 */

export interface AtmosphereUniforms {
  uHwHaze: { value: Color };
  uHwSunColor: { value: Color };
  uHwSunDir: { value: Vector3 };
  /** How thick the haze is at the valley floor, per metre. */
  uHwHazeDensity: { value: number };
  /** How quickly it thins with height, per metre. */
  uHwHazeFalloff: { value: number };
  uHwShadowTint: { value: Color };
  /** Seconds, for anything that moves. */
  uHwTime: { value: number };
  /** The light falling on a surface that lights itself in its own shader (water): from the sky and the ground all round, and from the sun (or moon). */
  uHwSkyLight: { value: Color };
  uHwSunLight: { value: Color };
  /** The key light's colour times its intensity, exactly as the directional light shines it (the sun's or the moon's). */
  uHwKeyLight: { value: Color };
}

export function makeAtmosphere(): AtmosphereUniforms {
  return {
    uHwHaze: { value: new Color() },
    uHwSunColor: { value: new Color() },
    uHwSunDir: { value: new Vector3(0, 1, 0) },
    uHwHazeDensity: { value: 0.004 },
    uHwHazeFalloff: { value: 0.016 },
    uHwShadowTint: { value: new Color() },
    uHwTime: { value: 0 },
    uHwSkyLight: { value: new Color(1, 1, 1) },
    uHwSunLight: { value: new Color() },
    uHwKeyLight: { value: new Color() },
  };
}

/** The air's uniforms, declared for any shader stage. */
export const ATMOSPHERE_UNIFORMS_GLSL = /* glsl */ `
uniform vec3 uHwHaze;
uniform vec3 uHwSunColor;
uniform vec3 uHwSunDir;
uniform float uHwHazeDensity;
uniform float uHwHazeFalloff;
uniform vec3 uHwShadowTint;
uniform float uHwTime;
uniform vec3 uHwSkyLight;
uniform vec3 uHwSunLight;
uniform vec3 uHwKeyLight;
`;

/** Value noise, for anything drawn that wants a little unevenness. */
export const NOISE_GLSL = /* glsl */ `
float hwHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hwValueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hwHash(i), hwHash(i + vec2(1.0, 0.0)), u.x), mix(hwHash(i + vec2(0.0, 1.0)), hwHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

/** The air's uniforms and the functions that end a colour in it: the haze. */
export const ATMOSPHERE_GLSL = /* glsl */ `
${ATMOSPHERE_UNIFORMS_GLSL}

// The haze's colour along a view direction: warmer towards the sun.
vec3 hwHazeColour(vec3 dir) {
  float toSun = max(dot(dir, uHwSunDir), 0.0);
  return mix(uHwHaze, uHwSunColor, 0.4 * pow(toSun, 6.0) * smoothstep(-0.1, 0.15, uHwSunDir.y));
}

// Height haze integrated along the ray from the eye: thick on the valley floor, thin up high.
float hwHazeAmount(vec3 eye, vec3 world) {
  vec3 ray = world - eye;
  float dist = length(ray);
  float k = uHwHazeFalloff;
  float rise = ray.y * k;
  float base = exp(-max(eye.y, -10.0) * k);
  float along = abs(rise) > 1e-3 ? (1.0 - exp(-rise)) / rise : 1.0;
  return 1.0 - exp(-uHwHazeDensity * base * along * dist);
}

vec3 hwAtmosphere(vec3 colour, vec3 world) {
  // With the fog feature on, its own air takes the haze's place, at the colour hook.
  #ifdef ${featureDefine("fog")}
    return colour;
  #else
    vec3 dir = normalize(world - cameraPosition);
    return mix(colour, hwHazeColour(dir), hwHazeAmount(cameraPosition, world));
  #endif
}
`;
