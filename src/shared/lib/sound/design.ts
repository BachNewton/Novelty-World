// A sound designed with ZzFX (Frank Force's MIT micro-synth), the way every
// game here designs its sounds: no audio files, each sound a few numbers.

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
// second. A pitch jump adds its hertz once its time has passed, and a repeat
// starts the pitch over every repeat time, from where the jumps left it, so a
// jump and a repeat together climb (or fall) in steps. A negative filter is a
// low-pass at that cutoff, a positive one a high-pass.
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
  // About the most often play can trigger it, in seconds. The sound
  // audition's ten-in-a-row uses it to judge how the sound wears.
  busiestEvery: number;
}

// Renders a sound's layers into one mono buffer, each at its offset. `build`
// is ZzFX's sample builder, passed in so this stays testable without it.
export function renderSound(design: SoundDesign, sampleRate: number, build: (params: number[]) => ArrayLike<number>): Float32Array<ArrayBuffer> {
  const layers = design.layers.map((layer) => ({
    offset: Math.round(layer.at * sampleRate),
    samples: build(zzfxParams(layer.zzfx)),
  }));
  const length = Math.max(...layers.map(({ offset, samples }) => offset + samples.length));
  const mixed = new Float32Array(length);
  for (const { offset, samples } of layers) {
    for (let i = 0; i < samples.length; i++) mixed[offset + i] += samples[i];
  }
  return mixed;
}
