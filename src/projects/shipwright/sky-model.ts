/**
 * The sky's radiance field, as PURE MATH — the CPU twin of `sky.ts`'s GLSL.
 *
 * Two consumers, and they must agree:
 *  - the GPU draws the dome and bakes it to the PMREM env map (`sky.ts`);
 *  - the CPU integrates it to get the **diffuse irradiance** the lighting model keys off
 *    (`lighting.ts` — exposure, the water's downwelling veil, the reported sun:sky ratio).
 *
 * Same relationship as `ocean.ts`'s GLSL/`sampleSurface` pair: one formula, evaluated in two places,
 * kept in lock-step by hand. Change one, change the other — `sky-model.test.ts` pins the shape.
 *
 * The clear-sky term is three's `Sky` (Preetham via the simonwallner single-scattering
 * formulation), unchanged except that the arbitrary `* 0.04` display scale is lifted out: the dome
 * carries no absolute magnitude of its own. `lighting.ts` renormalises it per elevation to a real
 * clear-sky diffuse irradiance, because Preetham's `pow(Lin, 1.5)` collapses the low-sun sky by an
 * order of magnitude (measured: 0.6 W/m² at the horizon against a real ~4). Preetham supplies the
 * DISTRIBUTION and the COLOUR; physics supplies the ENERGY.
 */

/** Linear RGB radiance / irradiance triple. Renderer units: 1.0 = 1000 W/m² (see `lighting.ts`). */
export type Rgb = [number, number, number];

export interface SkyParams {
  /** Preetham haze/aerosol loading. */
  turbidity: number;
  /** Rayleigh scattering multiplier — how blue the zenith is, how red the low sun. */
  rayleigh: number;
  mieCoefficient: number;
  /** Henyey–Greenstein asymmetry of the aerosol phase function (the sun's aureole). */
  mieDirectionalG: number;
}

export const DEFAULT_SKY: SkyParams = {
  turbidity: 3,
  rayleigh: 3,
  mieCoefficient: 0.004,
  mieDirectionalG: 0.8,
};

// --- Preetham constants, verbatim from three's Sky ---------------------------
const TOTAL_RAYLEIGH: Rgb = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
const MIE_CONST: Rgb = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];
const CUTOFF_ANGLE = 1.6110731556870734;
const SUN_STEEPNESS = 1.5;
const EE = 1000;
const RAYLEIGH_ZENITH_LENGTH = 8.4e3;
const MIE_ZENITH_LENGTH = 1.25e3;
/** Vertical optical depth of the ozone Chappuis band at the sRGB primaries, 300 DU. Absorption only —
 *  ozone does not scatter toward you, it removes light from the view path. It eats green (0.025) and
 *  red (0.0395) far more than blue (0.0048), which is what makes a real clear zenith deep BLUE rather
 *  than the CYAN pure Rayleigh gives. three's `Sky` omits it; the beam (`lighting.ts`) already has it,
 *  so the dome disagreed with the beam about the same air. Same numbers, one physical column. */
export const OZONE_ZENITH_TAU: Rgb = [0.0395, 0.025, 0.0048];
/** `(R / (R + h_ozone))²` for the ozone shell at ~25 km — the thin-shell air-mass constant, so ozone's
 *  grazing path stays bounded (~11 air masses at the horizon) instead of following the sea-level slant. */
const OZONE_SHELL_REL2 = Math.pow(6371 / (6371 + 25), 2);
const THREE_OVER_SIXTEEN_PI = 0.05968310365946075;
const ONE_OVER_FOUR_PI = 0.07957747154594767;

/** Preetham's "earth shadow" fade of the extraterrestrial beam as the sun nears the horizon. */
const sunIntensity = (cosZenith: number): number => {
  const c = Math.max(-1, Math.min(1, cosZenith));
  return EE * Math.max(0, 1 - Math.exp(-(CUTOFF_ANGLE - Math.acos(c)) / SUN_STEEPNESS));
};

const totalMie = (turbidity: number): Rgb => {
  const c = 0.2 * turbidity * 1e-17;
  return [0.434 * c * MIE_CONST[0], 0.434 * c * MIE_CONST[1], 0.434 * c * MIE_CONST[2]];
};

const rayleighPhase = (cosTheta: number): number =>
  THREE_OVER_SIXTEEN_PI * (1 + cosTheta * cosTheta);

const hgPhase = (cosTheta: number, g: number): number => {
  const g2 = g * g;
  return (ONE_OVER_FOUR_PI * (1 - g2)) / Math.pow(1 - 2 * g * cosTheta + g2, 1.5);
};

