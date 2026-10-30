// The subtractive synth, the one a piece's band plays on: stacks of slightly
// detuned oscillators spread across the stereo field, through a warm low-pass
// whose envelope opens with velocity. A sound is plain data (`library.ts`).
// What makes it thick is many voices drifting apart slowly; what keeps it from
// whining is built in here rather than left to each sound: above `HIGH_PITCH`
// every note loses top and level as it rises, and a sustained sound grows an
// `anchor` of soft body an octave or two below it.

export type Wave = "saw" | "pulse" | "triangle" | "sine";

export interface Layer {
  wave: Wave;
  // How many oscillators stack; the cost of a sound is mostly this.
  voices: number;
  // From the lowest voice to the highest, in cents.
  detune: number;
  // How far the stack spreads across the stereo field, 0 to 1.
  width: number;
  level: number;
  // In semitones from the note.
  transpose?: number;
  // A pulse's duty moving slowly either side of square, so its even harmonics
  // come and go: movement inside a held note, with no detuning to blur its pitch.
  pulseSwing?: { hz: number; depth: number };
}

export interface Envelope {
  attack: number;
  decay: number;
  // Where the decay settles, 0 to 1.
  sustain: number;
}

export interface AnalogVoice {
  kind?: undefined;
  layers: readonly Layer[];
  // Noise through the same filter: a strike with a `decay`, a held breath
  // without one.
  noise?: { level: number; decay?: number };
  filter: {
    hz: number;
    // Octaves of cutoff per octave of pitch.
    keyTrack: number;
    // Octaves of cutoff from the softest touch to the hardest.
    velocity: number;
    // Octaves the envelope opens it, at full strength.
    opens: number;
    envelope: Envelope;
    // Feedback, 0 to 1. Kept low: a high value is the squeal the rule forbids.
    resonance: number;
    // A slow swing of the cutoff, so a long held note keeps changing.
    motion?: { hz: number; octaves: number };
  };
  amp: Envelope;
  // Octaves shorter the decay gets per octave of pitch: a struck high note dies sooner.
  keyDecay?: number;
  // The fade after a note lets go, in seconds.
  release: number;
  // How far each voice wanders, in cents, slowly: what makes a held chord breathe.
  drift: number;
  vibrato?: { hz: number; cents: number; delay: number };
  // A pitch that falls into the note at its start.
  drop?: { cents: number; time: number };
  // How much body a high note grows below itself, 0 to 1.
  anchor?: number;
  // Drive into the filter; above 1 it starts to saturate.
  drive?: number;
  // How strongly velocity sets loudness: the mixer's exponent.
  dynamics: number;
  output: number;
}

export interface StereoNote {
  left: Float32Array;
  right: Float32Array;
}

// Work counted, for the rule that speed isn't measured by a clock.
export interface AnalogWork {
  notes: number;
  oscillatorSamples: number;
}

const TAU = 2 * Math.PI;
const BLOCK = 32;
// Pitch moves slowly, so oscillators retune once every this many blocks.
const RETUNE_BLOCKS = 4;
const CENT = Math.LN2 / 1200;
// C6: the top of the keyboard is where a thin sound turns into a whine.
const HIGH_PITCH = 84;
// Above that, octaves of cutoff lost per octave risen, and level lost likewise.
const HIGH_FALL = 1;
const HIGH_TILT = 0.5;
// The note's own layers fall faster still, so up there its weight is the anchor's.
const HIGH_SELF_TILT = 1.2;
const ANCHOR_FROM = 76;
const ANCHOR_FULL = 88;
// The cutoff never falls under this multiple of the note, or a high note would
// be filtered silent rather than made soft.
const CUTOFF_FLOOR = 1.5;
const CUTOFF_CEILING = 0.3;
const PULSE_WIDTH = 0.5;

function frequency(pitch: number): number {
  return 440 * 2 ** ((pitch - 69) / 12);
}

// A saw with its worst aliasing smoothed off at each jump (PolyBLEP).
function saw(phase: number, step: number): number {
  let value = 2 * phase - 1;
  if (phase < step) {
    const t = phase / step;
    value -= t + t - t * t - 1;
  } else if (phase > 1 - step) {
    const t = (phase - 1) / step;
    value -= t * t + t + t + 1;
  }
  return value;
}

