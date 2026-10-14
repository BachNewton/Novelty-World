import { parseNote, tokens } from "./song";

// Helpers for writing themes in the note format of `song.ts`: lines on a
// coarser grid than a sixteenth, a bar per chord, and moving a line by key
// (chromatically) or along a scale (diatonically, for mirrors and parallel
// thirds). Each returns a line of the same format, bar lines kept.

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// `quieter` is the fraction a note is turned down by, 0.1 to 0.9.
function noteName(semitone: number, quieter: number): string {
  const octave = Math.floor(semitone / 12);
  return `${NAMES[semitone - 12 * octave]}${String(octave)}${quieter === 0 ? "" : `.${String(Math.round(quieter * 10))}`}`;
}

// Maps every note of a line, bar by bar, leaving rests, releases and drum
// hits as they are.
function mapNotes(notes: string, map: (token: string) => string): string {
  return notes
    .split("|")
    .map((bar) =>
      tokens(bar)
        .map((token) => (token === "." || token === "-" || token === "x" ? token : map(token)))
        .join(" "),
    )
    .filter((bar) => bar !== "")
    .join(" | ");
}

// A line written on a coarser grid: each token lasts `rows` rows, so
// `spread("C5 . E5 -", 2)` is a line of eighth notes.
export function spread(notes: string, rows: number): string {
  const rest = Array.from({ length: rows - 1 }, () => " .").join("");
  return notes
    .split("|")
    .map((bar) =>
      tokens(bar)
        .map((token) => `${token}${rest}`)
        .join(" "),
    )
    .filter((bar) => bar !== "")
    .join(" | ");
}

// One bar per chord, each written by `bar`, with bar lines between.
export function perBar<T>(chords: readonly T[], bar: (chord: T, index: number) => string): string {
  return chords.map(bar).join(" | ");
}

// The line moved by `semitones`.
export function transpose(notes: string, semitones: number): string {
  return mapNotes(notes, (token) => {
    const { semitone, quieter } = parseNote(token);
    return noteName(semitone + semitones, quieter);
  });
}

// A seven-note scale, by its notes' names (any octave, any order), for
// moving lines along it. A note off the scale fails loudly.
export class Scale {
  private readonly classes: readonly number[];

  constructor(names: readonly string[]) {
    if (names.length !== 7) throw new Error(`A scale has seven notes, not ${String(names.length)}`);
    this.classes = names.map((name) => parseNote(`${name}4`).semitone % 12).sort((a, b) => a - b);
  }

  // Steps up the scale from C0.
  private step(token: string): { step: number; quieter: number } {
    const { semitone, quieter } = parseNote(token);
    const octave = Math.floor(semitone / 12);
    const degree = this.classes.indexOf(semitone - 12 * octave);
    if (degree === -1) throw new Error(`${token} is off the scale`);
    return { step: octave * 7 + degree, quieter };
  }

  private note(step: number, quieter: number): string {
    const octave = Math.floor(step / 7);
    return noteName(octave * 12 + this.classes[step - 7 * octave], quieter);
  }

  // The line moved `steps` along the scale: -2 is a third below.
  shift(notes: string, steps: number): string {
    return mapNotes(notes, (token) => {
      const { step, quieter } = this.step(token);
      return this.note(step + steps, quieter);
    });
  }

  // The line mirrored about `axis` along the scale: where it rises, the
  // mirror falls by as many steps.
  mirror(notes: string, axis: string): string {
    const centre = this.step(axis).step;
    return mapNotes(notes, (token) => {
      const { step, quieter } = this.step(token);
      return this.note(2 * centre - step, quieter);
    });
  }
}