// --- Earth's shadow, and why twilight goes blue ------------------------------
// When the sun is `d` degrees below the horizon, the air along a horizontal line of sight is in the
// planet's shadow up to a height `z = R·(sec d − 1)`. Only the air ABOVE that still scatters direct
// sunlight toward you, so the in-scattering source is attenuated by the fraction of each scatterer's
// column that remains lit: `exp(−z / H)`.
//
// The two scale heights differ by 7x, and that is the whole story of twilight:
//
//   depression | shadow z | aerosol lit (H=1.2 km) | air lit (H=8.4 km)
//        0.5°  |  0.24 km |          0.82          |       0.97
//        1°    |  0.97 km |          0.45          |       0.89
//        2°    |  3.9 km  |          0.04          |       0.63
//        4°    | 15.6 km  |          ~0            |       0.16
//        6°    | 35 km    |           0            |       0.015
//
// The aerosol dies almost at once, taking Preetham's sharp forward-scattering AUREOLE with it; the
// Rayleigh glow lingers, broad and blue. That is why the sunset's hot white spot becomes a wide blue
// twilight arch — and why, before this term existed, a chrome ball still reflected a sun-shaped
// highlight at −6°, which a blind reviewer immediately (and rightly) called out.
const EARTH_RADIUS_KM = 6371;
const RAYLEIGH_SCALE_HEIGHT_KM = 8.4;
const MIE_SCALE_HEIGHT_KM = 1.2;

/** Fraction of a scatterer's column, of scale height `scaleHeightKm`, still lit by the direct beam. */
const sunlitFraction = (elevationRad: number, scaleHeightKm: number): number => {
  if (elevationRad >= 0) return 1;
  const shadowKm = EARTH_RADIUS_KM * (1 / Math.cos(elevationRad) - 1);
  return Math.exp(-shadowKm / scaleHeightKm);
};

/** The per-sun-position terms Preetham hoists into its vertex shader. Build once per sun move. */
export interface SunTerms {
  betaR: Rgb;
  betaM: Rgb;
  sunE: number;
  /** `sin(elevation)` of the sun the dome's SHAPE is evaluated at. */
  sunY: number;
  g: number;
  /** Sunlit fraction of the Rayleigh / Mie columns. 1 above the horizon. See `sunlitFraction`. */
  litRayleigh: number;
  litMie: number;
  /** The beam's colour where it meets each scattering species, at unit luminance. See `sourceTints`. */
  tintRayleigh: Rgb;
  tintMie: Rgb;
}

/**
 * @param shapeElevationRad the elevation the dome's SHAPE is evaluated at — clamped to the horizon.
 * @param trueElevationRad  the sun's real elevation, which may be below it. Only the shadow term
 *                          uses this; everything else is frozen at the sunset geometry.
 * @param tints             `lighting.ts` owns the beam, so it hands us the colour that reaches each
 *                          scattering species rather than this module re-deriving an optical depth it
 *                          has no business owning. Identity tints reproduce raw Preetham.
 */
export const sunTerms = (
  shapeElevationRad: number,
  p: SkyParams,
  trueElevationRad = shapeElevationRad,
  tints: { rayleigh: Rgb; mie: Rgb } = { rayleigh: [1, 1, 1], mie: [1, 1, 1] },
): SunTerms => {
  const mie = totalMie(p.turbidity);
  const sunY = Math.sin(shapeElevationRad);
  return {
    // `vSunfade` is 1 for a unit sun vector (three's own usage), so the rayleigh coefficient reduces
    // to `rayleigh` and the `- (1 - vSunfade)` term drops out. Deliberately not ported.
    betaR: [
      TOTAL_RAYLEIGH[0] * p.rayleigh,
      TOTAL_RAYLEIGH[1] * p.rayleigh,
      TOTAL_RAYLEIGH[2] * p.rayleigh,
    ],
    betaM: [mie[0] * p.mieCoefficient, mie[1] * p.mieCoefficient, mie[2] * p.mieCoefficient],
    sunE: sunIntensity(sunY),
    sunY,
    g: p.mieDirectionalG,
    litRayleigh: sunlitFraction(trueElevationRad, RAYLEIGH_SCALE_HEIGHT_KM),
    litMie: sunlitFraction(trueElevationRad, MIE_SCALE_HEIGHT_KM),
    tintRayleigh: tints.rayleigh,
    tintMie: tints.mie,
  };
};

