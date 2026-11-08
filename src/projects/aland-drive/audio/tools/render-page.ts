import { createDriveAudio } from "../graph";
import type { DriveAudioState, Place } from "../model";
import { CONDITIONS, SURFACES, type Condition, type Surface, type Tyre } from "../../sim/surfaces";
import { ENGINE_IDS, ENGINES, type EngineId, type VehicleId } from "../vehicles";
import { engineLoops, engineShots } from "../synthesis";
import { CARS } from "../../sim/cars";
import { hasOldVoice, oldEngineVoice } from "../old/engine";

/*
 * The headless check's page side: plays a scene through the real graph in an
 * OfflineAudioContext, stepping `update` by suspending the render at each
 * frame, and measures what came out. `check.mjs` bundles and runs it.
 */

const RATE = 44100;
const FRAME_S = 1 / 40;
const NO_PLACE: Place = { forest: 0, shore: 0, town: 0 };

export interface Scene {
  name: string;
  seconds: number;
  /** The state at a time into the scene. */
  at: (t: number) => Partial<DriveAudioState>;
}

const base = (vehicle: VehicleId): DriveAudioState => ({
  vehicle,
  speedMS: 0,
  throttle: 0,
  brake: 0,
  handbrake: false,
  slip: 0,
  wheels: ["asphalt", "asphalt", "asphalt", "asphalt"],
  condition: "dry",
  tyres: "summer",
  suspension: [0.11, 0.11, 0.11, 0.11],
  place: NO_PLACE,
});

const held = (vehicle: VehicleId, name: string, state: Partial<DriveAudioState>, seconds = 3): Scene & { vehicle: VehicleId } => ({ name, vehicle, seconds, at: () => state });

/** Flat out to top speed through the gears, in `seconds`, then lift and coast. */
const pull = (vehicle: VehicleId) => ({
  name: `${vehicle} pull`,
  vehicle,
  seconds: 16,
  at: (t: number) => (t < 12 ? { speedMS: 55 * Math.sqrt(t / 12), throttle: 1 } : { speedMS: 55 - (t - 12) * 2 }),
});

const all = (surface: Surface): Surface[] => [surface, surface, surface, surface];
const tyres = (name: Surface, slip = 0, condition: Condition = "dry", fitted: Tyre = "summer") =>
  held("strom", `tyres ${name}${condition === "dry" ? "" : ` ${condition}`}${fitted === "summer" ? "" : ` ${fitted}`}${slip > 0 ? " sliding" : ""}`, { speedMS: 25, wheels: all(name), condition, tyres: fitted, slip, heldRpm: 0 });

