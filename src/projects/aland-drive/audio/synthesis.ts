import { ENGINE_RATE, loopRpms } from "./model";
import { BIKE, type Combustion, type EngineSpec } from "./vehicles";
import type { TrafficVoice } from "./traffic";

/*
 * Every loop the continuous sounds play, computed once as samples: an engine's
 * firing cycle, the tyres' grit, snow and spray, rain on the roof, the freewheel and the sounds of each place. No
 * files and no Web Audio here, and seeded, so a loop is the same every visit.
 * A loop's end meets its start because everything in one is periodic in its
 * length: events wrap round it, and a filter's memory comes from a first pass.
 */

export interface Loop {
  rate: number;
  channels: Float32Array<ArrayBuffer>[];
}

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

/** Each loop holds about this long of the engine, a whole number of cycles, so a held note doesn't repeat a pattern fast enough to hear. */
const ENGINE_LOOP_S = 0.6;
/** Off load the cylinders still fire, but weakly and raggedly: the timbre a lift turns to. */
const OFF_LOAD = 0.55;
/** Where in a cylinder's 720° each of its four valves opens or shuts, as a share of the cycle after it fires: the ticks of the valve gear. */
const VALVE_EVENTS = [0.19, 0.47, 0.53, 0.81];

/** `make(t)` over `seconds`, one value a sample, with one to spare for the rounding of the last. */
function shape(seconds: number, make: (t: number) => number): Float32Array {
  return Float32Array.from({ length: Math.round(seconds * ENGINE_RATE) + 1 }, (_, i) => make(i / ENGINE_RATE));
}

/** An engine's four loops (`loopRpms`, `loopWeights` in `model.ts`): low revs off and on load, then high revs off and on. */
export interface EngineLoops {
  rpm: readonly [low: number, high: number];
  /** Each a pair of channels that aren't left and right: the exhaust's pulses, and the engine bay's intake roar and mechanicals. */
  loops: readonly [Loop, Loop, Loop, Loop];
}

/**
 * One loop of an engine at `rpm`, on load or off: each firing a pressure pulse leaving its port (a thump, its header's
 * ring and a share of turbulence) down its bank's pipe, and in the bay the cylinder breathing in half a cycle later, the
 * valve gear ticking, a diesel's knock and an air-cooled fan. Every loop of an engine has its firings at the same
 * places in its cycles, so loops blended together stay in step.
 */
