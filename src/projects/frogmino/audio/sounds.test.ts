import { describe, expect, it } from "vitest";
import { passStreakSemitones, SOUND_IDS, SOUNDS } from "./sounds";

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
