/**
 * The physical light model — pure math, no three.js. `sky.ts` renders what this computes.
 *
 * ## The one rule
 *
 * Every number below is either a **published model** or a **measurement of what we render**. There
 * are no constants fitted over elevation bands. `envIntensityForSun`'s `lerp(1.0, 0.45, 30°…90°)`
 * was not wrong because Finland never sees 90° — it was wrong because a band-fitted lerp is not a
 * model. Everything here derives from air mass.
 *
 * ## Units
 *
 * Irradiance is in **kW/m²** (`1.0` renderer unit = 1000 W/m²), so a clear zenith sun on a facing
 * surface is `0.947` and numbers stay near 1. Radiance is kW/m²/sr. The renderer's white point is
 * the **extraterrestrial beam**: `E0` is spectrally flat, so every colour in the scene is put there
 * by the atmosphere, not by a chosen sun tint.
 *
 * ## Where each piece comes from
 *
 * | quantity | source |
 * |---|---|
 * | air mass | Kasten–Young (1989) — `1/sin h` is ~1.5× wrong below 2° |
 * | direct normal irradiance | Meinel & Meinel: `DNI = 1353 · 0.7^(AM^0.678)` W/m² |
 * | beam **colour** | Rayleigh + Ångström aerosol + Chappuis ozone optical depths, pinned so their luminance-weighted transmittance at AM=1 is exactly Meinel's 0.70 |
 * | diffuse horizontal irradiance | Haurwitz (1945) clear-sky GHI, minus the beam |
 * | twilight (h < 3°) | the standard measured horizontal-illuminance table |
 * | cloud transmittance | two-stream, conservative scattering (`clouds.ts`) |
 * | sky **distribution + chromaticity** | Preetham (`sky-model.ts`) |
 *
 * ### Why Preetham supplies the shape but not the energy
 * MEASURED, not assumed: calibrate three's `Sky` so its diffuse horizontal irradiance is 110 W/m² at
 * the zenith, and it then delivers **11.7 W/m² at 10°** and **0.6 W/m² at 0°**, against ~61 and ~4
 * in reality. Its `pow(Lin, 1.5)` is a look hack, not radiative transfer, and it collapses the low-sun
 * sky by an order of magnitude. Using it directly would put the sun:sky ratio at 6.4:1 at 10°, where
 * the physics says ~1:1 — i.e. it would silently re-create the bug this overhaul exists to remove.
 *
 * So: **Preetham gives the dome its angular distribution and its colour; the clear-sky irradiance
 * model gives it its energy.** The dome is renormalised per elevation. This also means `turbidity`
 * and `rayleigh` reshape and recolour the sky without changing how much light it delivers — a
 * deliberate split, and the one place where the rendered sky and a textbook disagree by construction.
 */

import {
  DEFAULT_SKY,
  clearSkyIrradiance,
  cieOvercastShape,
  cieOvercastZenith,
  clearSkyRadiance,
  luminance,
  scaleRgb,
  sunTerms,
  type Rgb,
  type SkyParams,
} from "./sky-model";
import {
  cloudBeamTransmittance,
  cloudTotalTransmittance,
  cloudFieldJs,
  cloudThreshold,
  cloudViewOpacity,
  cloudStats,
  type CloudState,
} from "./clouds";

const DEG = Math.PI / 180;

/** Renderer irradiance unit, in W/m². Keeps a zenith sun near 1.0. */
export const WATTS_PER_UNIT = 1000;

/** Solar constant used by Meinel & Meinel, W/m². */
const SOLAR_CONSTANT = 1353;

/** Luminous efficacy of daylight, lm/W. Converts the twilight illuminance table into irradiance. */
const DAYLIGHT_EFFICACY = 110;

/** Solid angle of the sun's disc, steradians (angular radius 0.267°). The disc's radiance is
 *  `E_beam / Ω`, so integrating the disc returns exactly the beam — no magic disc brightness. */
