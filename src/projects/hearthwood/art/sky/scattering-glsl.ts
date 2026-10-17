import { DataTexture, DataUtils, HalfFloatType, LinearFilter, RGBAFormat, ClampToEdgeWrapping } from "three";
import { AIR, MULTIPLE_SIZE, TRANSMITTANCE_SIZE, type Table } from "./scattering";
import { SKY_RANGE } from "./sky-light";

/*
 * The physical sky's model in GLSL, the same as `scattering.ts` step for
 * step, reading the same tables uploaded as textures: the sky's dome draws
 * it per pixel, and any other shader can ask it for the sky's colour in a
 * direction (`hwSkyRadiance`).
 */

/** A table as a texture the GPU filters between texels. */
export function tableTexture(table: Table): DataTexture {
  const half = new Uint16Array(table.data.length);
  for (let i = 0; i < table.data.length; i++) half[i] = DataUtils.toHalfFloat(table.data[i]);
  const texture = new DataTexture(half, table.width, table.height, RGBAFormat, HalfFloatType);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

const f = (x: number) => (Number.isInteger(x) ? `${x}.0` : String(x));
const v3 = (c: readonly number[]) => `vec3(${c.map(f).join(", ")})`;

/** Declarations: the tables, the lights, and `hwSkyRadiance(dir)`, the sky's colour along a direction. */
export const SCATTERING_GLSL = /* glsl */ `
uniform sampler2D uHwSkyTransmittance;
uniform sampler2D uHwSkyMultiple;
uniform vec3 uHwSkySun;
uniform vec3 uHwSkySunLight;
uniform vec3 uHwSkySunGlow;
uniform vec3 uHwSkyMoon;
uniform vec3 uHwSkyMoonLight;
uniform vec3 uHwSkyAirglow;
uniform float uHwSkyAltitude;
uniform float uHwSkySaturation;

const float HW_PLANET = ${f(AIR.planet)};
const float HW_TOP = ${f(AIR.top)};
const vec3 HW_RAYLEIGH = ${v3(AIR.rayleigh)};
const vec3 HW_OZONE = ${v3(AIR.ozone)};
const float HW_HORIZON_SPAN = ${f(Math.sqrt(AIR.top * AIR.top - AIR.planet * AIR.planet))};

vec3 hwSkyDensity(float height) {
  return vec3(exp(-height / ${f(AIR.rayleighHeight)}), exp(-height / ${f(AIR.mieHeight)}), max(0.0, 1.0 - abs(height - ${f(AIR.ozoneCentre)}) / ${f(AIR.ozoneHalfWidth)}));
}

float hwSkyToTop(float r, float mu) {
  return max(0.0, -r * mu + sqrt(max(0.0, r * r * (mu * mu - 1.0) + HW_TOP * HW_TOP)));
}

float hwSkyTexel(float x, float size) {
  return 0.5 / size + clamp(x, 0.0, 1.0) * (1.0 - 1.0 / size);
}

// The light from a body at cosine mu from the zenith reaching radius r: none once it is behind the earth, fading over its disc.
vec3 hwSkyTransmittanceTo(float r, float mu) {
  float horizon = -sqrt(max(0.0, 1.0 - (HW_PLANET / r) * (HW_PLANET / r)));
  float visible = smoothstep(horizon - 0.0047, horizon + 0.0047, mu);
  float rho = sqrt(max(0.0, r * r - HW_PLANET * HW_PLANET));
  float dMin = HW_TOP - r;
  float dMax = rho + HW_HORIZON_SPAN;
  float u = (hwSkyToTop(r, max(mu, horizon)) - dMin) / max(1e-6, dMax - dMin);
  vec2 uv = vec2(hwSkyTexel(u, ${f(TRANSMITTANCE_SIZE.width)}), hwSkyTexel(rho / HW_HORIZON_SPAN, ${f(TRANSMITTANCE_SIZE.height)}));
  return texture2D(uHwSkyTransmittance, uv).rgb * visible;
}

vec3 hwSkyMultipleAt(float r, float mu) {
  vec2 uv = vec2(hwSkyTexel(mu * 0.5 + 0.5, ${f(MULTIPLE_SIZE.width)}), hwSkyTexel((r - HW_PLANET) / (HW_TOP - HW_PLANET), ${f(MULTIPLE_SIZE.height)}));
  return texture2D(uHwSkyMultiple, uv).rgb;
}

float hwRayleighPhase(float c) { return 0.0596831 * (1.0 + c * c); }

float hwMiePhase(float c) {
  const float g = ${f(AIR.mieG)};
  const float k = 0.1193662 * (1.0 - g * g) / (2.0 + g * g);
  return k * (1.0 + c * c) / pow(1.0 + g * g - 2.0 * g * c, 1.5);
}

// The light scattered towards the eye along a direction, by the sun and the moon, and the air's own glow, made a little more colourful.
vec3 hwSkyRadiance(vec3 dir) {
  float up = max(dir.y, 0.0);
  vec2 across = dir.xz / max(length(dir.xz), 1e-5) * sqrt(1.0 - up * up);
  vec3 view = vec3(across.x, up, across.y);
  float r = HW_PLANET + max(1.0, uHwSkyAltitude);
  float rayLength = hwSkyToTop(r, view.y);
  float cosSun = dot(view, uHwSkySun);
  float cosMoon = dot(view, uHwSkyMoon);
  vec2 sunPhase = vec2(hwRayleighPhase(cosSun), hwMiePhase(cosSun));
  vec2 moonPhase = vec2(hwRayleighPhase(cosMoon), hwMiePhase(cosMoon));
  vec3 colour = vec3(0.0);
  vec3 through = vec3(1.0);
  float previous = 0.0;
  const int STEPS = 20;
  for (int s = 0; s < STEPS; s++) {
    float next = rayLength * pow(float(s + 1) / float(STEPS), 2.0);
    float t = 0.5 * (previous + next);
    float dt = next - previous;
    previous = next;
    vec3 p = vec3(view.x * t, r + view.y * t, view.z * t);
    float pr = length(p);
    vec3 density = hwSkyDensity(pr - HW_PLANET);
    vec3 sigma = HW_RAYLEIGH * density.x + ${f(AIR.mieExtinction)} * density.y + HW_OZONE * density.z;
    vec3 scatterR = HW_RAYLEIGH * density.x;
    float scatterM = ${f(AIR.mie)} * density.y;
    float muSun = dot(p, uHwSkySun) / pr;
    float muMoon = dot(p, uHwSkyMoon) / pr;
    vec3 source = uHwSkySunLight * (hwSkyTransmittanceTo(pr, muSun) * (scatterR * sunPhase.x + scatterM * sunPhase.y * uHwSkySunGlow) + hwSkyMultipleAt(pr, muSun) * (scatterR + scatterM));
    source += uHwSkyMoonLight * (hwSkyTransmittanceTo(pr, muMoon) * (scatterR * moonPhase.x + scatterM * moonPhase.y) + hwSkyMultipleAt(pr, muMoon) * (scatterR + scatterM));
    vec3 step = exp(-sigma * dt);
    colour += through * source * (1.0 - step) / max(sigma, vec3(1e-12));
    through *= step;
  }
  colour += uHwSkyAirglow * (1.0 + 1.6 * pow(1.0 - up, 3.0));
  float luma = dot(colour, vec3(0.2126, 0.7152, 0.0722));
  colour /= 1.0 + luma / ${f(SKY_RANGE)};
  luma = dot(colour, vec3(0.2126, 0.7152, 0.0722));
  return max(vec3(0.0), vec3(luma) + (colour - luma) * uHwSkySaturation);
}
`;