/**
 * Clear-sky radiance along a direction with `dirY = cos(zenith angle)`, at an angle `cosTheta` from
 * the sun. RAW Preetham units (three's `* 0.04` display scale NOT applied) and WITHOUT the solar
 * disc — the disc is drawn by the dome shader alone, never by the env bake or this integral, so the
 * beam is never counted twice against the `DirectionalLight` that already carries it.
 *
 * ## `L0` is deleted, and it was the twilight bug
 *
 * three's `Sky` adds a floor `L0 = 0.1 · Fex`: a bare constant times the VIEW-path transmittance. It
 * names nothing. Worse, it is angularly INVERTED — `Fex` is ~1 at the zenith (a short path out) and
 * ~0.008 at the horizon (a long one), so the floor is brightest straight up and dark where the sun
 * actually set. In daylight `Lin` buries it (0.6 % of the sunward horizon). Below the horizon `Lin`
 * collapses with the Earth's shadow and the floor does not, because it never depended on the sun at
 * all. Measured share of the zenith's radiance:
 *
 *   sun at  0° → 15 %      sun at −2° → 32 %      sun at −6° → 99.9 %
 *
 * So civil twilight rendered as a warm glow ON TOP of a black horizon: the sunset drawn upside down.
 * Three blind reviewers flagged it independently; one called the −6° frames an outright artifact.
 * A fudge factor is exactly what this overhaul exists to remove, so it is gone rather than tuned, and
 * the dome is now pure in-scattering. `domeScale` re-pins the energy, so daylight barely moves.
 */
export const clearSkyRadiance = (dirY: number, cosTheta: number, t: SunTerms): Rgb => {
  const zenithAngle = Math.acos(Math.max(0, dirY));
  const inverse =
    1 / (Math.cos(zenithAngle) + 0.15 * Math.pow(93.885 - (zenithAngle * 180) / Math.PI, -1.253));
  const sR = RAYLEIGH_ZENITH_LENGTH * inverse;
  const sM = MIE_ZENITH_LENGTH * inverse;
  // Ozone sits in a THIN SHELL at ~25 km, so its air mass toward the horizon does not diverge like the
  // sea-level `inverse` (which runs to ~38): a horizontal ray crosses the ozone layer at a bounded
  // slant. Thin-shell geometry — `sin θ' = (R/(R+h))·sin θ` at the layer — gives a horizon air mass of
  // ~11, not 38, so ozone stops over-dimming the warm twilight horizon while still bluing the zenith.
  const ozoneAirMass = 1 / Math.sqrt(1 - OZONE_SHELL_REL2 * (1 - dirY * dirY));

  const rPhase = rayleighPhase(cosTheta * 0.5 + 0.5);
  const mPhase = hgPhase(cosTheta, t.g);
  const horizonMix = Math.min(1, Math.max(0, Math.pow(1 - t.sunY, 5)));

  const out: Rgb = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const bR = t.betaR[i];
    const bM = t.betaM[i];
    // Extinction along the VIEW path — unaffected by where the sun is. Rayleigh + aerosol scatter the
    // light out; ozone (absorption only, its own thin-shell air mass) removes it, and its red/green
    // bias is what turns Rayleigh's cyan zenith into a real blue one.
    const fex = Math.exp(-(bR * sR + bM * sM + OZONE_ZENITH_TAU[i] * ozoneAirMass));
    // In-scattering SOURCE — only the sunlit part of each column contributes. Numerator only: the
    // denominator is the total scattering coefficient, which does not care about the sun.
    const wR = t.litRayleigh * bR * rPhase;
    const wM = t.litMie * bM * mPhase;
    const ratio = (wR + wM) / (bR + bM);
    let lin = Math.pow(t.sunE * ratio * (1 - fex), 1.5);
    lin *= 1 + (Math.pow(t.sunE * ratio * fex, 0.5) - 1) * horizonMix;
    // Each species scatters the beam that actually reached IT. Applied OUTSIDE the 1.5 power, which
    // is a fit artefact of Preetham's magnitude, not a property of the source: scattered radiance is
    // LINEAR in the incident beam, so raising a chromaticity to 1.5 would just oversaturate it.
    const tint = (wR * t.tintRayleigh[i] + wM * t.tintMie[i]) / Math.max(wR + wM, 1e-12);
    out[i] = lin * tint;
  }
  return out;
};

/**
 * The CIE Standard Overcast Sky shape: `L(θ) = L_zenith · (1 + 2·cos θ) / 3`. Zenith is 3× the
 * horizon, azimuthally uniform, no sun disc. What a thick cloud deck actually looks like, and the
 * distribution the dome blends toward as cloud optical depth rises.
 */
export const cieOvercastShape = (dirY: number): number => (1 + 2 * Math.max(0, dirY)) / 3;