export const SUN_SOLID_ANGLE = 6.807e-5;

/** Sun's angular radius and mean atmospheric refraction at the horizon, degrees. Together they say
 *  the disc is fully up at h ≥ −0.30° and fully set at h ≤ −0.83°: the sun you watch touch the
 *  horizon is already geometrically below it. Free to get right. */
const SUN_ANGULAR_RADIUS_DEG = 0.267;
const HORIZON_REFRACTION_DEG = 0.567;

/** Diffuse Fresnel reflectance of a flat air→water surface for isotropic sky — the standard 0.066
 *  (Jerlov). Used to get the downwelling irradiance just *under* the surface. */
const WATER_DIFFUSE_FRESNEL = 0.066;

/**
 * Illuminance the sky alone puts on a horizontal surface during twilight, lux, against solar
 * elevation. The standard tabulation — the same one that defines civil (−6°), nautical (−12°) and
 * astronomical (−18°) twilight. Interpolated in log space, which is how it actually behaves.
 */
const TWILIGHT_LUX: [number, number][] = [
  [0, 400],
  [-1, 235],
  [-2, 130],
  [-3, 68],
  [-4, 33],
  [-5, 14],
  [-6, 3.4],
  [-8, 0.35],
  [-10, 0.045],
  [-12, 0.008],
  [-14, 0.0025],
  [-16, 0.0012],
  [-18, 0.0007],
];

/**
 * The single **adaptation** parameter, in lux. Above it the meter tracks the scene and holds middle
 * grey; below it the meter is pinned and the frame genuinely darkens with the real light.
 *
 * `400 lx` is the horizontal illuminance at the instant the sun's disc leaves the refracted horizon —
 * the top of civil twilight, and the last light that is *direct*. So: the exposure is set by the last
 * of the sunlight, and after the sun sets the world simply gets darker. Measured consequence, which is
 * the ladder the reviewers asked for and the physics already knew:
 *
 * | sun | illuminance | stops below middle grey |
 * |---|---|---|
 * | 0°  | 400 lx  | 0    (a properly exposed sunset) |
 * | −2° | 130 lx  | −1.6 |
 * | −4° | 33 lx   | −3.6 |
 * | −6° | 3.4 lx  | −6.9 (civil twilight ends; nearly black) |
 * | −12°| 0.008 lx| −15.6 (night) |
 *
 * The first value tried was `3 lx` — the *bottom* of civil twilight — and it auto-exposed all the way
 * through dusk: −2°, −4° and −6° all rendered at middle grey, a "bright dusk" that three blind
 * reviewers independently called the one thing that was actually wrong.
 *
 * This replaces `exposureForSun`'s `AMBIENT_FLOOR = 0.2`, which existed only because there was no
 * night model. It is deliberately ONE knob, and the doc is explicit that the night *look* — eye
 * adaptation, an artistic lift, the moon — is Kyle's call, not this model's. Drop it toward 3 lx for a
 * fully dark-adapted night; raise it for a scene that falls dark sooner.
 */
export const DEFAULT_ADAPTATION_FLOOR_LUX = 400;

/** Photographic key: the fraction of the display range a mid-grey subject is metered to. 0.18 is the
 *  grey card. Tone-mapper-independent — ACES or AgX then decides where 0.18 lands on screen. */
export const DEFAULT_EXPOSURE_KEY = 0.18;

/** Reflectance of a standard grey card. The scene's "average subject". */
const MIDDLE_GREY_ALBEDO = 0.18;

/** Broadband albedo of what lies below the horizon — mostly sea, a little rock. Lights the undersides
 *  of everything, and is why deleting the hemisphere light costs nothing. */
export const DEFAULT_GROUND_ALBEDO = 0.07;

// --- Air mass and the direct beam -------------------------------------------

/** Kasten–Young (1989) relative optical air mass. Valid to the horizon, where `1/sin h` diverges. */
export const airMass = (elevationDeg: number): number => {
  const h = Math.max(elevationDeg, 0);
  return 1 / (Math.sin(h * DEG) + 0.50572 * Math.pow(h + 6.07995, -1.6364));
};

