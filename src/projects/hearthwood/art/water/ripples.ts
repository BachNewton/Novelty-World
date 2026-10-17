import type { FeatureArt } from "../feature-art";

/*
 * Ripples: a few layered waves of a Gerstner-like shape (sharp crests,
 * broad troughs), each smaller and quicker than the last and turned by the
 * golden angle, so no two ever line up into a grid. Their phase is warped by
 * slow noise and their choppiness swells and calms over tens of metres, so
 * the surface never repeats. Where a river runs they turn downstream and run
 * faster. A wave finer than a pixel fades away, so the surface never
 * shimmers from a hand's breadth to the horizon, and the ripples fade at
 * grazing angles, where they would only alias. The normal comes from the
 * height by finite difference.
 */

const GRAVITY = 9.81;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export interface RippleWave {
  /** Which way it runs, x and z, unit length. */
  dir: readonly [number, number];
  /** Its wavelength in metres, its wavenumber and its angular frequency (deep water's: the smaller, the quicker). */
  length: number;
  k: number;
  omega: number;
  /** Its height in metres. */
  amplitude: number;
}

/** The waves, longest first: each `shrink` times the length of the one before, turned by the golden angle, each with the same steepness times `soften`. */
export function rippleWaves(count = 5, longest = 7, shrink = 0.6, steepness = 0.075, soften = 0.85): RippleWave[] {
  return Array.from({ length: count }, (_, i) => {
    const length = longest * shrink ** i;
    const k = (2 * Math.PI) / length;
    const angle = 0.5 + i * GOLDEN_ANGLE;
    return { dir: [Math.cos(angle), Math.sin(angle)], length, k, omega: Math.sqrt(GRAVITY * k), amplitude: (steepness * soften ** i) / k };
  });
}

const WAVES = rippleWaves();

/** The tallest the ripples stand above their troughs, in metres: what parallax steps through. */
export const RIPPLE_HEIGHT = WAVES.reduce((sum, w) => sum + w.amplitude, 0) * 2;

const f = (n: number) => n.toFixed(5);

/** One wave added to the height, faded out where it is finer than the pixel. */
const waveTerms = WAVES.map(
  (w, i) => `
  {
    vec2 d = normalize(mix(vec2(${f(w.dir[0])}, ${f(w.dir[1])}), flowDir, 0.8 * moving));
    float fade = 1.0 - smoothstep(0.12, 0.4, footprint / ${f(w.length)});
    h += ${f(w.amplitude)} * fade * exp(sin(dot(d, q) * ${f(w.k)} - ${f(w.omega)} * pace * t + warp * ${f(1 + i * 0.35)}) - 1.0);
  }`,
).join("");

const RIPPLE_HEAD = /* glsl */ `
// How hard it rains (see engine/weather.ts): rain roughens the water.
uniform float uHwRippleRain;
// The ripples' height at a point of the surface, in metres. footprint is how much of the surface a pixel covers there.
float hwRippleHeight(vec2 p, vec2 flowDir, float moving, float footprint) {
  float t = uHwTime;
  float pace = 1.0 + 1.4 * moving;
  vec2 q = p - flowDir * moving * t * 1.3;
  float warp = (hwValueNoise(p * 0.09 + t * 0.03) - 0.5) * 5.0 + (hwValueNoise(p * 0.31 - t * 0.05) - 0.5) * 1.6;
  float chop = mix(0.35, 1.3, smoothstep(0.2, 0.8, hwValueNoise(p * 0.016 + vec2(t * 0.006, 0.0))));
  chop *= (1.0 + 0.6 * moving) * (1.0 + 0.9 * uHwRippleRain);
  float h = 0.0;
  ${waveTerms}
  return h * chop;
}
`;

const RIPPLE_NORMAL = /* glsl */ `
  float footprint = max(length(fwidth(hwRippleP)), 1e-4);
  float e = max(0.02, footprint * 0.5);
  float h0 = hwRippleHeight(hwRippleP, hwFlowDir, hwMoving, footprint);
  float hx = hwRippleHeight(hwRippleP + vec2(e, 0.0), hwFlowDir, hwMoving, footprint);
  float hz = hwRippleHeight(hwRippleP + vec2(0.0, e), hwFlowDir, hwMoving, footprint);
  vec3 rippled = normalize(vec3(-(hx - h0) / e, 1.0, -(hz - h0) / e));
  // At a grazing look a ripple is finer than the pixel across it: ease them flat.
  float graze = smoothstep(0.015, 0.25, abs(hwView.y));
  hwNormal = normalize(mix(hwNormal, rippled, graze * (1.0 - hwFalling)));
`;

const rain = { uHwRippleRain: { value: 0 } };

export const RIPPLES_ART: FeatureArt = {
  feature: "ripples",
  uniforms: rain,
  chunks: [{ kinds: ["water"], fragmentHead: RIPPLE_HEAD, normal: RIPPLE_NORMAL }],
  frame: ({ weather }) => {
    rain.uHwRippleRain.value = weather.weather.precipitation * (1 - weather.weather.snow);
  },
};

const PARALLAX_STEPS = 4;

/** Steps down through the ripples' height along the view, and reads them where the ray meets them. Without the ripples it has nothing to step through. */
const PARALLAX_NORMAL = /* glsl */ `
  #ifdef HW_RIPPLES
    float footprint = max(length(fwidth(hwRippleP)), 1e-4);
    vec3 into = -hwView;
    // The ray's run across the surface for the whole height, held back at a grazing look.
    vec2 run = into.xz / max(-into.y, 0.25) * ${f(RIPPLE_HEIGHT)};
    float top = ${f(RIPPLE_HEIGHT)};
    float was = 0.0;
    float wasGap = top - hwRippleHeight(hwRippleP, hwFlowDir, hwMoving, footprint);
    for (int i = 1; i <= ${PARALLAX_STEPS}; i++) {
      float s = float(i) / ${PARALLAX_STEPS}.0;
      float gap = top * (1.0 - s) - hwRippleHeight(hwRippleP + run * s, hwFlowDir, hwMoving, footprint);
      if (gap <= 0.0) {
        hwRippleP += run * mix(was, s, clamp(wasGap / max(wasGap - gap, 1e-5), 0.0, 1.0));
        break;
      }
      was = s;
      wasGap = gap;
      if (i == ${PARALLAX_STEPS}) hwRippleP += run;
    }
  #endif
`;

export const RIPPLE_PARALLAX_ART: FeatureArt = {
  feature: "rippleParallax",
  chunks: [{ kinds: ["water"], normal: PARALLAX_NORMAL }],
};
