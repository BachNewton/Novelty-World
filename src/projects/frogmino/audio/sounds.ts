// Frogmino's sound designs: a handful of soft, short sounds built with ZzFX.
// Sound complements the gameplay and never gets in its way, so only moments
// worth marking have a sound, and the frequent actions (slides, turns, jumps)
// are silent.

// ZzFX's parameters by name, in ZzFX's own order, with its defaults. The
// randomness parameter is always 0: ZzFX would bake a random pitch into the
// one rendering, so the variation comes at playback instead (see `player.ts`).
const ZZFX_PARAMETERS = [
  ["volume", 1],
  ["randomness", 0],
  ["frequency", 220],
  ["attack", 0],
  ["sustain", 0],
  ["release", 0.1],
  ["shape", 0],
  ["shapeCurve", 1],
  ["slide", 0],
  ["deltaSlide", 0],
  ["pitchJump", 0],
  ["pitchJumpTime", 0],
  ["repeatTime", 0],
  ["noise", 0],
  ["modulation", 0],
  ["bitCrush", 0],
  ["delay", 0],
  ["sustainVolume", 1],
  ["decay", 0],
  ["tremolo", 0],
  ["filter", 0],
] as const;

type ZzfxParameter = Exclude<(typeof ZZFX_PARAMETERS)[number][0], "randomness">;

// ZzFX's wave shapes.
export const Shape = { sine: 0, triangle: 1, saw: 2, tan: 3, noise: 4, square: 5 } as const;

// One ZzFX sound, by parameter name; any left out take ZzFX's default. Times
// are in seconds, frequencies in hertz, and slide in steps of 500 Hz per
// second. A negative filter is a low-pass at that cutoff, which is what keeps
// the palette soft.
export type ZzfxSound = Partial<Record<ZzfxParameter, number>>;

// A sound as ZzFX's positional parameters, the form its designer page
// (killedbyapixel.github.io/ZzFX) takes.
export function zzfxParams(sound: ZzfxSound): number[] {
  return ZZFX_PARAMETERS.map(([name, fallback]) => (name === "randomness" ? 0 : (sound[name] ?? fallback)));
}

// A ZzFX sound starting `at` seconds into the rendering. Several layers make
// a sound one ZzFX call can't, like a fanfare's notes.
export interface SoundLayer {
  at: number;
  zzfx: ZzfxSound;
}

export interface SoundDesign {
  label: string;
  // The game event that plays it.
  trigger: string;
  layers: readonly SoundLayer[];
  // How far each play may stray, as fractions: the playback rate by up to
  // `pitch` either way, and the volume down by up to `volume`. It keeps a
  // repeated sound from sounding like a recording.
  variation: { pitch: number; volume: number };
  // The shortest time between two plays, in seconds on the audio clock. A
  // play sooner than that is dropped, so a sound can't machine-gun.
  minGap: number;
  // About the most often play can trigger it, in seconds. The `?sounds`
  // page's ten-in-a-row uses it to judge how the sound wears.
  busiestEvery: number;
}

export const SOUND_IDS = ["hop", "bonk", "pass", "drop", "swap", "finish"] as const;
export type SoundId = (typeof SOUND_IDS)[number];

// Each clean pass in a row climbs the major pentatonic scale, in semitones,
// and stays on the octave once it gets there. A bonk starts it over.
export const PASS_STREAK_STEPS = [0, 2, 4, 7, 9, 12] as const;

export function passStreakSemitones(streak: number): number {
  return PASS_STREAK_STEPS[Math.min(streak, PASS_STREAK_STEPS.length - 1)];
}

// A fanfare note: a soft triangle through a low-pass.
function note(at: number, frequency: number, hold: number, release: number): SoundLayer {
  return {
    at,
    zzfx: { volume: 0.4, frequency, attack: 0.01, sustain: hold, release, shape: Shape.triangle, filter: -3500 },
  };
}