/**
 * Per-channel optical depth of the whole atmosphere at AM = 1.
 *
 * Rayleigh at the sRGB primaries' effective wavelengths (612 / 549 / 465 nm), plus an Ångström
 * aerosol term `β·λ^−1.3` and the ozone Chappuis band. `β` is not chosen: it is *solved* so that the
 * luminance-weighted transmittance `Σ w_i·exp(−τ_i)` equals Meinel & Meinel's 0.70 exactly. So the
 * magnitude and the colour of the beam come from two independent published models that are forced to
 * agree at one point, and everything else follows from Beer's law.
 */
const beamOpticalDepth = (): Rgb => {
  const lambda = [0.612, 0.549, 0.465];
  const rayleigh = lambda.map((l) => {
    const l2 = 1 / (l * l);
    const l4 = l2 * l2;
    return 0.008569 * l4 * (1 + 0.0113 * l2 + 0.00013 * l4);
  });
  const ozone = [0.0395, 0.025, 0.0048]; // Chappuis, 300 DU column
  const tauFor = (beta: number): Rgb =>
    [0, 1, 2].map((i) => rayleigh[i] + beta * Math.pow(lambda[i], -1.3) + ozone[i]) as Rgb;
  // Bisect β so the luminance-weighted transmittance at AM = 1 is Meinel's 0.70.
  let lo = 0;
  let hi = 0.5;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const t = tauFor(mid).map((x) => Math.exp(-x)) as Rgb;
    if (luminance(t) > 0.7) lo = mid;
    else hi = mid;
  }
  return tauFor((lo + hi) / 2);
};

/** τ(R,G,B) at one air mass. Computed once; `[0.3074, 0.3590, 0.4910]`. */
export const BEAM_OPTICAL_DEPTH: Rgb = beamOpticalDepth();

/**
 * Fraction of the solar disc above the *refracted* horizon. 1 above −0.30°, 0 below −0.83°.
 * Nothing else in the model needs to know the sun has set — the beam simply becomes zero.
 */
export const sunDiscVisibility = (elevationDeg: number): number => {
  const top = SUN_ANGULAR_RADIUS_DEG - HORIZON_REFRACTION_DEG; // -0.300°
  const bottom = -SUN_ANGULAR_RADIUS_DEG - HORIZON_REFRACTION_DEG; // -0.834°
  const t = Math.max(0, Math.min(1, (elevationDeg - bottom) / (top - bottom)));
  return t * t * (3 - 2 * t);
};

/**
 * Direct normal irradiance of the beam, per channel, in renderer units (kW/m²).
 * `DNI_λ = E0 · exp(−τ_λ · AM^0.678)`; its luminance is exactly Meinel & Meinel's
 * `1353 · 0.7^(AM^0.678)`, because that is how `BEAM_OPTICAL_DEPTH` was pinned.
 */
export const beamIrradiance = (elevationDeg: number): Rgb => {
  const visible = sunDiscVisibility(elevationDeg);
  if (visible <= 0) return [0, 0, 0];
  const amp = Math.pow(airMass(elevationDeg), 0.678);
  const k = (SOLAR_CONSTANT / WATTS_PER_UNIT) * visible;
  return [0, 1, 2].map((i) => k * Math.exp(-BEAM_OPTICAL_DEPTH[i] * amp)) as Rgb;
};

// --- Diffuse skylight --------------------------------------------------------

/** Haurwitz (1945) clear-sky global horizontal irradiance, W/m². */
const haurwitzGhi = (elevationDeg: number): number => {
  const cosZ = Math.sin(Math.max(elevationDeg, 0) * DEG);
  if (cosZ <= 0) return 0;
  return 1098 * cosZ * Math.exp(-0.059 / cosZ);
};