function engineLoop(engine: Combustion, rpm: number, onLoad: boolean, strengths: readonly number[], next: () => number): Loop {
  const samplesPerCycle = Math.round((120 * ENGINE_RATE) / rpm);
  const cycleS = samplesPerCycle / ENGINE_RATE;
  const cycles = Math.max(4, Math.round(ENGINE_LOOP_S / cycleS));
  const exhaust = new Float32Array(samplesPerCycle * cycles);
  const bay = new Float32Array(samplesPerCycle * cycles);
  const { firing, banks } = engine;
  const pulseS = (engine.pulseMs / 1000) * (onLoad ? 1 : 1.5);
  const roughness = engine.roughness * (onLoad ? 1 : 0.5);
  const breathS = cycleS / 4;
  const breathing = 1 - Math.exp((-TAU * 1800) / ENGINE_RATE);
  // Every pulse of a bank has the same shape, worked out once: only its strength and its turbulence differ.
  const thumps = [1, banks.ring].map((ring) => shape(pulseS * 8, (t) => (t / pulseS) * Math.exp(1 - t / pulseS) * (1 + 0.5 * Math.sin(TAU * engine.headerHz * ring * t))));
  const turbulence = shape(pulseS * 8, (t) => roughness * Math.exp(-t / (0.7 * pulseS)));
  const breath = shape(breathS, (t) => 3 * Math.sin((Math.PI * t) / breathS));
  const knockRing = shape(0.008, (t) => Math.exp(-t / 0.0012) * (Math.sin(TAU * engine.knockHz * t) + 0.5 * Math.sin(TAU * engine.knockHz * 1.47 * t)));
  const knockRattle = shape(0.008, (t) => 0.6 * Math.exp(-t / 0.0012));
  const ticks = Array.from({ length: 8 }, () => {
    const hz = 4200 + 2500 * next();
    return shape(0.0015, (t) => Math.exp(-t / 0.00022) * Math.sin(TAU * hz * t));
  });
  for (let cycle = 0; cycle < cycles; cycle++) {
    firing.angles.forEach((angle, cylinder) => {
      const stray = engine.jitter * (next() * 2 - 1);
      const own = strengths[cylinder];
      const strength = onLoad ? own * (1 + stray) : OFF_LOAD * own * own * (1 + 2 * stray);
      const at = (cycle + angle / 720) * cycleS;
      const bank = firing.banks[cylinder];
      const gain = (bank === 1 ? banks.gain : 1) * strength;
      const thump = thumps[bank];
      addEvent(exhaust, ENGINE_RATE, at + (bank === 1 ? banks.delayMs / 1000 : 0), pulseS * 8, (t) => {
        const i = Math.round(t * ENGINE_RATE);
        return gain * (thump[i] + (next() * 2 - 1) * turbulence[i]);
      });
      const drawn = (onLoad ? strength : 0.2 * own) * engine.intake;
      let held = 0;
      addEvent(bay, ENGINE_RATE, at + cycleS / 2, breathS, (t) => {
        held += (next() * 2 - 1 - held) * breathing;
        return drawn * breath[Math.round(t * ENGINE_RATE)] * held;
      });
      if (engine.knock > 0) {
        const knock = engine.knock * own * (onLoad ? 0.8 : 1);
        addEvent(bay, ENGINE_RATE, at, 0.008, (t) => {
          const i = Math.round(t * ENGINE_RATE);
          return knock * (knockRing[i] + (next() * 2 - 1) * knockRattle[i]);
        });
      }
      if (engine.chatter > 0) {
        for (const share of VALVE_EVENTS) {
          const tick = ticks[Math.floor(next() * ticks.length)];
          const level = engine.chatter * 0.35 * (0.7 + 0.3 * next());
          addEvent(bay, ENGINE_RATE, at + share * cycleS, 0.0015, (t) => level * tick[Math.round(t * ENGINE_RATE)]);
        }
      }
    });
  }
  if (engine.fan !== null) {
    const turns = Math.round(cycles * 2 * engine.fan.order);
    for (let i = 0; i < bay.length; i++) bay[i] += 0.25 * engine.fan.level * Math.sin((TAU * turns * i) / bay.length);
  }
  for (const channel of [exhaust, bay]) {
    const mean = channel.reduce((sum, sample) => sum + sample, 0) / channel.length;
    for (let i = 0; i < channel.length; i++) channel[i] -= mean;
  }
  return { rate: ENGINE_RATE, channels: [exhaust, bay] };
}

/**
 * An engine's loops, rendered once: at its low and high revs, off and on load. Each cylinder's strength is drawn once
 * from the voice's seed and shared by all four, so the lope is the engine's own; all four are scaled by the one
 * factor that brings the loudest exhaust to the top, so a loop off load stays as much quieter as it was rendered.
 */
export function engineLoops(spec: EngineSpec): EngineLoops | null {
  const engine = spec.combustion;
  if (engine === null) return null;
  const next = random(spec.seed);
  const strengths = engine.firing.angles.map(() => 1 - engine.lope * next());
  const rpm = loopRpms(spec);
  const loops = rpm.flatMap((at) => [false, true].map((onLoad) => engineLoop(engine, at, onLoad, strengths, next))) as unknown as EngineLoops["loops"];
  let highest = 0;
  for (const loop of loops) for (const sample of loop.channels[0]) highest = Math.max(highest, Math.abs(sample));
  for (const loop of loops) for (const channel of loop.channels) for (let i = 0; i < channel.length; i++) channel[i] *= 0.9 / highest;
  return { rpm, loops };
}

/** The one-shots an engine's exhaust and turbo make, shared by every car and coloured by each car's own pipe. */
export interface EngineShots {
  /** Unburnt fuel catching in the pipe on a lift: a few cracks, each a little different. */
  pops: Loop[];
  /** Anti-lag: fuel lit in the manifold to keep the turbo spinning, a gunshot bang. */
  bang: Loop;
  /** A blow-off valve venting the boost on a lift: a falling psssh. */
  blowOff: Loop;
  /** The boost with no valve to vent it, backing up through the compressor in a fluttering chatter. */
  flutter: Loop;
}

