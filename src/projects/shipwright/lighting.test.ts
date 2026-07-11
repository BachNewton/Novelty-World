import { describe, expect, it } from "vitest";
import {
  BEAM_OPTICAL_DEPTH,
  DEFAULT_ADAPTATION_FLOOR_LUX,
  DEFAULT_EXPOSURE_KEY,
  DEFAULT_GROUND_ALBEDO,
  DEFAULT_SKY,
  WATTS_PER_UNIT,
  airMass,
  beamIrradiance,
  HORIZON_FADE_MU,
  beamOpticalDepth,
  sourceTints,
  clearSkyDhi,
  computeLighting,
  skyShapeElevation,
  sunDiscVisibility,
  sunSkyRatio,
  type LightingInput,
} from "./lighting";
import { clearSkyRadiance, luminance, sunTerms } from "./sky-model";
import { CLOUD_GENERA, cloudStateFromGenus, cloudTotalTransmittance, type CloudGenusName } from "./clouds";

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

describe("air mass", () => {
  it("is 1 at the zenith", () => {
    expect(airMass(90)).toBeCloseTo(1, 3);
  });

  it("matches Kasten-Young at the horizon, where 1/sin(h) diverges", () => {
    expect(airMass(0)).toBeCloseTo(37.92, 1);
    // The whole reason for Kasten-Young: the naive form is ~1.5x wrong below 2 degrees.
    expect(1 / Math.sin((1 * Math.PI) / 180) / airMass(1)).toBeGreaterThan(2);
  });
});

describe("the direct beam", () => {
  const meinelDni = (h: number) => 1353 * Math.pow(0.7, Math.pow(airMass(h), 0.678));

  it("reproduces Meinel & Meinel's DNI in luminance, by construction", () => {
    // DNI(AM) = 1353 * 0.7 ^ (AM ^ 0.678). The per-channel optical depths were solved so their
    // luminance-weighted transmittance at AM = 1 is exactly 0.70; the rest is Beer's law.
    expect(luminance(beamIrradiance(90)) * WATTS_PER_UNIT).toBeCloseTo(meinelDni(90), 0);
    for (const h of [70, 53, 30, 15, 7, 4.5]) {
      expect(luminance(beamIrradiance(h)) / (meinelDni(h) / WATTS_PER_UNIT)).toBeCloseTo(1, 1);
    }
  });

  it("beats a grey atmosphere at high air mass, because what survives is the red end", () => {
    // Jensen's inequality, and it is physics rather than error: a spectrally SELECTIVE atmosphere
    // transmits more broadband light than a grey one with the same AM=1 transmittance, because the
    // blue that Beer's law kills fastest carries the least luminance. The gap widens toward the
    // horizon, which is also why the beam reddens. Anchored here so a refactor cannot quietly
    // flatten the spectrum back to grey.
    const excess = (h: number) => luminance(beamIrradiance(h)) * WATTS_PER_UNIT / meinelDni(h);
    expect(excess(90)).toBeCloseTo(1, 3);
    expect(excess(15)).toBeGreaterThan(1);
    expect(excess(4.5)).toBeGreaterThan(excess(15));
    expect(excess(0)).toBeGreaterThan(excess(4.5));
    expect(excess(0)).toBeLessThan(1.3);
  });

  it("reddens monotonically as air mass grows, and never goes blue", () => {
    let previous = 0;
    for (const h of [90, 53, 30, 15, 7, 4.5, 2]) {
      const [r, g, b] = beamIrradiance(h);
      const warmth = r / g;
      expect(warmth).toBeGreaterThan(previous);
      expect(b).toBeLessThan(g); // the beam is never cooler than neutral once it has crossed air
      previous = warmth;
    }
  });

  it("vanishes across the sun's angular radius, allowing for refraction", () => {
    expect(sunDiscVisibility(0)).toBe(1); // the sun you watch touch the horizon is fully visible
    expect(sunDiscVisibility(-0.3)).toBeCloseTo(1, 2);
    expect(sunDiscVisibility(-0.57)).toBeCloseTo(0.5, 1); // centre on the refracted horizon
    expect(sunDiscVisibility(-0.9)).toBe(0);
    expect(luminance(beamIrradiance(-2))).toBe(0);
    expect(luminance(beamIrradiance(-6))).toBe(0);
  });
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

  it("falls monotonically below the horizon and never reaches zero", () => {
    let previous = clearSkyDhi(0);
    for (const h of [-2, -4, -6, -12, -18]) {
      const dhi = clearSkyDhi(h);
      expect(dhi).toBeGreaterThan(0);
      expect(dhi).toBeLessThan(previous);
      previous = dhi;
    }
  });

  it("puts civil twilight at ~3 lux, the value that defines it", () => {
    const lux = clearSkyDhi(-6) * WATTS_PER_UNIT * 110;
    expect(lux).toBeGreaterThan(2);
    expect(lux).toBeLessThan(5);
  });

  it("peaks in the mid sky, not at the zenith — the sky path is longest when the sun is low", () => {
    expect(clearSkyDhi(40)).toBeGreaterThan(clearSkyDhi(90));
    expect(clearSkyDhi(40)).toBeGreaterThan(clearSkyDhi(10));
  });
});

