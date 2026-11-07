import { BIKE, type EngineSpec } from "./vehicles";

/*
 * Every loop the continuous sounds play, computed once as samples: an engine's
 * firing cycle, the tyres' grit, snow and spray, rain on the roof, the freewheel and the beds of each place. No
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

/** Bare granite: a coarse grind of grit, crisp hard clicks off its crystals, and low knocks where one slab meets the next. */
export function rockLoop(): Loop {
  const next = random(59);
  const seconds = 3.5;
  const length = Math.round(seconds * HIGH_RATE);
  const grit = Array.from({ length: 16 }, () => ({ count: 40 + Math.floor(next() * 160), phase: next() * TAU }));
  const rough = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const place = (TAU * i) / length;
    let sum = 0;
    for (const { count, phase } of grit) sum += Math.sin(count * place + phase);
    rough[i] = 0.35 + (0.65 * Math.abs(sum)) / Math.sqrt(grit.length);
  }
  const channels = [0, 1].map(() => {
    const roar = lowNoise(length, next, () => 3200, HIGH_RATE);
    const body = lowNoise(length, next, () => 500, HIGH_RATE);
    return roar.map((sample, i) => (sample - body[i]) * rough[i]);
  });
  for (let i = 0; i < 1100; i++) {
    const hz = 700 + 2600 * next() * next();
    const decayS = 0.0004 + 0.0012 * next();
    const level = 0.2 + 0.6 * next() * next();
    addPanned(channels, HIGH_RATE, next() * seconds, decayS * 5, next() * 1.2 - 0.6, (t) => level * Math.exp(-t / decayS) * Math.sin(TAU * hz * t));
  }
  for (let i = 0; i < 11; i++) {
    const hz = 90 + 110 * next();
    const level = 0.5 + 0.4 * next();
    addPanned(channels, HIGH_RATE, ((i + 0.6 * next()) / 11) * seconds, 0.06, next() * 0.6 - 0.3, (t) => level * Math.exp(-t / 0.011) * Math.sin(TAU * hz * t));
  }
  normalise(channels, 0.9);
  return { rate: HIGH_RATE, channels };
}

/** Packed snow under a tyre: a soft crunch, clusters of small dull crackles over a hush, with no stone in it. */
export function snowLoop(): Loop {
  const next = random(61);
  const seconds = 3.1;
  const length = Math.round(seconds * HIGH_RATE);
  const channels = [0, 1].map(() => lowNoise(length, next, () => 420, HIGH_RATE).map((sample) => 0.6 * sample));
  let at = 0;
  while (at < seconds) {
    const grains = 5 + Math.floor(next() * 9);
    const pan = next() * 1.2 - 0.6;
    const cluster = 0.025 + 0.04 * next();
    for (let i = 0; i < grains; i++) {
      const lengthS = 0.004 + 0.012 * next();
      const grain = lowNoise(Math.round(lengthS * HIGH_RATE), next, () => 1400 + 1800 * next(), HIGH_RATE);
      const level = 0.6 + 0.8 * next();
      addPanned(channels, HIGH_RATE, at + next() * cluster, lengthS, pan, (t) => {
        const share = t / lengthS;
        return level * Math.sin(Math.PI * share) * grain[Math.min(Math.round(t * HIGH_RATE), grain.length - 1)];
      });
    }
    at += 0.03 + 0.05 * next();
  }
  normalise(channels, 0.9);
  return { rate: HIGH_RATE, channels };
}

/**
 * Studded tyres on a bare road: each stud ticks as it meets the ground, in a pattern that repeats every turn of
 * the wheel, so four wheels of them make a fast, hard ticking with a hum at its rate. A second is four turns.
 */