/** Noise between two one-pole low-passes, under an envelope, with the upper corner moving: a hiss that falls as it goes. */
function sweptHiss(next: () => number, seconds: number, envelope: (t: number) => number, corner: (t: number) => number): Loop {
  const channel = samplesOf(seconds, HIGH_RATE);
  let low = 0;
  let lower = 0;
  for (let i = 0; i < channel.length; i++) {
    const t = i / HIGH_RATE;
    const share = 1 - Math.exp((-TAU * corner(t)) / HIGH_RATE);
    low += (next() * 2 - 1 - low) * share;
    lower += (low - lower) * share * 0.25;
    channel[i] = envelope(t) * (low - lower);
  }
  normalise([channel], 0.9);
  return { rate: HIGH_RATE, channels: [channel] };
}

/** A crack of burning fuel: bright noise dying in `crackS`, over a low thump of the pipe. */
function crack(next: () => number, seconds: number, crackS: number, thumpHz: number, thumpS: number): Loop {
  const channel = samplesOf(seconds, HIGH_RATE);
  let held = 0;
  const share = 1 - Math.exp((-TAU * (2500 + 3000 * next())) / HIGH_RATE);
  for (let i = 0; i < channel.length; i++) {
    const t = i / HIGH_RATE;
    held += (next() * 2 - 1 - held) * share;
    channel[i] = 2.5 * held * Math.exp(-t / crackS) + 0.6 * Math.sin(TAU * thumpHz * t) * Math.exp(-t / thumpS);
  }
  normalise([channel], 0.9);
  return { rate: HIGH_RATE, channels: [channel] };
}

export function engineShots(): EngineShots {
  const next = random(73);
  const pops = Array.from({ length: 6 }, () => crack(next, 0.09, 0.0015 + 0.002 * next(), 70 + 60 * next(), 0.008 + 0.006 * next()));
  const bang = crack(next, 0.3, 0.006, 55, 0.04);
  // A tail of smaller crackles after the bang.
  const [bangChannel] = bang.channels;
  for (const pop of pops) {
    const at = Math.round((0.03 + 0.15 * next()) * HIGH_RATE);
    const [small] = pop.channels;
    for (let j = 0; j < small.length && at + j < bangChannel.length; j++) bangChannel[at + j] += 0.3 * small[j];
  }
  normalise(bang.channels, 0.9);
  const blowOff = sweptHiss(next, 0.55, (t) => Math.min(1, t / 0.012) * Math.exp(-t / 0.16), (t) => 900 + 3600 * Math.exp(-t / 0.2));
  // Compressor surge: the air backing up and letting go about twenty times a second, slowing as the shaft runs down.
  let phase = 0;
  const flutter = sweptHiss(
    next,
    0.7,
    (t) => {
      phase += (TAU * (24 - 12 * t)) / HIGH_RATE;
      return Math.exp(-t / 0.25) * Math.max(0, Math.sin(phase)) ** 3;
    },
    () => 1700,
  );
  return { pops, bang, blowOff, flutter };
}

/** A short burst of noise through a one-pole low-pass at `corner`, dying away over `decayS`: unpitched, as stone on stone is. */
function crunchBurst(next: () => number, decayS: number, corner: number, rate: number): Float32Array {
  const out = new Float32Array(Math.round(decayS * 5 * rate));
  const share = 1 - Math.exp((-TAU * corner) / rate);
  let held = 0;
  for (let i = 0; i < out.length; i++) {
    held += (next() * 2 - 1 - held) * share;
    out[i] = held * Math.exp(-i / rate / decayS);
  }
  return out;
}

/**
 * Stones under a tyre: a gritty grind of crushed gravel, thousands of short unpitched crunches over it, and fewer low
 * knocks of bigger stones. No pings: tuned clicks in their thousands are heard as rain or running water.
 */
