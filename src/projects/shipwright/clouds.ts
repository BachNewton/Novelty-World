/**
 * The cloud field — ONE 2-D noise field on a plane at altitude, evaluated in three places that
 * must agree:
 *
 *  - the **sky dome** shades it (`sky.ts`), so you see the cloud;
 *  - the **cloud shadow map** projects it from the sun (`sky.ts`), so the cloud darkens the ground
 *    it covers, and the water it covers;
 *  - the **CPU twin** (`cloudFieldJs`) integrates it, so exposure, the water's downwelling veil and
 *    the reported sun:sky ratio know how much light the cloud actually removed.
 *
 * That is the whole point of the "one model" thesis: what you SEE and what LIGHTS you are the same
 * function. Change `CLOUD_FIELD_GLSL` and you must change the CPU twin — the same lock-step contract
 * `ocean.ts` keeps between its shader and `sampleSurface`.
 *
 * The CPU twin is used only for **statistics** (means and integrals), never for per-pixel agreement:
 * `sin()` differs in the last bits between a float GPU and double-precision JS, so the two fields are
 * the same field statistically but not texel-for-texel. Nothing depends on the latter.
 *
 * ## The optical model
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
 *    ~25 % of clear-sky illuminance, and `τ = 40` at ~14 %. That is the 10–25 % the brief asks for,
 *    and it falls out of the two-stream solution rather than being dialled in.
 *  - **Visual opacity** against the sky behind: the FULL `τ`, no similarity transform. See
 *    `cloudViewOpacity` — getting this wrong made cirrus invisible.
 *
 * ## Phase 3: genus, not a density slider
 *
 * A sailor must be able to name what he is looking at. Five cheap additions get stratus, cumulus,
 * cirrus and cumulonimbus out of one 2-D field:
 *
 *  1. **Thickness, not a mask.** `taper` bleeds the thickness to zero at a cloud's edge, so `τ·h`
 *     does too. Thresholded masks have hard edges; real clouds do not.
 *  2. **Self-shadow taps** along the sun's direction in cloud-plane UV — the single biggest step from
 *     "smear" to "cumulus" (`sky.ts`, `uCloudSunStep`). Lit sides, dark sides.
 *  3. **A Henyey–Greenstein phase** on the view–sun angle: the silver lining when backlit.
 *  4. **Edge sharpness as a parameter** (`edge`), not a hardcoded `0.3`.
 *  5. **Noise character**: `billow` (`1 − |2n − 1|`) for the cauliflower lumps of a convective cloud;
 *     anisotropic `shear` for wind-stretched cirrus streaks.
 *
 * The light reads only `cloudTransmittance` and `τ`, so none of this touches the balance.
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

/**
 * Opacity of the cloud deck looking OUT along a view direction with `dirY = cos(zenith)`.
 *
 * NOTE the FULL `tau`, with no `(1 − g)`. The similarity transform belongs to the BEAM: a photon
 * scattered 2° forward is still, for all practical purposes, in the beam. It does not belong to how
 * opaque a cloud looks against the sky behind it — there, any scattering event replaces the
 * background's radiance with the cloud's own, so the full extinction applies.
 *
 * Getting this wrong made cirrus invisible: `tau = 0.35` with `(1 − g) = 0.2` is a similarity depth of
 * 0.07, i.e. 7 % opacity, and a blind reviewer reported the cirrus frames as "a cloudless-looking sky".
 */
export const cloudViewOpacity = (thickness: number, dirY: number, tau: number): number => {
  if (tau <= 0 || thickness <= 0) return 0;
  const path = Math.min(1 / Math.max(dirY, 0.05), MAX_SLAB_PATH);
  return 1 - Math.exp(-tau * thickness * path);
};

// --- Genus presets -----------------------------------------------------------
// One parameter set per genus. Because the same `tau` feeds the lighting, the light follows the sky
// automatically — that is the "one model" property paying out. Optical depths are the meteorological
// ranges: cirrus 0.1–0.5, fair-weather cumulus high but sparse, stratus 10–40, cumulonimbus 100+.

