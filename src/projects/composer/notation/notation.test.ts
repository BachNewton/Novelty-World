import { describe, expect, it } from "vitest";
import { PIECES } from "../pieces";
import type { Note, Role, Score } from "../types";
import { notationToMei } from "./mei";
import { metreOf, splitNote, splitRest, valueOf } from "./metre";
import { detectKeys, spellScore } from "./spell";
import { buildTimeline, scrollAt, soundingBeats } from "./timeline";
import { clefFor, keepsIn, transcribe, type Staff, type Written } from "./transcribe";

const LETTERS = "CDEFGAB";

function note(pitch: number, start: number, duration: number): Note {
  return { pitch, start, duration, velocity: 0.7 };
}

function score(notes: Note[], metre: readonly [number, number] = [4, 4], key = "C", role: Role = "lead"): Score {
  return { title: "T", tempo: [{ beat: 0, bpm: 120 }], pedal: [], metre, key, tracks: [{ name: "t", role, notes }] };
}

function name(written: Written): string {
  const length = `${String(written.dur)}${written.dots === 1 ? "." : ""}${written.tuplet === null ? "" : "t"}`;
  if (written.notes.length === 0) return `r${length}`;
  return written.notes.some(({ tie }) => tie === "i" || tie === "m") ? `${length}~` : length;
}

const rhythm = (staff: Staff, bar: number, voice = 0): string => (staff.bars[bar].at(voice) ?? []).map(name).join(" ");

function spelledNames(source: Score): string[] {
  const spelling = spellScore(source, detectKeys(source, 8));
  return source.tracks[0].notes.map((entry) => {
    const spelled = spelling.get(entry);
    if (spelled === undefined) throw new Error("unspelled");
    return `${LETTERS[spelled.letter]}${spelled.alter > 0 ? "#".repeat(spelled.alter) : "b".repeat(-spelled.alter)}`;
  });
}

describe("written values", () => {
  it("cuts a note where the bar's beat must show", () => {
    const fourFour = metreOf([4, 4]);
    const span = (start: number, end: number): number[][] => splitNote({ start, end }, fourFour).map((part) => [part.start, part.end]);
    expect(span(0, 72)).toEqual([[0, 72]]); // a dotted quarter from the beat
    expect(span(24, 72)).toEqual([[24, 72]]); // the syncopated quarter
    expect(span(72, 120)).toEqual([[72, 96], [96, 120]]); // ...but not over the middle
    expect(span(24, 96)).toEqual([[24, 48], [48, 96]]); // off the beat, the beat shows
  });

  it("shows compound beats in notes and rests", () => {
    const sixEight = metreOf([6, 8]);
    expect(splitNote({ start: 0, end: 96 }, sixEight)).toEqual([{ start: 0, end: 72 }, { start: 72, end: 96 }]);
    expect(splitNote({ start: 0, end: 72 }, sixEight)).toEqual([{ start: 0, end: 72 }]);
    expect(splitRest({ start: 24, end: 144 }, sixEight)).toEqual([{ start: 24, end: 48 }, { start: 48, end: 72 }, { start: 72, end: 144 }]);
  });

  it("never leaves a length it can't write", () => {
    for (const metre of [metreOf([4, 4]), metreOf([6, 8]), metreOf([3, 4]), metreOf([7, 8])]) {
      for (let start = 0; start < metre.barTicks; start += 6) {
        for (let end = start + 6; end <= metre.barTicks; end += 6) {
          for (const part of [...splitNote({ start, end }, metre), ...splitRest({ start, end }, metre)]) {
            expect(valueOf(part.end - part.start), `${String(start)}-${String(end)}`).not.toBeNull();
          }
        }
      }
    }
  });
});

