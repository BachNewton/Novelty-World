import { describe, expect, it } from "vitest";
import {
  DEFAULT_ADAPTATION_FLOOR_LUX,
  DEFAULT_EXPOSURE_KEY,
  DEFAULT_GROUND_ALBEDO,
  DEFAULT_SKY,
  HORIZON_FADE_MU,
  sourceTints,
  clearSkyDhi,
  computeLighting,
  skyShapeElevation,
  sunSkyRatio,
  type LightingInput,
} from "./lighting";
import { clearSkyRadiance, luminance, sunTerms } from "./sky-model";
import { CLOUD_GENERA, cloudStateFromGenus } from "./clouds";

const input = (over: Partial<LightingInput> = {}): LightingInput => ({
  elevationDeg: 30,
  azimuthDeg: 135,
  sky: DEFAULT_SKY,
  cloud: cloudStateFromGenus(CLOUD_GENERA.clear),
  cloudOffset: [0, 0],
  exposureKey: DEFAULT_EXPOSURE_KEY,
  adaptationFloorLux: DEFAULT_ADAPTATION_FLOOR_LUX,
  groundAlbedo: DEFAULT_GROUND_ALBEDO,
  ...over,
});

describe("diffuse skylight", () => {
  it("is continuous through the twilight handover", () => {
    const below = clearSkyDhi(2.999);
    const above = clearSkyDhi(3.001);
    expect(below / above).toBeCloseTo(1, 2);
    const atZero = clearSkyDhi(0);
    const justAbove = clearSkyDhi(0.001);
    expect(atZero / justAbove).toBeCloseTo(1, 2);
  });
});

describe("exposure", () => {
  /** The rendered, pre-tonemap luminance of a grey card lying flat in the scene. */
  const greyCard = (h: number) => {
    const s = computeLighting(input({ elevationDeg: h }));
    return s.exposure * (0.18 / Math.PI) * luminance(s.horizontalIrradiance);
  };

  it("meters the SCENE's average luminance, not a grey card on the ground", () => {
    // An averaging meter places the scene's own average at middle grey. The first version metered
    // `(0.18/pi) * E_horizontal` -- an incident meter with a cosine receptor, which no camera and no
    // retina is. Its consequence was measured: at a 0 degree sun it pinned the sea at a rendered 0.07
    // and to do so put 36% of the sky hemisphere above the white point, where AgX desaturates it to
    // cream. Three blind reviewers called those sunsets "a pale wash".
    for (const h of [90, 53, 30, 10, 4.5, 1, 0]) {
      const s = computeLighting(input({ elevationDeg: h }));
      expect(s.fieldLuminance * s.exposure).toBeCloseTo(DEFAULT_EXPOSURE_KEY, 4);
    }
  });

  it("does NOT hold a grey card at middle grey, because the sea is darker than one", () => {
    // The corollary, and the thing that makes a sunset a sunset. A scene whose average is below 18%
    // reflectance renders a grey card ABOVE middle grey; a scene dominated by a blazing sky renders
    // it far below. If a refactor ever pins the card back to 0.18 at every elevation, the meter has
    // silently gone back to metering the ground.
    expect(greyCard(90)).toBeGreaterThan(DEFAULT_EXPOSURE_KEY * 1.5);
    expect(greyCard(0)).toBeLessThan(DEFAULT_EXPOSURE_KEY);
  });

  it("stops down as the sky takes over the field of view", () => {
    // The whole sunset fix in one assertion. As the sun drops, the sky's mean radiance falls far more
    // slowly than the light landing on a horizontal surface (the aureole sits where cos(theta) ~ 0),
    // so the sky's SHARE of the field grows -- and the meter must respond to it.
    const skyShare = (h: number) => {
      const s = computeLighting(input({ elevationDeg: h }));
      return (0.5 * luminance(s.skyMeanRadiance)) / s.fieldLuminance;
    };
    expect(skyShare(90)).toBeLessThan(skyShare(0));
    expect(skyShare(0)).toBeGreaterThan(0.85); // at sunset the field IS the sky
    // ...and the sea therefore falls toward silhouette rather than holding at a fixed grey.
    const sea = (h: number) => {
      const s = computeLighting(input({ elevationDeg: h }));
      return s.exposure * luminance(s.groundRadiance);
    };
    expect(sea(0)).toBeLessThan(sea(90) / 3);
  });

  it("then lets twilight actually get dark, one step at a time", () => {
    // The failure this pins: with the floor at 3 lx (the BOTTOM of civil twilight) the meter tracked
    // all the way down and -2, -4 and -6 rendered identically to sunset. Three blind reviewers called
    // it. The floor is the field luminance at sunset itself, so the meter stops there.
    const stops = (h: number) => Math.log2(greyCard(h) / greyCard(0));
    expect(stops(0)).toBe(0);
    expect(stops(-2)).toBeLessThan(-1);
    expect(stops(-4)).toBeLessThan(stops(-2) - 1);
    expect(stops(-6)).toBeLessThan(stops(-4) - 2);
    expect(stops(-12)).toBeLessThan(-12);
  });

  it("pins the exposure at the floor, so every deep-twilight frame shares one meter reading", () => {
    const civil = computeLighting(input({ elevationDeg: -6 }));
    const nautical = computeLighting(input({ elevationDeg: -12 }));
    const astronomical = computeLighting(input({ elevationDeg: -18 }));
    // All below the floor, so the exposure is identical and only the LIGHT changes.
    for (const s of [nautical, astronomical]) {
      expect(s.exposure).toBeCloseTo(civil.exposure, 0);
    }
    expect(nautical.illuminanceLux).toBeLessThan(civil.illuminanceLux / 100);
    // The sun is still up at 0 degrees, so the meter is still tracking there, not yet pinned.
    expect(computeLighting(input({ elevationDeg: 0 })).exposure).toBeLessThan(civil.exposure);
  });

  it("never divides by the sun: exposure is finite with no directional source at all", () => {
    const night = computeLighting(input({ elevationDeg: -18 }));
    expect(night.sources).toHaveLength(0);
    expect(Number.isFinite(night.exposure)).toBe(true);
    expect(night.exposure).toBeGreaterThan(0);
  });
});