export const SCENES: (Scene & { vehicle: VehicleId })[] = [
  ...ENGINE_IDS.flatMap((vehicle) => [
    held(vehicle, `${vehicle} idle`, {}),
    held(vehicle, `${vehicle} cruise`, { speedMS: 25, throttle: 0.3 }),
    held(vehicle, `${vehicle} held 3000`, { heldRpm: 3000, speedMS: 20, throttle: 0.6 }),
    held(vehicle, `${vehicle} limiter`, { heldRpm: CARS[vehicle].gearbox.redlineRpm, throttle: 1 }),
    pull(vehicle),
    { ...pull(vehicle), name: `${vehicle} pull inside`, at: (t: number) => ({ ...pull(vehicle).at(t), perspective: "inside" as const }) },
  ]),
  ...CONDITIONS.flatMap((condition) => SURFACES.flatMap((name) => [tyres(name, 0, condition), tyres(name, 1, condition)])),
  ...(["dry", "wet", "ice"] as const).map((condition) => tyres("asphalt", 0, condition, "studded")),
  held("strom", "tyres verge, two wheels", { speedMS: 25, wheels: ["asphalt", "grass", "asphalt", "grass"], heldRpm: 0 }),
  held("strom", "wind 15", { speedMS: 15, heldRpm: 0, suspension: [0, 0, 0, 0] }),
  held("strom", "wind 30", { speedMS: 30, heldRpm: 0, suspension: [0, 0, 0, 0] }),
  held("strom", "wind 55", { speedMS: 55, heldRpm: 0, suspension: [0, 0, 0, 0] }),
  held("strom", "rain light, standing", { heldRpm: 0, weather: { rain: 0.2, snowfall: 0, windMS: 4 } }, 5),
  held("strom", "rain heavy, standing", { heldRpm: 0, weather: { rain: 0.9, snowfall: 0, windMS: 8 } }, 5),
  held("strom", "rain heavy, at speed", { speedMS: 30, heldRpm: 0, condition: "wet", weather: { rain: 0.9, snowfall: 0, windMS: 8 } }, 5),
  held("bike", "bike coasting", { speedMS: 7 }),
  held("bike", "bike pedalling", { speedMS: 7, throttle: 0.7 }),
  held("bike", "bike gravel", { speedMS: 7, throttle: 0.7, wheels: all("gravel") }),
  held("strom", "forest", { place: { forest: 1, shore: 0, town: 0 } }, 12),
  held("strom", "shore", { place: { forest: 0, shore: 1, town: 0 } }, 12),
  held("strom", "town", { place: { forest: 0, shore: 0, town: 1 } }, 12),
  held("strom", "lake", { place: { forest: 0, shore: 0, town: 0, lake: 1 } }, 12),
  held("strom", "forest, spring dawn", { place: { forest: 1, shore: 0, town: 0 }, season: { yearDay: 140, sunDeg: 1, hour: 4, leafed: 1, iceReach: 0 } }, 12),
  held("strom", "forest, winter noon", { place: { forest: 1, shore: 0, town: 0 }, season: { yearDay: 20, sunDeg: 7, hour: 12, leafed: 0, iceReach: 0.3 } }, 12),
  held("strom", "shore, frozen", { place: { forest: 0, shore: 1, town: 0 }, season: { yearDay: 40, sunDeg: 15, hour: 12, leafed: 0, iceReach: 0.8 } }, 12),
  held("strom", "town, winter night", { place: { forest: 0, shore: 0, town: 1 }, season: { yearDay: 20, sunDeg: -40, hour: 23, leafed: 0, iceReach: 0.3 } }, 12),
  {
    name: "everything at worst",
    vehicle: "skerry-gt",
    seconds: 5,
    at: (t) => ({
      speedMS: t < 2.5 ? 55 : 10,
      throttle: 1,
      slip: 1,
      wheels: all("gravel"),
      place: { forest: 1, shore: 1, town: 1 },
      suspension: t > 1 && t < 1.03 ? [0.3, 0.3, 0.3, 0.3] : [0.11, 0.11, 0.11, 0.11],
    }),
  },
];

function fft(real: Float64Array, imag: Float64Array): void {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const turn = (-2 * Math.PI) / size;
    for (let i = 0; i < n; i += size) {
      for (let k = 0; k < size / 2; k++) {
        const c = Math.cos(turn * k);
        const s = Math.sin(turn * k);
        const a = i + k;
        const b = a + size / 2;
        const tr = real[b] * c - imag[b] * s;
        const ti = real[b] * s + imag[b] * c;
        real[b] = real[a] - tr;
        imag[b] = imag[a] - ti;
        real[a] += tr;
        imag[a] += ti;
      }
    }
  }
}

const decibels = (value: number) => Math.round(200 * Math.log10(Math.max(value, 1e-6))) / 10;

/** Level and spectrum of a stretch of samples: the strongest low partial, and the share of energy by band. */
function measure(samples: Float32Array, from: number, to: number) {
  let peak = 0;
  let energy = 0;
  let broken = 0;
  for (let i = from; i < to; i++) {
    if (!Number.isFinite(samples[i])) broken++;
    peak = Math.max(peak, Math.abs(samples[i]));
    energy += samples[i] * samples[i];
  }
  const size = 1 << 15;
  const real = new Float64Array(size);
  const imag = new Float64Array(size);
  const start = Math.max(from, to - size);
  for (let i = 0; i < size && start + i < to; i++) real[i] = samples[start + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size));
  fft(real, imag);
  const binHz = RATE / size;
  const bands = [0, 200, 800, 3000, 8000, 22050];
  const bandEnergy = bands.slice(1).map(() => 0);
  let weighted = 0;
  let total = 0;
  let strongest = 0;
  let strongestHz = 0;
  for (let bin = 1; bin < size / 2; bin++) {
    const hz = bin * binHz;
    const power = real[bin] * real[bin] + imag[bin] * imag[bin];
    weighted += hz * power;
    total += power;
    if (power > strongest) {
      strongest = power;
      strongestHz = hz;
    }
    const band = bands.findIndex((edge, index) => hz >= edge && hz < bands[index + 1]);
    if (band >= 0) bandEnergy[band] += power;
  }
  return {
    peakDb: decibels(peak),
    rmsDb: decibels(Math.sqrt(energy / Math.max(to - from, 1))),
    centroidHz: Math.round(total > 0 ? weighted / total : 0),
    strongestHz: Math.round(strongestHz),
    bandsPct: bandEnergy.map((value) => Math.round((100 * value) / Math.max(total, 1e-12))),
    broken,
  };
}