export function studsLoop(): Loop {
  const next = random(67);
  const seconds = 1;
  const turns = 4;
  const studs = 64;
  const turnS = seconds / turns;
  const channels = [samplesOf(seconds, HIGH_RATE), samplesOf(seconds, HIGH_RATE)];
  for (let wheel = 0; wheel < 4; wheel++) {
    const pan = wheel % 2 === 0 ? -0.5 : 0.5;
    const phase = next() * turnS;
    const pattern = Array.from({ length: studs }, (_, stud) => ({ at: (stud + 0.3 * (next() - 0.5)) / studs, hz: 2600 + 3400 * next(), level: 0.5 + 0.5 * next() }));
    for (let turn = 0; turn < turns; turn++) {
      for (const { at, hz, level } of pattern) {
        const decayS = 0.00035;
        addPanned(channels, HIGH_RATE, phase + (turn + at) * turnS, decayS * 6, pan, (t) => level * Math.exp(-t / decayS) * Math.sin(TAU * hz * t));
      }
    }
  }
  normalise(channels, 0.9);
  return { rate: HIGH_RATE, channels };
}

/** Water off a wet road: a bright hiss that surges as the tread wrings it out, droplets against the arches, and a low wash. */
export function sprayLoop(): Loop {
  const next = random(67);
  const seconds = 3.3;
  const length = Math.round(seconds * HIGH_RATE);
  const surges = Array.from({ length: 5 }, () => ({ count: 3 + Math.floor(next() * 14), phase: next() * TAU }));
  const channels = [0, 1].map(() => {
    const white = lowNoise(length, next, () => 9000, HIGH_RATE);
    const dull = lowNoise(length, next, () => 1800, HIGH_RATE);
    const wash = lowNoise(length, next, () => 600, HIGH_RATE);
    return white.map((sample, i) => {
      const place = (TAU * i) / length;
      let surge = 0;
      for (const { count, phase } of surges) surge += Math.sin(count * place + phase);
      return (sample - dull[i]) * (0.6 + 0.4 * Math.max(0, surge / 2.5)) + 0.5 * wash[i];
    });
  });
  for (let i = 0; i < 1800; i++) {
    const hz = 2500 + 5000 * next();
    const decayS = 0.0002 + 0.0005 * next();
    const level = 0.05 + 0.15 * next() * next();
    addPanned(channels, HIGH_RATE, next() * seconds, decayS * 5, next() * 1.6 - 0.8, (t) => level * Math.exp(-t / decayS) * Math.sin(TAU * hz * t));
  }
  normalise(channels, 0.9);
  return { rate: HIGH_RATE, channels };
}

/**
 * One drop striking a car: a short burst of noise (glass and paint are hard, so the tap is broadband, not a tone),
 * and under some of them the dull thump of the roof panel it struck, low and damped.
 */
function addDrop(channels: Float32Array[], next: () => number, at: number, level: number, pan: number, thump: boolean): void {
  const tapS = 0.00025 + 0.0007 * next();
  addPanned(channels, HIGH_RATE, at, tapS * 5, pan, (t) => level * Math.exp(-t / tapS) * (next() * 2 - 1));
  if (!thump) return;
  const hz = 160 + 260 * next();
  const ringS = 0.003 + 0.005 * next();
  addPanned(channels, HIGH_RATE, at, ringS * 5, pan, (t) => 0.45 * level * Math.exp(-t / ringS) * Math.sin(TAU * hz * t));
}

/** A seamless loop through a one-pole low-pass, its memory from a first pass: what a roof and glass between drop and ear take off the top. */
function softened(channel: Float32Array<ArrayBuffer>, corner: number): Float32Array<ArrayBuffer> {
  const share = 1 - Math.exp((-TAU * corner) / HIGH_RATE);
  const out = new Float32Array(channel.length);
  let held = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < channel.length; i++) {
      held += (channel[i] - held) * share;
      out[i] = held;
    }
  }
  return out;
}

/** Light rain on a car: drops heard one by one on the roof and the glass, a few hundred a second, over a faint hiss. */
export function rainLightLoop(): Loop {
  const next = random(83);
  const seconds = 4.3;
  const length = Math.round(seconds * HIGH_RATE);
  const channels = [0, 1].map(() => {
    const bright = lowNoise(length, next, () => 5000, HIGH_RATE);
    const dull = lowNoise(length, next, () => 900, HIGH_RATE);
    return bright.map((sample, i) => 0.05 * (sample - dull[i]));
  });
  for (let i = 0; i < 1100; i++) {
    const level = 0.15 + 0.85 * next() * next();
    addDrop(channels, next, next() * seconds, level, next() * 1.8 - 0.9, next() < 0.3);
  }
  const soft = channels.map((channel) => softened(channel, 6000));
  normalise(soft, 0.9);
  return { rate: HIGH_RATE, channels: soft };
}

