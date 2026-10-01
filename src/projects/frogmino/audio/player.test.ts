import { describe, expect, it } from "vitest";
import { SoundPlayer, vary, type AudioOutput } from "./player";
import { DEFAULT_SOUND_SETTINGS, type SoundSettings } from "./settings";
import { SOUND_IDS, SOUNDS, type SoundId } from "./sounds";

interface Played {
  id: SoundId;
  at: number;
  rate: number;
  gain: number;
}

// An output on a clock the test moves by hand.
function fakeOutput(): AudioOutput & { time: number; played: Played[] } {
  const output = {
    time: 0,
    played: [] as Played[],
    now: () => output.time,
    play: (id: SoundId, at: number, rate: number, gain: number) => {
      output.played.push({ id, at, rate, gain });
    },
  };
  return output;
}

function playerOn(output: AudioOutput, settings: SoundSettings = DEFAULT_SOUND_SETTINGS, random = () => 0.5): SoundPlayer {
  return new SoundPlayer(output, () => settings, random);
}

describe("vary", () => {
  it("keeps every sound's rate and gain within its range, at the extremes and between", () => {
    for (const id of SOUND_IDS) {
      const { variation } = SOUNDS[id];
      for (const r of [0, 0.25, 0.5, 0.75, 0.999999]) {
        const { rate, gain } = vary(variation, () => r);
        expect(rate).toBeGreaterThanOrEqual(1 - variation.pitch);
        expect(rate).toBeLessThanOrEqual(1 + variation.pitch);
        expect(gain).toBeGreaterThan(1 - variation.volume - 1e-9);
        expect(gain).toBeLessThanOrEqual(1);
      }
    }
  });

  it("strays both ways in pitch", () => {
    const variation = { pitch: 0.1, volume: 0 };
    expect(vary(variation, () => 0).rate).toBeCloseTo(0.9);
    expect(vary(variation, () => 1).rate).toBeCloseTo(1.1);
  });
});

describe("SoundPlayer", () => {
  it("drops a play sooner than the sound's minimum gap, on the audio clock", () => {
    const output = fakeOutput();
    const player = playerOn(output);
    const { minGap } = SOUNDS.hop;
    expect(player.play("hop")).toBe(true);
    output.time = minGap * 0.99;
    expect(player.play("hop")).toBe(false);
    output.time = minGap;
    expect(player.play("hop")).toBe(true);
    expect(output.played.map((p) => p.at)).toEqual([0, minGap]);
  });

  it("measures the gap from the last play that sounded, so mashing can't creep through", () => {
    const output = fakeOutput();
    const player = playerOn(output);
    const { minGap } = SOUNDS.bonk;
    player.play("bonk");
    output.time = minGap * 0.6;
    player.play("bonk");
    output.time = minGap * 1.2;
    expect(player.play("bonk")).toBe(true);
    expect(output.played).toHaveLength(2);
  });

  it("keeps each sound's gap to itself", () => {
    const output = fakeOutput();
    const player = playerOn(output);
    expect(player.play("pass")).toBe(true);
    expect(player.play("bonk")).toBe(true);
    expect(player.play("hop")).toBe(true);
  });

  it("holds the gap for plays scheduled ahead", () => {
    const output = fakeOutput();
    const player = playerOn(output);
    expect(player.play("gate", { delay: 1 })).toBe(true);
    expect(player.play("gate", { delay: 1 + SOUNDS.gate.minGap / 2 })).toBe(false);
    expect(player.play("gate", { delay: 1 + SOUNDS.gate.minGap })).toBe(true);
  });

  it("plays nothing while muted", () => {
    const output = fakeOutput();
    const player = playerOn(output, { muted: true, volume: 1 });
    expect(player.play("finish")).toBe(false);
    expect(output.played).toEqual([]);
  });

  it("scales the gain by the master volume and shifts the rate by semitones", () => {
    const output = fakeOutput();
    const player = playerOn(output, { muted: false, volume: 0.5 }, () => 0.5);
    player.play("finish", { semitones: 12 });
    const [{ rate, gain }] = output.played;
    expect(rate).toBeCloseTo(2);
    expect(gain).toBeCloseTo(0.5);
  });
});
