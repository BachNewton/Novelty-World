import { audioContext, listenForAudioUnlock, renderSound, SoundPlayer, unlockAudio, type SoundSettings } from "@/shared/lib/sound";
import { useDriveSoundSettings } from "./settings";
import { restingEngine, stepEngine, type EngineRead } from "../sim/gearbox";
import { landing, mix, noJolts, PLACED_VOICES, quietEngine, readJolts, stepEngineSound, type DriveAudioState, type EngineHeard, type EngineSound, type Jolt, type Mix } from "./model";
import { createPlacedVoices, TRAFFIC_SOUNDS, type PlacedLoop, type PlacedSoundId } from "./placed";
import { SOUNDS, type SoundId } from "./sounds";
import { engineLoops, engineShots, birdsBed, freewheelLoop, grassLoop, gravelLoop, iceBed, lakeBed, noiseLoop, rainHeavyLoop, rainLightLoop, rockLoop, shoreBed, snowLoop, sprayLoop, studsLoop, winterCallsBed, type Loop } from "./synthesis";
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
  /** Audition only: plays every car's engine through another voice from now on, null for its own. */
  auditionEngine(maker: EngineVoiceMaker | null): void;
  /** The one-shots' player, unlocked: the audition's way in. */
  audition(): Promise<SoundPlayer<SoundId>>;
  /** What the last frame asked for and which gear it's in, for the audition's readout. */
  reading(): { mix: Mix; engine: EngineRead | null } | null;
  /**
   * The loops placed in the world this frame (`audio/placed.ts`): each named by an id that keeps it one voice from frame
   * to frame, a sound, a place and a loudness. Heard from the frame's `listener`; the loudest play, up to the budget.
   */
  placeLoops(loops: readonly PlacedLoop[]): void;
  /** Plays a sound once from a place in the world, if it's heard and the budget has room; `rate` 1 as rendered. */
  placeOnce(sound: PlacedSoundId, x: number, z: number, loudness: number, rate?: number): void;
  /** How many placed sounds may play at once (`PLACED_VOICES` to start): a setting's number. */
  setPlacedBudget(voices: number): void;
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

