import { describe, expect, it, vi } from "vitest";
import { compileTheme, themeSeconds } from "./song";
import { THEMES } from "./themes";
import { zzfxm } from "./zzfxm";

// Renders every theme in full, a few seconds of work that grows with each theme
// added: it catches a theme that renders to the wrong length or too loud, which
// the format's own checks can't see.
describe("the themes", () => {
  it("render with ZzFX to their length, quietly enough to sit under the sound effects", async () => {
    // ZzFX creates its AudioContext as it loads; rendering doesn't use it.
    vi.stubGlobal("AudioContext", class {});
    const { ZZFX } = await import("zzfx");
    vi.unstubAllGlobals();
    for (const theme of THEMES) {
      const [left, right] = zzfxm(compileTheme(theme), ZZFX.sampleRate, (params) => ZZFX.buildSamples(...params));
      expect(left.length / ZZFX.sampleRate, theme.id).toBeCloseTo(themeSeconds(theme), 1);
      let peak = 0;
      for (let i = 0; i < left.length; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
      expect(peak, theme.id).toBeGreaterThan(0.1);
      expect(peak, theme.id).toBeLessThan(0.5);
    }
  });
});
