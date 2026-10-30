import { describe, expect, it } from "vitest";
import { eventsScore } from "./formats/events";
import { PIECES } from "./pieces";
import { timingOf } from "./tempo";
import { bandsOf } from "./types";

const HEADER = "title: T\nbpm: 120\nmetre: 4/4\nkey: C\n";

describe("raw events", () => {
  it("reads ticks", () => {
    const [{ notes }] = eventsScore(`${HEADER}track bass b\n480 240 40 127\n`).tracks;
    expect(notes).toEqual([{ pitch: 40, start: 1, duration: 0.5, velocity: 1 }]);
  });

  it("reads tempo, glides, and the pedal by score and by track", () => {
    const score = eventsScore(`${HEADER}tempo 480 90\nglide 960 60\npedal 0 480\ntrack keys k\npedal 960 240\n0 480 60 90\n`);
    expect(score.tempo).toEqual([{ beat: 0, bpm: 120 }, { beat: 1, bpm: 90 }, { beat: 2, bpm: 60, glide: true }]);
    expect(score.pedal).toEqual([{ start: 0, end: 1 }]);
    expect(score.tracks[0].pedal).toEqual([{ start: 2, end: 2.5 }]);
  });
});

describe("the tempo map", () => {
  // A wrong integral shows only as views drifting off the sound.
  it("turns beats into seconds through a glide and back", () => {
    const time = timingOf({ tempo: [{ beat: 0, bpm: 60 }, { beat: 4, bpm: 60 }, { beat: 8, bpm: 120, glide: true }, { beat: 12, bpm: 60 }] });
    expect(time.seconds(4)).toBe(4);
    expect(time.seconds(8)).toBeCloseTo(4 + 4 * Math.LN2, 9);
    expect(time.seconds(10)).toBeCloseTo(4 + 4 * Math.LN2 + 1, 9);
    for (const beats of [0, 3, 5.5, 7.9, 9, 12, 14]) expect(time.beats(time.seconds(beats))).toBeCloseTo(beats, 9);
    expect(time.bpm(6)).toBeCloseTo(90, 9);
  });
});

describe("the pieces", () => {
  it.each(PIECES.map((piece) => [piece.id, piece] as const))("%s stays on the keyboard", (_, piece) => {
    const score = piece.score();
    expect(score.tracks.length).toBeGreaterThan(0);
    for (const band of bandsOf(piece)) for (const track of score.tracks) expect(Object.keys(band.chairs), track.name).toContain(track.name);
    for (const note of score.tracks.flatMap((track) => track.notes)) {
      expect(note.pitch).toBeGreaterThanOrEqual(21);
      expect(note.pitch).toBeLessThanOrEqual(108);
      expect(note.duration).toBeGreaterThan(0);
      expect(note.velocity).toBeGreaterThan(0);
    }
  });
});
