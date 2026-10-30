import type { Note } from "../types";

// The dictionary between the owner's ears and Claude's numbers. Claude can't
// hear and the owner doesn't always have the word, so each word here is a
// sound both can point at: the Sampler tab plays it, and this file says what it is.
// A code is a promise: `BRT-4` always means exactly these values. To change a
// sound, add a new step with a new code and never reuse an old one, because
// codes live on in pasted notes and conversations.
//
// In every scale the number rises towards the word in its code: BRT-5 is the
// brightest and TGT-5 the tightest. Only one quality moves along a scale, and
// `renderClip` (`clip.ts`) evens out the loudness, so a louder sound never
// passes for a better one. Step 3 is PLAIN, except where plain is already one
// end of the scale (GRT, WHN), and there step 1 is.

// Everything a word can move. Most of these are parameters of an analog voice
// (`analog.ts`) or a band's chair (`band.ts`); the comment says which.
export interface Sound {
  // Low-pass cutoff at middle C: filter.hz.
  cutoffHz: number;
  // The filter's feedback: filter.resonance.
  resonance: number;
  // Oscillators in each stack, and their spread in cents: Layer.voices, Layer.detune.
  voices: number;
  detune: number;
  // Across the stereo field, 0 to 1: Layer.width.
  width: number;
  // The share of the stack that is a square wave rather than a saw.
  square: number;
  // A soft triangle an octave below, as a Layer.level.
  sub: number;
  // Seconds: amp.attack, release.
  attack: number;
  release: number;
  // How far each voice wanders, in cents: drift.
  drift: number;
  // Saturation of the finished sound, after the filter; 1 is none. Not yet a
  // chair's parameter: the master bus's tape is the same curve.
  drive: number;
  // Hz: Chair.lowCut.
  lowCut: number;
  // Peaks of EQ in dB, around 1.2 kHz, 300 Hz and 3.2 kHz. Not yet chair
  // parameters: `MUD_HZ` in `band.ts` is the one fixed cut of this kind.
  honkDb: number;
  mudDb: number;
  presenceDb: number;
  // How much goes to the hall: Chair.send.
  send: number;
  // How late a note may land, and its length against the written one. These
  // belong to the score, not the synth.
  scatterMs: number;
  gate: number;
  // The level of a bare high tone three octaves over every note: the sound the
  // no-whine rule forbids, here so it can be pointed at and nowhere else.
  whine: number;
}

export const PLAIN: Sound = {
  cutoffHz: 1600,
  resonance: 0.08,
  voices: 3,
  detune: 12,
  width: 0.5,
  square: 0.5,
  sub: 0.15,
  attack: 0.015,
  release: 0.3,
  drift: 3,
  drive: 1,
  lowCut: 90,
  honkDb: 0,
  mudDb: 0,
  presenceDb: 0,
  send: 0.4,
  scatterMs: 10,
  gate: 0.92,
  whine: 0,
};

export const PLAIN_CODE = "REF-0";

export interface Step {
  code: string;
  word: string;
  set: Partial<Sound>;
}

export interface Scale {
  // The prefix of its codes.
  id: string;
  low: string;
  high: string;
  // The quality in plain English.
  says: string;
  // What it is technically.
  maps: string;
  steps: readonly Step[];
}