describe("the CPU/GPU lock-step contract", () => {
  it("fades the cloud deck at the horizon with the SAME cubic the dome shader uses", () => {
    // REGRESSION, found by an independent code review. The dome fragment does
    //     thickness = mix(uCloudFraction, thickness, smoothstep(0.0, 0.10, dy))
    // and this integral used a LINEAR ramp `clamp(mu / 0.1)`. They differ by up to 0.09 across a band
    // that is ~10 % of the hemisphere by solid angle -- structural, not float noise -- and that band
    // feeds `skyMeanRadiance`, hence `fieldLuminance`, hence the exposure of every cloudy frame.
    //
    // This test does not check the integral (too coarse to isolate). It checks the FADE ITSELF against
    // a literal transcription of GLSL `smoothstep`, at the boundaries and where the two curves are
    // furthest apart. If someone re-linearises it, the midpoints move and this fails.
    const glslSmoothstep = (edge0: number, edge1: number, x: number) => {
      const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
      return t * t * (3 - 2 * t);
    };
    const cpuFade = (mu: number) => {
      const t = Math.max(0, Math.min(1, mu / HORIZON_FADE_MU));
      return t * t * (3 - 2 * t);
    };

    for (const mu of [0, 0.01, 0.025, 0.05, 0.075, 0.09, 0.1, 0.2, 1]) {
      expect(cpuFade(mu), `mu=${mu}`).toBeCloseTo(glslSmoothstep(0, 0.1, mu), 12);
    }
    // And it is genuinely NOT the linear ramp it used to be: the gap peaks around the quarter points.
    const linear = (mu: number) => Math.max(0, Math.min(1, mu / HORIZON_FADE_MU));
    expect(Math.abs(cpuFade(0.025) - linear(0.025))).toBeGreaterThan(0.08);
    expect(Math.abs(cpuFade(0.075) - linear(0.075))).toBeGreaterThan(0.08);
    // Endpoints must still agree, or the fade would not be a fade.
    expect(cpuFade(0)).toBe(0);
    expect(cpuFade(HORIZON_FADE_MU)).toBe(1);
  });

  it("keeps the fade's edge in one place, so the shader and the integral cannot drift apart", () => {
    // `sky.ts` hard-codes `smoothstep(0.0, 0.10, dy)`. If that 0.10 ever moves, this constant must
    // move with it -- the export exists so the pair is greppable as a pair.
    expect(HORIZON_FADE_MU).toBe(0.1);
  });
});

