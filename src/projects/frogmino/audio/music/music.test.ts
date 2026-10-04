import { describe, expect, it, vi } from "vitest";
import { compileTheme, noteFrequency, themeSeconds, tokens, zzfxmSource, type Theme } from "./song";
import { THEMES } from "./themes";
import { rowSamples, zzfxm, type ZzfxmSong } from "./zzfxm";

const RATE = 400;

// A fake ZzFX: a steady sample of 1 as long as its sustain parameter, so the
// mixing can be checked by hand.
function steady(params: number[]): number[] {
  return Array.from({ length: Math.round(params[4] * RATE) }, () => 1);
}

// One instrument at 100 Hz that holds for a second; 60 BPM makes a row a
// quarter of a second, 100 samples at this rate.
function song(notes: number[], channel2?: number[]): ZzfxmSong {
  const channels = [[0, 0, ...notes]];
  if (channel2 !== undefined) channels.push([0, 1, ...channel2]);
  return [[[1, 0, 100, 0, 1]], [channels], [0], 60];
}

describe("zzfxm", () => {
  it("makes each row a quarter of a beat", () => {
    expect(rowSamples(60, RATE)).toBe(100);
    const [left, right] = zzfxm(song([13, 0, 0, 0]), RATE, steady);
    expect(left).toHaveLength(400);
    expect(right).toHaveLength(400);
  });

  it("lets a note ring on through rests and halves it into both speakers", () => {
    const [left, right] = zzfxm(song([13, 0, 0, 0]), RATE, steady);
    expect(left[0]).toBeCloseTo(0.5);
    expect(right[250]).toBeCloseTo(0.5);
  });

  it("silences a released note, fading it out at the end of the row before", () => {
    const [left] = zzfxm(song([13, 0, -1, 0]), RATE, steady);
    expect(left[50]).toBeCloseTo(0.5);
    expect(left[199]).toBeLessThan(0.05);
    expect(left[250]).toBe(0);
  });

  it("turns a note down by its fraction", () => {
    const [left] = zzfxm(song([13.5, 0, 0, 0]), RATE, steady);
    expect(left[0]).toBeCloseTo(0.25);
  });

  it("pans a channel by its panning", () => {
    const [left, right] = zzfxm(song([0, 0, 0, 0], [13, 0, 0, 0]), RATE, steady);
    expect(left[0]).toBeCloseTo(0);
    expect(right[0]).toBeCloseTo(1);
  });

  it("tunes note 12 to the instrument's frequency, a semitone a step, and builds each note once", () => {
    const build = vi.fn(steady);
    zzfxm(song([12, 24, 12, 24]), RATE, build);
    expect(build).toHaveBeenCalledTimes(2);
    expect(build.mock.calls[0][0][2]).toBeCloseTo(100);
    expect(build.mock.calls[1][0][2]).toBeCloseTo(200);
  });
});

describe("compileTheme", () => {
  const theme = (notes: string, base = "B4"): Theme => ({
    id: "test",
    name: "Test",
    use: "",
    mood: "",
    style: [],
    key: "C major",
    kind: "loop",
    bpm: 120,
    beatsPerBar: 1,
    instruments: [{ name: "Test", base, zzfx: {} }],
    patterns: [[{ instrument: 0, pan: 0.5, notes }]],
    sequence: [0],
  });

  it("tunes the instrument to its base and counts notes in semitones from it", () => {
    const [instruments, patterns] = compileTheme(theme("B4 C5 Bb4 C4 | . - x E5.4"));
    expect(instruments[0][2]).toBeCloseTo(noteFrequency("B4"));
    expect(patterns[0][0]).toEqual([0, 0.5, 12, 13, 11, 1, 0, -1, 12, 17.4]);
  });

  it("knows its pitches", () => {
    expect(noteFrequency("A4")).toBeCloseTo(440);
    expect(noteFrequency("C4")).toBeCloseTo(261.63, 1);
    expect(noteFrequency("F#5")).toBeCloseTo(739.99, 1);
  });

  it("fails loudly on a note out of the instrument's range, or one it can't read", () => {
    expect(() => compileTheme(theme("B3"))).toThrow(/out of range/);
    expect(() => compileTheme(theme("C7"))).toThrow(/out of range/);
    expect(() => compileTheme(theme("H4"))).toThrow(/Not a note/);
  });

  it("fails loudly on channels of different lengths", () => {
    const uneven = theme("C5 . . .");
    expect(() =>
      compileTheme({ ...uneven, patterns: [[uneven.patterns[0][0], { instrument: 0, pan: 0, notes: "C5 . ." }]] }),
    ).toThrow(/3 rows, not 4/);
  });
});

describe("the themes", () => {
  it("have distinct ids, and say what they are for and what style they borrow", () => {
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
    for (const theme of THEMES) {
      expect(theme.use).not.toBe("");
      expect(theme.mood).not.toBe("");
      expect(theme.style.length).toBeGreaterThan(0);
    }
  });

  it("all compile", () => {
    for (const theme of THEMES) expect(() => compileTheme(theme)).not.toThrow();
  });

  it("keep every bar of every channel a full bar", () => {
    for (const theme of THEMES) {
      for (const pattern of theme.patterns) {
        for (const { notes } of pattern) {
          const bars = notes.split("|").filter((bar) => bar.trim() !== "");
          for (const bar of bars) expect(tokens(bar), `${theme.id}: ${bar}`).toHaveLength(theme.beatsPerBar * 4);
        }
      }
    }
  });

  it("loop for at most two minutes, and jingles are short", () => {
    for (const theme of THEMES) {
      const seconds = themeSeconds(theme);
      if (theme.kind === "loop") {
        expect(seconds, theme.id).toBeGreaterThanOrEqual(15);
        expect(seconds, theme.id).toBeLessThanOrEqual(120);
      } else {
        expect(seconds, theme.id).toBeLessThanOrEqual(6);
      }
    }
  });

  it("copy out as ZzFXM source the tracker can read", () => {
    for (const theme of THEMES) {
      const [instruments, patterns, sequence, bpm, meta] = JSON.parse(zzfxmSource(theme)) as [...ZzfxmSong, { title: string }];
      expect(instruments).toHaveLength(theme.instruments.length);
      expect(patterns).toHaveLength(theme.patterns.length);
      expect(sequence).toEqual(theme.sequence);
      expect(bpm).toBe(theme.bpm);
      expect(meta.title).toBe(theme.name);
    }
  });

  it("render with ZzFX to their length, quietly enough to sit under the sound effects", async () => {
    // ZzFX creates its AudioContext as it loads; rendering doesn't use it.
    vi.stubGlobal("AudioContext", class {});
    const { ZZFX } = await import("zzfx");
    vi.unstubAllGlobals();
    for (const theme of THEMES) {
      const [left, right] = zzfxm(compileTheme(theme), ZZFX.sampleRate, (params) => ZZFX.buildSamples(...params));
      expect(left.length / ZZFX.sampleRate, theme.id).toBeCloseTo(themeSeconds(theme), 1);
      let peak = 0;
      for (let i = 0; i < left.length; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
      expect(peak, theme.id).toBeGreaterThan(0.1);
      expect(peak, theme.id).toBeLessThan(0.5);
    }
  });
});
