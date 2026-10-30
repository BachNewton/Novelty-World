import "@/shared/lib/sound/no-audio-context";
import { describe, expect, it } from "vitest";
import { ZZFX } from "zzfx";
import { humanize } from "./humanize";
import { PIECES } from "./pieces";
import { PERFORMERS, renderScore } from "./synth/render";
import { HAT, KICK, ROLES, SNARE, type Score } from "./types";

const context = { sampleRate: ZZFX.sampleRate, build: (params: number[]) => ZZFX.buildSamples(...params) };

// Every role across the keyboard, so a patch that blows up at some pitch
// shows as a number rather than a screech: resonators and feedback fail so.
const sweep: Score = {
  title: "sweep",
  bpm: 240,
  metre: [4, 4],
  key: "C",
  tracks: ROLES.map((role) => ({
    name: role,
    role,
    notes: (role === "drums" ? [KICK, SNARE, HAT] : [28, 40, 52, 64, 76, 88, 100]).map((pitch, i) => ({
      pitch,
      start: i * 2,
      duration: 2,
      velocity: 0.3 + i * 0.1,
    })),
  })),
};

function rms(samples: Float32Array): number {
  return Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
}

describe("every synth", () => {
  it.each(PERFORMERS.map((performer) => [performer.name, performer] as const))("%s renders a clean, audible sweep", (_, performer) => {
    const { left, right } = renderScore(sweep, performer, context);
    for (const channel of [left, right]) {
      expect(channel.every(Number.isFinite)).toBe(true);
      expect(rms(channel)).toBeGreaterThan(0.01);
    }
  });
});

describe("every piece", () => {
  it.each(PIECES.map((piece) => [piece.id, piece] as const))("%s renders on the piano", (_, piece) => {
    const { left } = renderScore(humanize(piece.score()), PERFORMERS[0], context);
    expect(rms(left)).toBeGreaterThan(0.01);
  });
});
