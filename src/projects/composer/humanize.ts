import { barBeats, type Note, type Role, type Score, type Track } from "./types";

// A performance of a score: the same notes, played by someone. Melody over
// accompaniment, a lean into the bar's strong beats, phrases that swell, small
// strays in time and strength, and chords that don't land as one. Seeded, so
// a piece performs the same way every time.

interface Touch {
  level: number;
  // How much of a note's written length it sounds.
  legato: number;
  // Strays in time, in seconds.
  stray: number;
}

const TOUCH: Record<Role, Touch> = {
  lead: { level: 1, legato: 1.03, stray: 0.012 },
  keys: { level: 0.72, legato: 0.95, stray: 0.009 },
  pad: { level: 0.6, legato: 1, stray: 0.006 },
  bass: { level: 0.82, legato: 0.92, stray: 0.006 },
  drums: { level: 0.85, legato: 1, stray: 0.004 },
};

const PHRASE_BARS = 4;
const SWELL = 0.14;
const ACCENT = 0.08;
const VELOCITY_STRAY = 0.05;
// How far apart a chord's notes land, low to high, in seconds.
const ROLL = 0.006;

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function performTrack(track: Track, score: Score, seed: number): Track {
  const random = seededRandom(seed);
  const touch = TOUCH[track.role];
  const bar = barBeats(score);
  const beatsToSeconds = 60 / score.bpm;
  const phrase = PHRASE_BARS * bar;
  const chordIndex = new Map<number, number>();
  const notes = [...track.notes]
    .sort((a, b) => a.start - b.start || a.pitch - b.pitch)
    .map((note): Note => {
      const place = note.start % bar;
      const accent = place === 0 ? ACCENT : place === bar / 2 ? ACCENT / 2 : -ACCENT / 2;
      // Rises to the phrase's middle and falls away.
      const swell = Math.sin((Math.PI * (note.start % phrase)) / phrase) * SWELL - SWELL / 2;
      const velocity = note.velocity * touch.level * (1 + accent + swell + (random() - 0.5) * VELOCITY_STRAY * 2);
      const inChord = chordIndex.get(note.start) ?? 0;
      chordIndex.set(note.start, inChord + 1);
      const late = (random() - 0.5) * 2 * touch.stray + inChord * ROLL;
      return {
        pitch: note.pitch,
        start: Math.max(0, note.start + late / beatsToSeconds),
        duration: note.duration * touch.legato,
        velocity: Math.min(1, Math.max(0.05, velocity)),
      };
    });
  return { ...track, notes };
}

export function humanize(score: Score): Score {
  return { ...score, tracks: score.tracks.map((track, index) => performTrack(track, score, index + 1)) };
}
