import { CARS } from "../../sim/cars";
import type { EngineRead } from "../../sim/gearbox";
import type { EngineFrame, EngineVoiceMaker, EngineVoiceNodes, Steer } from "../graph";
import type { EngineId } from "../vehicles";
import { OLD_VOICES } from "./voices";

/*
 * The engine synthesis as it was before the new one, frozen for the audition's "old" switch on `?sounds`, so the
 * owner can hear old beside new on the same gearbox and throttle. Nothing in the game uses it. Once the owner has
 * decided, this folder is deleted, with the switch in `sound-lab.tsx` and the `auditionEngine` seam in `graph.ts`.
 */

export interface OldHarmonic {
  order: number;
  wave: OscillatorType;
  level: number;
  cents: number;
}

export interface OldVoice {
  seed: number;
  firesPerRev: number;
  pulseOrders: readonly number[];
  pulseDecay: number;
  unevenness: number;
  harmonics: readonly OldHarmonic[];
  cycleLevel: number;
  exhaustHz: readonly [closed: number, revs: number, load: number];
  bodyHz: number;
  bodyDb: number;
  drive: number;
  intakeHz: readonly [low: number, high: number];
  intakeQ: number;
  intakeLevel: number;
  firingBeat: number;
  level: number;
  idleLevel: number;
}

/** The cars voiced before the new synthesis: each has an old voice to compare. */
export const hasOldVoice = (id: EngineId) => OLD_VOICES[id] !== undefined;

const CYCLE_RPM = 3000;
const RATE = 44100;
const TAU = Math.PI * 2;
const VOICE_FADE_S = 0.08;

function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function oldCycle(spec: OldVoice): Float32Array<ArrayBuffer> {
  const next = random(spec.seed);
  const cylinders = Math.max(1, Math.round(spec.firesPerRev * 2));
  const cycleS = (2 * 60) / CYCLE_RPM;
  const cycles = 8;
  const gapS = cycleS / cylinders;
  const channel = new Float32Array(Math.round(cycleS * cycles * RATE));
  const strengths = Array.from({ length: cylinders }, () => 1 - spec.unevenness * next());
  const firingHz = 1 / gapS;
  for (let cycle = 0; cycle < cycles; cycle++) {
    for (let cylinder = 0; cylinder < cylinders; cylinder++) {
      const strength = strengths[cylinder] * (1 - 0.5 * spec.unevenness * next());
      const start = (cycle * cylinders + cylinder + 0.25 * spec.unevenness * next()) * gapS;
      const decayS = spec.pulseDecay * gapS;
      const first = Math.round(start * RATE);
      const count = Math.round(decayS * 6 * RATE);
      for (let i = 0; i < count; i++) {
        const t = i / RATE;
        let sum = 0;
        spec.pulseOrders.forEach((order, index) => {
          sum += Math.sin(TAU * order * firingHz * t) / (index + 1);
        });
        channel[(first + i) % channel.length] += strength * Math.exp(-t / decayS) * sum;
      }
    }
  }
  let highest = 0;
  for (const sample of channel) highest = Math.max(highest, Math.abs(sample));
  for (let i = 0; i < channel.length; i++) channel[i] /= highest;
  return channel;
}

function softClipCurve(): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(1025);
  for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(((i / (curve.length - 1)) * 2 - 1) * 2.4);
  return curve;
}

const clamp = (value: number, low = 0, high = 1) => Math.min(Math.max(value, low), high);
const lerp = (a: number, b: number, share: number) => a + (b - a) * share;

function oldMix(spec: OldVoice & { idleRpm: number; redlineRpm: number }, read: EngineRead, heldRpm: number | undefined, stage: number) {
  const rpm = heldRpm ?? read.rpm;
  const revs = clamp((rpm - spec.idleRpm) / (spec.redlineRpm - spec.idleRpm));
  const { load } = read;
  const shaped = lerp(spec.idleLevel, 1, 0.42 * revs + 0.58 * load * Math.sqrt(revs + 0.15));
  const stirring = spec.idleRpm > 0 ? 1 : clamp(rpm / 700);
  return {
    rpm,
    firingHz: (rpm / 60) * spec.firesPerRev,
    engineLevel: spec.level * shaped * stirring * stage,
    driveAmount: 1 + spec.drive * load,
    exhaustHz: spec.exhaustHz[0] + spec.exhaustHz[1] * revs + spec.exhaustHz[2] * load,
    intakeHz: lerp(spec.intakeHz[0], spec.intakeHz[1], revs),
    intakeLevel: spec.intakeLevel * (0.25 + 0.75 * load) * (0.35 + 0.65 * revs) * stirring * stage,
  };
}