async function renderScene(scene: (typeof SCENES)[number]) {
  const length = Math.round(scene.seconds * RATE);
  const context = new OfflineAudioContext(2, length, RATE);
  const audio = createDriveAudio({ context, settings: () => ({ muted: false, volume: 1 }) });
  await audio.ready;
  const gears: number[] = [];
  const revs: number[] = [];
  const stateAt = (t: number) => ({ ...base(scene.vehicle), ...scene.at(t) });
  audio.update(stateAt(0), FRAME_S);
  for (let frame = 1; frame * FRAME_S < scene.seconds; frame++) {
    const t = frame * FRAME_S;
    void context.suspend(t).then(() => {
      audio.update(stateAt(t), FRAME_S);
      const reading = audio.reading();
      if (reading?.engine) {
        gears.push(reading.engine.gear);
        revs.push(Math.round(reading.engine.rpm));
      }
      return context.resume();
    });
  }
  const rendered = await context.startRendering();
  const left = rendered.getChannelData(0);
  const right = rendered.getChannelData(1);
  const settled = Math.min(RATE, Math.floor(length / 3));
  return {
    name: scene.name,
    left: measure(left, settled, length),
    right: { peakDb: measure(right, settled, length).peakDb },
    whole: measure(left, 0, length).peakDb,
    highestRpm: revs.length > 0 ? Math.max(...revs) : null,
    gears: gears.length > 0 ? [...new Set(gears)].join("") : null,
    shifts: gears.filter((gear, index) => index > 0 && gear !== gears[index - 1]).length,
  };
}

// ---- The engine study: each car's engine alone, held at set revs on and off load ----

const LOW_HZ = 40;
const HIGH_HZ = 6000;

function spectrum(samples: Float32Array, start: number, size: number): Float64Array {
  const real = new Float64Array(size);
  const imag = new Float64Array(size);
  for (let i = 0; i < size; i++) real[i] = samples[start + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size));
  fft(real, imag);
  const power = new Float64Array(size / 2);
  for (let bin = 0; bin < size / 2; bin++) power[bin] = real[bin] * real[bin] + imag[bin] * imag[bin];
  return power;
}

/** Third-octave levels from 50 Hz to 8 kHz, dB, for comparing spectral envelopes. */
function thirds(power: Float64Array, size: number): number[] {
  const binHz = RATE / size;
  const levels: number[] = [];
  for (let band = 0; band < 23; band++) {
    const low = 50 * 2 ** (band / 3 - 1 / 6);
    const high = 50 * 2 ** (band / 3 + 1 / 6);
    let sum = 1e-12;
    for (let bin = Math.ceil(low / binHz); bin < high / binHz && bin < power.length; bin++) sum += power[bin];
    levels.push(10 * Math.log10(sum));
  }
  return levels;
}

function correlation(a: number[], b: number[]): number {
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const [ma, mb] = [mean(a), mean(b)];
  let top = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    top += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return Math.round((100 * top) / Math.sqrt(da * db)) / 100;
}

/** How the engine sounds held still: level, centroid, how much of it is steady tones, and how much it changes frame to frame. */
function character(samples: Float32Array, from: number, to: number) {
  let energy = 0;
  for (let i = from; i < to; i++) energy += samples[i] * samples[i];
  // Tones against the noise between them, on spectra averaged over 93 ms frames: the loops' own repeat, every
  // half second or so, is finer than these bins, so it counts as noise rather than as a forest of steady lines.
  const size = 4096;
  const power = new Float64Array(size / 2);
  for (let start = from; start + size <= to; start += size / 2) spectrum(samples, start, size).forEach((value, bin) => (power[bin] += value));
  const binHz = RATE / size;
  const [low, high] = [Math.round(LOW_HZ / binHz), Math.round(HIGH_HZ / binHz)];
  let total = 0;
  let tonal = 0;
  let weighted = 0;
  for (let bin = low; bin < high; bin++) {
    total += power[bin];
    weighted += power[bin] * bin * binHz;
    const around: number[] = [];
    for (let k = bin - 8; k <= bin + 8; k++) if (k !== bin && k > 0) around.push(power[k]);
    around.sort((a, b) => a - b);
    if (power[bin] > 10 * around[around.length >> 1]) tonal += power[bin];
  }
  // Spectral flux over 46 ms frames: a held oscillator barely changes; burning fuel does, cycle to cycle.
  const frame = 2048;
  let flux = 0;
  let frames = 0;
  let previous: Float64Array | null = null;
  for (let start = from; start + frame <= to; start += frame / 2) {
    const now = spectrum(samples, start, frame);
    const [a, b] = [Math.round(LOW_HZ / (RATE / frame)), Math.round(HIGH_HZ / (RATE / frame))];
    let sum = 0;
    for (let bin = a; bin < b; bin++) sum += Math.sqrt(now[bin]);
    if (previous !== null && sum > 0) {
      let change = 0;
      let prior = 0;
      for (let bin = a; bin < b; bin++) {
        change += Math.abs(Math.sqrt(now[bin]) - Math.sqrt(previous[bin]));
        prior += Math.sqrt(previous[bin]);
      }
      flux += change / Math.max(prior, 1e-12);
      frames++;
    }
    previous = now;
  }
  return {
    rmsDb: decibels(Math.sqrt(energy / (to - from))),
    centroidHz: Math.round(weighted / Math.max(total, 1e-12)),
    tonalPct: Math.round((100 * tonal) / Math.max(total, 1e-12)),
    fluxPct: Math.round((100 * flux) / Math.max(frames, 1)),
    thirds: thirds(power, size),
  };
}

