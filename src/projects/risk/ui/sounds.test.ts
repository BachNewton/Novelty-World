import { beforeAll, describe, expect, it, vi } from "vitest";
import { renderSound } from "@/shared/lib/sound";
import { RISK_SOUND_IDS, RISK_SOUNDS } from "./sounds";

let sampleRate = 0;
let build: (params: number[]) => number[] = () => [];

beforeAll(async () => {
  // ZzFX creates its AudioContext as it loads; rendering doesn't use it.
  vi.stubGlobal("AudioContext", class {});
  const { ZZFX } = await import("zzfx");
  vi.unstubAllGlobals();
  sampleRate = ZZFX.sampleRate;
  build = (params) => ZZFX.buildSamples(...params);
});

describe("Risk's sounds", () => {
  it("never play two of one sound closer than it could be triggered, and stray little", () => {
    for (const id of RISK_SOUND_IDS) {
      const { minGap, busiestEvery, variation } = RISK_SOUNDS[id];
      expect(minGap, id).toBeLessThanOrEqual(busiestEvery);
      expect(variation.pitch, id).toBeLessThanOrEqual(0.1);
      expect(variation.volume, id).toBeLessThanOrEqual(0.3);
    }
  });

  it("render with ZzFX loud enough to hear, short of clipping, and short", () => {
    for (const id of RISK_SOUND_IDS) {
      const samples = renderSound(RISK_SOUNDS[id], sampleRate, build);
      const peak = samples.reduce((most, sample) => Math.max(most, Math.abs(sample)), 0);
      expect(samples.every(Number.isFinite), id).toBe(true);
      expect(peak, id).toBeGreaterThan(0.03);
      expect(peak, id).toBeLessThan(1);
      expect(samples.length / sampleRate, id).toBeLessThan(2.5);
    }
  });
});