const cycles = new WeakMap<BaseAudioContext, Map<EngineId, AudioBuffer>>();

/** A car's engine through the old synthesis: the rendered cycle, oscillators at the firing orders, a soft clipper and fixed filters. */
export const oldEngineVoice: EngineVoiceMaker = (context, id, { noise, bus }): EngineVoiceNodes => {
  const voice = OLD_VOICES[id];
  if (voice === undefined) throw new Error(`${id} has no old voice`);
  const spec = { ...CARS[id].gearbox, ...voice };
  const built = cycles.get(context) ?? new Map<EngineId, AudioBuffer>();
  cycles.set(context, built);
  let cycle = built.get(id);
  if (cycle === undefined) {
    const samples = oldCycle(spec);
    cycle = new AudioBuffer({ numberOfChannels: 1, length: samples.length, sampleRate: RATE });
    cycle.copyToChannel(samples, 0);
    built.set(id, cycle);
  }

  const body = new GainNode(context, { gain: spec.cycleLevel });
  const loop = new AudioBufferSourceNode(context, { buffer: cycle, loop: true });
  loop.connect(body);
  const blend = new GainNode(context, { gain: 1 });
  body.connect(blend);
  const oscillators = spec.harmonics.map((harmonic) => {
    const oscillator = new OscillatorNode(context, { type: harmonic.wave, detune: harmonic.cents, frequency: 0 });
    oscillator.connect(new GainNode(context, { gain: harmonic.level })).connect(blend);
    return oscillator;
  });
  const drive = new GainNode(context, { gain: 1 });
  const shaper = new WaveShaperNode(context, { curve: softClipCurve() });
  const exhaust = new BiquadFilterNode(context, { type: "lowpass", frequency: spec.exhaustHz[0], Q: 0.9 });
  const silencer = new BiquadFilterNode(context, { type: "peaking", frequency: spec.bodyHz, Q: 1.1, gain: spec.bodyDb });
  const level = new GainNode(context, { gain: 0 });
  const out = new GainNode(context, { gain: 1 });
  const rumbleCut = new BiquadFilterNode(context, { type: "highpass", frequency: 60, Q: 0.7 });
  blend.connect(drive).connect(shaper).connect(exhaust).connect(silencer).connect(rumbleCut).connect(level).connect(out).connect(bus);
  const intake = new BiquadFilterNode(context, { type: "bandpass", frequency: spec.intakeHz[0], Q: spec.intakeQ });
  const beaten = new GainNode(context, { gain: 1 - spec.firingBeat * 0.6 });
  const intakeLevel = new GainNode(context, { gain: 0 });
  noise.connect(intake).connect(beaten).connect(intakeLevel).connect(out);
  if (spec.firingBeat > 0) {
    const firing = oscillators.find(({ type }) => type !== "sine") ?? oscillators[0];
    firing.connect(new GainNode(context, { gain: spec.firingBeat })).connect(beaten.gain);
  }
  const orders = spec.harmonics.map(({ order }) => order);
  const sources: AudioScheduledSourceNode[] = [loop, ...oscillators];
  for (const source of sources) source.start();

  return {
    steer: ({ read, state }: EngineFrame, steer: Steer) => {
      const mixed = oldMix(spec, read, state.heldRpm, state.paused === true ? 0 : 1);
      steer(loop.playbackRate, Math.max(mixed.rpm / CYCLE_RPM, 0.01));
      oscillators.forEach((oscillator, index) => steer(oscillator.frequency, mixed.firingHz * orders[index]));
      steer(drive.gain, mixed.driveAmount);
      steer(exhaust.frequency, mixed.exhaustHz);
      steer(level.gain, mixed.engineLevel);
      steer(intake.frequency, mixed.intakeHz);
      steer(intakeLevel.gain, mixed.intakeLevel);
    },
    stop: () => {
      out.gain.setTargetAtTime(0, context.currentTime, VOICE_FADE_S / 3);
      const at = context.currentTime + VOICE_FADE_S * 2;
      for (const source of sources) source.stop(at);
      loop.addEventListener("ended", () => {
        out.disconnect();
        noise.disconnect(intake);
      });
    },
  };
};