export const SCALES: readonly Scale[] = [
  {
    id: "BRT",
    low: "dark",
    high: "bright",
    says: "How much of the top of the sound gets through, like a door from closed to open.",
    maps: "low-pass cutoff",
    steps: [
      { code: "BRT-1", word: "very dark", set: { cutoffHz: 350 } },
      { code: "BRT-2", word: "dark", set: { cutoffHz: 750 } },
      { code: "BRT-3", word: "plain", set: {} },
      { code: "BRT-4", word: "bright", set: { cutoffHz: 3600 } },
      { code: "BRT-5", word: "very bright", set: { cutoffHz: 8000 } },
    ],
  },
  {
    id: "THK",
    low: "thin",
    high: "thick",
    says: "How much body the sound has: one string of it, or a rope.",
    maps: "oscillator count, sub octave, low cut",
    steps: [
      { code: "THK-1", word: "very thin", set: { voices: 1, sub: 0, lowCut: 320 } },
      { code: "THK-2", word: "thin", set: { voices: 2, sub: 0.05, lowCut: 180 } },
      { code: "THK-3", word: "plain", set: {} },
      { code: "THK-4", word: "thick", set: { voices: 6, sub: 0.4, lowCut: 60 } },
      { code: "THK-5", word: "very thick", set: { voices: 10, sub: 0.8, lowCut: 40 } },
    ],
  },
  {
    id: "TGT",
    low: "loose",
    high: "tight",
    says: "How exactly notes land and let go: a drilled band, or friends in a kitchen.",
    maps: "timing scatter, note length and release",
    steps: [
      { code: "TGT-1", word: "very loose", set: { scatterMs: 80, gate: 1.3, release: 0.4 } },
      { code: "TGT-2", word: "loose", set: { scatterMs: 40, gate: 1.1, release: 0.35 } },
      { code: "TGT-3", word: "plain", set: {} },
      { code: "TGT-4", word: "tight", set: { scatterMs: 3, gate: 0.78, release: 0.14 } },
      { code: "TGT-5", word: "very tight", set: { scatterMs: 0, gate: 0.62, release: 0.06 } },
    ],
  },
  {
    id: "WET",
    low: "dry",
    high: "wet",
    says: "How much room is around the sound: in your ear, or across a hall.",
    maps: "reverb send",
    steps: [
      { code: "WET-1", word: "bone dry", set: { send: 0 } },
      { code: "WET-2", word: "dry", set: { send: 0.15 } },
      { code: "WET-3", word: "plain", set: {} },
      { code: "WET-4", word: "wet", set: { send: 1 } },
      { code: "WET-5", word: "drenched", set: { send: 2.2 } },
    ],
  },
  {
    id: "SMR",
    low: "focused",
    high: "smeared",
    says: "Whether a note is one clean pitch, or several slightly out of tune with each other.",
    maps: "detune between oscillators",
    steps: [
      { code: "SMR-1", word: "pin sharp", set: { detune: 0 } },
      { code: "SMR-2", word: "focused", set: { detune: 5 } },
      { code: "SMR-3", word: "plain", set: {} },
      { code: "SMR-4", word: "smeared", set: { detune: 32 } },
      { code: "SMR-5", word: "very smeared", set: { detune: 75 } },
    ],
  },
  {
    id: "HRD",
    low: "soft attack",
    high: "hard attack",
    says: "How a note begins: swelling up from nothing, or arriving all at once.",
    maps: "amp envelope attack time",
    steps: [
      { code: "HRD-1", word: "swell", set: { attack: 0.25 } },
      { code: "HRD-2", word: "soft", set: { attack: 0.08 } },
      { code: "HRD-3", word: "plain", set: {} },
      { code: "HRD-4", word: "hard", set: { attack: 0.004 } },
      { code: "HRD-5", word: "instant", set: { attack: 0.001 } },
    ],
  },
  {
    id: "LNG",
    low: "short tail",
    high: "long tail",
    says: "How long a note hangs on after it is let go, before the room's own ring.",
    maps: "amp release time",
    steps: [
      { code: "LNG-1", word: "cut off", set: { release: 0.03 } },
      { code: "LNG-2", word: "short", set: { release: 0.12 } },
      { code: "LNG-3", word: "plain", set: {} },
      { code: "LNG-4", word: "long", set: { release: 0.9 } },
      { code: "LNG-5", word: "very long", set: { release: 2.2 } },
    ],
  },
  {
    id: "WID",
    low: "narrow",
    high: "wide",
    says: "How much of the space left to right it fills: a point in the middle, or both walls.",
    maps: "stereo spread of the stack",
    steps: [
      { code: "WID-1", word: "mono", set: { width: 0 } },
      { code: "WID-2", word: "narrow", set: { width: 0.2 } },
      { code: "WID-3", word: "plain", set: {} },
      { code: "WID-4", word: "wide", set: { width: 0.8 } },
      { code: "WID-5", word: "very wide", set: { width: 1 } },
    ],
  },
  {
    id: "GRT",
    low: "clean",
    high: "gritty",
    says: "Whether the sound is smooth, or has a fuzz and rasp from being pushed too hard.",
    maps: "saturation after the filter",
    steps: [
      { code: "GRT-1", word: "clean", set: {} },
      { code: "GRT-2", word: "warm", set: { drive: 2 } },
      { code: "GRT-3", word: "pushed", set: { drive: 4 } },
      { code: "GRT-4", word: "gritty", set: { drive: 9 } },
      { code: "GRT-5", word: "very gritty", set: { drive: 22 } },
    ],
  },
  {
    id: "FUL",
    low: "hollow",
    high: "full",
    says: "Hollow is a tube with the middle of the tone missing; full has every harmonic in.",
    maps: "square wave (odd harmonics) to saw (all)",
    steps: [
      { code: "FUL-1", word: "very hollow", set: { square: 1 } },
      { code: "FUL-2", word: "hollow", set: { square: 0.8 } },
      { code: "FUL-3", word: "plain", set: {} },
      { code: "FUL-4", word: "full", set: { square: 0.25 } },
      { code: "FUL-5", word: "very full", set: { square: 0 } },
    ],
  },
  {
    id: "OPN",
    low: "nasal",
    high: "open",
    says: "Nasal is talking with a pinched nose, a honk stuck in the upper middle.",
    maps: "EQ peak around 1.2 kHz",
    steps: [
      { code: "OPN-1", word: "very nasal", set: { honkDb: 14 } },
      { code: "OPN-2", word: "nasal", set: { honkDb: 7 } },
      { code: "OPN-3", word: "plain", set: {} },
      { code: "OPN-4", word: "open", set: { honkDb: -4 } },
      { code: "OPN-5", word: "very open", set: { honkDb: -9 } },
    ],
  },
  {
    id: "CLR",
    low: "muddy",
    high: "clear",
    says: "Muddy is a blanket over the low middle, where notes run together and lose their edges.",
    maps: "EQ around 300 Hz",
    steps: [
      { code: "CLR-1", word: "very muddy", set: { mudDb: 12 } },
      { code: "CLR-2", word: "muddy", set: { mudDb: 6 } },
      { code: "CLR-3", word: "plain", set: {} },
      { code: "CLR-4", word: "clear", set: { mudDb: -5 } },
      { code: "CLR-5", word: "very clear", set: { mudDb: -11 } },
    ],
  },
  {
    id: "ALV",
    low: "still",
    high: "alive",
    says: "Whether a held note is frozen, or moves slowly from within, like breathing.",
    maps: "slow pitch drift of each oscillator",
    steps: [
      { code: "ALV-1", word: "frozen", set: { drift: 0 } },
      { code: "ALV-2", word: "still", set: { drift: 1 } },
      { code: "ALV-3", word: "plain", set: {} },
      { code: "ALV-4", word: "alive", set: { drift: 10 } },
      { code: "ALV-5", word: "seasick", set: { drift: 28 } },
    ],
  },
  {
    id: "HRS",
    low: "mellow",
    high: "harsh",
    says: "Mellow is easy to listen to for an hour; harsh bites at the part of the range ears dislike.",
    maps: "EQ around 3.2 kHz, filter resonance",
    steps: [
      { code: "HRS-1", word: "very mellow", set: { presenceDb: -14, resonance: 0 } },
      { code: "HRS-2", word: "mellow", set: { presenceDb: -7, resonance: 0.04 } },
      { code: "HRS-3", word: "plain", set: {} },
      { code: "HRS-4", word: "harsh", set: { presenceDb: 9, resonance: 0.2 } },
      { code: "HRS-5", word: "very harsh", set: { presenceDb: 18, resonance: 0.35 } },
    ],
  },
  {
    id: "WHN",
    low: "no whine",
    high: "whine",
    says: "A thin high tone sitting on top of the sound. The bad end, on purpose: the rule forbids this.",
    maps: "bare tone three octaves over each note",
    steps: [
      { code: "WHN-1", word: "none", set: {} },
      { code: "WHN-2", word: "a trace", set: { whine: 0.04 } },
      { code: "WHN-3", word: "noticeable", set: { whine: 0.1 } },
      { code: "WHN-4", word: "whine", set: { whine: 0.35 } },
      { code: "WHN-5", word: "bad whine", set: { whine: 1 } },
    ],
  },
];

