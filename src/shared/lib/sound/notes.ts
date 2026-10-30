// Note names as the music here writes them: C4 is middle C, with # or b, and
// .1 to .9 after it to play the note quieter by that much (E5.4).

const NOTE_STEPS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NOTE = /^([A-G])(#|b|)(\d)((?:\.\d)?)$/;

// Semitones from C0, and how far the note is turned down.
export function parseNote(token: string): { semitone: number; quieter: number } {
  const match = NOTE.exec(token);
  if (match === null) throw new Error(`Not a note: "${token}"`);
  // An absent fraction is the empty string, which Number reads as 0.
  const [, letter, accidental, octave, fraction] = match;
  const shift = accidental === "#" ? 1 : accidental === "b" ? -1 : 0;
  return { semitone: NOTE_STEPS[letter] + shift + 12 * Number(octave), quieter: Number(fraction) };
}

export function noteFrequency(name: string): number {
  // A4 is 440 Hz, and 57 semitones above C0.
  return 440 * 2 ** ((parseNote(name).semitone - 57) / 12);
}