describe("the sun:sky ratio on a horizontal surface", () => {
  // The acceptance criterion of the whole overhaul. Targets from docs/LIGHTING.md, which derives
  // them from Meinel (beam) and a standard clear-sky diffuse model.
  const cases: [number, number, number][] = [
    // elevation, min, max
    [90, 8, 12],
    [53, 6, 8.5],
    [30, 3, 4.5],
    [22, 2, 3.2],
    [15, 1.3, 2.3],
    [10, 0.9, 1.6],
    [7, 0.6, 1.2],
  ];
  it.each(cases)("at %i degrees lands in [%f, %f]", (elevationDeg, min, max) => {
    const ratio = sunSkyRatio(computeLighting(input({ elevationDeg })));
    expect(ratio).toBeGreaterThanOrEqual(min);
    expect(ratio).toBeLessThanOrEqual(max);
  });

  it("crosses 1:1 between 8 and 11 degrees — the physically meaningful number", () => {
    expect(sunSkyRatio(computeLighting(input({ elevationDeg: 12 })))).toBeGreaterThan(1);
    expect(sunSkyRatio(computeLighting(input({ elevationDeg: 6 })))).toBeLessThan(1);
  });

  it("rises monotonically with elevation — the sky never out-lights a higher sun", () => {
    let previous = -1;
    for (const h of [0, 2, 4.5, 7, 10, 15, 22, 30, 53, 70, 90]) {
      const ratio = sunSkyRatio(computeLighting(input({ elevationDeg: h })));
      expect(ratio).toBeGreaterThan(previous);
      previous = ratio;
    }
  });

  it("is exactly zero below the horizon: skylight only", () => {
    for (const h of [-2, -4, -6]) {
      expect(sunSkyRatio(computeLighting(input({ elevationDeg: h })))).toBe(0);
    }
  });
});