export interface CloudGenus {
  name: string;
  /** Fraction of the sky the field covers, 0–1. Mapped through the noise's own quantile function. */
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
  /** How much the thickness bleeds to zero at a cloud's edge. 0 = a uniform slab (stratus),
   *  1 = a lens that tapers to nothing (cirrus, cumulus). */
  taper: number;
  /** Billow: `mix(n, 1 − |2n − 1|, billow)`. Turns smooth fBm into the cauliflower lumps of a
   *  convective cloud. 0 for the stratiform genera. */
  billow: number;
  /** Anisotropic sampling. < 1 stretches the field along x, giving wind-sheared cirrus streaks. */
  shear: number;
  /** Wind velocity over the cloud plane, m/s. */
  wind: [number, number];
}

const GENERA = {
  clear: { name: "Clear", coverage: 0, tau: 0, altitude: 6000, featureSize: 2000, edge: 0.3, taper: 0.5, billow: 0, shear: 1, wind: [6, 2] },
  // A thin, flat, backlit sheet with no self-shadowing — which is precisely what the old 2-D model
  // could produce, and why everything used to look like cirrus. Stretched hard along the wind.
  cirrus: { name: "Cirrus", coverage: 0.45, tau: 0.5, altitude: 9000, featureSize: 4200, edge: 0.42, taper: 1, billow: 0, shear: 0.16, wind: [26, 7] },
  // Convective: sharp cauliflower edges, strong self-shadowing, sparse. The genus the cloud shadow
  // map exists for.
  cumulus: { name: "Fair-weather cumulus", coverage: 0.3, tau: 18, altitude: 1200, featureSize: 900, edge: 0.1, taper: 0.9, billow: 0.85, shear: 1, wind: [7, 2] },
  // A featureless slab. Soft edge, no taper, no billow — the light must go flat and shadowless.
  stratus: { name: "Stratus", coverage: 1, tau: 22, altitude: 700, featureSize: 3000, edge: 0.55, taper: 0.15, billow: 0, shear: 1, wind: [5, 1] },
  // tau 250, not 120: measured, 120 put the base at only 2.3x darker than the clear sky beside it,
  // where a real thunderhead's base is ~7-10x darker. At 250 its two-stream transmittance passes
  // ~14 W/m2, i.e. the ~1500 lx a real Cb base actually does.
  cumulonimbus: { name: "Cumulonimbus", coverage: 0.72, tau: 250, altitude: 900, featureSize: 2600, edge: 0.08, taper: 0.5, billow: 0.6, shear: 1, wind: [10, 3] },
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
  taper: number;
  billow: number;
  shear: number;
  wind: [number, number];
}

export const cloudStateFromGenus = (g: CloudGenus): CloudState => ({
  coverage: g.coverage,
  tau: g.tau,
  altitude: g.altitude,
  featureSize: g.featureSize,
  edge: g.edge,
  taper: g.taper,
  billow: g.billow,
  shear: g.shear,
  wind: [...g.wind],
});

// --- The field: GLSL ---------------------------------------------------------
// Included by BOTH the sky dome and the cloud-shadow pass, so there is exactly one definition of
// where a cloud is and how thick it is. The including shader declares the uniforms these read:
// uCloudThreshold, uCloudEdge, uCloudTaper, uCloudBillow, uCloudShear, uCloudFrequency, uCloudOffset.
//
// NB: no backticks anywhere inside the GLSL — it lives in a template literal, and one in a comment
// silently terminates it.