function seeded(seed: number): () => number {
  let state = (seed * 2654435761) >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

// The value of an envelope at a time.
function envelopeAt({ attack, decay, sustain }: Envelope, seconds: number): number {
  if (seconds < attack) {
    const rise = seconds / attack;
    return rise * rise * (3 - 2 * rise);
  }
  return sustain + (1 - sustain) * Math.exp(-(seconds - attack) / decay);
}

// A soft clip that stays nearly straight through small values.
function soft(value: number): number {
  const limited = Math.max(-3, Math.min(3, value));
  return (limited * (27 + limited * limited)) / (27 + 9 * limited * limited);
}

interface Stack {
  wave: Wave;
  phases: Float64Array;
  steps: Float64Array;
  cents: Float64Array;
  driftRates: Float64Array;
  driftPhases: Float64Array;
  gainsLeft: Float64Array;
  gainsRight: Float64Array;
  hz: number;
  duty: number;
  swing: Layer["pulseSwing"];
}

function stack(layer: Layer, hz: number, gain: number, random: () => number): Stack {
  const { voices, detune, width, level, wave } = layer;
  const each = (gain * level) / Math.sqrt(voices);
  const offsets = Float64Array.from({ length: voices }, (_, v) => (voices === 1 ? 0 : (v / (voices - 1) - 0.5) * detune));
  const gainsLeft = new Float64Array(voices);
  const gainsRight = new Float64Array(voices);
  for (let v = 0; v < voices; v++) {
    // Alternate sides, so neighbouring pitches sit apart and the stack is wide.
    const place = voices === 1 ? 0 : ((v % 2 === 0 ? -1 : 1) * width * (v + 1)) / voices;
    gainsLeft[v] = each * Math.cos(((place + 1) * Math.PI) / 4) * Math.SQRT2;
    gainsRight[v] = each * Math.sin(((place + 1) * Math.PI) / 4) * Math.SQRT2;
  }
  return {
    wave,
    phases: Float64Array.from({ length: voices }, () => random()),
    steps: new Float64Array(voices),
    cents: offsets,
    driftRates: Float64Array.from({ length: voices }, () => TAU * (0.07 + 0.3 * random())),
    driftPhases: Float64Array.from({ length: voices }, () => TAU * random()),
    gainsLeft,
    gainsRight,
    hz: hz * 2 ** ((layer.transpose ?? 0) / 12),
    duty: PULSE_WIDTH,
    swing: layer.pulseSwing,
  };
}

function retune(stacked: Stack, seconds: number, drift: number, common: number, sampleRate: number): void {
  const { steps, cents, driftRates, driftPhases, hz, swing } = stacked;
  if (swing !== undefined) stacked.duty = PULSE_WIDTH + swing.depth * Math.sin(TAU * swing.hz * seconds);
  for (let v = 0; v < steps.length; v++) {
    const wander = drift * Math.sin(driftRates[v] * seconds + driftPhases[v]);
    steps[v] = (hz * common * (1 + (cents[v] + wander) * CENT)) / sampleRate;
  }
}

function play(stacked: Stack, left: Float64Array, right: Float64Array): void {
  const { wave, phases, steps, gainsLeft, gainsRight, duty } = stacked;
  for (let v = 0; v < phases.length; v++) {
    const step = steps[v];
    const gainLeft = gainsLeft[v];
    const gainRight = gainsRight[v];
    let phase = phases[v];
    for (let i = 0; i < BLOCK; i++) {
      phase += step;
      if (phase >= 1) phase -= 1;
      let value: number;
      if (wave === "saw") value = saw(phase, step);
      else if (wave === "pulse") value = saw(phase, step) - saw((phase + duty) % 1, step);
      else if (wave === "triangle") value = 4 * Math.abs(phase - 0.5) - 1;
      else value = Math.sin(TAU * phase);
      left[i] += value * gainLeft;
      right[i] += value * gainRight;
    }
    phases[v] = phase;
  }
}

// A four-pole ladder in plain one-poles, with soft feedback.
function ladder(block: Float64Array, state: Float64Array, g: number, feedback: number): void {
  let [a, b, c, d] = state;
  for (let i = 0; i < BLOCK; i++) {
    const input = block[i] - feedback * soft(d);
    a += g * (input - a);
    b += g * (a - b);
    c += g * (b - c);
    d += g * (c - d);
    block[i] = d;
  }
  state[0] = a;
  state[1] = b;
  state[2] = c;
  state[3] = d;
}

function layersFor(voice: AnalogVoice, pitch: number): readonly Layer[] {
  const anchor = (voice.anchor ?? 0) * Math.min(1, Math.max(0, (pitch - ANCHOR_FROM) / (ANCHOR_FULL - ANCHOR_FROM)));
  if (anchor === 0) return voice.layers;
  const below: Layer = { wave: "triangle", voices: 4, detune: 14, width: 0.7, level: anchor, transpose: -12 };
  return [...voice.layers, below, { ...below, level: anchor * 0.7, transpose: -24 }];
}

export function renderAnalog(voice: AnalogVoice, pitch: number, velocity: number, take: number, seconds: number, sampleRate: number, work: AnalogWork): StereoNote {
  const length = Math.round(seconds * sampleRate);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  const hz = frequency(pitch);
  const random = seeded(pitch * 131 + Math.round(velocity * 8) * 17 + take * 977 + voice.output * 4099 + 3);
  const height = Math.max(0, pitch - HIGH_PITCH) / 12;
  const own = 2 ** (-HIGH_SELF_TILT * height);
  const stacks = layersFor(voice, pitch).map((layer, index) => stack(layer, hz, index < voice.layers.length ? own : 1, random));
  const { filter, amp, noise, vibrato, drop, drift } = voice;
  const baseHz = filter.hz * 2 ** (filter.keyTrack * ((pitch - 60) / 12) + filter.velocity * (velocity - 0.6) - HIGH_FALL * height);
  const feedback = filter.resonance * 3.2;
  const makeUp = (1 + feedback * 0.5) * voice.output * 2 ** (-HIGH_TILT * height);
  const decay = amp.decay * 2 ** (-(voice.keyDecay ?? 0) * ((pitch - 60) / 12));
  const shaped: Envelope = { ...amp, decay };
  const drive = voice.drive ?? 1;
  const stateLeft = new Float64Array(4);
  const stateRight = new Float64Array(4);
  const blockLeft = new Float64Array(BLOCK);
  const blockRight = new Float64Array(BLOCK);
  const noiseLeft = seeded(pitch * 7 + take * 13 + 1);
  const noiseRight = seeded(pitch * 11 + take * 17 + 2);
  const motionPhase = filter.motion === undefined ? 0 : TAU * random();
  let gain = envelopeAt(shaped, 0);
  work.notes++;

  for (let start = 0, block = 0; start < length; start += BLOCK, block++) {
    const t = start / sampleRate;
    if (block % RETUNE_BLOCKS === 0) {
      const swing = vibrato === undefined ? 0 : vibrato.cents * Math.min(1, Math.max(0, t / vibrato.delay - 1)) * Math.sin(TAU * vibrato.hz * t);
      const falling = drop === undefined ? 0 : drop.cents * Math.exp(-t / drop.time);
      const common = 2 ** ((swing + falling) / 1200);
      for (const stacked of stacks) retune(stacked, t, drift, common, sampleRate);
    }
    blockLeft.fill(0);
    blockRight.fill(0);
    for (const stacked of stacks) {
      play(stacked, blockLeft, blockRight);
      work.oscillatorSamples += BLOCK * stacked.phases.length;
    }
    if (noise !== undefined) {
      const level = noise.level * (noise.decay === undefined ? 1 : Math.exp(-t / noise.decay));
      for (let i = 0; i < BLOCK; i++) {
        blockLeft[i] += (noiseLeft() * 2 - 1) * level;
        blockRight[i] += (noiseRight() * 2 - 1) * level;
      }
    }
    if (drive !== 1) {
      for (let i = 0; i < BLOCK; i++) {
        blockLeft[i] = soft(blockLeft[i] * drive);
        blockRight[i] = soft(blockRight[i] * drive);
      }
    }
    const moved = filter.motion === undefined ? 0 : filter.motion.octaves * Math.sin(TAU * filter.motion.hz * t + motionPhase);
    const cutoff = baseHz * 2 ** (filter.opens * velocity * envelopeAt(filter.envelope, t) + moved);
    const limited = Math.min(CUTOFF_CEILING * sampleRate, Math.max(cutoff, hz * CUTOFF_FLOOR));
    const g = 1 - Math.exp((-TAU * limited) / sampleRate);
    ladder(blockLeft, stateLeft, g, feedback);
    ladder(blockRight, stateRight, g, feedback);
    const next = envelopeAt(shaped, (start + BLOCK) / sampleRate);
    const count = Math.min(BLOCK, length - start);
    for (let i = 0; i < count; i++) {
      const level = (gain + ((next - gain) * i) / BLOCK) * makeUp;
      left[start + i] = blockLeft[i] * level;
      right[start + i] = blockRight[i] * level;
    }
    gain = next;
  }
  return { left, right };
}
