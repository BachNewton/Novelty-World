import { BIKE, type EngineSpec } from "./vehicles";

/*
 * Every loop the continuous sounds play, computed once as samples: an engine's
 * firing cycle, the tyres' grit, the freewheel and the beds of each place. No
 * files and no Web Audio here, and seeded, so a loop is the same every visit.
 * A loop's end meets its start because everything in one is periodic in its
 * length: events wrap round it, and a filter's memory comes from a first pass.
 */

export interface Loop {
  rate: number;
  channels: Float32Array<ArrayBuffer>[];
}

/** The rate an engine cycle is rendered at; its playback rate is `rpm / CYCLE_RPM`. */
export const CYCLE_RPM = 3000;

const HIGH_RATE = 44100;
const BED_RATE = 22050;
const TAU = Math.PI * 2;

function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const samplesOf = (seconds: number, rate: number) => new Float32Array(Math.round(seconds * rate));

function normalise(channels: Float32Array[], peak: number): void {
  let highest = 0;
  for (const channel of channels) for (const sample of channel) highest = Math.max(highest, Math.abs(sample));
  if (highest === 0) throw new Error("A loop rendered silent");
  for (const channel of channels) for (let i = 0; i < channel.length; i++) channel[i] *= peak / highest;
}

/** Adds `make(t)` from `start` for `seconds`, wrapping round the loop. */
function addEvent(channel: Float32Array, rate: number, start: number, seconds: number, make: (t: number) => number): void {
  const first = Math.round(start * rate);
  const count = Math.round(seconds * rate);
  for (let i = 0; i < count; i++) channel[(first + i) % channel.length] += make(i / rate);
}

function addPanned(channels: Float32Array[], rate: number, start: number, seconds: number, pan: number, make: (t: number) => number): void {
  const left = Math.cos(((pan + 1) * Math.PI) / 4);
  const right = Math.sin(((pan + 1) * Math.PI) / 4);
  addEvent(channels[0], rate, start, seconds, (t) => left * make(t));
  addEvent(channels[1], rate, start, seconds, (t) => right * make(t));
}

/** White noise put through a one-pole low-pass, whose corner `corner(i)` may move, as a seamless loop. */
function lowNoise(length: number, next: () => number, corner: (i: number) => number, rate: number): Float32Array<ArrayBuffer> {
  const white = new Float32Array(length);
  for (let i = 0; i < length; i++) white[i] = next() * 2 - 1;
  const out = new Float32Array(length);
  let held = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < length; i++) {
      const share = 1 - Math.exp((-TAU * corner(i)) / rate);
      held += (white[i] - held) * share;
      out[i] = held;
    }
  }
  return out;
}

/** Plain stereo noise, the raw stuff of wind, tarmac and the intake. */
export function noiseLoop(): Loop {
  const next = random(11);
  const channels = [samplesOf(3.1, HIGH_RATE), samplesOf(3.1, HIGH_RATE)];
  for (const channel of channels) for (let i = 0; i < channel.length; i++) channel[i] = next() * 2 - 1;
  return { rate: HIGH_RATE, channels };
}

/**
 * Eight four-stroke cycles of one engine at `CYCLE_RPM`, each firing a ringing
 * pulse. Each cylinder has its own strength and each cycle strays a little, so
 * the note has a lope below its firing rate rather than a buzz.
 */
export function engineCycle(spec: EngineSpec, seed: number): Loop {
  const next = random(seed);
  const cylinders = Math.max(1, Math.round(spec.firesPerRev * 2));
  const cycleS = (2 * 60) / CYCLE_RPM;
  const cycles = 8;
  const gapS = cycleS / cylinders;
  const channel = samplesOf(cycleS * cycles, HIGH_RATE);
  const strengths = Array.from({ length: cylinders }, () => 1 - spec.unevenness * next());
  const firingHz = 1 / gapS;
  for (let cycle = 0; cycle < cycles; cycle++) {
    for (let cylinder = 0; cylinder < cylinders; cylinder++) {
      const strength = strengths[cylinder] * (1 - 0.5 * spec.unevenness * next());
      const start = (cycle * cylinders + cylinder + 0.25 * spec.unevenness * next()) * gapS;
      const decayS = spec.pulseDecay * gapS;
      addEvent(channel, HIGH_RATE, start, decayS * 6, (t) => {
        const ring = Math.exp(-t / decayS);
        let sum = 0;
        spec.pulseOrders.forEach((order, index) => {
          sum += Math.sin(TAU * order * firingHz * t) / (index + 1);
        });
        return strength * ring * sum;
      });
    }
  }
  normalise([channel], 1);
  return { rate: HIGH_RATE, channels: [channel] };
}

