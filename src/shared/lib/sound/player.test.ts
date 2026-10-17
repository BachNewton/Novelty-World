import { describe, expect, it } from "vitest";
import type { SoundDesign } from "./design";
import { SoundPlayer, vary, type AudioOutput, type SoundSettings } from "./player";

const design = (minGap: number, variation = { pitch: 0.05, volume: 0.2 }): SoundDesign => ({
  label: "test",
  trigger: "test",
  layers: [{ at: 0, zzfx: {} }],
  variation,
  minGap,
  busiestEvery: minGap,
});

const DESIGNS = { tick: design(0.1), thud: design(0.3), chime: design(2, { pitch: 0, volume: 0 }) };
type Id = keyof typeof DESIGNS;

interface Played {
  id: Id;
  at: number;
  rate: number;
  gain: number;
}

// An output on a clock the test moves by hand.
function fakeOutput(): AudioOutput<Id> & { time: number; played: Played[] } {
  const output = {
    time: 0,
    played: [] as Played[],
    now: () => output.time,
    play: (id: Id, at: number, rate: number, gain: number) => {
      output.played.push({ id, at, rate, gain });
    },
  };
  return output;
}

function playerOn(output: AudioOutput<Id>, settings: SoundSettings = { muted: false, volume: 1 }, random = () => 0.5): SoundPlayer<Id> {
  return new SoundPlayer(DESIGNS, output, () => settings, random);
}

describe("vary", () => {
  it("keeps a sound's rate and gain within its range, at the extremes and between", () => {
    const variation = { pitch: 0.07, volume: 0.2 };
    for (const r of [0, 0.25, 0.5, 0.75, 0.999999]) {
      const { rate, gain } = vary(variation, () => r);
      expect(rate).toBeGreaterThanOrEqual(1 - variation.pitch);
      expect(rate).toBeLessThanOrEqual(1 + variation.pitch);
      expect(gain).toBeGreaterThan(1 - variation.volume - 1e-9);
      expect(gain).toBeLessThanOrEqual(1);
    }
  });

  it("strays both ways in pitch", () => {
    const variation = { pitch: 0.1, volume: 0 };
    expect(vary(variation, () => 0).rate).toBeCloseTo(0.9);
    expect(vary(variation, () => 1).rate).toBeCloseTo(1.1);
  });
});

describe("SoundPlayer", () => {
  it("keeps each voice's minimum gap apart, so one player's sound never swallows another's", () => {
    const output = fakeOutput();
    const player = playerOn(output);
    expect(player.play("tick", { voice: 0 })).toBe(true);
    output.time = DESIGNS.tick.minGap / 2;
    expect(player.play("tick", { voice: 1 })).toBe(true);
    expect(player.play("tick", { voice: 0 })).toBe(false);
    expect(player.play("tick", { voice: 1 })).toBe(false);
  });

  it("drops a play sooner than the sound's minimum gap, on the audio clock", () => {
    const output = fakeOutput();
    const player = playerOn(output);
    const { minGap } = DESIGNS.tick;
    expect(player.play("tick")).toBe(true);
    output.time = minGap * 0.99;
    expect(player.play("tick")).toBe(false);
    output.time = minGap;
    expect(player.play("tick")).toBe(true);
    expect(output.played.map((p) => p.at)).toEqual([0, minGap]);
  });

  it("measures the gap from the last play that sounded, so mashing can't creep through", () => {
    const output = fakeOutput();
    const player = playerOn(output);
    const { minGap } = DESIGNS.thud;
    player.play("thud");
    output.time = minGap * 0.6;
    player.play("thud");
    output.time = minGap * 1.2;
    expect(player.play("thud")).toBe(true);
    expect(output.played).toHaveLength(2);
  });

  it("keeps each sound's gap to itself", () => {
    const output = fakeOutput();
    const player = playerOn(output);
    expect(player.play("tick")).toBe(true);
    expect(player.play("thud")).toBe(true);
    expect(player.play("chime")).toBe(true);
  });

  it("holds the gap for plays scheduled ahead", () => {
    const output = fakeOutput();
    const player = playerOn(output);
    expect(player.play("thud", { delay: 1 })).toBe(true);
    expect(player.play("thud", { delay: 1 + DESIGNS.thud.minGap / 2 })).toBe(false);
    expect(player.play("thud", { delay: 1 + DESIGNS.thud.minGap })).toBe(true);
  });

  it("plays nothing while muted", () => {
    const output = fakeOutput();
    const player = playerOn(output, { muted: true, volume: 1 });
    expect(player.play("chime")).toBe(false);
    expect(output.played).toEqual([]);
  });

  it("scales the gain by the master volume and shifts the rate by semitones", () => {
    const output = fakeOutput();
    const player = playerOn(output, { muted: false, volume: 0.5 }, () => 0.5);
    player.play("chime", { semitones: 12 });
    const [{ rate, gain }] = output.played;
    expect(rate).toBeCloseTo(2);
    expect(gain).toBeCloseTo(0.5);
  });
});