describe("rhythm", () => {
  it("ties over a bar line, spelled once", () => {
    const { staves } = transcribe(score([note(66, 3, 2)]));
    expect(rhythm(staves[0], 0)).toBe("r2 r4 4~");
    expect(rhythm(staves[0], 1)).toBe("4 r4 r2");
    expect(staves[0].bars[0][0][2].notes[0].accidental).toBe(1);
    expect(staves[0].bars[1][0][0].notes[0].accidental).toBeNull();
    expect(staves[0].bars[1][0][0].notes[0].tie).toBe("t");
  });

  it("writes compound metre in its beats", () => {
    const { staves } = transcribe(score([note(60, 0, 1), note(62, 1, 0.5), note(64, 1.5, 1.5)], [6, 8]));
    expect(rhythm(staves[0], 0)).toBe("4 8 4.");
  });

  it("finds triplets only where the notes are triplets", () => {
    const third = 1 / 3;
    const triplets = transcribe(score([note(60, 0, third), note(62, third, third), note(64, 2 * third, third), note(65, 1, 1)]));
    expect(rhythm(triplets.staves[0], 0)).toBe("8t 8t 8t 4 r2");
    expect(triplets.staves[0].bars[0][0][0].tuplet?.count).toBe(3);
    const strayed = transcribe(score([note(60, 0.02, 0.48), note(62, 0.51, 0.47), note(64, 1, 1)]));
    expect(rhythm(strayed.staves[0], 0)).toBe("8 8 4 r2");
  });

  it("reads swing as straight eighths with a marking, and keeps the sounding time", () => {
    const swung = Array.from({ length: 16 }, (_, index) => note(60 + (index % 5), index % 2 === 0 ? index / 2 : (index - 1) / 2 + 2 / 3, index % 2 === 0 ? 0.6 : 0.3));
    const notation = transcribe(score(swung));
    expect(notation.swing).toBe(true);
    expect(rhythm(notation.staves[0], 0)).toBe("8 8 8 8 8 8 8 8");
    expect(soundingBeats(notation.timing, 0.5)).toBeCloseTo(2 / 3);
    expect(soundingBeats(notation.timing, 1)).toBeCloseTo(1);
  });

  it("reads a clipped note as the length it was asked for, staccato", () => {
    const { staves } = transcribe(score(Array.from({ length: 8 }, (_, index) => note(60, index / 2, 0.25))));
    expect(rhythm(staves[0], 0)).toBe("8 8 8 8 8 8 8 8");
    expect(staves[0].bars[0][0][0].staccato).toBe(true);
  });

  it("adds up in every bar of every voice of every piece", () => {
    for (const piece of PIECES) {
      const notation = transcribe(piece.score());
      const { barTicks } = metreOf(notation.metre);
      for (const staff of notation.staves) {
        staff.bars.forEach((bar, index) => {
          for (const voice of bar) {
            const sum = voice.reduce((total, { end, start }) => total + end - start, 0);
            expect(sum, `${piece.id} ${staff.name} bar ${String(index + 1)}`).toBe(barTicks);
          }
        });
      }
    }
  });
});

describe("pitch spelling", () => {
  const line = (pitches: number[]): Note[] => pitches.map((pitch, index) => note(pitch, index, 1));

  it("spells by the key, not by a table", () => {
    expect(spelledNames(score(line([70, 75, 77, 79, 68]), [4, 4], "Eb"))).toEqual(["Bb", "Eb", "F", "G", "Ab"]);
    expect(spelledNames(score(line([66, 73, 68, 71, 69]), [4, 4], "A"))).toEqual(["F#", "C#", "G#", "B", "A"]);
    expect(spelledNames(score(line([61, 66, 68, 69, 71]), [4, 4], "F#m"))).toEqual(["C#", "F#", "G#", "A", "B"]);
  });

  it("gives minor keys their leading tone", () => {
    expect(spelledNames(score(line([66, 65, 66, 69]), [4, 4], "F#m"))).toEqual(["F#", "E#", "F#", "A"]);
    expect(spelledNames(score(line([69, 68, 69, 72]), [4, 4], "Am"))).toEqual(["A", "G#", "A", "C"]);
  });

  it("keeps every pitch the pitch it was, in every key", () => {
    const natural = [0, 2, 4, 5, 7, 9, 11];
    for (const key of ["C", "G", "D", "A", "E", "F", "Bb", "Eb", "Ab", "Db", "Am", "Em", "Dm", "F#m", "C#m", "Cm", "Fm"]) {
      const source = score(line(Array.from({ length: 48 }, (_, index) => 36 + index)), [4, 4], key);
      for (const [entry, { letter, alter, octave }] of spellScore(source, detectKeys(source, 8))) {
        expect(natural[letter] + alter + (octave + 1) * 12, key).toBe(entry.pitch);
        expect(Math.abs(alter), key).toBeLessThan(2);
      }
    }
  });

  it("spells a chromatic line by its direction", () => {
    expect(spelledNames(score(line([60, 61, 62]), [4, 4], "C"))).toEqual(["C", "C#", "D"]);
    expect(spelledNames(score(line([62, 61, 60]), [4, 4], "C"))).toEqual(["D", "Db", "C"]);
  });

  it("follows a modulation into a new signature", () => {
    const inG = [67, 71, 74, 72, 71, 69, 67, 66, 67, 74, 71, 67];
    const inBb = [70, 74, 77, 75, 74, 72, 70, 69, 70, 77, 74, 70];
    const bars = (pitches: number[], from: number): Note[] => Array.from({ length: 32 }, (_, index) => note(pitches[index % pitches.length], from + index, 1));
    const { keys } = transcribe(score([...bars(inG, 0), ...bars(inBb, 32)], [4, 4], "G"));
    expect(keys[0]).toEqual({ bar: 0, fifths: 1 });
    expect(keys.at(-1)?.fifths).toBe(-2);
  });
});