/** Heavy rain on a car: a dense hiss of countless drops, surging a little, with the nearer taps and thumps still standing out of it. */
export function rainHeavyLoop(): Loop {
  const next = random(89);
  const seconds = 3.7;
  const length = Math.round(seconds * HIGH_RATE);
  const surges = Array.from({ length: 4 }, () => ({ count: 2 + Math.floor(next() * 9), phase: next() * TAU }));
  const channels = [0, 1].map(() => {
    const bright = lowNoise(length, next, () => 6500, HIGH_RATE);
    const dull = lowNoise(length, next, () => 700, HIGH_RATE);
    return bright.map((sample, i) => {
      const place = (TAU * i) / length;
      let surge = 0;
      for (const { count, phase } of surges) surge += Math.sin(count * place + phase);
      return 0.45 * (sample - dull[i]) * (0.85 + 0.15 * (surge / 4));
    });
  });
  for (let i = 0; i < 3500; i++) {
    const level = 0.08 + 0.5 * next() * next();
    addDrop(channels, next, next() * seconds, level, next() * 1.8 - 0.9, next() < 0.3);
  }
  const soft = channels.map((channel) => softened(channel, 3800));
  normalise(soft, 0.9);
  return { rate: HIGH_RATE, channels: soft };
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

/**
 * Gusts on a loop: each comes up and dies away over its own few seconds, at its own strength, with stiller air
 * between, wrapping round the loop. Irregular on purpose: wind that swells and falls on a steady beat is heard as
 * waves on a shore.
 */
function gustsOver(seconds: number, next: () => number, lengthS: readonly [number, number], gapS: readonly [number, number]) {
  const gusts: { at: number; lengthS: number; strength: number }[] = [];
  for (let at = next() * gapS[1]; at < seconds; at += gapS[0] + (gapS[1] - gapS[0]) * next()) {
    gusts.push({ at, lengthS: lengthS[0] + (lengthS[1] - lengthS[0]) * next(), strength: 0.35 + 0.65 * next() });
  }
  return (t: number) => {
    let sum = 0;
    for (const { at, lengthS: span, strength } of gusts) {
      const into = (((t - at) % seconds) + seconds) % seconds;
      if (into < span) sum += strength * Math.sin((Math.PI * into) / span) ** 2;
    }
    return Math.min(sum, 1.3);
  };
}

/** A fast, uneven flutter round 1, periodic in the loop: leaves catching the air and letting go, many times a second. */
function flutterOver(seconds: number, next: () => number) {
  const parts = Array.from({ length: 6 }, () => ({ cycles: Math.round((7 + 18 * next()) * seconds), phase: next() * TAU }));
  return (t: number) => {
    let sum = 0;
    for (const { cycles, phase } of parts) sum += Math.sin((TAU * cycles * t) / seconds + phase);
    return Math.max(0, 0.55 + 0.35 * sum);
  };
}

/** Forest in leaf: leaves rustling in gusts, a bright flickering hiss with leaves ticking in it, and quieter air between. */
export function leavesBed(): Loop {
  const next = random(41);
  const seconds = 29;
  const length = Math.round(seconds * BED_RATE);
  const gust = gustsOver(seconds, next, [1.5, 4.5], [1.5, 5]);
  const channels = [0, 1].map(() => {
    const bright = lowNoise(length, next, () => 7000, BED_RATE);
    const dull = lowNoise(length, next, () => 1500, BED_RATE);
    const flutter = flutterOver(seconds, next);
    return bright.map((sample, i) => {
      const t = i / BED_RATE;
      return (sample - dull[i]) * (0.12 + gust(t)) * flutter(t);
    });
  });
  for (let i = 0; i < 4000; i++) {
    const at = next() * seconds;
    if (next() > 0.15 + gust(at)) continue;
    const hz = 2500 + 4500 * next();
    const decayS = 0.0004 + 0.0012 * next();
    const level = 0.04 + 0.12 * next() * next();
    addPanned(channels, BED_RATE, at, decayS * 5, next() * 1.8 - 0.9, (t) => level * Math.exp(-t / decayS) * Math.sin(TAU * hz * t));
  }
  normalise(channels, 0.8);
  return { rate: BED_RATE, channels };
}

/** Spring and summer's birds: a few kinds of small bird, near and far, singing over one another with short gaps, so a chorus is this bed played loud. */
export function birdsBed(): Loop {
  const next = random(42);
  const seconds = 29;
  const channels = [samplesOf(seconds, BED_RATE), samplesOf(seconds, BED_RATE)];
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
    at += 0.6 + next() * 2.4;
  }
  // A woodpecker drumming, now and then: a burst of knocks on hollow wood, faster than anything else in the wood.
  for (let at = 4 + next() * 4; at < seconds - 2; at += 9 + 6 * next()) {
    const pan = next() * 1.4 - 0.7;
    const rateHz = 15 + 5 * next();
    const knocks = Math.round(rateHz * (0.5 + 0.4 * next()));
    for (let k = 0; k < knocks; k++) {
      const level = 0.25 * (1 - (0.4 * k) / knocks);
      addPanned(channels, BED_RATE, at + k / rateHz, 0.03, pan, (t) => level * Math.exp(-t / 0.006) * (Math.sin(TAU * 1150 * t) + 0.7 * Math.sin(TAU * 420 * t)));
    }
  }
  normalise(channels, 0.8);
  return { rate: BED_RATE, channels };
}

