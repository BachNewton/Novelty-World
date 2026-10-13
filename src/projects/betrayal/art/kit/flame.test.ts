import { describe, expect, it } from "vitest";
import { flickerOf, MAX_FLICKER } from "../lighting";
import { FLAME_PRESETS, flameLight, flameSway, MAX_TONGUES, momentAtSignal, type FlamePresetName } from "./flame";

const NAMES = Object.keys(FLAME_PRESETS) as FlamePresetName[];

describe("flame presets", () => {
  it.each(NAMES)("%s flickers within the flicker map and draws a tongue count the shader takes", (name) => {
    const preset = FLAME_PRESETS[name];
    expect(preset.light.flicker).toBeLessThanOrEqual(MAX_FLICKER);
    expect(preset.tongues).toBeGreaterThanOrEqual(1);
    expect(preset.tongues).toBeLessThanOrEqual(MAX_TONGUES);
  });

  it("gives a flame's light the signal its flame dips with", () => {
    expect(flameLight("candle", 2)).toMatchObject({ ...FLAME_PRESETS.candle.light, signal: 2 });
  });
});

describe("flameSway", () => {
  it("stands at rest on a signal of 0, and dips and rises with it, deeper than its light", () => {
    const preset = FLAME_PRESETS.candle;
    expect(flameSway(preset, 0)).toEqual({ brightness: 1, height: 1 });
    const low = flameSway(preset, -1);
    const high = flameSway(preset, 1);
    expect(low.brightness).toBeLessThan(1 - preset.light.flicker);
    expect(low.height).toBeLessThan(1);
    expect(high.brightness).toBeGreaterThan(1 + preset.light.flicker);
    expect(high.height).toBeGreaterThan(1);
  });

  it("never goes dark or flat at the deepest dip", () => {
    for (const name of NAMES) {
      const { brightness, height } = flameSway(FLAME_PRESETS[name], -1);
      expect(brightness).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(0);
    }
  });
});

describe("momentAtSignal", () => {
  it.each([-0.8, 0, 0.6])("finds a moment the signal stands near %s", (target) => {
    expect(flickerOf(momentAtSignal(target, 0), 0)).toBeCloseTo(target, 1);
  });
});