describe("overcast", () => {
  it("extinguishes the beam, so the shadows go with it", () => {
    const state = computeLighting(input({ cloud: cloudStateFromGenus(CLOUD_GENERA.stratus) }));
    expect(state.cloudBeamFactor).toBeLessThan(0.001);
    expect(sunSkyRatio(state)).toBeLessThan(0.01);
  });

  it("lands at 10-25% of clear-sky illuminance, straight out of the two-stream solution", () => {
    const clear = computeLighting(input({ elevationDeg: 40 }));
    const stratus = computeLighting(
      input({ elevationDeg: 40, cloud: cloudStateFromGenus(CLOUD_GENERA.stratus) }),
    );
    const fraction = stratus.illuminanceLux / clear.illuminanceLux;
    expect(fraction).toBeGreaterThan(0.1);
    expect(fraction).toBeLessThan(0.25);
  });

  it("dims the scene monotonically with optical depth, for the genera that fully cover", () => {
    const lux = (genus: CloudGenusName) =>
      computeLighting(input({ elevationDeg: 40, cloud: cloudStateFromGenus(CLOUD_GENERA[genus]) }))
        .illuminanceLux;
    expect(lux("stratus")).toBeLessThan(lux("cumulus"));
    expect(lux("cumulus")).toBeLessThan(lux("cirrus"));
    expect(lux("cirrus")).toBeLessThan(lux("clear"));
  });

  it("cumulonimbus is about CONTRAST, not mean illuminance — its gaps let the full beam through", () => {
    // Its base is by far the darkest thing in the model...
    expect(cloudTotalTransmittance(CLOUD_GENERA.cumulonimbus.tau)).toBeLessThan(
      cloudTotalTransmittance(CLOUD_GENERA.stratus.tau) / 4,
    );
    // ...yet at 72 % coverage the 28 % of clear sky keeps the SCENE MEAN near a total overcast.
    // A squall is dramatic because of the shafts through the gaps, not because it is dimmer on
    // average. Anyone "fixing" the mean here would be flattening exactly the effect we want.
    const cb = computeLighting(
      input({ elevationDeg: 40, cloud: cloudStateFromGenus(CLOUD_GENERA.cumulonimbus) }),
    );
    const stratus = computeLighting(
      input({ elevationDeg: 40, cloud: cloudStateFromGenus(CLOUD_GENERA.stratus) }),
    );
    expect(cb.illuminanceLux / stratus.illuminanceLux).toBeGreaterThan(0.7);
    expect(cb.illuminanceLux / stratus.illuminanceLux).toBeLessThan(1.5);
    // And the beam is alive under Cb (through gaps) where under stratus it is gone entirely.
    expect(cb.cloudBeamFactor).toBeGreaterThan(stratus.cloudBeamFactor * 50);
  });

  it("cirrus barely dims the beam — a similarity depth of tau*(1-g)", () => {
    const state = computeLighting(
      input({ elevationDeg: 40, cloud: cloudStateFromGenus(CLOUD_GENERA.cirrus) }),
    );
    expect(state.cloudBeamFactor).toBeGreaterThan(0.9);
  });

  it("two-stream total transmittance lands the stratus range on 10-25% of clear sky", () => {
    // T = 1 / (1 + 0.75*tau*(1-g)), g = 0.8. Stratus spans tau 10..40.
    expect(cloudTotalTransmittance(10)).toBeCloseTo(0.4, 2);
    expect(cloudTotalTransmittance(20)).toBeCloseTo(0.25, 2);
    expect(cloudTotalTransmittance(40)).toBeCloseTo(0.143, 2);
    expect(cloudTotalTransmittance(0)).toBe(1);
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
  it("the veil is the downwelling irradiance under the surface, never brighter than above it", () => {
    for (const h of [90, 30, 4.5, 0, -6]) {
      const s = computeLighting(input({ elevationDeg: h }));
      const veil = luminance(s.underwaterBeam) + luminance(s.underwaterSky);
      expect(veil).toBeLessThanOrEqual(luminance(s.horizontalIrradiance) + 1e-9);
      expect(veil).toBeGreaterThan(0);
    }
  });

  it("the beam's Fresnel loss into the water grows as the sun drops", () => {
    const share = (h: number) => {
      const s = computeLighting(input({ elevationDeg: h }));
      return (
        (luminance(s.underwaterBeam) + luminance(s.underwaterSky)) /
        luminance(s.horizontalIrradiance)
      );
    };
    expect(share(90)).toBeGreaterThan(share(10));
  });

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

  it("the ground bounce tracks the scene's total light, not the sun specifically", () => {
    const day = computeLighting(input({ elevationDeg: 40 }));
    const overcast = computeLighting(
      input({ elevationDeg: 40, cloud: cloudStateFromGenus(CLOUD_GENERA.stratus) }),
    );
    expect(luminance(day.groundRadiance)).toBeGreaterThan(luminance(overcast.groundRadiance));
    expect(luminance(overcast.groundRadiance)).toBeGreaterThan(0);
  });
});

describe("the optical depths that colour the beam", () => {
  it("are ordered blue > green > red, as Rayleigh demands", () => {
    expect(BEAM_OPTICAL_DEPTH[2]).toBeGreaterThan(BEAM_OPTICAL_DEPTH[1]);
    expect(BEAM_OPTICAL_DEPTH[1]).toBeGreaterThan(BEAM_OPTICAL_DEPTH[0]);
  });

  it("have exactly Meinel's luminance-weighted transmittance at one air mass", () => {
    const t = BEAM_OPTICAL_DEPTH.map((x) => Math.exp(-x)) as [number, number, number];
    expect(luminance(t)).toBeCloseTo(0.7, 5);
  });

  it("rise with turbidity, because turbidity IS the aerosol load", () => {
    // The sky dome always took `turbidity`; the BEAM did not, so a hazy sky came with a sun burning at
    // full clear-air strength. The picture and the light disagreed.
    expect(beamOpticalDepth(3)).toEqual(BEAM_OPTICAL_DEPTH);
    for (const i of [0, 1, 2]) {
      expect(beamOpticalDepth(8)[i]).toBeGreaterThan(beamOpticalDepth(3)[i]);
      expect(beamOpticalDepth(1)[i]).toBeLessThan(beamOpticalDepth(3)[i]);
    }
    // Only the aerosol term moves; Rayleigh and ozone are properties of the gas column, not the haze.
    expect(beamOpticalDepth(0)[1]).toBeCloseTo(0.123, 3); // Rayleigh(549) 0.098 + ozone(549) 0.025
  });

  it("redden the beam faster than they dim it, so a hazy horizon sun goes deep orange", () => {
    // beta * lambda^-1.3 hits blue hardest. This is the whole reason the classic big orange sun needs
    // haze: it is the only thing that can dim a disc that is a million times middle grey.
    const hue = (t: number) => {
      const [r, g] = beamIrradiance(1, t);
      return r / g;
    };
    expect(hue(8)).toBeGreaterThan(hue(3));
    expect(hue(3)).toBeGreaterThan(hue(1));
    expect(luminance(beamIrradiance(1, 8))).toBeLessThan(0.25 * luminance(beamIrradiance(1, 3)));
  });

  it("reddens the aerosol's source far harder than the air's, so a sunset sky stays blue overhead", () => {
    // A single dome-wide tint was tried first and the ANTI-SOLAR sky at sunset went olive: the beam
    // that lights a Rayleigh scatterer at 8.4 km has NOT crossed the column the beam lighting an
    // aerosol at 1.2 km has. `H_j/(H_s + H_j)` is exact for exponential columns; nothing is fitted.
    const { rayleigh, mie } = sourceTints(0);
    expect(mie[2]).toBeLessThan(0.45); // the aureole loses most of its blue
    expect(rayleigh[2]).toBeGreaterThan(0.6); // the sky keeps most of its own
    expect(mie[0]).toBeGreaterThan(rayleigh[0]);
    // Overhead they nearly agree, because there is barely any column to cross either way — the
    // aerosol still sees ~5% more of it, which is exactly the asymmetry, just very small at AM = 1.
    const high = sourceTints(90);
    for (const i of [0, 1, 2]) expect(Math.abs(high.mie[i] - high.rayleigh[i])).toBeLessThan(0.08);
  });

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