export function gravelLoop(): Loop {
  const next = random(23);
  const seconds = 3.7;
  const length = Math.round(seconds * HIGH_RATE);
  const channels = [0, 1].map(() => {
    const grit = lowNoise(length, next, () => 1800, HIGH_RATE);
    const held = lowNoise(length, next, () => 250, HIGH_RATE);
    return grit.map((sample, i) => 0.9 * (sample - held[i]));
  });
  for (let i = 0; i < 1600; i++) {
    const burst = crunchBurst(next, 0.002 + 0.006 * next(), 500 + 2200 * next() * next(), HIGH_RATE);
    const level = 0.6 + 2.4 * next() * next();
    addPanned(channels, HIGH_RATE, next() * seconds, burst.length / HIGH_RATE, next() * 1.4 - 0.7, (t) => level * burst[Math.min(Math.round(t * HIGH_RATE), burst.length - 1)]);
  }
  for (let i = 0; i < 200; i++) {
    const hz = 140 + 220 * next();
    const decayS = 0.004 + 0.008 * next();
    const level = 0.4 + 0.8 * next();
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
 * A frozen sea or lake: the ice itself, now and then, in the quiet: a low creak as it shifts, or the falling "pew" of a
 * crack running far across it, its high notes arriving first. The wind is the car's own.
 */
export function iceBed(): Loop {
  const next = random(49);
  const seconds = 33;
  const channels = [samplesOf(seconds, BED_RATE), samplesOf(seconds, BED_RATE)];
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


// ---- Traffic ----

/** A one-pole low-pass run twice round a loop, so its memory at the start is its end's and the loop stays seamless. */
function lowPassed(channel: Float32Array, cornerHz: number, rate: number): void {
  const share = 1 - Math.exp((-TAU * cornerHz) / rate);
  let held = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < channel.length; i++) {
      held += (channel[i] - held) * share;
      if (pass === 1) channel[i] = held;
    }
  }
}

/**
 * A traffic car's engine heard from the roadside (`traffic.ts`), one loop at a cruise: its exhaust and a little of its
 * bay, part on load and part off as a car holding its speed is, through its silencer shut. Mono, in both channels, so
 * the placed sound's panner puts it where the car is.
 */
export function trafficEngineLoop(voice: TrafficVoice, rpm: number): Loop {
  const engine = voice.combustion;
  if (engine === null) throw new Error("a traffic engine loop needs an engine");
  const next = random(voice.seed);
  const strengths = engine.firing.angles.map(() => 1 - engine.lope * next());
  const on = engineLoop(engine, rpm, true, strengths, next);
  const off = engineLoop(engine, rpm, false, strengths, next);
  const channel = on.channels[0].map((sample, i) => 0.6 * (sample + 0.4 * on.channels[1][i]) + 0.4 * (off.channels[0][i] + 0.4 * off.channels[1][i]));
  lowPassed(channel, engine.exhaustHz[0] + 0.3 * engine.exhaustHz[1], ENGINE_RATE);
  lowPassed(channel, engine.exhaustHz[0] * 2, ENGINE_RATE);
  normalise([channel], 0.85);
  return { rate: ENGINE_RATE, channels: [channel, Float32Array.from(channel)] };
}

/** A traffic car's motor at `rpm`: its whine in its orders, the inverter's tone under it, and a breath of noise so it isn't a bare sine. */
export function trafficMotorLoop(voice: TrafficVoice, rpm: number): Loop {
  const motor = voice.electric;
  if (motor === null) throw new Error("a traffic motor loop needs a motor");
  const next = random(voice.seed);
  const turnHz = rpm / 60;
  const seconds = 2;
  const length = Math.round(seconds * HIGH_RATE);
  // Every tone a whole number of cycles in the loop.
  const whole = (hz: number) => Math.round(hz * seconds) / seconds;
  const breath = lowNoise(length, next, () => 2500, HIGH_RATE);
  const channel = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / HIGH_RATE;
    let sum = 0;
    for (const [order, level] of motor.orders) sum += level * Math.sin(TAU * whole(turnHz * order) * t);
    sum += motor.inverter * Math.sin(TAU * whole(motor.carrierHz) * t);
    channel[i] = sum + 0.6 * breath[i];
  }
  normalise([channel], 0.8);
  return { rate: HIGH_RATE, channels: [channel, Float32Array.from(channel)] };
}

/** Tyres rolling on a sealed road, heard from the roadside: a broad hiss with a roar under it. */
export function rollTarmacLoop(): Loop {
  const next = random(53);
  const length = Math.round(2.9 * HIGH_RATE);
  const hiss = lowNoise(length, next, () => 1400, HIGH_RATE);
  const held = lowNoise(length, next, () => 120, HIGH_RATE);
  const roar = lowNoise(length, next, () => 350, HIGH_RATE);
  const channel = hiss.map((sample, i) => sample - held[i] + 0.8 * (roar[i] - held[i]));
  normalise([channel], 0.8);
  return { rate: HIGH_RATE, channels: [channel, Float32Array.from(channel)] };
}

/** Tyres rolling on gravel, heard from the roadside: the car's own gravel bed, both sides together. */
export function rollGravelLoop(): Loop {
  const { rate, channels } = gravelLoop();
  const channel = channels[0].map((sample, i) => 0.5 * (sample + channels[1][i]));
  normalise([channel], 0.8);
  return { rate, channels: [channel, Float32Array.from(channel)] };
}