describe("staves and voices", () => {
  it("chooses a clef from the range", () => {
    expect(clefFor([60, 64, 67, 72])).toBe("treble");
    expect(clefFor([36, 43, 48])).toBe("bass");
    expect(clefFor([88, 91, 96])).toBe("treble8");
  });

  it("splits a wide keyboard part into a braced pair, a narrow one not", () => {
    const wide = score([note(40, 0, 1), note(45, 1, 1), note(84, 2, 1), note(79, 3, 1)], [4, 4], "C", "keys");
    const [upper, lower] = transcribe(wide).staves;
    expect([upper.clef, lower.clef]).toEqual(["treble", "bass"]);
    expect(upper.brace).toBe(0);
    expect(lower.brace).toBe(0);
    expect(transcribe(score([note(60, 0, 1), note(64, 1, 1)], [4, 4], "C", "keys")).staves).toHaveLength(1);
  });

  it("sets a held note and a moving line in two voices", () => {
    const { staves } = transcribe(score([note(60, 0, 4), note(72, 0, 1), note(74, 1, 1), note(76, 2, 1), note(77, 3, 1)]));
    expect(staves[0].bars[0]).toHaveLength(2);
    expect(rhythm(staves[0], 0, 0)).toBe("4 4 4 4");
    expect(rhythm(staves[0], 0, 1)).toBe("1");
  });

  it("groups notes struck and released together into one chord", () => {
    const { staves } = transcribe(score([note(60, 0, 1), note(64, 0, 1), note(67, 0, 1), note(62, 1, 1)]));
    expect(staves[0].bars[0]).toHaveLength(1);
    expect(staves[0].bars[0][0][0].notes).toHaveLength(3);
  });

  it("puts a kit on a percussion staff, feet in their own voice", () => {
    const kit = score([note(36, 0, 0.1), note(42, 0, 0.1), note(38, 1, 0.1), note(42, 1, 0.1)], [4, 4], "C", "drums");
    const [staff] = transcribe(kit).staves;
    expect(staff.clef).toBe("percussion");
    expect(staff.bars[0]).toHaveLength(2);
    expect(staff.bars[0][0][0].notes.some(({ drum }) => drum?.cross === true)).toBe(true);
  });

  it("keeps the melody and the bass when parts must go", () => {
    const part = (role: Role, label: string): Score["tracks"][number] => ({ name: label, role, notes: [note(60, 0, 1)] });
    const full: Score = { ...score([]), tracks: [part("drums", "d"), part("pad", "p"), part("bass", "b"), part("lead", "l"), part("keys", "k")] };
    expect(keepsIn(full, 2).map((track) => track.name)).toEqual(["l", "b"]);
  });
});

describe("the MEI", () => {
  it("names every tied note under the first, which is all the timemap reports", () => {
    const { mei, ties } = notationToMei(transcribe(score([note(60, 3, 3)])));
    expect([...ties.values()].flat()).toHaveLength(1);
    expect(mei).toContain('tie="i"');
    expect(mei).toContain('tie="t"');
  });
});

describe("the timeline", () => {
  const timeline = buildTimeline(
    [
      { qstamp: 0, on: ["a"] },
      { qstamp: 1, off: ["a"], on: ["b"] },
      { qstamp: 2, off: ["b"], on: ["c"] },
      { qstamp: 3, off: ["c"] },
    ],
    (id) => new Map([["a", 0.1], ["b", 0.2], ["c", 0.5]]).get(id) ?? null,
    (quarters) => quarters / 2,
    new Map([["b", ["b2"]]]),
  );

  it("passes through every note exactly and never runs backwards", () => {
    expect(scrollAt(timeline, 0)).toBeCloseTo(0.1);
    expect(scrollAt(timeline, 0.5)).toBeCloseTo(0.2);
    expect(scrollAt(timeline, 1)).toBeCloseTo(0.5);
    let last = -1;
    for (let time = -0.5; time < 2; time += 0.01) {
      const x = scrollAt(timeline, time);
      expect(x).toBeGreaterThanOrEqual(last - 1e-9);
      last = x;
    }
  });

  it("knows what sounds at each moment, held ties and all", () => {
    expect(timeline.sounding).toEqual([["a"], ["b", "b2"], ["c"], []]);
  });
});