export const CLOUD_FIELD_GLSL = /* glsl */ `
// The +74.7 phase is load-bearing: without it hash(0,0) = fract(sin(0) * 43758) = 0 EXACTLY, and
// because fbm doubles p each octave, (0,0) stays on the degenerate lattice corner in every octave.
// The result is a permanent thin spot in the cloud deck over the world origin -- which is where the
// raft spawns. Caught by the lighting probe (the stratus beam read 8.9x its own model there), never
// by eye.
float cloudHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7)) + 74.7) * 43758.5453123);
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
// why the threshold that yields a given sky fraction is not "1 - coverage" -- see cloudThreshold().
float cloudFbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  float total = 0.0;
  for (int i = 0; i < 5; i++) {
    value += amplitude * cloudValueNoise(p);
    total += amplitude;
    // Translate as well as scale, so successive octaves land on different lattice phases and no
    // single point can sit on a degenerate corner in all five at once.
    p = p * 2.0 + vec2(37.1, 17.3);
    amplitude *= 0.5;
  }
  return value / total;
}
// Genus noise character: billow (1 - |2n-1|) for the cauliflower lumps of a convective cloud,
// anisotropic shear for wind-stretched cirrus streaks.
float cloudShapedNoise(vec2 p) {
  p.x *= uCloudShear;
  float n = cloudFbm(p);
  return mix(n, 1.0 - abs(2.0 * n - 1.0), uCloudBillow);
}
// Cloud THICKNESS in [0,1] at a point on the cloud plane, c in METRES. Not a mask: uCloudTaper bleeds
// it to zero at a cloud's edge, so tau*h does too. A thresholded mask has hard edges; a cloud does not.
//
// uCloudThreshold is supplied by the CPU as the (1 - coverage) QUANTILE of the SHAPED noise's
// distribution, so coverage really is the fraction of sky covered. The shader never sees coverage.
float cloudThickness(vec2 c) {
  float n = cloudShapedNoise(c * uCloudFrequency + uCloudOffset);
  float halfEdge = uCloudEdge * 0.5;
  float mask = smoothstep(uCloudThreshold - halfEdge, uCloudThreshold + halfEdge, n);
  float depth = clamp((n - uCloudThreshold) / max(1.0 - uCloudThreshold, 0.05), 0.0, 1.0);
  return mask * mix(1.0, depth, uCloudTaper);
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
  const s = Math.sin(x * 127.1 + y * 311.7 + 74.7) * 43758.5453123;
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
    px = px * 2 + 37.1;
    py = py * 2 + 17.3;
    amplitude *= 0.5;
  }
  return value / total;
};

const shapedNoise = (x: number, y: number, billow: number, shear: number): number => {
  const n = fbm(x * shear, y);
  return n + (1 - Math.abs(2 * n - 1) - n) * billow;
};

const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Sorted samples of the SHAPED noise, i.e. its empirical CDF, cached per (billow, shear).
 *
 * WHY: five octaves of averaged value noise are bell-shaped around 0.5 with a standard deviation near
 * 0.12, NOT uniform on [0,1] — and `billow` reshapes that distribution again. Thresholding at
 * `1 − coverage` therefore covers nothing like `coverage` of the sky: measured, `coverage = 0.3`
 * covered 5 % and `coverage = 0.72` covered 97 %. (three's Sky has this same latent bug.)
 *
 * So `coverage` is mapped through this quantile function, and the resulting THRESHOLD is what both
 * the shader and the CPU twin consume.
 */
const quantileCache = new Map<string, Float64Array>();
const QUANTILE_SIDE = 96;
const noiseQuantiles = (billow: number, shear: number): Float64Array => {
  const key = `${billow.toFixed(3)}|${shear.toFixed(3)}`;
  const cached = quantileCache.get(key);
  if (cached) return cached;
  const samples = new Float64Array(QUANTILE_SIDE * QUANTILE_SIDE);
  // Irrational strides keep successive samples off the noise lattice in lock-step.
  const stride = 0.7548776662466927;
  for (let i = 0; i < QUANTILE_SIDE; i++) {
    for (let j = 0; j < QUANTILE_SIDE; j++) {
      samples[i * QUANTILE_SIDE + j] = shapedNoise(
        i * stride,
        j * stride * 1.3247179572447458,
        billow,
        shear,
      );
    }
  }
  samples.sort();
  quantileCache.set(key, samples);
  return samples;
};

/** The noise threshold whose smoothstep covers `coverage` of the sky. */
export const cloudThreshold = (state: Pick<CloudState, "coverage" | "billow" | "shear">): number => {
  if (state.coverage <= 0) return 1.001; // above every sample: nothing passes
  if (state.coverage >= 1) return -0.001; // below every sample: everything passes
  const q = noiseQuantiles(state.billow, state.shear);
  const idx = (1 - state.coverage) * (q.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(q.length - 1, lo + 1);
  return q[lo] + (q[hi] - q[lo]) * (idx - lo);
};

/** Scratch for `cloudFieldParts`, so the statistics loop stays allocation-free. */
const fieldParts = { mask: 0, thickness: 0 };

/**
 * The field's two halves at a cloud-plane point (metres). CPU twin of GLSL `cloudThickness`.
 *
 * `mask` is WHETHER there is cloud (its plane-mean is the coverage, by construction of the quantile
 * threshold); `thickness` is HOW MUCH, after `taper` bleeds the rim to nothing. They are different
 * numbers and they are wanted in different places — conflating them made a `coverage: 0.3` deck report
 * a covered fraction of 0.38, because a tapered rim is still cloud.
 */
const cloudFieldParts = (
  cx: number,
  cz: number,
  state: CloudState,
  offsetX: number,
  offsetZ: number,
  threshold: number,
): typeof fieldParts => {
  const f = 1 / state.featureSize;
  const n = shapedNoise(cx * f + offsetX, cz * f + offsetZ, state.billow, state.shear);
  const halfEdge = state.edge * 0.5;
  const mask = smoothstep(threshold - halfEdge, threshold + halfEdge, n);
  const depth = Math.max(0, Math.min(1, (n - threshold) / Math.max(1 - threshold, 0.05)));
  fieldParts.mask = mask;
  fieldParts.thickness = mask * (1 + (depth - 1) * state.taper);
  return fieldParts;
};

/** Cloud thickness in [0,1] at a cloud-plane point (metres). CPU twin of GLSL `cloudThickness`. */
export const cloudFieldJs = (
  cx: number,
  cz: number,
  state: CloudState,
  offsetX: number,
  offsetZ: number,
  threshold = cloudThreshold(state),
): number => {
  if (state.coverage <= 0) return 0;
  return cloudFieldParts(cx, cz, state, offsetX, offsetZ, threshold).thickness;
};

/** Lattice side for the field statistics below. 40² samples over many feature widths is stable to
 *  well under 1 % — the means only need to be right, not reproducible to the last bit. */
const STAT_SIDE = 40;
/** Cloud-plane extent the statistics lattice spans, in feature widths. Wide enough that the sample
 *  sees many independent cells rather than one lucky patch of noise. */
const STAT_SPAN_FEATURES = 24;

export interface CloudStats {
  /** Area fraction actually covered — the mean of the MASK, so it tracks `coverage`. */
  fraction: number;
  /** Mean THICKNESS over the whole plane, gaps included. This is what the dome fades toward at the
   *  horizon, where the cloud-plane coordinate runs away: fading to the covered fraction instead
   *  would make a tapered deck read as thicker than it is. */
  planeThickness: number;
  /** Mean of `exp(−τ(1−g)·thickness/μ)` over the plane: the factor by which the cloud field, on
   *  average, attenuates the direct beam. The per-pixel version of this is the cloud shadow map, so
   *  the two agree by construction and nothing has to be told what the average "should" be. */
  beamFactor: number;
  /** Mean thickness WHERE THERE IS CLOUD. `τ · meanThickness` is the optical depth of a typical
   *  cloud, which is what its radiative balance must use once `taper` makes thickness vary. */
  meanThickness: number;
  /** Mean of the dome's sun-shading modulation, so the shader can divide by it and redistribute the
   *  cloud's radiance (lit sides, dark sides) without inventing or destroying energy. */
  shadeMean: number;
}

/** Fraction of the ambient (multiply-scattered) share in a cloud's radiance; the rest is single
 *  scatter from the sun, and is what self-shadowing modulates. */
export const CLOUD_SCATTER_SHARE = 0.55;

/** How far the self-shadow taps march along the sun's direction, in feature widths, and how many. */
export const CLOUD_SHADOW_TAPS = 3;
export const CLOUD_SHADOW_STEP_FEATURES = 0.22;

/**
 * Memo. Every entry costs 1600 lattice points x 4 fbm evaluations, and the statistics are SMOOTH in
 * the sun's position, so a coarse key is honest: quantising `sinH` and the sun's plane direction lets
 * a benchmark's continuous day-sweep hit the cache on most frames instead of paying ~2.5 ms each.
 */
const statsCache = new Map<string, CloudStats>();
const STATS_CACHE_LIMIT = 64;

/**
 * Measure the cloud field. Called when the clouds or the sun move, never per frame.
 *
 * `beamFactor` is the spatial mean of the *same* transmittance the shadow map writes, so the scalar
 * the exposure/veil use and the texture the fragments sample cannot drift apart.
 */
export const cloudStats = (state: CloudState, sinH: number, sunPlane: [number, number]): CloudStats => {
  if (state.coverage <= 0 || state.tau <= 0) {
    return { fraction: 0, planeThickness: 0, beamFactor: 1, meanThickness: 0, shadeMean: 1 };
  }
  const key = [
    state.coverage, state.tau, state.featureSize, state.edge, state.taper, state.billow, state.shear,
    Math.round(sinH * 60), Math.round(sunPlane[0] * 24), Math.round(sunPlane[1] * 24),
  ].join(",");
  const hit = statsCache.get(key);
  if (hit) return hit;
  const path = Math.min(1 / Math.max(sinH, 1e-4), MAX_SLAB_PATH);
  const k = state.tau * (1 - CLOUD_ASYMMETRY) * path;
  const span = state.featureSize * STAT_SPAN_FEATURES;
  const threshold = cloudThreshold(state);
  const stepX = sunPlane[0] * state.featureSize * CLOUD_SHADOW_STEP_FEATURES;
  const stepZ = sunPlane[1] * state.featureSize * CLOUD_SHADOW_STEP_FEATURES;

  let maskSum = 0;
  let thicknessSum = 0;
  let beam = 0;
  let shade = 0;
  for (let i = 0; i < STAT_SIDE; i++) {
    for (let j = 0; j < STAT_SIDE; j++) {
      const cx = ((i + 0.5) / STAT_SIDE) * span;
      const cz = ((j + 0.5) / STAT_SIDE) * span;
      const parts = cloudFieldParts(cx, cz, state, 0, 0, threshold);
      const t = parts.thickness;
      maskSum += parts.mask;
      thicknessSum += t;
      beam += Math.exp(-k * t);

      // The same self-shadow march the dome does, so `shadeMean` really is the mean of what is drawn.
      let sunDepth = 0;
      for (let s = 1; s <= CLOUD_SHADOW_TAPS; s++) {
        sunDepth += cloudFieldJs(cx + stepX * s, cz + stepZ * s, state, 0, 0, threshold);
      }
      const tSun = Math.exp(
        -state.tau * (1 - CLOUD_ASYMMETRY) * sunDepth * CLOUD_SHADOW_STEP_FEATURES,
      );
      shade += CLOUD_SCATTER_SHARE + (1 - CLOUD_SCATTER_SHARE) * tSun;
    }
  }
  const n = STAT_SIDE * STAT_SIDE;
  const result: CloudStats = {
    fraction: maskSum / n,
    planeThickness: thicknessSum / n,
    beamFactor: beam / n,
    // Thickness WHERE THERE IS CLOUD: `tau * this` is the optical depth of a typical cloud, which is
    // what its radiative balance must use once `taper` makes the thickness vary.
    meanThickness: maskSum > 0 ? thicknessSum / maskSum : 0,
    shadeMean: Math.max(shade / n, 1e-3),
  };
  if (statsCache.size >= STATS_CACHE_LIMIT) statsCache.clear();
  statsCache.set(key, result);
  return result;
};