function shotBuffers(): EngineShared["shots"] {
  const { pops, bang, blowOff, flutter } = engineShots();
  return { pops: pops.map(toBuffer), bang: toBuffer(bang), blowOff: toBuffer(blowOff), flutter: toBuffer(flutter) };
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

export type Steer = ReturnType<typeof steerer>;

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

/** One steer of an engine's voice: what the mix asks for, and the frame and engine it was made from. */
export interface EngineFrame {
  mix: Mix;
  state: DriveAudioState;
  read: EngineRead;
}

export interface EngineVoiceNodes {
  steer(frame: EngineFrame, steer: Steer): void;
  /** Plays what the engine set off this frame: a blow-off, pops, anti-lag's bangs. */
  hear?(heard: EngineHeard): void;
  stop(): void;
}

/** What every engine voice draws on: the shared noise, the bus it plays into, the one-shots, and the loops rendered so far. */
export interface EngineShared {
  noise: AudioNode;
  bus: AudioNode;
  shots: { pops: AudioBuffer[]; bang: AudioBuffer; blowOff: AudioBuffer; flutter: AudioBuffer };
  loops: Map<EngineId, { rpm: readonly [number, number]; buffers: AudioBuffer[] } | null>;
}

/** Builds a car's engine on the graph, playing into the shared bus: the car's own (`engineVoice`), or for the audition another (`old/engine.ts`). */
export type EngineVoiceMaker = (context: BaseAudioContext, id: EngineId, shared: EngineShared) => EngineVoiceNodes;

/** The cabin between the exhaust and the driver: the body passes the low boom and takes the rest. */
const CABIN_HZ = 420;
const CABIN_BOOM_HZ = 95;
/** How deep the limiter cuts the engine, and how far the revs bounce with it, cents. */
const LIMITER_CUT = 0.8;
const LIMITER_CENTS = 30;
const POP_LEVEL = 0.4;
const BANG_LEVEL = 0.9;
const BLOW_OFF_LEVEL = 0.6;

/**
 * A car's engine on the graph, built from what its voice has. A combustion engine's four loops are blended by revs
 * and load into two channels: the exhaust, driven into rasp by the load, ringing down its pipe (a feedback delay at
 * the pipe's note), through the silencer, and then heard outside as it is or inside through the cabin; and the bay,
 * through the airbox's resonance. The limiter cuts the lot in a bounce. A turbo whistles and hisses on the shared
 * noise, a supercharger and the gearbox whine, and a motor whines in its orders with its inverter's tones over it.
 */
export const engineVoice: EngineVoiceMaker = (context, id, { noise, bus, shots, loops }) => {
  const spec = ENGINES[id];
  const out = new GainNode(context, { gain: 1 });
  out.connect(bus);
  const sources: AudioScheduledSourceNode[] = [];
  const inputs: [AudioNode, AudioNode][] = [];
  const steering: ((mixed: Mix, steer: Steer) => void)[] = [];
  const level = (gain = 0) => {
    const node = new GainNode(context, { gain });
    node.connect(out);
    return node;
  };
  const tone = (type: OscillatorType, into: AudioNode) => {
    const oscillator = new OscillatorNode(context, { type, frequency: 100 });
    oscillator.connect(into);
    sources.push(oscillator);
    return oscillator;
  };
  const share = (gain: number, into: AudioNode) => {
    const node = new GainNode(context, { gain });
    node.connect(into);
    return node;
  };

  let exhaustIn: AudioNode | null = null;
  const engine = spec.combustion;
  let rendered = loops.get(id);
  if (rendered === undefined) {
    const made = engineLoops(spec);
    rendered = made === null ? null : { rpm: made.rpm, buffers: made.loops.map(toBuffer) };
    loops.set(id, rendered);
  }
  if (engine !== null && rendered !== null) {
    const { rpm: loopRpm, buffers } = rendered;
    const blend = new GainNode(context, { gain: 1, channelCount: 2, channelCountMode: "explicit", channelInterpretation: "discrete" });
    const players = buffers.map((buffer) => {
      const source = new AudioBufferSourceNode(context, { buffer, loop: true });
      const weight = new GainNode(context, { gain: 0, channelCount: 2, channelCountMode: "explicit", channelInterpretation: "discrete" });
      source.connect(weight).connect(blend);
      sources.push(source);
      return { source, weight };
    });
    const cut = new GainNode(context, { gain: 1, channelCount: 2, channelCountMode: "explicit", channelInterpretation: "discrete" });
    const split = new ChannelSplitterNode(context, { numberOfOutputs: 2 });
    blend.connect(cut).connect(split);

    const drive = new GainNode(context, { gain: 1 });
    const shaper = new WaveShaperNode(context, { curve: softClipCurve() });
    const pipe = new GainNode(context, { gain: 1 });
    split.connect(drive, 0).connect(shaper).connect(pipe);
    const delay = new DelayNode(context, { maxDelayTime: 0.05, delayTime: 1 / engine.pipeHz });
    const damping = new BiquadFilterNode(context, { type: "lowpass", frequency: Math.min(engine.pipeHz * 12, 6000), Q: 0.5 });
    pipe.connect(delay).connect(damping).connect(new GainNode(context, { gain: engine.pipeRing })).connect(pipe);
    const muffler = new BiquadFilterNode(context, { type: "lowpass", frequency: engine.exhaustHz[0], Q: 0.9 });
    const silencer = new BiquadFilterNode(context, { type: "peaking", frequency: engine.silencerHz, Q: 1.1, gain: engine.silencerDb });
    // What's under this no small speaker plays: an idling four fires at 26 Hz, and it would only eat headroom.
    const rumbleCut = new BiquadFilterNode(context, { type: "highpass", frequency: 50, Q: 0.7 });
    pipe.connect(muffler).connect(silencer).connect(rumbleCut);
    exhaustIn = silencer;
    const outside = level();
    rumbleCut.connect(outside);
    const inside = level();
    rumbleCut
      .connect(new BiquadFilterNode(context, { type: "lowpass", frequency: CABIN_HZ, Q: 0.7 }))
      .connect(new BiquadFilterNode(context, { type: "peaking", frequency: CABIN_BOOM_HZ, Q: 1.2, gain: 4 }))
      .connect(inside);

    const bay = level();
    split
      .connect(new BiquadFilterNode(context, { type: "peaking", frequency: engine.intakeHz, Q: engine.intakeQ, gain: 12 }), 1)
      .connect(new BiquadFilterNode(context, { type: "highpass", frequency: 70, Q: 0.7 }))
      .connect(bay);

    // The limiter: a square wave cuts the engine between full and a fifth, and bounces its revs.
    const bounce = new OscillatorNode(context, { type: "square", frequency: engine.limiterHz });
    const cutDepth = new GainNode(context, { gain: 0 });
    bounce.connect(cutDepth).connect(cut.gain);
    const wobble = new GainNode(context, { gain: 0 });
    bounce.connect(wobble);
    for (const { source } of players) wobble.connect(source.detune);
    sources.push(bounce);

    steering.push((mixed, steer) => {
      players.forEach(({ source, weight }, i) => {
        steer(source.playbackRate, Math.max(mixed.rpm / loopRpm[i >> 1], 0.01));
        steer(weight.gain, mixed.loopWeights[i]);
      });
      steer(drive.gain, mixed.driveAmount);
      steer(muffler.frequency, mixed.exhaustHz);
      steer(outside.gain, mixed.exhaustLevel);
      steer(inside.gain, mixed.muffledLevel);
      steer(bay.gain, mixed.bayLevel);
      steer(cut.gain, 1 - (LIMITER_CUT / 2) * mixed.limiter, 0.01);
      steer(cutDepth.gain, (LIMITER_CUT / 2) * mixed.limiter, 0.01);
      steer(wobble.gain, LIMITER_CENTS * mixed.limiter, 0.01);
    });
  }

  if (spec.turbo !== null) {
    const whistleLevel = level();
    const whistle = tone("sine", whistleLevel);
    const hiss = new BiquadFilterNode(context, { type: "bandpass", frequency: 3000, Q: 1.4 });
    const hissLevel = level();
    noise.connect(hiss).connect(hissLevel);
    inputs.push([noise, hiss]);
    steering.push((mixed, steer) => {
      steer(whistle.frequency, mixed.whistleHz);
      steer(whistleLevel.gain, mixed.whistleLevel);
      steer(hiss.frequency, 1500 + 0.8 * mixed.whistleHz);
      steer(hissLevel.gain, mixed.turboHissLevel);
    });
  }
  if (spec.supercharger !== null) {
    const blowerLevel = level();
    const blower = tone("triangle", blowerLevel);
    steering.push((mixed, steer) => {
      steer(blower.frequency, mixed.blowerHz);
      steer(blowerLevel.gain, mixed.blowerLevel);
    });
  }
  if (spec.gearWhine.level > 0) {
    const whineLevel = level();
    const whine = tone("triangle", whineLevel);
    steering.push((mixed, steer) => {
      steer(whine.frequency, mixed.gearWhineHz);
      steer(whineLevel.gain, mixed.gearWhineLevel);
    });
  }
  if (spec.electric !== null) {
    const motorLevel = level();
    const whines = spec.electric.orders.map(([order, gain]) => ({ order, oscillator: tone("sine", share(gain, motorLevel)) }));
    const inverterLevel = level();
    const carrier = tone("sine", inverterLevel);
    const sidebands = [-2, 2].map((side) => ({ side, oscillator: tone("sine", share(0.5, inverterLevel)) }));
    const { carrierHz } = spec.electric;
    steering.push((mixed, steer) => {
      for (const { order, oscillator } of whines) steer(oscillator.frequency, Math.max(mixed.motorHz * order, 1));
      steer(motorLevel.gain, mixed.motorLevel);
      steer(carrier.frequency, carrierHz);
      for (const { side, oscillator } of sidebands) steer(oscillator.frequency, Math.max(carrierHz + side * mixed.inverterHz, 20));
      steer(inverterLevel.gain, mixed.inverterLevel);
    });
  }
  for (const source of sources) source.start();

  const shot = (buffer: AudioBuffer, gain: number, into: AudioNode) => {
    const source = new AudioBufferSourceNode(context, { buffer, playbackRate: 0.9 + 0.2 * Math.random() });
    source.connect(new GainNode(context, { gain })).connect(into);
    source.start();
  };
  return {
    steer: ({ mix: mixed }, steer) => {
      for (const steerPart of steering) steerPart(mixed, steer);
    },
    hear: ({ blowOff, pops, bangs }) => {
      if (exhaustIn !== null) {
        for (let i = 0; i < pops; i++) shot(shots.pops[Math.floor(Math.random() * shots.pops.length)], POP_LEVEL * spec.level * (0.5 + 0.5 * Math.random()), exhaustIn);
        for (let i = 0; i < bangs; i++) shot(shots.bang, BANG_LEVEL * spec.level, exhaustIn);
      }
      if (blowOff > 0 && spec.turbo !== null) shot(spec.turbo.blowOff === "valve" ? shots.blowOff : shots.flutter, BLOW_OFF_LEVEL * spec.level * spec.turbo.blowOffLevel * blowOff, out);
    },
    stop: () => stopAll(context, sources, out, inputs),
  };
};

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
  gale: ReturnType<typeof noiseBand>;
  rainLight: ReturnType<typeof looped>;
  rainHeavy: ReturnType<typeof looped>;
  gravel: ReturnType<typeof looped>;
  grass: ReturnType<typeof looped>;
  rock: ReturnType<typeof looped>;
  spray: ReturnType<typeof looped>;
  snow: ReturnType<typeof looped>;
  studs: ReturnType<typeof looped>;
  squealTones: OscillatorNode[];
  squealFilter: BiquadFilterNode;
  squealLevel: GainNode;
  squeakTones: OscillatorNode[];
  squeakFilter: BiquadFilterNode;
  squeakLevel: GainNode;
  birds: GainNode;
  winterCalls: GainNode;
  shore: GainNode;
  lake: GainNode;
  ice: GainNode;
  placed: ReturnType<typeof createPlacedVoices>;
  ticks: AudioBuffer;
  shots: EngineShared["shots"];
  loops: EngineShared["loops"];
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
  const rock = looped(context, rockLoop(), master);
  const spray = looped(context, sprayLoop(), master);
  const snow = looped(context, snowLoop(), master);
  const studs = looped(context, studsLoop(), master);
  const rainLight = looped(context, rainLightLoop(), master);
  const rainHeavy = looped(context, rainHeavyLoop(), master);
  const birds = looped(context, birdsBed(), master);
  const winterCalls = looped(context, winterCallsBed(), master);
  const shore = looped(context, shoreBed(), master);
  const lake = looped(context, lakeBed(), master);
  const ice = looped(context, iceBed(), master);

  const squealFilter = new BiquadFilterNode(context, { type: "bandpass", frequency: 1500, Q: 5 });
  const squealLevel = new GainNode(context, { gain: 0 });
  squealFilter.connect(squealLevel).connect(master);
  const squealTones = [-16, 13, 1190].map((detune) => {
    const tone = new OscillatorNode(context, { type: "sawtooth", detune, frequency: 900 });
    tone.connect(squealFilter);
    tone.start();
    return tone;
  });

  // Rubber on cold snow sticks and lets go: a squeak chopped by a fast flutter.
  const squeakFilter = new BiquadFilterNode(context, { type: "bandpass", frequency: 1200, Q: 3 });
  const flutter = new GainNode(context, { gain: 0.5 });
  const squeakLevel = new GainNode(context, { gain: 0 });
  squeakFilter.connect(flutter).connect(squeakLevel).connect(master);
  const squeakTones = [-9, 11].map((detune) => {
    const tone = new OscillatorNode(context, { type: "triangle", detune, frequency: 620 });
    tone.connect(squeakFilter);
    tone.start();
    return tone;
  });
  const stickSlip = new OscillatorNode(context, { type: "sawtooth", frequency: 19 });
  stickSlip.connect(new GainNode(context, { gain: 0.5 })).connect(flutter.gain);
  stickSlip.start();

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

  // The traffic's voices are rendered with the rest, not on the first car heard mid-drive.
  const placed = createPlacedVoices(context, master, toBuffer);
  placed.prepare(TRAFFIC_SOUNDS);

  return {
    master,
    player,
    noise,
    asphalt: noiseBand(context, noise, master, "bandpass", 0.7),
    rumble: noiseBand(context, noise, master, "lowpass", 0.8),
    hiss: noiseBand(context, noise, master, "bandpass", 0.8),
    windLow: noiseBand(context, noise, master, "bandpass", 0.5),
    windHigh: noiseBand(context, noise, master, "bandpass", 0.6),
    gale: noiseBand(context, noise, master, "bandpass", 1.4),
    rainLight,
    rainHeavy,
    gravel,
    grass,
    rock,
    spray,
    snow,
    studs,
    squealTones,
    squealFilter,
    squealLevel,
    squeakTones,
    squeakFilter,
    squeakLevel,
    birds: birds.level,
    winterCalls: winterCalls.level,
    shore: shore.level,
    lake: lake.level,
    ice: ice.level,
    placed,
    ticks: toBuffer(freewheelLoop()),
    shots: shotBuffers(),
    loops: new Map(),
    sources: [raw, gravel.source, grass.source, rock.source, spray.source, snow.source, studs.source, rainLight.source, rainHeavy.source, birds.source, winterCalls.source, shore.source, lake.source, ice.source, ...squealTones, ...squeakTones, stickSlip],
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
  let maker: EngineVoiceMaker | null = null;
  let engineNodes: EngineVoiceNodes | null = null;
  let engineSound: EngineSound = quietEngine();
  let makerOf: EngineVoiceMaker | null = null;
  let lastState: DriveAudioState | null = null;
  let spec: EngineSpec | null = null;
  let engine: EngineRead | null = null;
  let jolts = noJolts();
  let since = STEER_EVERY_S;
  let wander = 0;
  let last: Mix | null = null;
  let stones = 0;
  let clods = 0;
  let gulls = 0;
  let placedBudget = PLACED_VOICES;
  let placedLoops: readonly PlacedLoop[] = [];

  const ready = (async () => {
    const audio = context ?? (await audioContext());
    live = audio;
    steer = steerer(audio);
    rig = await buildRig(audio, settings);
  })();

  function choose(vehicle: VehicleId, audio: BaseAudioContext, built: Rig): void {
    if (vehicle === voiceOf && maker === makerOf) return;
    voice?.stop();
    if (vehicle !== voiceOf) {
      spec = vehicle === "bike" ? null : ENGINES[vehicle];
      engine = spec === null ? null : restingEngine(spec);
      engineSound = quietEngine();
    }
    voiceOf = vehicle;
    makerOf = maker;
    if (vehicle === "bike") {
      engineNodes = null;
      voice = bikeVoice(audio, built.ticks, built.noise, built.master);
      return;
    }
    const nodes = (maker ?? engineVoice)(audio, vehicle, { noise: built.noise, bus: built.master, shots: built.shots, loops: built.loops });
    engineNodes = nodes;
    voice = {
      steer: (mixed, to) => {
        if (engine !== null && lastState !== null) nodes.steer({ mix: mixed, state: lastState, read: engine }, to);
      },
      stop: () => nodes.stop(),
    };
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
    to(built.rock.level.gain, mixed.rockLevel, SURFACE_FOLLOW_S);
    to(built.rock.source.playbackRate, mixed.rockRate);
    to(built.spray.level.gain, mixed.sprayLevel, SURFACE_FOLLOW_S);
    to(built.spray.source.playbackRate, mixed.sprayRate);
    to(built.snow.level.gain, mixed.snowLevel, SURFACE_FOLLOW_S);
    to(built.snow.source.playbackRate, mixed.snowRate);
    to(built.studs.level.gain, mixed.studsLevel, SURFACE_FOLLOW_S);
    to(built.studs.source.playbackRate, mixed.studsRate);
    to(built.squealLevel.gain, mixed.squealLevel, 0.05);
    for (const tone of built.squealTones) to(tone.frequency, mixed.squealHz);
    to(built.squealFilter.frequency, mixed.squealHz * 2);
    to(built.squeakLevel.gain, mixed.squeakLevel, 0.05);
    for (const tone of built.squeakTones) to(tone.frequency, mixed.squeakHz);
    to(built.squeakFilter.frequency, mixed.squeakHz * 2);
    to(built.hiss.level.gain, mixed.hissLevel, 0.05);
    to(built.hiss.filter.frequency, mixed.hissHz, 0.3);
    to(built.windLow.level.gain, mixed.windLowLevel, 0.12);
    to(built.windLow.filter.frequency, mixed.windLowHz, 0.12);
    to(built.windHigh.level.gain, mixed.windHighLevel, 0.12);
    to(built.windHigh.filter.frequency, mixed.windHighHz, 0.12);
    to(built.rainLight.level.gain, mixed.rainLightLevel, PLACE_FOLLOW_S);
    to(built.rainHeavy.level.gain, mixed.rainHeavyLevel, PLACE_FOLLOW_S);
    to(built.gale.level.gain, mixed.galeLevel, 0.3);
    to(built.gale.filter.frequency, mixed.galeHz, 0.3);
    to(built.birds.gain, mixed.birdsLevel, PLACE_FOLLOW_S);
    to(built.winterCalls.gain, mixed.winterCallsLevel, PLACE_FOLLOW_S);
    to(built.shore.gain, mixed.shoreLevel, PLACE_FOLLOW_S);
    to(built.lake.gain, mixed.lakeLevel, PLACE_FOLLOW_S);
    to(built.ice.gain, mixed.iceLevel, PLACE_FOLLOW_S);
  }

  return {
    ready,
    update(state, dt) {
      if (rig === null || live === null || steer === null || dt <= 0) return;
      choose(state.vehicle, live, rig);
      lastState = state;

      if (engine !== null && spec !== null) {
        const stepped = state.engine ? { read: state.engine, shifted: state.engine.gear !== engine.gear } : stepEngine(spec, engine, state.speedMS, state.throttle, dt);
        const shiftedUp = stepped.shifted && stepped.read.gear > engine.gear;
        engine = stepped.read;
        if (stepped.shifted && state.paused !== true) rig.player.play("gear");
        const sounded = stepEngineSound(spec, engineSound, state.heldRpm ?? engine.rpm, engine.load, dt, Math.random, shiftedUp);
        engineSound = sounded.sound;
        if (state.paused !== true) engineNodes?.hear?.(sounded.heard);
      }

      const read = readJolts(jolts, state, dt);
      jolts = read.jolts;
      if (state.paused !== true) for (const jolt of read.heard) hear(jolt, rig.player);
      if (last !== null && state.paused !== true) {
        const thrown = landing(stones, last.stonesPerS, dt, Math.random());
        stones = thrown.carry;
        for (let i = 0; i < thrown.count; i++) rig.player.play("stone");
        const torn = landing(clods, last.clodsPerS, dt, Math.random());
        clods = torn.carry;
        for (let i = 0; i < torn.count; i++) rig.player.play("clod");
      }
      if (state.listener !== undefined) {
        rig.placed.frame(state.listener, placedLoops, placedBudget);
        // Gulls call from over the water, somewhere off the nearest sea, each a little higher or lower.
        const sea = state.place.seaAt;
        if (last !== null && sea !== undefined) {
          const called = landing(gulls, last.gullsPerS, dt, Math.random());
          gulls = called.carry;
          for (let i = 0; i < called.count; i++) rig.placed.once("gull", sea.x + (Math.random() - 0.5) * 80, sea.z + (Math.random() - 0.5) * 80, 1.4, placedBudget, 0.9 + 0.2 * Math.random());
        }
      }

      since += dt;
      if (since < STEER_EVERY_S) return;
      wander += (Math.random() * 2 - 1 - wander) * Math.min(since * 4, 1);
      last = mix({ state, engine: engine !== null && spec !== null ? { spec, read: engine, sound: engineSound } : null, time: live.currentTime, wander });
      steerAll(rig, last, steer);
      const { muted, volume } = settings();
      steer(rig.master.gain, muted ? 0 : volume * HEADROOM, 0.02);
      since = 0;
    },
    auditionEngine(next) {
      maker = next;
    },
    reset() {
      jolts = noJolts();
      if (spec !== null) engine = restingEngine(spec);
      engineSound = quietEngine();
    },
    audition: async () => {
      unlockAudio();
      await ready;
      if (rig === null) throw new Error("The drive's sounds were never built");
      // Only `update` raises the master from silence, and no drive may be running here.
      const { muted, volume } = settings();
      rig.master.gain.value = muted ? 0 : volume * HEADROOM;
      return rig.player;
    },
    reading: () => (last === null ? null : { mix: last, engine }),
    placeLoops(loops) {
      placedLoops = loops;
    },
    placeOnce(sound, x, z, loudness, rate) {
      rig?.placed.once(sound, x, z, loudness, placedBudget, rate);
    },
    setPlacedBudget(voices) {
      placedBudget = voices;
    },
    dispose() {
      stopListening?.();
      voice?.stop();
      voice = null;
      if (rig === null) return;
      for (const source of rig.sources) source.stop();
      rig.placed.stopAll();
      rig.master.disconnect();
      rig = null;
    },
  };
}
