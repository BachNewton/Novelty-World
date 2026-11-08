import { describe, expect, it } from "vitest";
import {
  CHARCOAL,
  CHROME_BALL,
  DEFAULT_PROBE_SET,
  GOLD,
  MATERIALS,
  SEAWATER,
  assertPlausible,
  isMaterialName,
  outsideAuthoringRange,
} from "./materials";

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