export const CLIP_BPM = 96;
// The moment the phrase gives way to the held chord, in beats, and the end.
export const CHORD_BEAT = 4;
export const CLIP_BEATS = 8;

const STRENGTH = 0.7;

function line(from: number, steps: readonly (readonly [pitch: number, beats: number])[]): Note[] {
  let start = from;
  return steps.map(([pitch, beats]) => {
    const note = { pitch, start, duration: beats, velocity: STRENGTH };
    start += beats;
    return note;
  });
}

// The same short phrase and held chord for every sound.
const PHRASE = line(0, [[60, 1], [64, 0.5], [67, 0.5], [69, 1], [67, 0.5], [64, 0.5]]);
const CHORD: Note[] = [48, 55, 64, 71].map((pitch) => ({ pitch, start: CHORD_BEAT, duration: CHORD_BEAT, velocity: STRENGTH }));

export interface ClipPart {
  sound: Sound;
  notes: readonly Note[];
  // Against the other part, in dB, and across the field, -1 left to 1 right.
  db: number;
  pan: number;
}

export interface Clip {
  title: string;
  parts: readonly ClipPart[];
  // One part alone, at the level it has in the mix.
  solo?: number;
}

const STEPS = new Map(SCALES.flatMap((scale) => scale.steps.map((step) => [step.code, step] as const)));

