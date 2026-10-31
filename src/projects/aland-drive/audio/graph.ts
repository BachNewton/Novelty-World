import { audioContext, listenForAudioUnlock, renderSound, SoundPlayer, unlockAudio, type SoundSettings } from "@/shared/lib/sound";
import { useDriveSoundSettings } from "./settings";
import { mix, noJolts, readJolts, restingEngine, stepEngine, type DriveAudioState, type EngineRead, type Jolt, type Mix } from "./model";
import { SOUNDS, type SoundId } from "./sounds";
import { CYCLE_RPM, engineCycle, forestBed, freewheelLoop, grassLoop, gravelLoop, gullsBed, noiseLoop, shoreBed, townBed, type Loop } from "./synthesis";
import { ENGINES, type EngineId, type EngineSpec, type VehicleId } from "./vehicles";

/*
 * The sound's Web Audio: one small graph on the page's own context, whose
 * parameters `update` steers. Every source starts once and runs for good, and
 * a voice is quiet by its gain, so nothing is built or torn down while driving
 * but the vehicle's own voice, when the vehicle changes.
 *
 * The context is passed in by the headless check, which renders this same
 * graph through an OfflineAudioContext.
 */

export interface DriveAudio {
  /** Resolves when the sounds are rendered. A frame before then is dropped. */
  readonly ready: Promise<void>;
  /** One frame of the drive. */
  update(state: DriveAudioState, dt: number): void;
  /** The car jumped (a respawn, a showcase spot): forgets the last frame, so it isn't heard as a crash. */
  reset(): void;
  /** The one-shots' player, unlocked: the audition's way in. */
  audition(): Promise<SoundPlayer<SoundId>>;
  /** What the last frame asked for and which gear it's in, for the audition's readout. */
  reading(): { mix: Mix; engine: EngineRead | null } | null;
  dispose(): void;
}

export interface DriveAudioOptions {
  context?: BaseAudioContext;
  settings?: () => SoundSettings;
}

/** Parameters aren't worth steering faster than this. */
const STEER_EVERY_S = 1 / 40;
const FOLLOW_S = 0.035;
const SURFACE_FOLLOW_S = 0.1;
const PLACE_FOLLOW_S = 1.2;
const VOICE_FADE_S = 0.08;
/** Keeps the loudest moment, a crash flat out in a slide, under clipping at full volume. */
const HEADROOM = 0.5;

function toBuffer(loop: Loop): AudioBuffer {
  const buffer = new AudioBuffer({ numberOfChannels: loop.channels.length, length: loop.channels[0].length, sampleRate: loop.rate });
  loop.channels.forEach((channel, index) => buffer.copyToChannel(channel, index));
  return buffer;
}

function softClipCurve(): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(1025);
  for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(((i / (curve.length - 1)) * 2 - 1) * 2.4);
  return curve;
}

/** Sends a parameter towards a value, skipping changes too small to hear, which is most of them. */
function steerer(context: BaseAudioContext) {
  const last = new Map<AudioParam, number>();
  return (param: AudioParam, value: number, follow = FOLLOW_S) => {
    const previous = last.get(param);
    if (previous !== undefined && Math.abs(value - previous) <= 0.002 * Math.abs(previous) + 1e-5) return;
    last.set(param, value);
    param.setTargetAtTime(value, context.currentTime, follow);
  };
}

type Steer = ReturnType<typeof steerer>;

interface Voice {
  steer(mixed: Mix, steer: Steer): void;
  stop(): void;
}

function stopAll(context: BaseAudioContext, sources: AudioScheduledSourceNode[], out: GainNode, inputs: readonly [AudioNode, AudioNode][]): void {
  out.gain.setTargetAtTime(0, context.currentTime, VOICE_FADE_S / 3);
  const at = context.currentTime + VOICE_FADE_S * 2;
  for (const source of sources) source.stop(at);
  sources[0].addEventListener("ended", () => {
    out.disconnect();
    for (const [from, to] of inputs) from.disconnect(to);
  });
}