/**
 * Zenith radiance that makes a CIE overcast dome deliver exactly `irradiance` on a horizontal
 * surface. `∫ shape·cos θ dω = 7π/9`, so `L_z = 9·E/(7π)`. Exact, not fitted.
 */
export const cieOvercastZenith = (irradiance: number): number => (9 * irradiance) / (7 * Math.PI);

/** Cosine-weighted hemisphere quadrature resolution for the clear dome. The sun's Mie aureole is
 *  narrow, so the azimuthal axis needs real samples; 96×64 costs ~0.5 ms and is memoised on the sun. */
const PHI_STEPS = 96;
const MU_STEPS = 64;

/**
 * Hemispherical irradiance on a HORIZONTAL surface from the raw clear-sky dome:
 * `E = ∫ L(ω)·cos θ dω`, midpoint rule in `(φ, μ = cos θ)`. Raw Preetham units.
 * The solar disc is excluded (see `clearSkyRadiance`).
 */
export const clearSkyIrradiance = (
  shapeElevationRad: number,
  p: SkyParams,
  trueElevationRad = shapeElevationRad,
  tints: { rayleigh: Rgb; mie: Rgb } = { rayleigh: [1, 1, 1], mie: [1, 1, 1] },
): Rgb => {
  const t = sunTerms(shapeElevationRad, p, trueElevationRad, tints);
  const sunHoriz = Math.cos(shapeElevationRad);
  const out: Rgb = [0, 0, 0];
  for (let m = 0; m < MU_STEPS; m++) {
    const mu = (m + 0.5) / MU_STEPS; // cos(zenith) of the sample direction
    const sinT = Math.sqrt(Math.max(0, 1 - mu * mu));
    for (let f = 0; f < PHI_STEPS; f++) {
      const phi = ((f + 0.5) / PHI_STEPS) * Math.PI * 2;
      // Sun placed at azimuth 0 without loss of generality: the dome is symmetric about it.
      const cosTheta = sinT * Math.cos(phi) * sunHoriz + mu * t.sunY;
      const l = clearSkyRadiance(mu, cosTheta, t);
      out[0] += l[0] * mu;
      out[1] += l[1] * mu;
      out[2] += l[2] * mu;
    }
  }
  const w = (2 * Math.PI) / (PHI_STEPS * MU_STEPS);
  return [out[0] * w, out[1] * w, out[2] * w];
};

/**
 * Solid-angle MEAN radiance of the raw clear dome over the upper hemisphere: `(1/2π)·∫ L dω`.
 *
 * Not the same integral as `clearSkyIrradiance`, which weights by `cos θ` because it asks how much
 * light lands on a flat surface. This one asks how bright the sky LOOKS, which is what an eye and a
 * camera's averaging meter respond to, and it therefore has no cosine. Near a low sun the two diverge
 * by more than an order of magnitude — the aureole is at the horizon, where `cos θ` ≈ 0.
 *
 * The solar disc is excluded, exactly as it is from `clearSkyRadiance` and the env bake.
 */
export const clearSkyMeanRadiance = (
  shapeElevationRad: number,
  p: SkyParams,
  trueElevationRad = shapeElevationRad,
  tints: { rayleigh: Rgb; mie: Rgb } = { rayleigh: [1, 1, 1], mie: [1, 1, 1] },
): Rgb => {
  const t = sunTerms(shapeElevationRad, p, trueElevationRad, tints);
  const sunHoriz = Math.cos(shapeElevationRad);
  const out: Rgb = [0, 0, 0];
  for (let m = 0; m < MU_STEPS; m++) {
    const mu = (m + 0.5) / MU_STEPS;
    const sinT = Math.sqrt(Math.max(0, 1 - mu * mu));
    for (let f = 0; f < PHI_STEPS; f++) {
      const phi = ((f + 0.5) / PHI_STEPS) * Math.PI * 2;
      const cosTheta = sinT * Math.cos(phi) * sunHoriz + mu * t.sunY;
      const l = clearSkyRadiance(mu, cosTheta, t);
      out[0] += l[0];
      out[1] += l[1];
      out[2] += l[2];
    }
  }
  // `dω = dφ dμ` exactly, so uniform samples in (φ, μ) are uniform in SOLID ANGLE and the plain mean
  // of the samples is `(1/2π)·∫ L dω`. No weight, no Jacobian. (The irradiance integral above carries
  // an extra `· mu` precisely because it is NOT this quantity.)
  const n = MU_STEPS * PHI_STEPS;
  return [out[0] / n, out[1] / n, out[2] / n];
};

/** Rec. 709 luminance — how a triple collapses to the single number a light meter reads. */
export const luminance = (c: Rgb): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

export const scaleRgb = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];