export interface StudyOptions {
  /** Plays each engine through the audition's old voice instead of its own. */
  old?: boolean;
  /** Heard from inside the car. */
  inside?: boolean;
  ids?: readonly EngineId[];
}

async function renderEngine(vehicle: EngineId, at: (t: number) => Partial<DriveAudioState>, seconds: number, options: StudyOptions) {
  const length = Math.round(seconds * RATE);
  const context = new OfflineAudioContext(2, length, RATE);
  const audio = createDriveAudio({ context, settings: () => ({ muted: false, volume: 1 }) });
  await audio.ready;
  if (options.old === true) audio.auditionEngine(oldEngineVoice);
  const stateAt = (t: number): DriveAudioState => ({ ...base(vehicle), ...(options.inside === true ? { perspective: "inside" } : {}), ...at(t) });
  audio.update(stateAt(0), FRAME_S);
  for (let frame = 1; frame * FRAME_S < seconds; frame++) {
    const t = frame * FRAME_S;
    void context.suspend(t).then(() => {
      audio.update(stateAt(t), FRAME_S);
      return context.resume();
    });
  }
  const rendered = await context.startRendering();
  return rendered.getChannelData(0);
}

/** Each car's engine alone (standing, so no tyres or wind): at idle, and held at 30 and 60 and 90% of its redline, on and off load. */
export async function study(options: StudyOptions = {}) {
  const results = [];
  for (const id of options.ids ?? ENGINE_IDS) {
    if (options.old === true && !hasOldVoice(id)) continue;
    const { idleRpm, redlineRpm } = CARS[id].gearbox;
    const seconds = 2.5;
    const settled = Math.round(0.8 * RATE);
    const end = Math.round(seconds * RATE);
    const held = async (share: number, throttle: number) => character(await renderEngine(id, () => ({ heldRpm: Math.max(idleRpm, 1200, share * redlineRpm), throttle }), seconds, options), settled, end);
    const idle = character(await renderEngine(id, () => (idleRpm > 0 ? {} : { heldRpm: 300 }), seconds, options), settled, end);
    const rows: Record<string, ReturnType<typeof character>> = { idle };
    for (const share of [0.3, 0.6, 0.9]) {
      rows[`${String(share * 100)}% on`] = await held(share, 1);
      rows[`${String(share * 100)}% off`] = await held(share, 0);
    }
    const onOff = [0.3, 0.6, 0.9].map((share) => {
      const [on, off] = [rows[`${String(share * 100)}% on`], rows[`${String(share * 100)}% off`]];
      return { share, levelDb: Math.round(10 * (on.rmsDb - off.rmsDb)) / 10, centroidHz: on.centroidHz - off.centroidHz, shape: correlation(on.thirds, off.thirds) };
    });
    // Above 300 Hz, where the firings' lowest orders no longer rule it, a third-octave envelope that stays put as the
    // revs double is resonances fixed in Hz, as a pipe's are; one that slides an octave with them is everything scaling with the revs.
    const [low, high] = [rows["30% on"].thirds.slice(8), rows["60% on"].thirds.slice(8)];
    const fixed = correlation(low, high);
    const sliding = correlation(low.slice(0, -3), high.slice(3));
    results.push({ id, rows: Object.fromEntries(Object.entries(rows).map(([name, { thirds: _thirds, ...rest }]) => [name, rest])), onOff, envelope: { fixed, sliding } });
  }
  return results;
}

