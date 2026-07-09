/**
 * The cloud field — ONE 2-D noise field on a plane at altitude, evaluated in three places that
 * must agree:
 *
 *  - the **sky dome** shades it (`sky.ts`), so you see the cloud;
 *  - the **cloud shadow map** projects it from the sun (`lighting.ts`), so the cloud darkens the
 *    ground it covers;
 *  - the **CPU twin** (`cloudFieldJs`) integrates it, so exposure, the water's downwelling veil and
 *    the reported sun:sky ratio know how much light the cloud actually removed.
 *
 * That is the whole point of the "one model" thesis: what you SEE and what LIGHTS you are the same
 * function. Change `CLOUD_FIELD_GLSL` and you must change `cloudFieldJs` — the same lock-step
 * contract `ocean.ts` keeps between its shader and `sampleSurface`.
 *
 * The CPU twin is used only for **statistics** (means and integrals), never for per-pixel agreement:
 * `sin()` differs in the last bits between a float GPU and double-precision JS, so the two fields are
 * the same field statistically but not texel-for-texel. Nothing depends on the latter.
 *
 * ## The optical model (phase 1)
 *
 * The noise is a **thickness** in [0, 1], scaled by the genus's optical depth `τ`. Radiative
 * transfer through the slab, with the standard two-stream results for a conservatively scattering
 * cloud of asymmetry `g`:
 *
 *  - **Direct beam** (what survives unscattered, plus the strongly forward-scattered peak that stays
 *    in the beam): `T_beam = exp(−τ·(1−g)/μ)`. The `(1−g)` is the similarity transform — it is why a
 *    cirrus veil of `τ = 0.3` barely dims the sun while `τ = 20` stratus extinguishes it.
 *  - **Total transmittance** (direct + diffuse, the rest reflected back to space):
 *    `T_tot = 1/(1 + 0.75·τ·(1−g))`. At `τ = 20`, `g = 0.8` this is 0.25 — an overcast day lands at
 *    ~25 % of clear-sky illuminance, and `τ = 40` at ~12 %. That is the 10–25 % the brief asks for,
 *    and it falls out of the two-stream solution rather than being dialled in.
 *
 * Phase 3 replaces the *appearance* (thickness, self-shadow taps, phase function, layers) without
 * touching this interface: the light only ever reads `cloudTransmittance` and `τ`.
 */

/** Henyey–Greenstein asymmetry of a water cloud. Near-forward scattering; the textbook value. */
export const CLOUD_ASYMMETRY = 0.8;

/** Longest slant path we let the beam take through the cloud slab (a flat slab diverges at the
 *  horizon; the real curved atmosphere tops out near 38 air masses). */
const MAX_SLAB_PATH = 38;

/** Fraction of the beam surviving a slab of optical depth `tau` at sine-of-elevation `sinH`. */
export const cloudBeamTransmittance = (tau: number, sinH: number): number => {
  if (tau <= 0) return 1;
  const path = Math.min(1 / Math.max(sinH, 1e-4), MAX_SLAB_PATH);
  return Math.exp(-tau * (1 - CLOUD_ASYMMETRY) * path);
};

/** Fraction of incident irradiance reaching the ground at all (direct + diffuse) — two-stream,
 *  conservative scattering. The remainder is reflected back to space by the cloud's albedo. */
export const cloudTotalTransmittance = (tau: number): number =>
  1 / (1 + 0.75 * tau * (1 - CLOUD_ASYMMETRY));

// --- Genus presets -----------------------------------------------------------
// One parameter set per genus. Because the same `tau` feeds the lighting, the light follows the sky
// automatically — that is the "one model" property paying out. Optical depths are the meteorological
// ranges: cirrus 0.1–0.5, fair-weather cumulus high but sparse, stratus 10–40, cumulonimbus 100+.

export interface CloudGenus {
  name: string;
  /** Fraction of the sky the field's mask covers, 0–1. */
  coverage: number;
  /** Optical depth at full thickness. */
  tau: number;
  /** Cloud-base altitude, metres. Sets parallax and how fast the field runs to the horizon. */
  altitude: number;
  /** Horizontal size of one noise feature, metres. */
  featureSize: number;
  /** Width of the coverage threshold's soft edge, in noise units. Sharp = cauliflower cumulus,
   *  wide = featureless stratus. This is the hardcoded `0.3` of three's Sky, set free. */
  edge: number;
  /** Wind velocity over the cloud plane, m/s. */
  wind: [number, number];
}