export const SOUNDS: Record<SoundId, SoundDesign> = {
  hop: {
    label: "Hop",
    trigger: "The frog hops up (Space).",
    layers: [
      {
        at: 0,
        zzfx: {
          volume: 0.5,
          frequency: 240,
          attack: 0.01,
          decay: 0.04,
          sustain: 0.02,
          sustainVolume: 0.6,
          release: 0.08,
          shape: Shape.triangle,
          slide: 5,
          filter: -2400,
        },
      },
    ],
    variation: { pitch: 0.07, volume: 0.2 },
    minGap: 0.12,
    busiestEvery: 0.75,
  },
  bonk: {
    label: "Bonk",
    trigger: "A row the frog doesn't fit knocks it back.",
    layers: [
      {
        at: 0,
        zzfx: {
          volume: 0.35,
          frequency: 420,
          release: 0.08,
          shape: Shape.triangle,
          slide: -6,
          filter: -2000,
        },
      },
      {
        at: 0,
        zzfx: {
          volume: 0.9,
          frequency: 160,
          decay: 0.05,
          sustain: 0.03,
          sustainVolume: 0.5,
          release: 0.16,
          slide: -0.8,
          noise: 0.4,
          filter: -1200,
        },
      },
    ],
    variation: { pitch: 0.06, volume: 0.15 },
    minGap: 0.3,
    busiestEvery: 1.2,
  },
  pass: {
    label: "Row passed",
    trigger: "The frog fits through a row. Each clean pass in a row climbs a note; a bonk resets it.",
    layers: [{ at: 0, zzfx: { volume: 0.45, frequency: 520, attack: 0.005, sustain: 0.015, release: 0.07, slide: 1.5 } }],
    variation: { pitch: 0.012, volume: 0.12 },
    minGap: 0.08,
    busiestEvery: 0.9,
  },
  drop: {
    label: "Drop onto the road",
    trigger: "The frog drops from the start overpass onto the road.",
    layers: [
      { at: 0, zzfx: { volume: 0.5, frequency: 760, attack: 0.01, sustain: 0.04, release: 0.12, slide: -6, filter: -3000 } },
      { at: 0.15, zzfx: { volume: 0.5, frequency: 180, release: 0.08, slide: -1 } },
    ],
    variation: { pitch: 0.05, volume: 0.15 },
    minGap: 0.4,
    busiestEvery: 2,
  },
  swap: {
    label: "Pull-off swap",
    trigger: "The frog takes the piece waiting in a pull-off.",
    layers: [
      {
        at: 0,
        zzfx: {
          volume: 0.45,
          frequency: 392,
          attack: 0.005,
          sustain: 0.06,
          release: 0.07,
          shape: Shape.triangle,
          pitchJump: 196,
          pitchJumpTime: 0.045,
          filter: -3000,
        },
      },
    ],
    variation: { pitch: 0.04, volume: 0.15 },
    minGap: 0.12,
    busiestEvery: 0.4,
  },
  finish: {
    label: "Finish",
    trigger: "The frog reaches the end of the course.",
    layers: [note(0, 523.25, 0.06, 0.12), note(0.1, 659.25, 0.06, 0.12), note(0.2, 783.99, 0.06, 0.12), note(0.3, 1046.5, 0.12, 0.4)],
    variation: { pitch: 0, volume: 0 },
    minGap: 2,
    busiestEvery: 3,
  },
};

// Renders a sound's layers into one mono buffer, each at its offset. `build`
// is ZzFX's sample builder, passed in so this stays testable without it.
export function renderSound(design: SoundDesign, sampleRate: number, build: (params: number[]) => number[]): Float32Array<ArrayBuffer> {
  const layers = design.layers.map((layer) => ({
    offset: Math.round(layer.at * sampleRate),
    samples: build(zzfxParams(layer.zzfx)),
  }));
  const length = Math.max(...layers.map(({ offset, samples }) => offset + samples.length));
  const mixed = new Float32Array(length);
  for (const { offset, samples } of layers) {
    samples.forEach((sample, i) => {
      mixed[offset + i] += sample;
    });
  }
  return mixed;
}
