import { Color, Vector3, type Material, type WebGLProgramParametersWithUniforms } from "three";

/*
 * The valley's air, shared by everything drawn in it: a haze that lies
 * thickest low in the valley and thins up the mountains, warmed towards the
 * sun, and a gentle grade that tints the shadows towards the moment's own
 * colour. Every material in the valley is patched to end in it, so one set
 * of uniforms moves the whole scene's mood; custom shaders include the same
 * GLSL.
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
  /** The light falling on a surface that lights itself in its own shader (water), from the sky and the sun together. */
  uHwLight: { value: Color };
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
    uHwLight: { value: new Color(1, 1, 1) },
  };
}

export const ATMOSPHERE_GLSL = /* glsl */ `
uniform vec3 uHwHaze;
uniform vec3 uHwSunColor;
uniform vec3 uHwSunDir;
uniform float uHwHazeDensity;
uniform float uHwHazeFalloff;
uniform vec3 uHwShadowTint;
uniform float uHwTime;
uniform vec3 uHwLight;

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

vec3 hwGrade(vec3 colour) {
  float luma = dot(colour, vec3(0.299, 0.587, 0.114));
  vec3 graded = mix(vec3(luma), colour, 1.12);
  return graded + uHwShadowTint * 0.18 * (1.0 - smoothstep(0.0, 0.45, luma));
}

vec3 hwAtmosphere(vec3 colour, vec3 world) {
  vec3 dir = normalize(world - cameraPosition);
  vec3 hazed = mix(colour, hwHazeColour(dir), hwHazeAmount(cameraPosition, world));
  return hwGrade(hazed);
}
`;

const WORLD_POSITION = /* glsl */ `
  vec4 hwWorld = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    hwWorld = instanceMatrix * hwWorld;
  #endif
  vHwWorld = (modelMatrix * hwWorld).xyz;
`;

/** Foliage sways in a breeze: more the higher up the plant, each plant in its own time. */
const SWAY = /* glsl */ `
  #ifdef USE_INSTANCING
    vec3 hwRoot = instanceMatrix[3].xyz;
    float hwPhase = uHwTime * 1.3 + hwRoot.x * 0.21 + hwRoot.z * 0.17;
    float hwBend = position.y * position.y;
    transformed.x += sin(hwPhase) * 0.035 * hwBend;
    transformed.z += cos(hwPhase * 0.8) * 0.025 * hwBend;
  #endif
`;

/** A little noise over the ground, so a field reads as grass and not as paint. */
const GROUND_GRAIN = /* glsl */ `
float hwHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hwValueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hwHash(i), hwHash(i + vec2(1.0, 0.0)), u.x), mix(hwHash(i + vec2(0.0, 1.0)), hwHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

export interface PatchOptions {
  /** Sway in the breeze (an instanced plant whose shape is one unit tall). */
  sway?: boolean;
  /** Grain over the ground's colour. */
  grain?: boolean;
}

/** Ends a built-in material in the valley's air, sharing the atmosphere's uniforms. */
export function breatheAtmosphere<M extends Material>(material: M, atmosphere: AtmosphereUniforms, options: PatchOptions = {}): M {
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, atmosphere);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vHwWorld;\nuniform float uHwTime;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${options.sway ? SWAY : ""}`)
      .replace("#include <fog_vertex>", `#include <fog_vertex>\n${WORLD_POSITION}`);
    let fragment = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec3 vHwWorld;\n${ATMOSPHERE_GLSL}\n${options.grain ? GROUND_GRAIN : ""}`)
      .replace("#include <tonemapping_fragment>", `gl_FragColor.rgb = hwAtmosphere(gl_FragColor.rgb, vHwWorld);\n#include <tonemapping_fragment>`);
    if (options.grain) {
      fragment = fragment.replace(
        "#include <color_fragment>",
        `#include <color_fragment>\n  float hwGrain = hwValueNoise(vHwWorld.xz * 0.9) * 0.6 + hwValueNoise(vHwWorld.xz * 3.1) * 0.4;\n  diffuseColor.rgb *= 0.82 + 0.36 * hwGrain;`,
      );
    }
    shader.fragmentShader = fragment;
  };
  material.customProgramCacheKey = () => `hearthwood:${options.sway ? "s" : ""}${options.grain ? "g" : ""}`;
  return material;
}