/** Stones under a tyre: thousands of short ticks and fewer low pops. */
export function gravelLoop(): Loop {
  const next = random(23);
  const seconds = 3.7;
  const channels = [samplesOf(seconds, HIGH_RATE), samplesOf(seconds, HIGH_RATE)];
  for (let i = 0; i < 2400; i++) {
    const hz = 1200 + 5200 * next() * next();
    const decayS = 0.0005 + 0.0016 * next();
    const level = 0.15 + 0.85 * next() * next();
    addPanned(channels, HIGH_RATE, next() * seconds, decayS * 5, next() * 1.4 - 0.7, (t) => level * Math.exp(-t / decayS) * Math.sin(TAU * hz * t));
  }
  for (let i = 0; i < 260; i++) {
    const hz = 240 + 500 * next();
    const decayS = 0.003 + 0.006 * next();
    const level = 0.5 + next();
    addPanned(channels, HIGH_RATE, next() * seconds, decayS * 5, next() - 0.5, (t) => level * Math.exp(-t / decayS) * Math.sin(TAU * hz * t));
  }
  normalise(channels, 0.9);
  return { rate: HIGH_RATE, channels };
}

/** Grass against the sill: a soft hush swishing at the tufts' rate, and the odd soft thump. */
export function grassLoop(): Loop {
  const next = random(29);
  const seconds = 3.3;
  const length = Math.round(seconds * HIGH_RATE);
  const channels = [0, 1].map(() => lowNoise(length, next, () => 1400, HIGH_RATE));
  const swishes = Array.from({ length: 7 }, () => ({ count: 5 + Math.floor(next() * 28), phase: next() * TAU }));
  for (const channel of channels) {
    for (let i = 0; i < length; i++) {
      const place = (TAU * i) / length;
      let beat = 0;
      for (const { count, phase } of swishes) beat += Math.sin(count * place + phase);
      channel[i] *= 0.45 + 0.55 * Math.max(0, beat / 3.2 + 0.4);
    }
  }
  for (let i = 0; i < 30; i++) {
    const hz = 70 + 90 * next();
    const level = 0.08 + 0.12 * next();
    addPanned(channels, HIGH_RATE, next() * seconds, 0.05, next() - 0.5, (t) => level * Math.exp(-t / 0.012) * Math.sin(TAU * hz * t));
  }
  normalise(channels, 0.9);
  return { rate: HIGH_RATE, channels };
}

/** One turn of the rear wheel's freewheel, its pawls clicking over the ratchet. */
export function freewheelLoop(): Loop {
  const next = random(31);
  const turnS = 1 / BIKE.renderedTurnsHz;
  const channel = samplesOf(turnS, HIGH_RATE);
  for (let i = 0; i < BIKE.pawlClicks; i++) {
    const level = 0.7 + 0.3 * next();
    const hz = 3000 + 700 * next();
    addEvent(channel, HIGH_RATE, (i / BIKE.pawlClicks) * turnS, 0.004, (t) => level * Math.exp(-t / 0.0009) * Math.sin(TAU * hz * t));
  }
  normalise([channel], 0.9);
  return { rate: HIGH_RATE, channels: [channel] };
}

// ---- The places ----

/** A bird's phrase: `pitch(t)` over `seconds`, with its envelope. */
function chirp(channels: Float32Array[], at: number, seconds: number, pan: number, level: number, pitch: (share: number) => number): void {
  let phase = 0;
  const step = 1 / BED_RATE;
  const count = Math.round(seconds * BED_RATE);
  const left = Math.cos(((pan + 1) * Math.PI) / 4);
  const right = Math.sin(((pan + 1) * Math.PI) / 4);
  const first = Math.round(at * BED_RATE);
  for (let i = 0; i < count; i++) {
    const share = i / count;
    phase += TAU * pitch(share) * step;
    const sample = level * Math.sin(Math.PI * share) ** 0.7 * (Math.sin(phase) + 0.18 * Math.sin(2 * phase));
    channels[0][(first + i) % channels[0].length] += left * sample;
    channels[1][(first + i) % channels[1].length] += right * sample;
  }
}

/** Forest: leaves moving in the wind, and a few kinds of small bird, near and far, with long gaps. */
export function forestBed(): Loop {
  const next = random(41);
  const seconds = 29;
  const length = Math.round(seconds * BED_RATE);
  const swell = [0, 1].map(() => ({ a: 2 + Math.floor(next() * 3), b: 5 + Math.floor(next() * 5), phase: next() * TAU }));
  const channels = swell.map(({ a, b, phase }) => {
    const leaves = lowNoise(length, next, () => 2400, BED_RATE);
    const held = lowNoise(length, next, () => 600, BED_RATE);
    return leaves.map((sample, i) => {
      const place = (TAU * i) / length;
      const breeze = 0.5 + 0.3 * Math.sin(a * place + phase) + 0.2 * Math.sin(b * place);
      return 0.16 * breeze * (sample - held[i]);
    });
  });

  let at = next() * 1.5;
  while (at < seconds - 3) {
    const pan = next() * 1.6 - 0.8;
    const level = 0.1 + 0.26 * next() * next();
    const kind = next();
    if (kind < 0.4) {
      // A falling trill that speeds up and ends in a flourish, as a finch's does.
      const notes = 7 + Math.floor(next() * 6);
      const base = 2800 + next() * 900;
      for (let i = 0; i < notes; i++) {
        const hz = base * (1 - (0.28 * i) / notes);
        chirp(channels, at + i * (0.085 - 0.004 * i), 0.07, pan, level, (s) => hz * (1 + 0.1 * (1 - s)));
      }
      chirp(channels, at + notes * 0.07, 0.2, pan, level, (s) => base * (0.9 + 0.5 * Math.sin(Math.PI * s)));
    } else if (kind < 0.72) {
      // Two notes over and over, as a great tit's.
      const high = 4200 + next() * 700;
      const repeats = 3 + Math.floor(next() * 3);
      for (let i = 0; i < repeats; i++) {
        chirp(channels, at + i * 0.36, 0.14, pan, level, () => high);
        chirp(channels, at + i * 0.36 + 0.17, 0.13, pan, level, () => high * 0.72);
      }
    } else {
      // A slow fluting phrase, as a blackbird's.
      const notes = [1, 1.26, 1.12, 1.5].map((ratio) => ratio * (1500 + next() * 400));
      notes.forEach((hz, i) => chirp(channels, at + i * 0.27, 0.25, pan, level * 1.1, (s) => hz * (1 + 0.04 * Math.sin(TAU * 5 * s))));
    }
    at += 1.4 + next() * 4.6;
  }
  normalise(channels, 0.8);
  return { rate: BED_RATE, channels };
}

