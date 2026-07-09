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
  clearSkyDhi,
  computeLighting,
  skyShapeElevation,
  sunDiscVisibility,
  sunSkyRatio,
  type LightingInput,
} from "./lighting";
import { luminance } from "./sky-model";
import { CLOUD_GENERA, cloudStateFromGenus, cloudTotalTransmittance } from "./clouds";

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
    const lux = (genus: string) =>
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

  it("cirrus barely dims the beam — tau 0.35 with g = 0.8 is a similarity depth of 0.07", () => {
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
  it("meters middle grey, so a grey card holds still from zenith to civil twilight", () => {
    const grey = (h: number) => {
      const s = computeLighting(input({ elevationDeg: h }));
      return (s.exposure * (0.18 / Math.PI) * luminance(s.horizontalIrradiance));
    };
    for (const h of [90, 30, 4.5, 0, -4]) {
      expect(grey(h)).toBeCloseTo(DEFAULT_EXPOSURE_KEY, 3);
    }
  });

  it("stops opening up below the civil-twilight floor, so night goes dark rather than grey", () => {
    const rendered = (s: ReturnType<typeof computeLighting>) =>
      s.exposure * (0.18 / Math.PI) * luminance(s.horizontalIrradiance);
    const civil = computeLighting(input({ elevationDeg: -6 }));
    const nautical = computeLighting(input({ elevationDeg: -12 }));
    const astronomical = computeLighting(input({ elevationDeg: -18 }));

    // Civil twilight is the last stop the meter can hold; below it exposure is pinned and the
    // frame darkens with the real light instead of being lifted into a grey night.
    expect(nautical.exposure).toBeCloseTo(astronomical.exposure, 0);
    expect(civil.exposure).toBeLessThan(nautical.exposure);
    expect(rendered(civil)).toBeCloseTo(DEFAULT_EXPOSURE_KEY, 2);
    expect(rendered(nautical)).toBeLessThan(DEFAULT_EXPOSURE_KEY / 100);
    expect(rendered(astronomical)).toBeLessThan(rendered(nautical));
  });

  it("never divides by the sun: exposure is finite with no directional source at all", () => {
    const night = computeLighting(input({ elevationDeg: -18 }));
    expect(night.sources).toHaveLength(0);
    expect(Number.isFinite(night.exposure)).toBe(true);
    expect(night.exposure).toBeGreaterThan(0);
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
});

describe("derived quantities that used to be hand-tuned curves", () => {
  it("the veil is the downwelling irradiance under the surface, never brighter than above it", () => {
    for (const h of [90, 30, 4.5, 0, -6]) {
      const s = computeLighting(input({ elevationDeg: h }));
      expect(luminance(s.underwaterIrradiance)).toBeLessThanOrEqual(
        luminance(s.horizontalIrradiance) + 1e-9,
      );
      expect(luminance(s.underwaterIrradiance)).toBeGreaterThan(0);
    }
  });

  it("the beam's Fresnel loss into the water grows as the sun drops", () => {
    const share = (h: number) => {
      const s = computeLighting(input({ elevationDeg: h }));
      return luminance(s.underwaterIrradiance) / luminance(s.horizontalIrradiance);
    };
    expect(share(90)).toBeGreaterThan(share(10));
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
});