/** Log-space interpolation of the measured twilight illuminance table, lux. */
const twilightLux = (elevationDeg: number): number => {
  const table = TWILIGHT_LUX;
  if (elevationDeg >= table[0][0]) return table[0][1];
  const last = table[table.length - 1];
  if (elevationDeg <= last[0]) return last[1];
  for (let i = 0; i < table.length - 1; i++) {
    const [h0, e0] = table[i];
    const [h1, e1] = table[i + 1];
    if (elevationDeg <= h0 && elevationDeg >= h1) {
      const t = (elevationDeg - h0) / (h1 - h0);
      return Math.exp(Math.log(e0) + t * (Math.log(e1) - Math.log(e0)));
    }
  }
  return last[1];
};

/** Elevation at which we hand over from Haurwitz to the twilight table. Haurwitz's GHI drops below
 *  the beam below ~2°, i.e. it stops being a diffuse model there. */
const TWILIGHT_HANDOVER_DEG = 3;

/**
 * Diffuse horizontal irradiance from the whole clear sky, renderer units. Continuous from 90° to
 * −18°: Haurwitz above the handover, the measured twilight table below it, and a log-space blend
 * across the join (which is anchored on the Haurwitz value, so there is no step).
 */
export const clearSkyDhi = (elevationDeg: number): number => {
  const daylightWatts = (h: number) =>
    Math.max(0, haurwitzGhi(h) - luminance(beamIrradiance(h)) * WATTS_PER_UNIT * Math.sin(h * DEG));

  if (elevationDeg >= TWILIGHT_HANDOVER_DEG) {
    return daylightWatts(elevationDeg) / WATTS_PER_UNIT;
  }
  // Below the horizon the measured table IS the model.
  const horizonWatts = twilightLux(0) / DAYLIGHT_EFFICACY;
  if (elevationDeg <= 0) {
    return twilightLux(elevationDeg) / DAYLIGHT_EFFICACY / WATTS_PER_UNIT;
  }
  // 0°…3°: geometric interpolation between the two models' own values at their own anchors, so the
  // curve is continuous at both ends without either being rescaled to flatter the other. (They
  // differ by ~1.5× where they meet — two independent sources, honestly disagreeing.)
  const joinWatts = daylightWatts(TWILIGHT_HANDOVER_DEG);
  const t = elevationDeg / TWILIGHT_HANDOVER_DEG;
  return (
    Math.exp(Math.log(horizonWatts) + t * (Math.log(joinWatts) - Math.log(horizonWatts))) /
    WATTS_PER_UNIT
  );
};

/**
 * Elevation the sky's *shape* is evaluated at. Preetham is undefined for a sun below the horizon —
 * its `sunIntensity` cutoff drives the whole dome to black by −2.3°, which would make the sky snap
 * off at dusk. So we **freeze the dome's geometry at the sunset configuration (h = 0)** and let
 * `clearSkyDhi`'s twilight table scale its total energy down instead.
 *
 * What this gets right: the magnitude at every depression angle (it is measured data), the colour of
 * the horizon glow, and the sun-side/anti-sun asymmetry.
 * What it gets wrong: the glow stays as broad at −6° as it is at sunset, because we do not model the
 * Earth's shadow rising through the atmosphere (no Belt of Venus, no narrowing). That is a known,
 * accepted limitation of freezing the geometry, and it is written down here rather than hidden.
 */
export const skyShapeElevation = (elevationDeg: number): number => Math.max(elevationDeg, 0);

// --- Cached clear-sky dome integral -----------------------------------------
// `clearSkyIrradiance` is a 6144-sample quadrature. It is a pure function of (elevation, params), and
// the sun moves far less often than the frame renders, so memoise on a quantised elevation.