/**
 * Winter's wind: a steady rush through bare branches and spruce that never falls quiet, its pitch rising as each gust
 * comes through, with the needles' thin hiss on top; the same wind blows over a frozen sea.
 */
export function winterBed(): Loop {
  const next = random(44);
  const seconds = 31;
  const length = Math.round(seconds * BED_RATE);
  const gust = gustsOver(seconds, next, [3, 8], [2, 6]);
  const gusting = Float32Array.from({ length }, (_, i) => gust(i / BED_RATE));
  const channels = [0, 1].map(() => {
    const rush = lowNoise(length, next, (i) => 450 + 900 * gusting[i], BED_RATE);
    const held = lowNoise(length, next, () => 140, BED_RATE);
    const needles = lowNoise(length, next, () => 7000, BED_RATE);
    const needlesHeld = lowNoise(length, next, () => 3000, BED_RATE);
    return rush.map((sample, i) => {
      const blowing = gusting[i];
      return (0.6 + 0.4 * blowing) * (sample - 0.7 * held[i]) + 0.25 * blowing * (needles[i] - needlesHeld[i]);
    });
  });
  normalise(channels, 0.8);
  return { rate: BED_RATE, channels };
}

/**
 * A frozen sea: a dry, steady wind over the flat ice with nothing to break on, never swelling, and now and then the ice
 * itself: a low creak as it shifts, or the falling "pew" of a crack running far across it, its high notes arriving
 * first.
 */
