import { describe, expect, it } from "vitest";
import { passStreakSemitones, renderSound, SOUND_IDS, SOUNDS, zzfxParams, type SoundDesign } from "./sounds";

describe("zzfxParams", () => {
  it("gives ZzFX's 21 parameters, with its defaults and no baked-in randomness", () => {
    const params = zzfxParams({ frequency: 440 });
    expect(params).toHaveLength(21);
    expect(params.slice(0, 3)).toEqual([1, 0, 440]);
  });
});

describe("the sound designs", () => {
  it("never plays two of one sound closer than it could be triggered", () => {
    for (const id of SOUND_IDS) {
      expect(SOUNDS[id].minGap).toBeLessThanOrEqual(SOUNDS[id].busiestEvery);
    }
  });

  it("keep their variation small enough to still sound like themselves", () => {
    for (const id of SOUND_IDS) {
      const { pitch, volume } = SOUNDS[id].variation;
      expect(pitch).toBeGreaterThanOrEqual(0);
      expect(pitch).toBeLessThanOrEqual(0.1);
      expect(volume).toBeGreaterThanOrEqual(0);
      expect(volume).toBeLessThanOrEqual(0.3);
    }
  });
});

describe("passStreakSemitones", () => {
  it("climbs the scale and stays on the octave", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 20].map(passStreakSemitones)).toEqual([0, 2, 4, 7, 9, 12, 12, 12]);
  });
});

describe("renderSound", () => {
  it("mixes each layer in at its offset", () => {
    const design: SoundDesign = {
      label: "test",
      trigger: "test",
      layers: [
        { at: 0, zzfx: { volume: 1 } },
        { at: 0.002, zzfx: { volume: 2 } },
      ],
      variation: { pitch: 0, volume: 0 },
      minGap: 0,
      busiestEvery: 0,
    };
    // A stand-in builder: three samples at the layer's volume.
    const mixed = renderSound(design, 1000, (params) => [params[0], params[0], params[0]]);
    expect([...mixed]).toEqual([1, 1, 3, 2, 2]);
  });
});