describe("the twilight seam", () => {
  it("freezes the dome's shape at the horizon rather than letting Preetham snap to black", () => {
    expect(skyShapeElevation(-6)).toBe(0);
    expect(skyShapeElevation(12)).toBe(12);
    // The dome still carries light at -6, and it is not the sun's.
    const state = computeLighting(input({ elevationDeg: -6 }));
    expect(luminance(state.skyIrradiance)).toBeGreaterThan(0);
    expect(luminance(state.beamHorizontal)).toBe(0);
  });

  it("Earth's shadow kills the aerosol aureole long before it kills the Rayleigh glow", () => {
    // z = R*(sec d - 1); lit fraction = exp(-z / H). Aerosol H = 1.2 km, air H = 8.4 km.
    const terms = (h: number) => sunTerms(0, DEFAULT_SKY, (h * Math.PI) / 180);
    expect(terms(0).litMie).toBe(1);
    expect(terms(0).litRayleigh).toBe(1);
    expect(terms(-2).litMie).toBeCloseTo(0.04, 2);
    expect(terms(-2).litRayleigh).toBeCloseTo(0.63, 2);
    expect(terms(-4).litMie).toBeLessThan(1e-5);
    expect(terms(-4).litRayleigh).toBeCloseTo(0.156, 2);
    expect(terms(-6).litRayleigh).toBeLessThan(0.02);
    // ...which is precisely why the twilight sky is blue, not white.
  });

  it("so the sky's forward-scatter hot spot dies as the sun sets, and the sky blues", () => {
    // The peak-to-zenith radiance ratio near the (frozen) sun position must COLLAPSE below 0,
    // otherwise a chrome ball keeps reflecting a sun that has already set. A blind reviewer caught
    // exactly that before this term existed.
    const peakOverZenith = (h: number) => {
      const t = sunTerms(0, DEFAULT_SKY, (h * Math.PI) / 180);
      const aureole = luminance(clearSkyRadiance(Math.sin(0.02), Math.cos(0.02), t));
      const zenith = luminance(clearSkyRadiance(1, 0, t));
      return aureole / zenith;
    };
    expect(peakOverZenith(0)).toBeGreaterThan(5);
    expect(peakOverZenith(-4)).toBeLessThan(peakOverZenith(0) / 2);
    expect(peakOverZenith(-6)).toBeLessThan(peakOverZenith(-4));
  });

  it("never divides by zero when both scattering columns are fully shadowed", () => {
    const t = sunTerms(0, DEFAULT_SKY, (-18 * Math.PI) / 180);
    const l = clearSkyRadiance(0.5, 0.5, t);
    expect(l.every((v) => Number.isFinite(v) && v >= 0)).toBe(true);
  });

  it("draws twilight the right way UP: the afterglow is low and toward the sun", () => {
    // REGRESSION. three's Sky floors the dome at `L0 = 0.1 * Fex` -- a constant times the VIEW-path
    // transmittance, so it PEAKS AT THE ZENITH (short path out) and dies at the horizon (long one).
    // In daylight Lin buries it. Below the horizon Lin collapses with the Earth's shadow and the
    // floor does not, because it never depended on the sun: it was 99.9% of the -6 degree zenith and
    // rendered civil twilight as a warm glow straight overhead above a black horizon. The sunset,
    // upside down. Three blind reviewers called it out; the fix was to delete the fudge, not tune it.
    const sample = (h: number) => {
      const t = sunTerms(0, DEFAULT_SKY, (h * Math.PI) / 180, sourceTints(h));
      return {
        towardSun: luminance(clearSkyRadiance(Math.sin(0.02), Math.cos(0.02), t)),
        awayFromSun: luminance(clearSkyRadiance(Math.sin(0.02), -Math.cos(0.02), t)),
        zenith: luminance(clearSkyRadiance(1, Math.sin((h * Math.PI) / 180), t)),
      };
    };

    for (const h of [0, -2, -4, -6]) {
      const { towardSun, awayFromSun, zenith } = sample(h);
      // The sun's own horizon always outshines the horizon opposite it...
      expect(towardSun).toBeGreaterThan(awayFromSun);
      // ...and the sky overhead never runs away from it. Below the horizon the two come within ~1.5x,
      // and that is honest rather than ideal, for two documented reasons. The Mie aureole dies first
      // (scale height 1.2 km), so the sunset's hot spot broadens into a wide, nearly altitude-uniform
      // arch; Preetham's frozen shape does not know a real arch still favours the horizon. And OZONE
      // now dims the toward-sun HORIZON path more than the zenith (its thin-shell air mass reaches ~11
      // at the horizon vs ~1 overhead), which nudges the ratio further — the price of the blue zenith,
      // paid only in deep twilight. What must never return is the zenith OUT-shining the sunset by 10x,
      // which is what the fudge floor did; 1.5x still catches that by a wide margin.
      expect(zenith).toBeLessThanOrEqual(towardSun * 1.5);
    }

    // With the sun up, the sunset is emphatically a sunset: the glow is on the horizon, and it is on
    // the sun's side of it.
    const sunset = sample(0);
    expect(sunset.towardSun / sunset.zenith).toBeGreaterThan(10);
    expect(sunset.towardSun / sunset.awayFromSun).toBeGreaterThan(50);

    // Deep in twilight the aureole is gone and only Rayleigh is left, so the azimuthal contrast
    // settles on the ratio of its phase function forward to back: 2:1 in the phase, ~4:1 here once
    // the view-path extinction has had its say. It must not go isotropic.
    const civil = sample(-6);
    expect(civil.towardSun / civil.awayFromSun).toBeGreaterThan(2.5);
  });

  it("goes to zero, not to a floor, when the Earth's shadow covers both columns", () => {
    // With `L0` gone the dome is pure in-scattering, so an unlit atmosphere emits nothing. The old
    // floor made the sky at -18 degrees as bright as the sky at -6.
    const deep = luminance(clearSkyRadiance(1, 0, sunTerms(0, DEFAULT_SKY, (-18 * Math.PI) / 180)));
    const civil = luminance(clearSkyRadiance(1, 0, sunTerms(0, DEFAULT_SKY, (-6 * Math.PI) / 180)));
    expect(deep).toBeLessThan(civil / 100);
  });
});