export function iceBed(): Loop {
  const next = random(49);
  const seconds = 33;
  const length = Math.round(seconds * BED_RATE);
  const channels = [0, 1].map(() => {
    const bright = lowNoise(length, next, () => 5200, BED_RATE);
    const dull = lowNoise(length, next, () => 1200, BED_RATE);
    const low = lowNoise(length, next, () => 300, BED_RATE);
    return bright.map((sample, i) => 0.7 * (sample - dull[i]) + 0.35 * low[i]);
  });
  for (let at = 2 + next() * 3; at < seconds - 2; at += 5 + 6 * next()) {
    const pan = next() * 1.6 - 0.8;
    if (next() < 0.55) {
      // A creak: a low groan, its pitch wandering as the ice grinds.
      const hz = 70 + 70 * next();
      const longS = 0.4 + 0.8 * next();
      const wobble = 3 + 5 * next();
      let phase = 0;
      addPanned(channels, BED_RATE, at, longS, pan, (t) => {
        phase += (TAU * hz * (1 + 0.15 * Math.sin(TAU * wobble * t))) / BED_RATE / 2;
        const grind = 0.6 + 0.4 * (next() * 2 - 1);
        return 0.5 * Math.sin((Math.PI * t) / longS) * grind * (Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.3 * Math.sin(3 * phase));
      });
    } else {
      // A crack running far across the ice: a falling whistle, then its echo.
      const fromHz = 2600 + 1200 * next();
      const longS = 0.5 + 0.4 * next();
      for (const [delayS, level] of [[0, 0.5], [0.18, 0.2]] as const) {
        let phase = 0;
        addPanned(channels, BED_RATE, at + delayS, longS, pan, (t) => {
          phase += (TAU * (220 + (fromHz - 220) * Math.exp(-t / (longS * 0.25)))) / BED_RATE / 2;
          return level * Math.exp(-t / (longS * 0.5)) * Math.sin(phase);
        });
      }
    }
  }
  normalise(channels, 0.8);
  return { rate: BED_RATE, channels };
}

/** Winter's birds, few and far between: a crow's rough caws and now and then a tit's two notes, with long quiet between. */
export function winterCallsBed(): Loop {
  const next = random(46);
  const seconds = 41;
  const channels = [samplesOf(seconds, BED_RATE), samplesOf(seconds, BED_RATE)];
  let at = 2 + next() * 3;
  while (at < seconds - 4) {
    const pan = next() * 1.8 - 0.9;
    if (next() < 0.6) {
      // A crow: two to four rough caws, each a falling note thick with harmonics.
      const caws = 2 + Math.floor(next() * 3);
      const hz = 520 + next() * 160;
      const level = 0.2 + 0.25 * next();
      for (let i = 0; i < caws; i++) {
        const caw = (s: number) => hz * (1.08 - 0.2 * s) * (1 + 0.04 * Math.sin(TAU * 31 * s));
        for (const [harmonic, share] of [[1, 1], [2, 0.7], [3, 0.5], [4, 0.3], [5, 0.2]] as const) chirp(channels, at, 0.32, pan, level * share, (s) => harmonic * caw(s));
        at += 0.45 + next() * 0.15;
      }
    } else {
      const high = 4100 + next() * 600;
      const level = 0.08 + 0.1 * next();
      for (let i = 0; i < 2; i++) {
        chirp(channels, at + i * 0.36, 0.14, pan, level, () => high);
        chirp(channels, at + i * 0.36 + 0.17, 0.13, pan, level, () => high * 0.72);
      }
    }
    at += 7 + next() * 9;
  }
  normalise(channels, 0.8);
  return { rate: BED_RATE, channels };
}

/**
 * The sea on a rocky shore: each swell comes in rising, breaks, and washes back fizzing over the stones, at an uneven
 * rhythm of six to nine seconds, over the far surf's low murmur. The fizz, thousands of bubbles bursting, is what
 * tells water from wind.
 */