const GENERA = {
  clear: { name: "Clear", coverage: 0, tau: 0, altitude: 6000, featureSize: 2000, edge: 0.3, wind: [6, 2] },
  cirrus: { name: "Cirrus", coverage: 0.45, tau: 0.35, altitude: 9000, featureSize: 4200, edge: 0.42, wind: [26, 7] },
  cumulus: { name: "Fair-weather cumulus", coverage: 0.3, tau: 18, altitude: 1200, featureSize: 900, edge: 0.1, wind: [7, 2] },
  stratus: { name: "Stratus", coverage: 1, tau: 22, altitude: 700, featureSize: 3000, edge: 0.55, wind: [5, 1] },
  cumulonimbus: { name: "Cumulonimbus", coverage: 0.72, tau: 120, altitude: 900, featureSize: 2600, edge: 0.08, wind: [10, 3] },
} satisfies Record<string, CloudGenus>;

/** The genera by name. Keyed by a real union rather than `string`, so a lookup is TOTAL and callers
 *  cannot pretend to handle a miss that the type system says can never happen. */
export type CloudGenusName = keyof typeof GENERA;
export const CLOUD_GENERA: Record<CloudGenusName, CloudGenus> = GENERA;
export const CLOUD_GENUS_NAMES = Object.keys(GENERA) as CloudGenusName[];

/** Narrow a string that came in over the debug API or the shot suite. */
export const isCloudGenus = (name: string): name is CloudGenusName => name in GENERA;

export const DEFAULT_GENUS: CloudGenusName = "cumulus";

/** The live cloud parameters the sky, the shadow map and the light all read. */
export interface CloudState {
  coverage: number;
  tau: number;
  altitude: number;
  featureSize: number;
  edge: number;
  wind: [number, number];
}

export const cloudStateFromGenus = (g: CloudGenus): CloudState => ({
  coverage: g.coverage,
  tau: g.tau,
  altitude: g.altitude,
  featureSize: g.featureSize,
  edge: g.edge,
  wind: [...g.wind],
});

// --- The field: GLSL ---------------------------------------------------------
// Included by BOTH the sky dome and the cloud-shadow pass, so there is exactly one definition of
// where a cloud is. The including shader declares the uniforms these read: uCloudThreshold,
// uCloudEdge, uCloudFrequency, uCloudOffset.
//
// NB: no backticks anywhere inside the GLSL — it lives in a template literal.

export const CLOUD_FIELD_GLSL = /* glsl */ `
float cloudHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float cloudValueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = cloudHash(i);
  float b = cloudHash(i + vec2(1.0, 0.0));
  float c = cloudHash(i + vec2(0.0, 1.0));
  float d = cloudHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
// 5 octaves, normalised to ~[0,1]. Its distribution is bell-shaped around 0.5 and NARROW, which is
// why the threshold that yields a given sky fraction is not "1 - coverage" — see cloudThreshold().
float cloudFbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  float total = 0.0;
  for (int i = 0; i < 5; i++) {
    value += amplitude * cloudValueNoise(p);
    total += amplitude;
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value / total;
}
// Cloud thickness in [0,1] at a point on the cloud plane, c in METRES.
// uCloudThreshold is supplied by the CPU as the (1 - coverage) QUANTILE of cloudFbm's distribution,
// so coverage really is the fraction of sky covered. The shader never sees coverage itself.
float cloudThickness(vec2 c) {
  vec2 p = c * uCloudFrequency + uCloudOffset;
  float n = cloudFbm(p);
  float halfEdge = uCloudEdge * 0.5;
  return smoothstep(uCloudThreshold - halfEdge, uCloudThreshold + halfEdge, n);
}
// Where the ray from world point p toward the sun pierces the cloud plane, in cloud-plane metres.
// sunDir points FROM the scene TOWARD the sun. Degenerate for a sun at/below the horizon, where
// there is no beam to shadow anyway - the caller gates on that.
vec2 cloudPlaneFromWorld(vec3 p, vec3 sunDir, float altitude) {
  float t = (altitude - p.y) / max(sunDir.y, 1e-3);
  return p.xz + sunDir.xz * t;
}
`;

// --- The field: CPU twin -----------------------------------------------------
// Mirrors CLOUD_FIELD_GLSL term for term. Used ONLY for means/integrals (see the file header).

const hash = (x: number, y: number): number => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
};

const valueNoise = (x: number, y: number): number => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let fx = x - ix;
  let fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
};

const fbm = (x: number, y: number): number => {
  let value = 0;
  let amplitude = 0.5;
  let total = 0;
  let px = x;
  let py = y;
  for (let i = 0; i < 5; i++) {
    value += amplitude * valueNoise(px, py);
    total += amplitude;
    px *= 2;
    py *= 2;
    amplitude *= 0.5;
  }
  return value / total;
};