describe("derived quantities that used to be hand-tuned curves", () => {

  it("the veil's BEAM half carries the clear-sky beam — the cloud is applied once, in the shader", () => {
    // The shadow map multiplies `underwaterBeam` per fragment. If the cloud's spatial mean were
    // baked in here too, a cumulus shadow would darken the sea's body twice over.
    const clear = computeLighting(input({ elevationDeg: 40 }));
    const cloudy = computeLighting(
      input({ elevationDeg: 40, cloud: cloudStateFromGenus(CLOUD_GENERA.stratus) }),
    );
    expect(luminance(cloudy.underwaterBeam)).toBeCloseTo(luminance(clear.underwaterBeam), 6);
    // ...while the SKY half really does dim under the deck.
    expect(luminance(cloudy.underwaterSky)).toBeGreaterThan(luminance(clear.underwaterSky));
  });
});

describe("the optical depths that colour the beam", () => {

  it("has unit luminance for both species, so the tint moves hue and never energy", () => {
    for (const el of [90, 30, 5, 0]) {
      const t = sourceTints(el);
      expect(luminance(t.rayleigh)).toBeCloseTo(1, 6);
      expect(luminance(t.mie)).toBeCloseTo(1, 6);
    }
  });

  it("hands the beam's loss to the sky, because haze scatters rather than absorbs", () => {
    // DHI is GHI - beam, so this falls out for free. Total illuminance must barely move at high sun.
    const at = (turbidity: number) =>
      computeLighting(input({ elevationDeg: 40, sky: { ...DEFAULT_SKY, turbidity } }));
    const clear = at(2);
    const hazy = at(8);
    expect(luminance(hazy.skyIrradiance)).toBeGreaterThan(luminance(clear.skyIrradiance));
    expect(sunSkyRatio(hazy)).toBeLessThan(sunSkyRatio(clear));
    expect(hazy.illuminanceLux).toBeGreaterThan(0.6 * clear.illuminanceLux);
  });
});