// ---- The cost: nodes, rendered bytes and the parameters steered, counted ----

const NODE_KINDS = ["GainNode", "BiquadFilterNode", "OscillatorNode", "AudioBufferSourceNode", "WaveShaperNode", "DelayNode", "ChannelSplitterNode"] as const;

/** Counts every node made and every parameter change scheduled, by wrapping the constructors and `setTargetAtTime`. */
function counting() {
  const nodes: Record<string, number> = Object.fromEntries(NODE_KINDS.map((kind) => [kind, 0]));
  const scope = globalThis as unknown as Record<string, new (...args: unknown[]) => object>;
  for (const kind of NODE_KINDS) {
    const Native = scope[kind];
    scope[kind] = class extends Native {
      constructor(...args: unknown[]) {
        super(...args);
        nodes[kind]++;
      }
    };
  }
  const steered = { count: 0 };
  const schedule = AudioParam.prototype.setTargetAtTime;
  AudioParam.prototype.setTargetAtTime = function (this: AudioParam, ...args: Parameters<AudioParam["setTargetAtTime"]>) {
    steered.count++;
    return schedule.apply(this, args);
  };
  const total = () => Object.values(nodes).reduce((sum, count) => sum + count, 0);
  return { nodes, steered, total };
}

/**
 * What each car's engine costs, old and new: the nodes its voice adds to the graph, the bytes and seconds of loops it
 * renders, and the parameter changes scheduled over a pull through the gears and a lift, on top of the same scene
 * with a bicycle (no engine at all), so what's counted is the engine's own.
 */
export async function cost() {
  const count = counting();
  const results = [];
  const pullOf = pull("skerry-gt");
  const scene = async (vehicle: VehicleId, old: boolean) => {
    const length = Math.round(pullOf.seconds * RATE);
    const context = new OfflineAudioContext(2, length, RATE);
    const audio = createDriveAudio({ context, settings: () => ({ muted: false, volume: 1 }) });
    await audio.ready;
    if (old) audio.auditionEngine(oldEngineVoice);
    const before = count.total();
    audio.update({ ...base(vehicle), ...pullOf.at(0) }, FRAME_S);
    const voiceNodes = count.total() - before;
    const steeredBefore = count.steered.count;
    const frames = Math.floor(pullOf.seconds / FRAME_S);
    for (let frame = 1; frame < frames; frame++) {
      const t = frame * FRAME_S;
      void context.suspend(t).then(() => {
        audio.update({ ...base(vehicle), ...pullOf.at(t) }, FRAME_S);
        return context.resume();
      });
    }
    await context.startRendering();
    return { voiceNodes, steered: count.steered.count - steeredBefore, frames };
  };
  const bike = await scene("bike", false);
  for (const id of ENGINE_IDS) {
    const spec = ENGINES[id];
    const made = engineLoops(spec);
    const samples = made === null ? 0 : made.loops.reduce((sum, loop) => sum + loop.channels.length * loop.channels[0].length, 0);
    const seconds = made === null ? 0 : made.loops.reduce((sum, loop) => sum + loop.channels[0].length / loop.rate, 0);
    const now = await scene(id, false);
    const then = hasOldVoice(id) ? await scene(id, true) : null;
    results.push({
      id,
      nodes: now.voiceNodes,
      oldNodes: then?.voiceNodes ?? null,
      loopKb: Math.round((samples * 4) / 1024),
      loopSeconds: Math.round(seconds * 100) / 100,
      // The old cycle: eight four-stroke cycles at 3,000 rpm, one channel.
      oldLoopKb: then === null ? null : Math.round((Math.round(0.32 * RATE) * 4) / 1024),
      steeredPerFrame: Math.round((100 * (now.steered - bike.steered)) / now.frames) / 100,
      oldSteeredPerFrame: then === null ? null : Math.round((100 * (then.steered - bike.steered)) / then.frames) / 100,
    });
  }
  const shots = engineShots();
  const shotSamples = [...shots.pops, shots.bang, shots.blowOff, shots.flutter].reduce((sum, loop) => sum + loop.channels[0].length, 0);
  return { results, shotsKb: Math.round((shotSamples * 4) / 1024), nodeKinds: count.nodes };
}

export async function renderAll() {
  const results = [];
  for (const scene of SCENES) results.push(await renderScene(scene));
  return results;
}