export function shoreBed(): Loop {
  const next = random(43);
  const seconds = 27;
  const length = Math.round(seconds * BED_RATE);
  const waves: { breakS: number; riseS: number; washS: number; height: number }[] = [];
  for (let at = 1 + next() * 2; at < seconds; at += 5.5 + 3 * next()) waves.push({ breakS: at, riseS: 1.4 + 0.8 * next(), washS: 2.2 + 1.4 * next(), height: 0.6 + 0.4 * next() });
  /** How much water is moving at a moment: rising to the break, then drawing back. */
  const surge = (t: number) => {
    let sum = 0;
    for (const { breakS, riseS, washS, height } of waves) {
      const from = ((((t - breakS) % seconds) + seconds * 1.5) % seconds) - seconds / 2;
      if (from < 0 && from > -riseS) sum += height * (1 + from / riseS) ** 2;
      else if (from >= 0) sum += height * Math.exp(-from / (washS * 0.45));
    }
    return Math.min(sum, 1.4);
  };
  /** The water drawing back after each break, the hiss of it running over the stones. */
  const washing = (t: number) => {
    let sum = 0;
    for (const { breakS, washS, height } of waves) {
      const from = ((((t - breakS) % seconds) + seconds * 1.5) % seconds) - seconds / 2;
      if (from >= 0) sum += height * Math.min(1, from / 0.15) * Math.exp(-from / (washS * 0.55));
    }
    return Math.min(sum, 1.2);
  };
  // Each worked out once a sample, not once a sample of every pass.
  const surging = Float32Array.from({ length }, (_, i) => surge(i / BED_RATE));
  const washed = Float32Array.from({ length }, (_, i) => washing(i / BED_RATE));
  const channels = [0, 1].map((side) => {
    // The right ear hears each wave a moment after the left.
    const lag = Math.round(side * 0.03 * BED_RATE);
    const at = (values: Float32Array, i: number) => values[(i + lag) % length];
    const body = lowNoise(length, next, (i) => 220 + 2600 * at(surging, i), BED_RATE);
    const far = lowNoise(length, next, () => 260, BED_RATE);
    const hiss = lowNoise(length, next, () => 6500, BED_RATE);
    const hissHeld = lowNoise(length, next, () => 1800, BED_RATE);
    return body.map((sample, i) => sample * (0.06 + at(surging, i)) + 0.35 * far[i] + 1.4 * at(washed, i) * (hiss[i] - hissHeld[i]));
  });
  for (const { breakS, washS, height } of waves) {
    // The break: a short burst as the crest falls.
    addPanned(channels, BED_RATE, breakS, 0.35, next() * 0.8 - 0.4, (t) => height * 0.5 * Math.exp(-t / 0.09) * (next() * 2 - 1));
    // The wash: bubbles bursting as it draws back over the stones, thick at first and thinning out.
    for (let i = 0; i < 1000 * height; i++) {
      const into = washS * next() ** 1.8;
      const hz = 1800 + 4500 * next();
      const decayS = 0.0005 + 0.0015 * next();
      const level = 0.12 + 0.4 * next() * next();
      addPanned(channels, BED_RATE, breakS + into, decayS * 5, next() * 1.6 - 0.8, (t) => level * Math.exp(-t / decayS) * Math.sin(TAU * hz * (1 + 4 * t) * t));
    }
  }
  normalise(channels, 0.85);
  return { rate: BED_RATE, channels };
}

/** A lake or a pond on a still day: small wavelets lapping at the bank, a slap and a gulp every second or two, and quiet between. */
export function lakeBed(): Loop {
  const next = random(45);
  const seconds = 23;
  const channels = [samplesOf(seconds, BED_RATE), samplesOf(seconds, BED_RATE)];
  for (let at = next(); at < seconds - 0.5; at += 0.7 + 1.7 * next()) {
    const pan = next() * 1.4 - 0.7;
    const level = 0.3 + 0.7 * next();
    const slapS = 0.025 + 0.03 * next();
    const corner = 900 + 1200 * next();
    let held = 0;
    const share = 1 - Math.exp((-TAU * corner) / BED_RATE);
    addPanned(channels, BED_RATE, at, slapS * 6, pan, (t) => {
      held += (next() * 2 - 1 - held) * share;
      return level * 0.6 * Math.exp(-t / slapS) * held * 6;
    });
    // The gulp: water closing over the air the wavelet trapped, a short note rising as the pocket shrinks.
    const hz = 260 + 380 * next();
    const gulpS = 0.03 + 0.04 * next();
    addPanned(channels, BED_RATE, at + 0.02 + 0.05 * next(), gulpS * 5, pan, (t) => level * 0.35 * Math.exp(-t / gulpS) * Math.sin(TAU * hz * (1 + 6 * t) * t));
  }
  normalise(channels, 0.8);
  return { rate: BED_RATE, channels };
}

