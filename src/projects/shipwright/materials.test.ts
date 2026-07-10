import { describe, expect, it } from "vitest";
import {
  CHARCOAL,
  CHROME_BALL,
  COPPER,
  DEFAULT_PROBE_SET,
  GELCOAT,
  GOLD,
  GREY_50_SRGB,
  GREY_BALL,
  MATERIALS,
  RUSTED_IRON,
  SEAWATER,
  SNOW,
  assertPlausible,
  isMaterialName,
  outsideAuthoringRange,
} from "./materials";

/** The IEC 61966-2-1 forward transfer function: linear reflectance -> sRGB display value. */
const toSrgb = (linear: number) =>
  linear <= 0.0031308 ? linear * 12.92 : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;

describe("the material library", () => {
  it("is physically possible, every entry", () => {
    for (const m of MATERIALS) expect(() => assertPlausible(m)).not.toThrow();
  });

  it("has unique names, and the default probe set names real materials", () => {
    expect(new Set(MATERIALS.map((m) => m.name)).size).toBe(MATERIALS.length);
    for (const name of DEFAULT_PROBE_SET) expect(isMaterialName(name)).toBe(true);
  });

  it("makes every entry outside the authoring range explain itself", () => {
    // Filament's ranges are guidelines for hand-authoring an albedo texture, not measurements. Real
    // spectral data breaks them -- chromium's red F0 is 0.654 against a stated metal floor of 0.66,
    // and any strongly TINTED metal must have a low channel, because that is what tint is. Clamping
    // measured data to a heuristic would be the exact kind of fudge this project keeps deleting. So
    // the rule is not "stay in range", it is "if you leave, say why".
    for (const m of MATERIALS) {
      if (outsideAuthoringRange(m)) {
        expect(m.source.length, `${m.name} leaves the authoring range with no justification`)
          .toBeGreaterThan(30);
      }
    }
    // ...and these are the ones we know do, so a silent drift back into range is also caught.
    expect(outsideAuthoringRange(CHROME_BALL)).toBe(true); // red F0 0.654 < 0.66
    expect(outsideAuthoringRange(GOLD)).toBe(true); // blue F0 0.307
    expect(outsideAuthoringRange(CHARCOAL)).toBe(true); // 0.02 < the 0.04 rule of thumb
    expect(outsideAuthoringRange(SEAWATER)).toBe(true); // transmissive: almost nothing comes back
  });

  it("keeps 18% grey and 50% sRGB grey distinct, because they are", () => {
    // The single most common colour-management error in a renderer. 18% reflectance -- the grey card,
    // the on-set grey ball -- encodes to sRGB 118, NOT 128. If these two ever collapse onto the same
    // value, someone has confused a linear reflectance with a display value.
    expect(Math.round(toSrgb(GREY_BALL.baseColor[0]) * 255)).toBe(118);
    expect(Math.round(toSrgb(GREY_50_SRGB.baseColor[0]) * 255)).toBe(128);
    expect(GREY_50_SRGB.baseColor[0]).toBeGreaterThan(GREY_BALL.baseColor[0] * 1.15);
  });

  it("brackets the dielectrics between charcoal and snow", () => {
    const dielectrics = MATERIALS.filter((m) => m.metalness === 0 && m.name !== "seawater");
    const brightest = Math.max(...dielectrics.map((m) => Math.max(...m.baseColor)));
    const darkest = Math.min(...dielectrics.map((m) => Math.min(...m.baseColor)));
    expect(brightest).toBe(Math.max(...SNOW.baseColor));
    expect(darkest).toBe(Math.min(...CHARCOAL.baseColor));
  });

  it("treats metalness as binary, and rust as the dielectric it is", () => {
    for (const m of MATERIALS) expect([0, 1]).toContain(m.metalness);
    // Iron oxide is not a conductor. Rendering rust as a dirty metal is the commonest way to make a
    // PBR scene look wrong, and it is one line away at all times.
    expect(RUSTED_IRON.metalness).toBe(0);
  });

  it("gives metals a high F0 luminance even when a channel is low", () => {
    const lum = ([r, g, b]: readonly [number, number, number]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    for (const m of MATERIALS.filter((x) => x.metalness === 1)) {
      expect(lum(m.baseColor), m.name).toBeGreaterThan(0.5);
    }
    // Copper is the dimmest real metal in the set; it must still out-reflect any dielectric here.
    expect(lum(COPPER.baseColor)).toBeGreaterThan(Math.max(...SNOW.baseColor) * 0.6);
  });

  it("gives metals no diffuse albedo and dielectrics no F0 tint", () => {
    for (const m of MATERIALS) {
      if (m.metalness === 1) expect(m.albedo).toBeUndefined();
      else expect(m.albedo).toBeDefined();
    }
  });

  it("puts a clearcoat on the gelcoat hull and not on the matte paint", () => {
    // A gloss marine hull is literally white pigment under a clear resin topcoat, so the clearcoat
    // lobe is physical, not decorative -- and it is the whole difference between the two whites.
    expect(GELCOAT.clearcoat).toBe(1);
    expect(GELCOAT.clearcoatRoughness).toBeLessThan(0.1);
    expect(MATERIALS.find((m) => m.name === "matte-white")?.clearcoat).toBeUndefined();
  });

  it("gives seawater the refractive index that makes its F0 2%", () => {
    const { ior } = SEAWATER;
    const f0 = Math.pow((ior - 1) / (ior + 1), 2);
    expect(f0).toBeCloseTo(0.02, 3);
  });

  it("labels every derived value as derived, and cites every measured one", () => {
    for (const m of MATERIALS) {
      expect(m.source.length, m.name).toBeGreaterThan(20);
      // A DERIVED entry must say so in the source line too, so the provenance survives a copy-paste
      // out of this file and into a reviewer's hands.
      if (m.derived === true) expect(m.source).toContain("DERIVED");
      else expect(m.source).not.toContain("DERIVED");
    }
  });
});