let rawCacheKey = "";
let rawCacheValue: Rgb = [0, 0, 0];
const rawClearSkyIrradiance = (
  shapeElevationDeg: number,
  trueElevationDeg: number,
  params: SkyParams,
): Rgb => {
  const key = `${shapeElevationDeg.toFixed(3)}|${trueElevationDeg.toFixed(3)}|${params.turbidity}|${params.rayleigh}|${params.mieCoefficient}|${params.mieDirectionalG}`;
  if (key !== rawCacheKey) {
    rawCacheKey = key;
    rawCacheValue = clearSkyIrradiance(shapeElevationDeg * DEG, params, trueElevationDeg * DEG);
  }
  return rawCacheValue;
};

// --- The full state ----------------------------------------------------------

/** A directional light. There is one today; a moon would be a second, and nothing may assume
 *  otherwise — no code divides by "the sun's" intensity. */
export interface DirectionalSource {
  name: string;
  /** Unit vector FROM the scene TOWARD the source. */
  direction: [number, number, number];
  /** Normal irradiance, renderer units, BEFORE cloud attenuation (which the shader applies
   *  per-fragment from the cloud shadow map, so applying it here too would double-count). */
  irradiance: Rgb;
  /** Radiance of the source's disc, for the sky dome. `irradiance / solidAngle`. */
  discRadiance: Rgb;
  angularRadius: number;
}

export interface LightingState {
  elevationDeg: number;
  azimuthDeg: number;
  sources: DirectionalSource[];
  /** Scalar by which the raw Preetham dome must be multiplied to carry the physical clear-sky
   *  irradiance. Per elevation, derived — never a hand-fitted band. */
  domeScale: number;
  /** Zenith radiance of the CIE overcast component the dome blends toward under cloud. */
  overcastZenithRadiance: Rgb;
  /** Uniform radiance below the horizon: the ground bouncing the scene's own light back up. */
  groundRadiance: Rgb;
  /** Diffuse irradiance from the whole dome (clouds included) on a horizontal surface. MEASURED by
   *  integrating the dome we actually render, not predicted. */
  skyIrradiance: Rgb;
  /** Beam irradiance on a HORIZONTAL surface, after the cloud field's mean attenuation. */
  beamHorizontal: Rgb;
  /** Total downward irradiance on a horizontal surface. Exposure meters this. */
  horizontalIrradiance: Rgb;
  /** Mean cloud-beam transmittance — the spatial mean of the cloud shadow map. */
  cloudBeamFactor: number;
  /** Mean cloud thickness mask; drives the dome's horizon fade so overcast stays overcast. */
  cloudFraction: number;
  /** Downwelling irradiance just BELOW the water surface, split by source, because the water shader
   *  must attenuate the BEAM half per-fragment by the cloud shadow map (as every other material does)
   *  and leave the sky half alone. Summed, they are the veil. Note `underwaterBeam` carries the
   *  CLEAR-sky beam: the cloud's mean is already in the shadow map, and applying it twice would
   *  double-count. */
  underwaterBeam: Rgb;
  underwaterSky: Rgb;
  /** `renderer.toneMappingExposure`. */
  exposure: number;
  /** Illuminance a light meter reads on a horizontal surface, lux. Diagnostics + the exposure floor. */
  illuminanceLux: number;
}

export interface LightingInput {
  elevationDeg: number;
  azimuthDeg: number;
  sky: SkyParams;
  cloud: CloudState;
  /** Cloud-plane scroll offset (noise units), so the integral sees the same field the shader draws. */
  cloudOffset: [number, number];
  exposureKey: number;
  adaptationFloorLux: number;
  groundAlbedo: number;
}

/** Cosine-weighted hemisphere quadrature for the cloudy dome. Coarser than the clear-sky integral
 *  because it is only ever a correction to a smooth field, and it costs an fbm per sample. */
const DOME_PHI = 48;
const DOME_MU = 32;

/**
 * Integrate the dome we ACTUALLY render — Preetham × `domeScale`, blended toward CIE overcast by the
 * cloud field's per-direction opacity — to get the diffuse irradiance it delivers.
 *
 * Measuring rather than predicting is what keeps "what you see" and "what lights you" the same thing.
 * With no cloud the answer is `clearDhi` by construction, so we skip the integral entirely.
 */
