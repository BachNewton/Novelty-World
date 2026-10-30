import { describe, expect, it } from "vitest";
import type { Score } from "../types";
import { renderBand, renderNote } from "./band";
import { INSTRUMENT_IDS, LIBRARY, type Instrument } from "./library";
import { isWhiny, whine } from "./whine";

const sampleRate = 44100;
const HELD_FROM = 1.2;
const SECONDS = 2.2;

describe("no whine", () => {
  it("is measured at the top of every sustained sound, and catches a bare high sine", () => {
    const work = { notes: 0, oscillatorSamples: 0 };
    const sine = Float32Array.from({ length: SECONDS * sampleRate }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 2093 * i) / sampleRate));
    expect(isWhiny(whine(sine, sampleRate, HELD_FROM))).toBe(true);
    for (const id of INSTRUMENT_IDS) {
      const voice: Instrument = LIBRARY[id];
      if (voice.kind === "kit") continue;
      const reading = whine(renderNote(voice, voice.range[1], 0.75, 0, SECONDS, sampleRate, work).left, sampleRate, HELD_FROM);
      expect(isWhiny(reading), `${id} ${JSON.stringify(reading)}`).toBe(false);
    }
  });
});

describe("a held note", () => {
  // Two uses of one cached note: the short one must not set its length.
  it("sounds to its end when an earlier use of the same note was short", () => {
    const note = { start: 0, duration: 0.5, velocity: 0.75 };
    const score: Score = {
      title: "t",
      tempo: [{ beat: 0, bpm: 60 }],
      pedal: [],
      metre: [4, 4],
      key: "C",
      tracks: [{ name: "t", role: "pad", notes: [{ ...note, pitch: 60 }, { ...note, pitch: 67 }, { ...note, pitch: 60, start: 1, duration: 9 }] }],
    };
    const { left } = renderBand(score, { hall: { size: 0.5, wet: 0, damp: 0.5, preDelay: 0.01 }, level: 1, chairs: { t: [{ instrument: "juno-ensemble", gain: 1, pan: 0, send: 0 }] } }, sampleRate);
    const energy = (second: number): number => left.slice(second * sampleRate, (second + 1) * sampleRate).reduce((sum, value) => sum + value * value, 0);
    expect(energy(8.9)).toBeGreaterThan(energy(5) * 0.5);
  });
});

describe("a stream", () => {
  // Everything that rings across a join must carry over it: where the stretches
  // are cut must not be audible, down to the last bit.
  it("is the same audio wherever its chunks fall", () => {
    const notes = [60, 64, 67, 72].map((pitch, index) => ({ pitch, start: index, duration: 1.5, velocity: 0.7 }));
    const score: Score = { title: "t", tempo: [{ beat: 0, bpm: 120 }, { beat: 2, bpm: 60, glide: true }], pedal: [{ start: 0.5, end: 3 }], metre: [4, 4], key: "C", tracks: [{ name: "t", role: "keys", notes }, { name: "u", role: "lead", notes }] };
    const chair = { gain: 1, pan: 0.2, send: 0.5, chorus: 0.3, lowCut: 100, highCut: 3000, duck: -3 };
    const band = { hall: { size: 0.7, wet: 0.2, damp: 0.5, preDelay: 0.02 }, level: 0.5, tune: ["u"], chairs: { t: [{ ...chair, instrument: "iron-concert" as const }], u: [{ ...chair, instrument: "juno-ensemble" as const }] } };
    const long = renderBand(score, band, sampleRate);
    const short = renderBand(score, band, sampleRate, 4096);
    expect(short.left.findIndex((sample, index) => sample !== long.left[index])).toBe(-1);
    expect(short.right.findIndex((sample, index) => sample !== long.right[index])).toBe(-1);
  });

  it("rings a note on under the pedal, and stops it when the pedal lifts", () => {
    const note = { pitch: 60, start: 0, duration: 0.25, velocity: 0.75 };
    const score = (pedal: Score["pedal"]): Score => ({ title: "t", tempo: [{ beat: 0, bpm: 60 }], pedal, metre: [4, 4], key: "C", tracks: [{ name: "t", role: "keys", notes: [note] }] });
    const band = { hall: { size: 0.5, wet: 0, damp: 0.5, preDelay: 0.01 }, level: 1, chairs: { t: [{ instrument: "iron-concert" as const, gain: 1, pan: 0, send: 0 }] } };
    const energy = (samples: Float32Array, second: number): number => samples.slice(second * sampleRate, (second + 0.5) * sampleRate).reduce((sum, value) => sum + value * value, 0);
    const dry = renderBand(score([]), band, sampleRate).left;
    const pedalled = renderBand(score([{ start: 0.1, end: 2 }]), band, sampleRate).left;
    expect(energy(pedalled, 1.2)).toBeGreaterThan(energy(dry, 1.2) * 100);
    expect(energy(pedalled, 3)).toBeLessThan(energy(pedalled, 1.2) * 0.01);
  });
});
