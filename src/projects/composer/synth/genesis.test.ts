import { describe, expect, it } from "vitest";
import { renderNote } from "./band";
import { renderFm, type Operator } from "./genesis";
import { INSTRUMENT_IDS, LIBRARY, type Instrument } from "./library";

const sampleRate = 44100;
const work = { notes: 0, oscillatorSamples: 0 };
const A = 69;
const HZ = 440;

// The chip's diagrams, written out again by hand: every chain from a modulator
// to the output, in operator numbers. A wrong routing still makes a sound, and
// no number but this would say so.
const DIAGRAMS = [
  [[1, 2, 3, 4]],
  [[1, 3, 4], [2, 3, 4]],
  [[1, 4], [2, 3, 4]],
  [[1, 2, 4], [3, 4]],
  [[1, 2], [3, 4]],
  [[1, 2], [1, 3], [1, 4]],
  [[1, 2], [3], [4]],
  [[1], [2], [3], [4]],
];

// Odd multiples, so no sum of two lands on the harmonics the DAC's crossover
// step adds, which are odd too.
const MULS = [1, 3, 5, 7];

function operator(number: number, on: boolean): Operator {
  return { mul: MULS[number - 1], dt: 0, tl: on ? 16 : 127, ar: 31, d1r: 0, d1l: 0, d2r: 0, ks: 0, vel: 0 };
}

function play(algorithm: number, on: readonly number[]): Float32Array {
  const [one, two, three, four] = [1, 2, 3, 4].map((number) => operator(number, on.includes(number)));
  const voice = { kind: "fm", algorithm, feedback: 0, release: 0.01, dynamics: 1, output: 1, operators: [one, two, three, four] } as const;
  return renderFm(voice, A, 1, 0.2, sampleRate, work).left;
}

// How much of a frequency is in a sound, by a single bin of a Fourier sum.
function amount(samples: Float32Array, hz: number): number {
  let re = 0;
  let im = 0;
  for (let i = 0; i < samples.length; i++) {
    const phase = (2 * Math.PI * hz * i) / sampleRate;
    re += samples[i] * Math.cos(phase);
    im += samples[i] * Math.sin(phase);
  }
  return (2 * Math.hypot(re, im)) / samples.length;
}

const sumHz = (operators: readonly number[]): number => operators.reduce((sum, number) => sum + MULS[number - 1] * HZ, 0);
const peak = (samples: Float32Array): number => samples.reduce((most, value) => Math.max(most, Math.abs(value)), 0);
const PRESENT = 0.01;
const ABSENT = 0.004;

describe("the eight algorithms", () => {
  it.each(DIAGRAMS.map((paths, algorithm) => [algorithm, paths] as const))("algorithm %i routes as the chip's diagram", (algorithm, paths) => {
    const heard = new Set(paths.map((path) => path[path.length - 1]));
    for (const path of paths) expect(amount(play(algorithm, path), sumHz(path)), `path ${path.join(">")}`).toBeGreaterThan(PRESENT);
    for (const number of [1, 2, 3, 4]) {
      const alone = peak(play(algorithm, [number]));
      if (heard.has(number)) expect(alone, `${String(number)} is heard`).toBeGreaterThan(0.1);
      else expect(alone, `${String(number)} is silent alone`).toBe(0);
    }
    for (const carrier of heard) {
      for (const other of [1, 2, 3, 4]) {
        if (other === carrier || paths.some((path) => path[path.indexOf(other) + 1] === carrier && path.includes(other))) continue;
        expect(amount(play(algorithm, [other, carrier]), sumHz([other, carrier])), `${String(other)} doesn't bend ${String(carrier)}`).toBeLessThan(ABSENT);
      }
    }
  });
});

describe("the 16-bit family", () => {
  // Feedback and clipping at the extremes are where a voice would blow up.
  it("stays finite and in range at the ends of MIDI's pitch and strength", () => {
    for (const id of INSTRUMENT_IDS) {
      const voice: Instrument = LIBRARY[id];
      if (voice.kind !== "fm" && voice.kind !== "kit") continue;
      for (const pitch of [0, 127]) {
        for (const velocity of [0.25, 1]) {
          const { left } = renderNote(voice, pitch, velocity, 0, 1, sampleRate, work);
          expect(left.every(Number.isFinite), `${id} ${String(pitch)}`).toBe(true);
          expect(peak(left), `${id} ${String(pitch)}`).toBeLessThan(1.1);
        }
      }
    }
  });
});