const integrateDome = (
  input: LightingInput,
  domeScale: number,
  overcastZenith: Rgb,
  clearChroma: Rgb,
  clearDhi: number,
  cloudFraction: number,
): Rgb => {
  // With no cloud the dome IS the clear sky, whose irradiance we already know exactly (that is what
  // `domeScale` was built from). Skip 1536 fbm evaluations for the common case.
  if (input.cloud.coverage <= 0 || input.cloud.tau <= 0) return scaleRgb(clearChroma, clearDhi);

  const shapeElRad = skyShapeElevation(input.elevationDeg) * DEG;
  const terms = sunTerms(shapeElRad, input.sky, input.elevationDeg * DEG);
  const sunHoriz = Math.cos(shapeElRad);
  const threshold = cloudThreshold(input.cloud.coverage);
  const out: Rgb = [0, 0, 0];

  for (let m = 0; m < DOME_MU; m++) {
    const mu = (m + 0.5) / DOME_MU;
    const sinT = Math.sqrt(Math.max(0, 1 - mu * mu));
    // Distance along the view ray to the cloud plane. Diverges at the horizon, which is exactly why
    // the shader (and this) fade the sampled thickness toward the field's MEAN there rather than to
    // zero — otherwise an overcast sky would open into clear blue at the horizon.
    const planeDist = input.cloud.altitude / Math.max(mu, 0.02);
    const horizonFade = Math.max(0, Math.min(1, mu / 0.1));
    for (let f = 0; f < DOME_PHI; f++) {
      const phi = ((f + 0.5) / DOME_PHI) * Math.PI * 2;
      const dx = sinT * Math.cos(phi);
      const dz = sinT * Math.sin(phi);
      const cosTheta = dx * sunHoriz + mu * terms.sunY;

      const raw = clearSkyRadiance(mu, cosTheta, terms);
      const sampled = cloudFieldJs(
        dx * planeDist,
        dz * planeDist,
        input.cloud,
        input.cloudOffset[0],
        input.cloudOffset[1],
        threshold,
      );
      const thickness = cloudFraction + (sampled - cloudFraction) * horizonFade;
      const alpha = cloudViewOpacity(thickness, mu, input.cloud.tau);
      const cie = cieOvercastShape(mu);
      for (let i = 0; i < 3; i++) {
        const clear = raw[i] * domeScale;
        const cloudy = overcastZenith[i] * cie;
        // Aerial perspective (see the shader, which does the same thing): the cloud is `planeDist`
        // metres away, and the air between dims it while filling in with airlight. Blue goes first.
        const aerial = Math.exp(-(terms.betaR[i] + terms.betaM[i]) * planeDist);
        out[i] += (clear + (cloudy - clear) * alpha * aerial) * mu;
      }
    }
  }
  const w = (2 * Math.PI) / (DOME_PHI * DOME_MU);
  return [out[0] * w, out[1] * w, out[2] * w];
};

/** Fresnel reflectance of air→water for an unpolarised beam at solar elevation `h` (Schlick is not
 *  good enough at grazing; this is the exact Fresnel average). */
const waterBeamFresnel = (elevationDeg: number): number => {
  if (elevationDeg <= 0) return 1;
  const n = 1.333;
  const cosI = Math.sin(elevationDeg * DEG); // angle from the surface NORMAL is 90° − h
  const sinT = Math.sqrt(Math.max(0, 1 - cosI * cosI)) / n;
  if (sinT >= 1) return 1;
  const cosT = Math.sqrt(1 - sinT * sinT);
  const rs = (cosI - n * cosT) / (cosI + n * cosT);
  const rp = (n * cosI - cosT) / (n * cosI + cosT);
  return Math.min(1, (rs * rs + rp * rp) / 2);
};