function engineVoice(context: BaseAudioContext, spec: EngineSpec, cycle: AudioBuffer, noise: AudioNode, bus: AudioNode): Voice {
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

  // The load drives a soft clipper: flat out, the note gains its edge.
  const drive = new GainNode(context, { gain: 1 });
  const shaper = new WaveShaperNode(context, { curve: softClipCurve() });
  const exhaust = new BiquadFilterNode(context, { type: "lowpass", frequency: spec.exhaustHz[0], Q: 0.9 });
  const silencer = new BiquadFilterNode(context, { type: "peaking", frequency: spec.bodyHz, Q: 1.1, gain: spec.bodyDb });
  const level = new GainNode(context, { gain: 0 });
  const out = new GainNode(context, { gain: 1 });
  // What's under this no small speaker plays: an idling four fires at 26 Hz, and it would only eat headroom.
  const rumbleCut = new BiquadFilterNode(context, { type: "highpass", frequency: 60, Q: 0.7 });
  blend.connect(drive).connect(shaper).connect(exhaust).connect(silencer).connect(rumbleCut).connect(level).connect(out).connect(bus);

  // Noise chopped by the firings: the breath of the intake, and a diesel's knock.
  const intake = new BiquadFilterNode(context, { type: "bandpass", frequency: spec.intakeHz[0], Q: spec.intakeQ });
  const beaten = new GainNode(context, { gain: 1 - spec.firingBeat * 0.6 });
  const intakeLevel = new GainNode(context, { gain: 0 });
  noise.connect(intake).connect(beaten).connect(intakeLevel).connect(out);
  if (spec.firingBeat > 0) {
    const firing = oscillators.find(({ type }) => type !== "sine") ?? oscillators[0];
    firing.connect(new GainNode(context, { gain: spec.firingBeat })).connect(beaten.gain);
  }

  const orders = spec.harmonics.map(({ order }) => order);
  const sources = [loop, ...oscillators];
  for (const source of sources) source.start();

  return {
    steer: (mixed, steer) => {
      steer(loop.playbackRate, Math.max(mixed.rpm / CYCLE_RPM, 0.01));
      oscillators.forEach((oscillator, index) => steer(oscillator.frequency, mixed.firingHz * orders[index]));
      steer(drive.gain, mixed.driveAmount);
      steer(exhaust.frequency, mixed.exhaustHz);
      steer(level.gain, mixed.engineLevel);
      steer(intake.frequency, mixed.intakeHz);
      steer(intakeLevel.gain, mixed.intakeLevel);
    },
    stop: () => stopAll(context, sources, out, [[noise, intake]]),
  };
}

function bikeVoice(context: BaseAudioContext, ticks: AudioBuffer, noise: AudioNode, bus: AudioNode): Voice {
  const out = new GainNode(context, { gain: 1 });
  out.connect(bus);

  const freewheel = new AudioBufferSourceNode(context, { buffer: ticks, loop: true });
  const freewheelLevel = new GainNode(context, { gain: 0 });
  freewheel.connect(freewheelLevel).connect(out);

  // Links over teeth: a soft pitched whirr, with a little of the noise for the grit in the chain.
  const chain = new OscillatorNode(context, { type: "sawtooth", frequency: 40 });
  const chainFilter = new BiquadFilterNode(context, { type: "bandpass", frequency: 400, Q: 1.2 });
  const chainLevel = new GainNode(context, { gain: 0 });
  chain.connect(chainFilter);
  noise.connect(chainFilter);
  chainFilter.connect(chainLevel).connect(out);

  const sources = [freewheel, chain];
  for (const source of sources) source.start();

  return {
    steer: (mixed, steer) => {
      steer(freewheel.playbackRate, mixed.freewheelRate);
      steer(freewheelLevel.gain, mixed.freewheelLevel);
      steer(chain.frequency, mixed.chainHz);
      steer(chainFilter.frequency, 120 + mixed.chainHz * 6);
      steer(chainLevel.gain, mixed.chainLevel);
    },
    stop: () => stopAll(context, sources, out, [[noise, chainFilter]]),
  };
}

/** A filter on the shared noise with its own level: tarmac, wind and hiss are each one of these. */
function noiseBand(context: BaseAudioContext, noise: AudioNode, bus: AudioNode, type: BiquadFilterType, Q: number) {
  const filter = new BiquadFilterNode(context, { type, Q });
  const level = new GainNode(context, { gain: 0 });
  noise.connect(filter).connect(level).connect(bus);
  return { filter, level };
}

function looped(context: BaseAudioContext, loop: Loop, bus: AudioNode, offset = 0) {
  const source = new AudioBufferSourceNode(context, { buffer: toBuffer(loop), loop: true });
  const level = new GainNode(context, { gain: 0 });
  source.connect(level).connect(bus);
  source.start(0, offset);
  return { source, level };
}

