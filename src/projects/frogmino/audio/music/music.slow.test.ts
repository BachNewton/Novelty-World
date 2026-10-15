import { beforeAll, describe, expect, it, vi } from "vitest";
import { renderSound, SOUNDS, type SoundId } from "../sounds";
import { MUSIC_LEVEL } from "./mix";
import { compileTheme, themeSeconds, type Theme } from "./song";
import { THEMES } from "./themes";
import { zzfxm } from "./zzfxm";

// Renders every theme in full, some seconds of work that grows with each
// theme added. It catches what the format's own checks can't see: a theme
// rendering to the wrong length, too quiet or clipping, and a theme loud
// enough in some stretch, or in some band, to bury a sound the players need
// to hear. Set MIX_REPORT=1 to print the measurements.

// The sounds that carry information, which every theme must leave clear.
const INFORMATION: readonly SoundId[] = ["bonk", "pass", "hop"];

// How far above a theme's loudest stretch each must stand, in decibels:
// broadband, and in the octave the sound is loudest in.
const BROADBAND_MARGIN = 3;
const BAND_MARGIN = 6;

// The music's loudest stretch is read over windows of 400 ms (the window of
// momentary loudness), a sound over 50 ms, about its own length.
const STRETCH_SECONDS = 0.4;
const SOUND_SECONDS = 0.05;

// Octave bands, by their middle frequency.
const BANDS = [125, 250, 500, 1000, 2000, 4000, 8000];

type Build = (params: number[]) => number[];

function decibels(level: number): number {
  return 20 * Math.log10(level);
}

// A one-octave band-pass (a biquad of the Audio EQ Cookbook, unity gain at its
// middle).
function bandPass(samples: Float32Array, middle: number, sampleRate: number): Float32Array {
  const w = (2 * Math.PI * middle) / sampleRate;
  const alpha = Math.sin(w) * Math.sinh((Math.LN2 / 2) * ((1 * w) / Math.sin(w)));
  const a0 = 1 + alpha;
  const [b0, b2, a1, a2] = [alpha / a0, -alpha / a0, (-2 * Math.cos(w)) / a0, (1 - alpha) / a0];
  const out = new Float32Array(samples.length);
  let [x1, x2, y1, y2] = [0, 0, 0, 0];
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    [x2, x1, y2, y1] = [x1, x, y1, y];
    out[i] = y;
  }
  return out;
}

// The loudest RMS level over any window of `seconds`, of the louder of the
// channels given, from running sums of the squares.
function loudest(channels: readonly Float32Array[], seconds: number, sampleRate: number): number {
  const size = Math.round(seconds * sampleRate);
  let best = 0;
  for (const samples of channels) {
    const sums = new Float64Array(samples.length + 1);
    for (let i = 0; i < samples.length; i++) sums[i + 1] = sums[i] + samples[i] ** 2;
    const last = Math.max(0, samples.length - size);
    for (let start = 0; start <= last; start++) {
      const end = Math.min(start + size, samples.length);
      best = Math.max(best, Math.sqrt((sums[end] - sums[start]) / size));
    }
  }
  return best;
}

interface Measured {
  // The loudest stretch, broadband and per band, at the music's level.
  stretch: number;
  bands: Map<number, number>;
}

let sampleRate = 0;
let build: Build = () => [];
const rendered = new Map<string, [Float32Array, Float32Array]>();
const measured = new Map<string, Measured>();

function renderTheme(theme: Theme): [Float32Array, Float32Array] {
  let samples = rendered.get(theme.id);
  if (samples === undefined) {
    samples = zzfxm(compileTheme(theme), sampleRate, build);
    rendered.set(theme.id, samples);
  }
  return samples;
}

function measureTheme(theme: Theme): Measured {
  let found = measured.get(theme.id);
  if (found === undefined) {
    const channels = renderTheme(theme).map((samples) => samples.map((sample) => sample * MUSIC_LEVEL));
    found = {
      stretch: loudest(channels, STRETCH_SECONDS, sampleRate),
      bands: new Map(BANDS.map((middle) => [middle, loudest(channels.map((c) => bandPass(c, middle, sampleRate)), STRETCH_SECONDS, sampleRate)])),
    };
    measured.set(theme.id, found);
  }
  return found;
}

// A sound at its quietest play: its variation can turn it down.
function soundSamples(id: SoundId): Float32Array {
  const design = SOUNDS[id];
  const quietest = 1 - design.variation.volume;
  return renderSound(design, sampleRate, build).map((sample) => sample * quietest);
}

beforeAll(async () => {
  // ZzFX creates its AudioContext as it loads; rendering doesn't use it.
  vi.stubGlobal("AudioContext", class {});
  const { ZZFX } = await import("zzfx");
  vi.unstubAllGlobals();
  sampleRate = ZZFX.sampleRate;
  build = (params) => ZZFX.buildSamples(...params);
});

describe("the themes", () => {
  it("render with ZzFX to their length, loud enough to hear and short of clipping", () => {
    for (const theme of THEMES) {
      const [left, right] = renderTheme(theme);
      expect(left.length / sampleRate, theme.id).toBeCloseTo(themeSeconds(theme), 1);
      let peak = 0;
      for (let i = 0; i < left.length; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
      expect(peak * MUSIC_LEVEL, theme.id).toBeGreaterThan(0.1);
      expect(peak * MUSIC_LEVEL, theme.id).toBeLessThan(0.9);
    }
  });

  it("leave the bonk, the pass and the hop clear over their loudest stretch, broadband and in each sound's own band", () => {
    const report: string[] = [];
    for (const id of INFORMATION) {
      const samples = soundSamples(id);
      const level = loudest([samples], SOUND_SECONDS, sampleRate);
      const bandLevels = BANDS.map((middle) => loudest([bandPass(samples, middle, sampleRate)], SOUND_SECONDS, sampleRate));
      const band = BANDS[bandLevels.indexOf(Math.max(...bandLevels))];
      const inBand = Math.max(...bandLevels);
      report.push(`${id}: ${decibels(level).toFixed(1)} dB, ${decibels(inBand).toFixed(1)} dB in the ${String(band)} Hz octave`);
      for (const theme of THEMES) {
        const { stretch, bands } = measureTheme(theme);
        const broadband = decibels(level) - decibels(stretch);
        const banded = decibels(inBand) - decibels(bands.get(band) ?? 0);
        report.push(`  ${theme.id}: loudest ${decibels(stretch).toFixed(1)} dB; ${id} clears it by ${broadband.toFixed(1)} dB, by ${banded.toFixed(1)} dB in band`);
        expect(broadband, `${theme.id} buries the ${id}`).toBeGreaterThanOrEqual(BROADBAND_MARGIN);
        expect(banded, `${theme.id} buries the ${id} in the ${String(band)} Hz octave`).toBeGreaterThanOrEqual(BAND_MARGIN);
      }
    }
    if (process.env.MIX_REPORT !== undefined) console.log(report.join("\n"));
  });
});