/**
 * The whole model, in one pure function. Everything downstream — the sun light, the dome, the
 * exposure, the veil, the ground bounce, the reported ratio — reads this and nothing else.
 */
export const computeLighting = (input: LightingInput): LightingState => {
  const { elevationDeg, azimuthDeg } = input;
  const shapeEl = skyShapeElevation(elevationDeg);
  const sinH = Math.sin(Math.max(elevationDeg, 0) * DEG);

  // Sun direction, matching three's spherical convention in scene.ts.
  const phi = (90 - elevationDeg) * DEG;
  const theta = azimuthDeg * DEG;
  const direction: [number, number, number] = [
    Math.sin(phi) * Math.sin(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.cos(theta),
  ];

  // --- The beam, clear-sky. Clouds are applied per-fragment by the shadow map, so the light itself
  // carries the unattenuated beam and only the CPU-side energy budget uses the mean.
  const beamClear = beamIrradiance(elevationDeg);

  // --- The clear dome: Preetham's shape + chromaticity, the irradiance model's energy.
  const rawClear = rawClearSkyIrradiance(shapeEl, elevationDeg, input.sky);
  const rawLum = Math.max(luminance(rawClear), 1e-12);
  const clearDhi = clearSkyDhi(elevationDeg);
  const domeScale = clearDhi / rawLum;
  const clearChroma: Rgb = [rawClear[0] / rawLum, rawClear[1] / rawLum, rawClear[2] / rawLum];

  // --- Clouds: how much beam survives, on average, and how much energy the deck re-emits downward.
  const stats = cloudStats(input.cloud, sinH);
  const beamHorizontal = scaleRgb(beamClear, stats.beamFactor * sinH);
  const tTot = cloudTotalTransmittance(input.cloud.tau);
  const tBeam = cloudBeamTransmittance(input.cloud.tau, sinH);
  const globalClear: Rgb = [0, 1, 2].map(
    (i) => beamClear[i] * sinH + clearChroma[i] * clearDhi,
  ) as Rgb;
  // How bright the CLOUD ITSELF is, seen from below: of everything that reaches the ground THROUGH a
  // cloud (`tTot · E_global`), the part that arrives as an unscattered beam (`tBeam · E_beam`) is the
  // sun; the rest is the cloud's own glow.
  //
  // Both terms must describe the SAME patch of sky. Subtracting `beamHorizontal` — which is the beam
  // averaged over the whole dome, gaps included — made `E_overcast` go NEGATIVE for any broken deck:
  // at 85° under fair-weather cumulus it was `0.27·1.03 − 0.66 < 0`, clamped to zero, and the clouds
  // rendered PURE BLACK with a black wall wherever the deck stacked up at the horizon. Two blind
  // reviewers called it independently. The gap fraction belongs in the beam's spatial mean (which
  // drives the exposure and the shadow map), never in a single cloud's radiative balance.
  const beamHorizontalClear = scaleRgb(beamClear, sinH);
  const overcastDome: Rgb = [0, 1, 2].map((i) =>
    Math.max(0, tTot * globalClear[i] - tBeam * beamHorizontalClear[i]),
  ) as Rgb;
  const overcastZenithRadiance: Rgb = [0, 1, 2].map((i) =>
    cieOvercastZenith(overcastDome[i]),
  ) as Rgb;

  // --- Measure the dome we render (see integrateDome).
  const skyIrradiance = integrateDome(
    input,
    domeScale,
    overcastZenithRadiance,
    clearChroma,
    clearDhi,
    stats.fraction,
  );

  const horizontalIrradiance: Rgb = [0, 1, 2].map(
    (i) => beamHorizontal[i] + skyIrradiance[i],
  ) as Rgb;
  const illuminanceLux = luminance(horizontalIrradiance) * WATTS_PER_UNIT * DAYLIGHT_EFFICACY;

  // --- Ground bounce: what lies below the horizon reflects the scene's own light back up. This is
  // why `hemiLight` could be deleted rather than replaced — a hemisphere light on top of the PMREM
  // sky was double-counting the sky, and this term is the half it was actually standing in for.
  const groundRadiance = scaleRgb(horizontalIrradiance, input.groundAlbedo / Math.PI);

  // --- Downwelling just under the water surface: the veil, derived at last.
  // `E_d = (1 − F(θ))·E_beam,horizontal + (1 − F_diffuse)·E_sky`.
  //
  // The beam half uses the CLEAR beam. The water shader multiplies it by the same cloud shadow map
  // every other material samples, so a cloud shadow darkens the sea's BODY as well as killing its
  // glitter — which is what actually makes dappled light legible on water. Feeding the cloud-averaged
  // beam in here would count the cloud twice.
  const fBeam = waterBeamFresnel(elevationDeg);
  const underwaterBeam = scaleRgb(beamHorizontalClear, 1 - fBeam);
  const underwaterSky = scaleRgb(skyIrradiance, 1 - WATER_DIFFUSE_FRESNEL);

  // --- Exposure: a real photographic meter. `key / L_avg`, where `L_avg` is the radiance of a grey
  // card lying flat in this scene. No `AMBIENT_FLOOR`; instead the meter bottoms out at a real
  // illuminance (civil twilight) and the frame is allowed to go dark below it.
  const floorIrradiance = input.adaptationFloorLux / (DAYLIGHT_EFFICACY * WATTS_PER_UNIT);
  const meteredIrradiance = Math.max(luminance(horizontalIrradiance), floorIrradiance);
  const greyRadiance = (MIDDLE_GREY_ALBEDO / Math.PI) * meteredIrradiance;
  const exposure = input.exposureKey / Math.max(greyRadiance, 1e-9);

  const sources: DirectionalSource[] =
    luminance(beamClear) > 0
      ? [
          {
            name: "sun",
            direction,
            irradiance: beamClear,
            discRadiance: scaleRgb(beamClear, 1 / SUN_SOLID_ANGLE),
            angularRadius: SUN_ANGULAR_RADIUS_DEG * DEG,
          },
        ]
      : [];

  return {
    elevationDeg,
    azimuthDeg,
    sources,
    domeScale,
    overcastZenithRadiance,
    groundRadiance,
    skyIrradiance,
    beamHorizontal,
    horizontalIrradiance,
    cloudBeamFactor: stats.beamFactor,
    cloudFraction: stats.fraction,
    underwaterBeam,
    underwaterSky,
    exposure,
    illuminanceLux,
  };
};

/** The headline diagnostic: beam vs sky on a HORIZONTAL diffuse surface, the orientation the target
 *  table in `docs/LIGHTING.md` is defined on. `Infinity` would be meaningless, so a dark sky reads 0. */
export const sunSkyRatio = (state: LightingState): number => {
  const sky = luminance(state.skyIrradiance);
  return sky > 0 ? luminance(state.beamHorizontal) / sky : 0;
};

/**
 * Same ratio on a surface whose normal points AT the sun — no `sin h` foreshortening. This is the
 * orientation of the probe that originally found the bug, and it always reads higher, so always say
 * which surface a number refers to.
 *
 * The sky term uses the isotropic view factor of a plane tilted `90° − h` from horizontal,
 * `(1 + sin h)/2`: it sees the whole dome lying flat and half of it standing up. Approximate,
 * because our dome is not isotropic — the GPU probe (`lighting-rig.ts`) measures the real thing.
 */
export const sunSkyRatioSunFacing = (state: LightingState): number => {
  const sky = luminance(state.skyIrradiance);
  if (sky <= 0 || state.sources.length === 0) return 0;
  const beamNormal = luminance(state.sources[0].irradiance) * state.cloudBeamFactor;
  const viewFactor = (1 + Math.sin(Math.max(state.elevationDeg, 0) * DEG)) / 2;
  return beamNormal / (sky * viewFactor);
};

export { DEFAULT_SKY };
export type { Rgb, SkyParams, CloudState };