interface Rig {
  master: GainNode;
  player: SoundPlayer<SoundId>;
  noise: AudioNode;
  asphalt: ReturnType<typeof noiseBand>;
  rumble: ReturnType<typeof noiseBand>;
  hiss: ReturnType<typeof noiseBand>;
  windLow: ReturnType<typeof noiseBand>;
  windHigh: ReturnType<typeof noiseBand>;
  gravel: ReturnType<typeof looped>;
  grass: ReturnType<typeof looped>;
  squealTones: OscillatorNode[];
  squealFilter: BiquadFilterNode;
  squealLevel: GainNode;
  forest: GainNode;
  shore: GainNode;
  gulls: GainNode;
  town: GainNode;
  ticks: AudioBuffer;
  cycles: Map<EngineId, AudioBuffer>;
  sources: AudioScheduledSourceNode[];
}

async function buildRig(context: BaseAudioContext, settings: () => SoundSettings): Promise<Rig> {
  const master = new GainNode(context, { gain: 0 });
  master.connect(context.destination);

  const raw = new AudioBufferSourceNode(context, { buffer: toBuffer(noiseLoop()), loop: true });
  const noise = new GainNode(context, { gain: 1 });
  raw.connect(noise);
  raw.start();

  const gravel = looped(context, gravelLoop(), master);
  const grass = looped(context, grassLoop(), master);
  const forest = looped(context, forestBed(), master);
  const shore = looped(context, shoreBed(), master);
  const gulls = looped(context, gullsBed(), master);
  const town = looped(context, townBed(), master);

  const squealFilter = new BiquadFilterNode(context, { type: "bandpass", frequency: 1500, Q: 5 });
  const squealLevel = new GainNode(context, { gain: 0 });
  squealFilter.connect(squealLevel).connect(master);
  const squealTones = [-16, 13, 1190].map((detune) => {
    const tone = new OscillatorNode(context, { type: "sawtooth", detune, frequency: 900 });
    tone.connect(squealFilter);
    tone.start();
    return tone;
  });

  const { ZZFX } = await import("zzfx");
  const buffers = new Map<SoundId, AudioBuffer>();
  for (const [id, design] of Object.entries(SOUNDS)) {
    const samples = renderSound(design, ZZFX.sampleRate, (params) => ZZFX.buildSamples(...params));
    buffers.set(id as SoundId, toBuffer({ rate: ZZFX.sampleRate, channels: [samples] }));
  }
  // The one-shots go through the master with everything else, so the player plays them at full level.
  const player = new SoundPlayer<SoundId>(
    SOUNDS,
    {
      now: () => context.currentTime,
      play: (id, at, rate, gain) => {
        const source = new AudioBufferSourceNode(context, { buffer: buffers.get(id) ?? null, playbackRate: rate });
        source.connect(new GainNode(context, { gain: gain * strength.value })).connect(master);
        source.start(at);
      },
    },
    () => ({ muted: settings().muted, volume: 1 }),
  );

  return {
    master,
    player,
    noise,
    asphalt: noiseBand(context, noise, master, "bandpass", 0.7),
    rumble: noiseBand(context, noise, master, "lowpass", 0.8),
    hiss: noiseBand(context, noise, master, "bandpass", 0.8),
    windLow: noiseBand(context, noise, master, "bandpass", 0.5),
    windHigh: noiseBand(context, noise, master, "bandpass", 0.6),
    gravel,
    grass,
    squealTones,
    squealFilter,
    squealLevel,
    forest: forest.level,
    shore: shore.level,
    gulls: gulls.level,
    town: town.level,
    ticks: toBuffer(freewheelLoop()),
    cycles: new Map(),
    sources: [raw, gravel.source, grass.source, forest.source, shore.source, gulls.source, town.source, ...squealTones],
  };
}

/** The level the next one-shot plays at: `SoundPlayer` has no such option, and a hit's strength is the game's. */
const strength = { value: 1 };

function currentSettings(): SoundSettings {
  return useDriveSoundSettings.getState().settings;
}

