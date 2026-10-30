import { describe, expect, it } from "vitest";
import { abcScore } from "./formats/abc";
import { diatonic, invert, line, scale, seq } from "./formats/code";
import { eventsScore } from "./formats/events";
import { trackerScore } from "./formats/tracker";
import { humanize } from "./humanize";
import { midiToScore, scoreToMidi } from "./midi";
import { PIECES } from "./pieces";
import { scoreToAbc } from "./score-abc";
import { scoreBeats, type Score } from "./types";

const HEADER = "title: T\nbpm: 120\nmetre: 4/4\nkey: C\n";

describe("the formats", () => {
  it("rings a tracker note to the next note or dash, and joins a track's lines", () => {
    const { tracks } = trackerScore(`${HEADER}lead a: C4 . - . | E4 . . .\nlead a: G4 . . .\n`);
    expect(tracks).toHaveLength(1);
    expect(tracks[0].notes.map((n) => [n.pitch, n.start, n.duration])).toEqual([
      [60, 0, 0.5],
      [64, 1, 1],
      [67, 2, 1],
    ]);
  });

  it("reads tracker chords and quieter notes", () => {
    const [{ notes }] = trackerScore(`${HEADER}keys a: C4+E4.5 .\n`).tracks;
    expect(notes.map((n) => n.pitch)).toEqual([60, 64]);
    expect(notes[1].velocity).toBeLessThan(notes[0].velocity);
  });

  it("reads raw events as ticks", () => {
    const [{ notes }] = eventsScore(`${HEADER}track bass b\n480 240 40 127\n`).tracks;
    expect(notes).toEqual([{ pitch: 40, start: 1, duration: 0.5, velocity: 1 }]);
  });

  it("plays out ABC's repeats, ties and key signature, in quarter-note beats", () => {
    const score = abcScore(`X:1\nT:T\nM:4/4\nL:1/4\nQ:1/4=100\nK:G\n%%role 1 lead tune\nV:1\n|: F2- F2 :|\n`);
    expect(score.tracks[0]).toMatchObject({ role: "lead", name: "tune" });
    expect(score.tracks[0].notes.map((n) => [n.pitch, n.start, n.duration])).toEqual([
      [66, 0, 4],
      [66, 4, 4],
    ]);
  });

  it("moves a line along a scale, major or minor as it falls", () => {
    const aMinor = scale("A4", "minor");
    expect(diatonic(line("A4:1 C5:1"), 2, aMinor).map((n) => n.pitch)).toEqual([72, 76]);
    expect(invert(line("B4:1"), 69, aMinor)[0].pitch).toBe(67);
    expect(seq(line("A4:1"), 1, line("A4:1"))[1].start).toBe(2);
  });
});

function sample(): Score {
  return {
    title: "T",
    bpm: 97,
    metre: [3, 4],
    key: "Am",
    tracks: [
      { name: "tune", role: "lead", notes: [{ pitch: 69, start: 0, duration: 1.5, velocity: 0.5 }, { pitch: 72, start: 1.5, duration: 1.5, velocity: 1 }] },
      { name: "low", role: "bass", notes: [{ pitch: 33, start: 0, duration: 3, velocity: 0.7 }] },
      { name: "kit", role: "drums", notes: [{ pitch: 36, start: 1, duration: 0.25, velocity: 0.8 }] },
    ],
  };
}

describe("MIDI files", () => {
  it("round-trips a score", () => {
    const score = sample();
    const back = midiToScore(scoreToMidi(score), "T");
    expect(back.bpm).toBeCloseTo(97, 0);
    expect(back.metre).toEqual([3, 4]);
    expect(back.tracks.map((t) => [t.name, t.role])).toEqual([["tune", "lead"], ["low", "bass"], ["kit", "drums"]]);
    expect(back.tracks[0].notes.map((n) => [n.pitch, n.start, n.duration])).toEqual([[69, 0, 1.5], [72, 1.5, 1.5]]);
    expect(back.tracks[0].notes[0].velocity).toBeCloseTo(0.5, 1);
  });

  it("keeps two notes of one pitch on one tick apart", () => {
    const score = sample();
    score.tracks[0].notes = [{ pitch: 60, start: 0, duration: 1, velocity: 0.8 }, { pitch: 60, start: 1, duration: 1, velocity: 0.8 }];
    expect(midiToScore(scoreToMidi(score), "T").tracks[0].notes.map((n) => n.duration)).toEqual([1, 1]);
  });
});

describe("the sheet music", () => {
  // What is engraved must play back as what was written.
  const roundTrip = (score: Score): number[] => abcScore(scoreToAbc(score)).tracks[0].notes.map((n) => n.pitch);

  it("spells accidentals that hold through a bar and reset at the next", () => {
    const pitches = [68, 68, 67, 68];
    const score = sample();
    score.tracks = [{ name: "t", role: "lead", notes: pitches.map((pitch, i) => ({ pitch, start: i * 1.5, duration: 1.5, velocity: 0.7 })) }];
    expect(roundTrip(score)).toEqual(pitches);
  });

  it("spells every pitch in sharp and flat keys", () => {
    for (const key of ["C", "G", "D", "F", "Bb", "Eb", "Am", "Em", "Dm", "F#m", "Ab"]) {
      const score = sample();
      score.key = key;
      score.tracks = [{ name: "t", role: "lead", notes: Array.from({ length: 36 }, (_, i) => ({ pitch: 48 + i, start: i, duration: 1, velocity: 0.7 })) }];
      expect(roundTrip(score), key).toEqual(score.tracks[0].notes.map((n) => n.pitch));
    }
  });

  it("ties a note across a bar line", () => {
    const score = sample();
    score.tracks = [{ name: "t", role: "lead", notes: [{ pitch: 60, start: 2, duration: 2, velocity: 0.7 }] }];
    expect(abcScore(scoreToAbc(score)).tracks[0].notes.map((n) => [n.start, n.duration])).toEqual([[2, 2]]);
  });
});

describe("the performance", () => {
  it("keeps every note and the piece's length, and repeats exactly", () => {
    const score = sample();
    const played = humanize(score);
    expect(played).toEqual(humanize(score));
    expect(played.tracks.map((t) => t.notes.length)).toEqual(score.tracks.map((t) => t.notes.length));
    expect(Math.abs(scoreBeats(played) - scoreBeats(score))).toBeLessThan(0.25);
  });
});

describe("the pieces", () => {
  it.each(PIECES.map((piece) => [piece.id, piece] as const))("%s stays on the keyboard and engraves", (_, piece) => {
    const score = piece.score();
    expect(score.tracks.length).toBeGreaterThan(0);
    for (const note of score.tracks.flatMap((track) => track.notes)) {
      expect(note.pitch).toBeGreaterThanOrEqual(21);
      expect(note.pitch).toBeLessThanOrEqual(108);
      expect(note.duration).toBeGreaterThan(0);
      expect(note.velocity).toBeGreaterThan(0);
    }
    expect(abcScore(scoreToAbc(score)).tracks.length).toBeGreaterThan(0);
  });
});