/** A gull's call: a run of falling cries, each with its harsh upper harmonics. One call, for placing over the water. */
export function gullCall(): Loop {
  const next = random(47);
  const cries = 2 + Math.floor(next() * 3);
  const hz = 950 + next() * 400;
  const seconds = cries * 0.5 + 0.4;
  const channels = [samplesOf(seconds, BED_RATE), samplesOf(seconds, BED_RATE)];
  let at = 0.02;
  for (let i = 0; i < cries; i++) {
    const long = i === 0 ? 0.42 : 0.24;
    const cry = (s: number) => hz * (1.45 - 0.55 * s) * (1 + 0.012 * Math.sin(TAU * 14 * s));
    chirp(channels, at, long, 0, 0.8, cry);
    chirp(channels, at, long, 0, 0.34, (s) => 2 * cry(s));
    chirp(channels, at, long, 0, 0.16, (s) => 3 * cry(s));
    at += long + 0.08 + next() * 0.06;
  }
  normalise(channels, 0.8);
  return { rate: BED_RATE, channels };
}

/** One strike of a church bell: a bell's partials (the hum, the prime, the minor third, the fifth and the nominal), each dying away at its own rate. */
export function churchBell(): Loop {
  const seconds = 4.5;
  const base = 330;
  const partials = [
    [0.5, 0.5, 3.2],
    [1, 0.8, 2.2],
    [1.19, 0.5, 1.6],
    [1.5, 0.35, 1.2],
    [2, 0.45, 1],
    [2.51, 0.2, 0.6],
    [3.01, 0.15, 0.45],
  ] as const;
  const channel = samplesOf(seconds, BED_RATE);
  for (let i = 0; i < channel.length; i++) {
    const t = i / BED_RATE;
    let sum = 0;
    for (const [ratio, level, decayS] of partials) sum += level * Math.exp(-t / decayS) * Math.sin(TAU * base * ratio * t);
    channel[i] = sum * Math.min(1, t / 0.002);
  }
  normalise([channel], 0.8);
  return { rate: BED_RATE, channels: [channel, Float32Array.from(channel)] };
}

/**
 * A town beyond what's in view: the low hum of a town far off, and in the centre a murmur of voices, a few people
 * talking at once some way off, rising and falling. The traffic, cyclists and walkers are the world's own, heard where
 * they are; this is only what no one in sight makes.
 */
export function townBed(): Loop {
  const next = random(53);
  const seconds = 37;
  const length = Math.round(seconds * BED_RATE);
  const channels = [0, 1].map(() => {
    const low = lowNoise(length, next, () => 160, BED_RATE);
    const lower = lowNoise(length, next, () => 60, BED_RATE);
    return low.map((sample, i) => 0.9 * sample + 2.2 * lower[i]);
  });
  // Voices: each talks in spurts of a few seconds, syllable by syllable, a band of speech far enough off to lose the words.
  for (let voice = 0; voice < 7; voice++) {
    const pan = next() * 1.6 - 0.8;
    const pitch = 0.8 + 0.5 * next();
    const level = 0.5 + 0.5 * next();
    for (let at = next() * 4; at < seconds; at += 1 + 4 * next()) {
      const spurtS = 1 + 3 * next();
      const syllableHz = (3.5 + 2.5 * next()) * pitch;
      const speech = lowNoise(Math.round(spurtS * BED_RATE), next, () => 1400 * pitch, BED_RATE);
      const dull = lowNoise(Math.round(spurtS * BED_RATE), next, () => 300 * pitch, BED_RATE);
      addPanned(channels, BED_RATE, at, spurtS, pan, (t) => {
        const i = Math.min(Math.round(t * BED_RATE), speech.length - 1);
        const syllable = Math.max(0, Math.sin(TAU * syllableHz * t + voice)) ** 1.5;
        return level * 6 * Math.sin((Math.PI * t) / spurtS) * syllable * (speech[i] - dull[i]);
      });
    }
  }
  const humHz = 100;
  for (const channel of channels) for (let i = 0; i < length; i++) channel[i] += 0.006 * Math.sin((TAU * Math.round(humHz * seconds) * i) / length);
  normalise(channels, 0.8);
  return { rate: BED_RATE, channels };
}