export function createDriveAudio({ context, settings = currentSettings }: DriveAudioOptions = {}): DriveAudio {
  const stopListening = context === undefined ? listenForAudioUnlock() : null;
  let rig: Rig | null = null;
  let live: BaseAudioContext | null = null;
  let steer: Steer | null = null;
  let voice: Voice | null = null;
  let voiceOf: VehicleId | null = null;
  let spec: EngineSpec | null = null;
  let engine: EngineRead | null = null;
  let jolts = noJolts();
  let since = STEER_EVERY_S;
  let wander = 0;
  let last: Mix | null = null;

  const ready = (async () => {
    const audio = context ?? (await audioContext());
    live = audio;
    steer = steerer(audio);
    rig = await buildRig(audio, settings);
  })();

  function choose(vehicle: VehicleId, audio: BaseAudioContext, built: Rig): void {
    if (vehicle === voiceOf) return;
    voice?.stop();
    voiceOf = vehicle;
    if (vehicle === "bike") {
      spec = null;
      engine = null;
      voice = bikeVoice(audio, built.ticks, built.noise, built.master);
      return;
    }
    spec = ENGINES[vehicle];
    engine = restingEngine(spec);
    let cycle = built.cycles.get(vehicle);
    if (cycle === undefined) {
      cycle = toBuffer(engineCycle(spec, vehicle.length * 97));
      built.cycles.set(vehicle, cycle);
    }
    voice = engineVoice(audio, spec, cycle, built.noise, built.master);
  }

  function hear({ sound, strength: amount }: Jolt, player: SoundPlayer<SoundId>): void {
    strength.value = amount;
    player.play(sound);
    strength.value = 1;
  }

  function steerAll(built: Rig, mixed: Mix, to: Steer): void {
    voice?.steer(mixed, to);
    to(built.asphalt.level.gain, mixed.asphaltLevel, SURFACE_FOLLOW_S);
    to(built.asphalt.filter.frequency, mixed.asphaltHz);
    to(built.rumble.level.gain, mixed.rumbleLevel, SURFACE_FOLLOW_S);
    to(built.rumble.filter.frequency, mixed.rumbleHz);
    to(built.gravel.level.gain, mixed.gravelLevel, SURFACE_FOLLOW_S);
    to(built.gravel.source.playbackRate, mixed.gravelRate);
    to(built.grass.level.gain, mixed.grassLevel, SURFACE_FOLLOW_S);
    to(built.grass.source.playbackRate, mixed.grassRate);
    to(built.squealLevel.gain, mixed.squealLevel, 0.05);
    for (const tone of built.squealTones) to(tone.frequency, mixed.squealHz);
    to(built.squealFilter.frequency, mixed.squealHz * 2);
    to(built.hiss.level.gain, mixed.hissLevel, 0.05);
    to(built.hiss.filter.frequency, 3000);
    to(built.windLow.level.gain, mixed.windLowLevel, 0.12);
    to(built.windLow.filter.frequency, mixed.windLowHz, 0.12);
    to(built.windHigh.level.gain, mixed.windHighLevel, 0.12);
    to(built.windHigh.filter.frequency, mixed.windHighHz, 0.12);
    to(built.forest.gain, mixed.forestLevel, PLACE_FOLLOW_S);
    to(built.shore.gain, mixed.shoreLevel, PLACE_FOLLOW_S);
    to(built.gulls.gain, mixed.gullsLevel, PLACE_FOLLOW_S);
    to(built.town.gain, mixed.townLevel, PLACE_FOLLOW_S);
  }

  return {
    ready,
    update(state, dt) {
      if (rig === null || live === null || steer === null || dt <= 0) return;
      choose(state.vehicle, live, rig);

      if (engine !== null && spec !== null) {
        const stepped = stepEngine(spec, engine, state.speedMS, state.throttle, dt);
        engine = stepped.read;
        if (stepped.shifted && state.paused !== true) rig.player.play("gear");
      }

      const read = readJolts(jolts, state, dt);
      jolts = read.jolts;
      if (state.paused !== true) for (const jolt of read.heard) hear(jolt, rig.player);

      since += dt;
      if (since < STEER_EVERY_S) return;
      wander += (Math.random() * 2 - 1 - wander) * Math.min(since * 4, 1);
      last = mix({ state, engine: engine !== null && spec !== null ? { spec, read: engine } : null, time: live.currentTime, wander });
      steerAll(rig, last, steer);
      const { muted, volume } = settings();
      steer(rig.master.gain, muted ? 0 : volume * HEADROOM, 0.02);
      since = 0;
    },
    reset() {
      jolts = noJolts();
      if (spec !== null) engine = restingEngine(spec);
    },
    audition: async () => {
      unlockAudio();
      await ready;
      if (rig === null) throw new Error("The drive's sounds were never built");
      return rig.player;
    },
    reading: () => (last === null ? null : { mix: last, engine }),
    dispose() {
      stopListening?.();
      voice?.stop();
      voice = null;
      if (rig === null) return;
      for (const source of rig.sources) source.stop();
      rig.master.disconnect();
      rig = null;
    },
  };
}