/** Sea: swells that rise, break and draw back, each its own length, over a constant wash. */
export function shoreBed(): Loop {
  const next = random(43);
  const seconds = 23;
  const length = Math.round(seconds * BED_RATE);
  const waves = [0, 1, 2, 3, 4].map((i) => ({ at: (i + 0.8 * next()) / 5, width: 0.1 + 0.05 * next(), height: 0.65 + 0.35 * next() }));
  /** Each wave rises slowly and falls away quicker, on a loop of 0 to 1. */
  const swell = (share: number) => {
    let sum = 0;
    for (const { at, width, height } of waves) {
      const from = ((share - at + 1.5) % 1) - 0.5;
      const shaped = from < 0 ? from / (width * 1.6) : from / (width * 0.8);
      sum += height * Math.exp(-shaped * shaped);
    }
    return sum;
  };
  const channels = [0, 1].map((side) =>
    lowNoise(length, next, (i) => 280 + 2300 * swell(((i / length + side * 0.012) % 1)), BED_RATE).map((sample, i) => sample * (0.16 + swell((i / length + side * 0.012) % 1))),
  );
  normalise(channels, 0.85);
  return { rate: BED_RATE, channels };
}

/** Gulls, far off and now and then: falling cries in a run, on their own loop so they never line up with the waves. */
export function gullsBed(): Loop {
  const next = random(47);
  const seconds = 37;
  const channels = [samplesOf(seconds, BED_RATE), samplesOf(seconds, BED_RATE)];
  let at = 2 + next() * 3;
  while (at < seconds - 5) {
    const pan = next() * 1.8 - 0.9;
    const level = 0.15 + 0.35 * next();
    const cries = 2 + Math.floor(next() * 4);
    const hz = 900 + next() * 450;
    for (let i = 0; i < cries; i++) {
      const long = i === 0 ? 0.42 : 0.24;
      const cry = (s: number) => hz * (1.45 - 0.55 * s) * (1 + 0.012 * Math.sin(TAU * 14 * s));
      chirp(channels, at, long, pan, level, cry);
      chirp(channels, at, long, pan, level * 0.42, (s) => 2 * cry(s));
      chirp(channels, at, long, pan, level * 0.2, (s) => 3 * cry(s));
      at += long + 0.08 + next() * 0.1;
    }
    at += 3 + next() * 7;
  }
  normalise(channels, 0.8);
  return { rate: BED_RATE, channels };
}

/** A town: far traffic's low wash, cars going by a street away, and a hum of machines. */
export function townBed(): Loop {
  const next = random(53);
  const seconds = 19;
  const length = Math.round(seconds * BED_RATE);
  const channels = [0, 1].map(() => {
    const low = lowNoise(length, next, () => 260, BED_RATE);
    const lower = lowNoise(length, next, () => 70, BED_RATE);
    return low.map((sample, i) => 1.6 * sample + 3 * lower[i]);
  });
  for (let i = 0; i < 6; i++) {
    const at = (i + next()) * (seconds / 6);
    const passS = 3 + 2 * next();
    const pan = next() * 1.4 - 0.7;
    const passing = lowNoise(Math.round(passS * BED_RATE), next, () => 900, BED_RATE);
    addPanned(channels, BED_RATE, at, passS, pan, (t) => {
      const share = t / passS;
      return 1.2 * Math.sin(Math.PI * share) ** 2 * passing[Math.min(Math.round(t * BED_RATE), passing.length - 1)];
    });
  }
  const humHz = 100;
  for (const channel of channels) for (let i = 0; i < length; i++) channel[i] += 0.012 * Math.sin((TAU * Math.round(humHz * seconds) * i) / length);
  normalise(channels, 0.8);
  return { rate: BED_RATE, channels };
}