export function stepOf(code: string): Step | undefined {
  return code === PLAIN_CODE ? { code, word: "plain", set: {} } : STEPS.get(code);
}

// Codes that have no step are left out, not fatal: a kept list can outlive a
// browser's copy of this page, though a code is never taken back.
export function clipOf(codes: readonly string[]): Clip {
  const sound = codes.reduce<Sound>((merged, code) => ({ ...merged, ...stepOf(code)?.set }), PLAIN);
  return { title: codes.join(" "), parts: [{ sound, notes: [...PHRASE, ...CHORD], db: 0, pan: 0 }] };
}

// A random handful of scales, each away from plain. Whine isn't in the draw: it
// exists to be pointed at, not discovered.
export function surprise(random: () => number): string[] {
  const scales = SCALES.filter((scale) => scale.id !== "WHN");
  const picked = scales.map((scale) => ({ scale, order: random() })).sort((a, b) => a.order - b.order);
  const count = 3 + Math.floor(random() * 3);
  const chosen = new Set(picked.slice(0, count).map(({ scale }) => scale));
  return scales
    .filter((scale) => chosen.has(scale))
    .map((scale) => {
      const away = scale.steps.filter((step) => Object.keys(step.set).length > 0);
      return away[Math.floor(random() * away.length)].code;
    });
}

// Two lines to hear against each other: the same two for every pair, so only
// how they sit together changes.
const UPPER = line(0, [[67, 1], [69, 0.5], [71, 0.5], [72, 1.5], [71, 0.5], [69, 1], [67, 0.5], [65, 0.5], [64, 2]]);
const LOWER = line(0, [[60, 1.5], [62, 0.5], [64, 1], [62, 1], [60, 0.5], [59, 0.5], [57, 1], [60, 2]]);