const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Sorted samples of `fbm`, i.e. its empirical CDF. Built once, lazily.
 *
 * WHY: five octaves of averaged value noise are bell-shaped around 0.5 with a standard deviation near
 * 0.12, NOT uniform on [0,1]. Thresholding at `1 - coverage` therefore covers nothing like `coverage`
 * of the sky — measured, `coverage = 0.3` covered 5 % and `coverage = 0.72` covered 97 %. (This is the
 * same latent bug as three's Sky, whose "coverage 0.4" already floods the dome.)
 *
 * So `coverage` is mapped through this quantile function, and the resulting THRESHOLD is what both
 * the shader and the CPU twin consume. The distribution is a property of the noise alone — it does
 * not depend on feature size, offset or genus — so one table serves everything.
 */
let noiseQuantiles: Float64Array | null = null;
const QUANTILE_SIDE = 96;
const buildNoiseQuantiles = (): Float64Array => {
  const samples = new Float64Array(QUANTILE_SIDE * QUANTILE_SIDE);
  // An irrational stride keeps successive samples from landing on the noise lattice in lock-step.
  const stride = 0.7548776662466927;
  for (let i = 0; i < QUANTILE_SIDE; i++) {
    for (let j = 0; j < QUANTILE_SIDE; j++) {
      samples[i * QUANTILE_SIDE + j] = fbm(i * stride, j * stride * 1.3247179572447458);
    }
  }
  samples.sort();
  return samples;
};

/** The noise threshold whose smoothstep covers `coverage` of the sky. */
export const cloudThreshold = (coverage: number): number => {
  if (coverage <= 0) return 1.001; // above every sample: nothing passes
  if (coverage >= 1) return -0.001; // below every sample: everything passes
  noiseQuantiles ??= buildNoiseQuantiles();
  const q = noiseQuantiles;
  const idx = (1 - coverage) * (q.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(q.length - 1, lo + 1);
  return q[lo] + (q[hi] - q[lo]) * (idx - lo);
};

/** Cloud thickness in [0,1] at a cloud-plane point (metres). CPU twin of GLSL `cloudThickness`. */
export const cloudFieldJs = (
  cx: number,
  cz: number,
  state: CloudState,
  offsetX: number,
  offsetZ: number,
  threshold = cloudThreshold(state.coverage),
): number => {
  if (state.coverage <= 0) return 0;
  const f = 1 / state.featureSize;
  const n = fbm(cx * f + offsetX, cz * f + offsetZ);
  const halfEdge = state.edge * 0.5;
  return smoothstep(threshold - halfEdge, threshold + halfEdge, n);
};

/** Lattice side for the field statistics below. 48² samples over many feature widths is stable to
 *  well under 1 % — the means only need to be right, not reproducible to the last bit. */
const STAT_SIDE = 48;
/** Cloud-plane extent the statistics lattice spans, in feature widths. Wide enough that the sample
 *  sees many independent cells rather than one lucky patch of noise. */
const STAT_SPAN_FEATURES = 24;

export interface CloudStats {
  /** Area fraction actually covered (the mean of the thickness mask). */
  fraction: number;
  /** Mean of `exp(−τ(1−g)·thickness/μ)` over the plane: the factor by which the cloud field, on
   *  average, attenuates the direct beam. The per-pixel version of this is the cloud shadow map, so
   *  the two agree by construction and nothing has to be told what the average "should" be. */
  beamFactor: number;
}

/**
 * Measure the cloud field. Called when the clouds or the sun move, never per frame.
 *
 * `beamFactor` is the spatial mean of the *same* transmittance the shadow map writes, so the scalar
 * the exposure/veil use and the texture the fragments sample cannot drift apart.
 */
export const cloudStats = (state: CloudState, sinH: number): CloudStats => {
  if (state.coverage <= 0 || state.tau <= 0) return { fraction: 0, beamFactor: 1 };
  const path = Math.min(1 / Math.max(sinH, 1e-4), MAX_SLAB_PATH);
  const k = state.tau * (1 - CLOUD_ASYMMETRY) * path;
  const span = state.featureSize * STAT_SPAN_FEATURES;
  const threshold = cloudThreshold(state.coverage);
  let fraction = 0;
  let beam = 0;
  for (let i = 0; i < STAT_SIDE; i++) {
    for (let j = 0; j < STAT_SIDE; j++) {
      const cx = ((i + 0.5) / STAT_SIDE) * span;
      const cz = ((j + 0.5) / STAT_SIDE) * span;
      const t = cloudFieldJs(cx, cz, state, 0, 0, threshold);
      fraction += t;
      beam += Math.exp(-k * t);
    }
  }
  const n = STAT_SIDE * STAT_SIDE;
  return { fraction: fraction / n, beamFactor: beam / n };
};

/**
 * Opacity of the cloud deck looking OUT along a view direction with `dirY = cos(zenith)`.
 * The dome shader computes exactly this; the CPU integral in `lighting.ts` calls it to measure how
 * much of the sky the cloud has replaced.
 */
export const cloudViewOpacity = (thickness: number, dirY: number, tau: number): number => {
  if (tau <= 0 || thickness <= 0) return 0;
  const path = Math.min(1 / Math.max(dirY, 0.05), MAX_SLAB_PATH);
  return 1 - Math.exp(-tau * (1 - CLOUD_ASYMMETRY) * thickness * path);
};
