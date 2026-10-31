import { createDriveAudio } from "../graph";
import type { DriveAudioState, Place, Surface } from "../model";
import type { VehicleId } from "../vehicles";

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
  surface: "asphalt",
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

const surface = (name: Surface, slip = 0) => held("electric", `tyres ${name}${slip > 0 ? " sliding" : ""}`, { speedMS: 25, surface: name, slip, heldRpm: 0 });

export const SCENES: (Scene & { vehicle: VehicleId })[] = [
  ...(["skerry-gt", "old-estate", "electric", "diesel-van"] as const).flatMap((vehicle) => [
    held(vehicle, `${vehicle} idle`, {}),
    held(vehicle, `${vehicle} cruise`, { speedMS: 25, throttle: 0.3 }),
    held(vehicle, `${vehicle} held 3000`, { heldRpm: 3000, speedMS: 20, throttle: 0.6 }),
    pull(vehicle),
  ]),
  surface("asphalt"),
  surface("gravel"),
  surface("grass"),
  surface("asphalt", 1),
  surface("gravel", 1),
  surface("grass", 1),
  held("electric", "wind 15", { speedMS: 15, heldRpm: 0, surface: "asphalt", suspension: [0, 0, 0, 0] }),
  held("electric", "wind 30", { speedMS: 30, heldRpm: 0, suspension: [0, 0, 0, 0] }),
  held("electric", "wind 55", { speedMS: 55, heldRpm: 0, suspension: [0, 0, 0, 0] }),
  held("bike", "bike coasting", { speedMS: 7 }),
  held("bike", "bike pedalling", { speedMS: 7, throttle: 0.7 }),
  held("bike", "bike gravel", { speedMS: 7, throttle: 0.7, surface: "gravel" }),
  held("electric", "forest", { place: { forest: 1, shore: 0, town: 0 } }, 12),
  held("electric", "shore", { place: { forest: 0, shore: 1, town: 0 } }, 12),
  held("electric", "town", { place: { forest: 0, shore: 0, town: 1 } }, 12),
  {
    name: "everything at worst",
    vehicle: "skerry-gt",
    seconds: 5,
    at: (t) => ({
      speedMS: t < 2.5 ? 55 : 10,
      throttle: 1,
      slip: 1,
      surface: "gravel",
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

export async function renderAll() {
  const results = [];
  for (const scene of SCENES) results.push(await renderScene(scene));
  return results;
}