export interface Seat {
  name: string;
  sound: Partial<Sound>;
  // Semitones from where the line is written.
  transpose: number;
  db: number;
  pan: number;
}

export interface Pairing {
  code: string;
  word: string;
  says: string;
  maps: string;
  upper: Seat;
  lower: Seat;
}

const LEAD = { voices: 3, detune: 8, cutoffHz: 2600, send: 0.2 };
const MELLOW = { cutoffHz: 900, square: 0.8, send: 0.3 };

export const PAIRINGS: readonly Pairing[] = [
  {
    code: "PAR-SEP",
    word: "separated",
    says: "Each line has its own height, its own side and its own colour. Both are easy to follow.",
    maps: "an octave apart, panned apart, bright against dark",
    upper: { name: "Bright, right, high", sound: { ...LEAD, cutoffHz: 3000, lowCut: 300 }, transpose: 12, db: 0, pan: 0.45 },
    lower: { name: "Dark, left, low", sound: { ...MELLOW, cutoffHz: 700, sub: 0.4 }, transpose: -12, db: 0, pan: -0.45 },
  },
  {
    code: "PAR-MSK",
    word: "masking",
    says: "One sound in the same place at the same height: the lines fuse and the ear loses the lower one.",
    maps: "same sound, same register, same pan, one louder",
    upper: { name: "Same sound, louder", sound: { ...MELLOW }, transpose: 0, db: 3, pan: 0 },
    lower: { name: "Same sound, quieter", sound: { ...MELLOW }, transpose: 5, db: -3, pan: 0 },
  },
  {
    code: "PAR-MUD",
    word: "muddy",
    says: "Both lines are piled up low, heavy in the low middle, and the notes run together.",
    maps: "both an octave or more down, boosted 300 Hz, long tails",
    upper: { name: "Heavy, low", sound: { cutoffHz: 800, mudDb: 8, sub: 0.6, release: 0.7, send: 0.6, lowCut: 40, gate: 1.1 }, transpose: -12, db: 0, pan: -0.1 },
    lower: { name: "Heavy, lower", sound: { cutoffHz: 700, mudDb: 8, sub: 0.6, release: 0.7, send: 0.6, lowCut: 40, gate: 1.1 }, transpose: -19, db: 0, pan: 0.1 },
  },
  {
    code: "PAR-CLS",
    word: "clashing",
    says: "Two bright sounds fight for the same spot, so each one's edge scrapes against the other's.",
    maps: "both bright and harsh, mostly seconds apart, centred",
    upper: { name: "Hard edge", sound: { cutoffHz: 3800, presenceDb: 9, resonance: 0.2, detune: 5, send: 0.1 }, transpose: 0, db: 0, pan: 0 },
    lower: { name: "Hard edge, a step away", sound: { cutoffHz: 3800, presenceDb: 9, resonance: 0.2, detune: 5, send: 0.1 }, transpose: 7, db: 0, pan: 0 },
  },
  {
    code: "PAR-BHD",
    word: "one behind the other",
    says: "The upper line is close and in focus; the lower sits back in the room, like someone further away.",
    maps: "front dry and bright; back wet, dark, quieter",
    upper: { name: "In front", sound: { ...LEAD, send: 0.03, attack: 0.004 }, transpose: 0, db: 3, pan: 0 },
    lower: { name: "Behind", sound: { cutoffHz: 800, send: 2, attack: 0.05, width: 0.8 }, transpose: -5, db: -6, pan: 0 },
  },
];

function seated({ sound, transpose, db, pan }: Seat, notes: readonly Note[]): ClipPart {
  return { sound: { ...PLAIN, ...sound }, notes: notes.map((note) => ({ ...note, pitch: note.pitch + transpose })), db, pan };
}

export function clipOfPair({ code, upper, lower }: Pairing, solo?: number): Clip {
  return { title: code, parts: [seated(upper, UPPER), seated(lower, LOWER)], solo };
}
