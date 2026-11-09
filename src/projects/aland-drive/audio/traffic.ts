import type { Condition, Surface } from "../sim/surfaces";
import { inline } from "./firing";
import { ENGINE_RATE, type Listener } from "./model";
import type { Combustion, Electric } from "./vehicles";

/*
 * The traffic's sound: a few voices rather than one per car, a petrol car, a diesel, a van and an electric, each one
 * loop rendered once at a cruise (`synthesis.ts`) and played through the placed sounds (`placed.ts`) at the revs the
 * car's speed asks of a plain automatic gearbox, so its note climbs through a gear and drops at the change. Only the
 * nearest few cars are voiced, a number a frame reads; the rest are silent, as the country's roads mostly are. Each
 * voiced car is two placed loops, its engine and its tyres on the road, and both are heard shifted by the Doppler
 * effect from its speed and the listener's, so a car rises in pitch as it comes and falls as it passes. No Web Audio
 * here: what plays, how loud and at what rate is worked out from the cars each frame, and unit-tested.
 */

export type TrafficVoiceId = "petrol" | "diesel" | "van" | "electric";

interface Revs {
  idleRpm: number;
  /** The revs a gentle driver changes up at, and the speed that is in each gear, km/h. */
  shiftRpm: number;
  gearTopKmh: readonly number[];
}

/** A traffic voice: an engine's numbers as a car's are (`audio/CLAUDE.md`, "How to voice a car"), or a motor's. */
export interface TrafficVoice {
  seed: number;
  combustion: Combustion | null;
  electric: Electric | null;
  /** An engine's revs on its gearbox; null for a motor, whose turns follow the speed alone. */
  revs: Revs | null;
  /** How loud it is at a cruise beside the listener, and how much of that it keeps standing at idle. */
  level: number;
  idleLevel: number;
}

/** Revs moved to a whole number of samples a cycle at the engine rate, so a loop of whole cycles meets its start. */
const snapped = (rpm: number) => (120 * ENGINE_RATE) / Math.round((120 * ENGINE_RATE) / rpm);

/** What a car's engine is rendered at: a cruise in a high gear, so the loop is stretched least where it's heard most. */
export const TRAFFIC_LOOP_RPM: Readonly<Record<Exclude<TrafficVoiceId, "electric">, number>> = { petrol: snapped(2000), diesel: snapped(1700), van: snapped(1600) };
/** What a motor is rendered at: the speed, m/s, and its turns a minute then. */
export const ELECTRIC_LOOP_MS = 15;
export const ELECTRIC_LOOP_RPM = 9000;

const QUIET_SALOON_PIPE = { pipeHz: 140, pipeRing: 0.35, exhaustHz: [600, 800, 800] as [number, number, number], silencerHz: 220, silencerDb: 8 };

export const TRAFFIC_VOICES: Readonly<Record<TrafficVoiceId, TrafficVoice>> = {
  /** An ordinary petrol four in a family car: an even, muffled hum. */
  petrol: {
    seed: 1501,
    combustion: { firing: inline(4), lope: 0.05, jitter: 0.07, banks: { gain: 1, ring: 1, delayMs: 0 }, pulseMs: 1.4, headerHz: 520, roughness: 0.25, knock: 0, knockHz: 0, chatter: 0.1, fan: null, ...QUIET_SALOON_PIPE, rasp: 1.4, intakeHz: 260, intakeQ: 1.5, intake: 0.4, limiterHz: 7 },
    electric: null,
    revs: { idleRpm: 800, shiftRpm: 2500, gearTopKmh: [22, 40, 60, 80, 115] },
    level: 0.5,
    idleLevel: 0.4,
  },
  /** A diesel saloon or estate: a gruffer note with the clatter of each firing in it. */
  diesel: {
    seed: 1502,
    combustion: { firing: inline(4), lope: 0.07, jitter: 0.09, banks: { gain: 1, ring: 1, delayMs: 0 }, pulseMs: 1.7, headerHz: 480, roughness: 0.55, knock: 0.7, knockHz: 2300, chatter: 0.15, fan: null, ...QUIET_SALOON_PIPE, pipeHz: 120, exhaustHz: [650, 700, 700], rasp: 1.2, intakeHz: 240, intakeQ: 1.4, intake: 0.35, limiterHz: 6 },
    electric: null,
    revs: { idleRpm: 780, shiftRpm: 2100, gearTopKmh: [22, 42, 65, 90, 125] },
    level: 0.55,
    idleLevel: 0.55,
  },
  /** A van, a pickup or a taxi's big diesel: low and loud with knock, a long pipe, working hard. */
  van: {
    seed: 1503,
    combustion: { firing: inline(4), lope: 0.1, jitter: 0.1, banks: { gain: 1, ring: 1, delayMs: 0 }, pulseMs: 2, headerHz: 450, roughness: 0.6, knock: 1, knockHz: 2200, chatter: 0.2, fan: null, pipeHz: 100, pipeRing: 0.4, exhaustHz: [600, 650, 700], silencerHz: 180, silencerDb: 8, rasp: 1.3, intakeHz: 220, intakeQ: 1.4, intake: 0.4, limiterHz: 6 },
    electric: null,
    revs: { idleRpm: 750, shiftRpm: 2000, gearTopKmh: [18, 35, 55, 78, 110] },
    level: 0.65,
    idleLevel: 0.55,
  },
  /** An electric car: a soft motor whine rising with its speed, nothing at rest, mostly its tyres. */
  electric: {
    seed: 1504,
    combustion: null,
    electric: { rpmPerMS: null, orders: [[8, 1], [24, 0.35], [48, 0.12]], level: 0.5, carrierHz: 3400, polePairs: 4, inverter: 0.1, regen: 0.5 },
    revs: null,
    level: 0.18,
    idleLevel: 0,
  },
};

/**
 * Which voice a world car has, by its model in `render/parked-places.ts`'s `PARKED_CARS` and its seed: the vans,
 * pickups and taxi diesel, the old Raggare and the little Myra petrol, the Puls electric, and the rest a mix as Åland's
 * cars are, mostly petrol, a quarter diesel and a few electric.
 */
const VOICE_BY_MODEL: Readonly<Partial<Record<string, TrafficVoiceId>>> = {
  Raggare: "petrol",
  Myra: "petrol",
  Brev: "van",
  Åker: "van",
  Droska: "diesel",
  Vakt: "diesel",
  Bud: "van",
  Verk: "van",
  Puls: "electric",
};

export function trafficVoiceOf(modelName: string, seed: number): TrafficVoiceId {
  const fixed = VOICE_BY_MODEL[modelName];
  if (fixed !== undefined) return fixed;
  const roll = ((seed * 2654435761) >>> 0) / 4294967296;
  return roll < 0.1 ? "electric" : roll < 0.35 ? "diesel" : "petrol";
}

/** The revs a gentle driver's automatic holds at a speed: the lowest gear it hasn't outrun, never below idle. */
export function trafficRpm({ idleRpm, shiftRpm, gearTopKmh }: Revs, speedMS: number): number {
  const kmh = speedMS * 3.6;
  const top = gearTopKmh.find((gearKmh) => kmh <= gearKmh) ?? gearTopKmh[gearTopKmh.length - 1];
  return Math.max(idleRpm, (shiftRpm * kmh) / top);
}

const SOUND_MS = 343;

/**
 * How much higher a sound is heard than it was made, from a source and a listener each moving: up as they close, down
 * as they part. Held short of the speed of sound either way.
 */
export function dopplerRate(fromX: number, fromZ: number, sourceVX: number, sourceVZ: number, toX: number, toZ: number, listenerVX: number, listenerVZ: number): number {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const distance = Math.hypot(dx, dz);
  if (distance < 1e-3) return 1;
  const sourceToward = (sourceVX * dx + sourceVZ * dz) / distance;
  const listenerToward = -(listenerVX * dx + listenerVZ * dz) / distance;
  const limit = SOUND_MS * 0.5;
  return (SOUND_MS + Math.min(listenerToward, limit)) / (SOUND_MS - Math.min(sourceToward, limit));
}

/** A traffic car as the sound hears it. */
export interface TrafficHeard {
  id: string;
  voice: TrafficVoiceId;
  x: number;
  z: number;
  /** As the lane driver's pose has it: the car drives towards -z turned by this. */
  yaw: number;
  speedMS: number;
  surface: Surface;
}

/** The tyres' loops a traffic car rolls on: one for the sealed roads, one for gravel and the rest. */
export type RollId = "roll-tarmac" | "roll-gravel";

/** A placed loop to play, as `placed.ts`'s `PlacedLoop`, with the rate to play it at. */
export interface TrafficLoop {
  id: string;
  sound: `traffic-${TrafficVoiceId}` | RollId;
  x: number;
  z: number;
  loudness: number;
  rate: number;
}

/** How many traffic cars are voiced, the nearest first: a number a frame reads, which a setting turns down. */
export const TRAFFIC_VOICED = 3;
/** Past this, a car isn't voiced, however few are nearer. */
const VOICED_WITHIN_M = 250;
/** How quickly a car's load is read from its speed's change, m/s² for full load. */
const FULL_LOAD_MS2 = 1.5;
/** How loud tyres roll at 25 m/s beside the listener, and how much louder gravel is. */
const ROLL_LEVEL = 0.35;
const ROLL_FULL_MS = 25;
const ROLL_ON: Record<Surface, { sound: RollId; level: number }> = {
  asphalt: { sound: "roll-tarmac", level: 1 },
  rock: { sound: "roll-gravel", level: 0.8 },
  gravel: { sound: "roll-gravel", level: 1.2 },
  grass: { sound: "roll-gravel", level: 0.5 },
};
const ROLL_UNDER: Record<Condition, number> = { dry: 1, wet: 1.3, snow: 0.55, ice: 0.4 };

/**
 * The traffic's sound frame by frame: remembers each voiced car's last speed, to hear it pull away, and where the
 * listener was, to know how it moves.
 */
export class TrafficSound {
  private readonly speeds = new Map<string, number>();
  private last: { x: number; z: number } | null = null;

  /** Forgets where the listener was: after a jump, the camera's leap isn't a speed. */
  reset(): void {
    this.last = null;
    this.speeds.clear();
  }

  frame(listener: Listener, cars: Iterable<TrafficHeard>, condition: Condition, voiced: number, dt: number): TrafficLoop[] {
    const listenerV = this.last && dt > 0 ? { x: (listener.x - this.last.x) / dt, z: (listener.z - this.last.z) / dt } : { x: 0, z: 0 };
    this.last = { x: listener.x, z: listener.z };
    const nearest = [...cars]
      .map((car) => ({ car, away: Math.hypot(car.x - listener.x, car.z - listener.z) }))
      .filter(({ away }) => away < VOICED_WITHIN_M)
      .sort((a, b) => a.away - b.away)
      .slice(0, Math.max(0, Math.floor(voiced)));
    const loops: TrafficLoop[] = [];
    const heard = new Set<string>();
    for (const { car } of nearest) {
      heard.add(car.id);
      const before = this.speeds.get(car.id) ?? car.speedMS;
      this.speeds.set(car.id, car.speedMS);
      const load = dt > 0 ? Math.min(1, Math.max(0, (car.speedMS - before) / dt / FULL_LOAD_MS2)) : 0;
      const vx = -Math.sin(car.yaw) * car.speedMS;
      const vz = -Math.cos(car.yaw) * car.speedMS;
      const shift = dopplerRate(car.x, car.z, vx, vz, listener.x, listener.z, listenerV.x, listenerV.z);
      const voice = TRAFFIC_VOICES[car.voice];
      const { rate, loudness } = engineHeard(voice, car.voice, car.speedMS, load);
      if (loudness > 0) loops.push({ id: `${car.id}:engine`, sound: `traffic-${car.voice}`, x: car.x, z: car.z, loudness, rate: rate * shift });
      const rolling = Math.min(1, car.speedMS / ROLL_FULL_MS);
      const roll = ROLL_ON[car.surface];
      if (rolling > 0.02) loops.push({ id: `${car.id}:roll`, sound: roll.sound, x: car.x, z: car.z, loudness: ROLL_LEVEL * roll.level * ROLL_UNDER[condition] * rolling, rate: (0.75 + 0.45 * rolling) * shift });
    }
    for (const id of this.speeds.keys()) if (!heard.has(id)) this.speeds.delete(id);
    return loops;
  }
}

/** How fast and loud a voice's loop plays at a speed and load. */
export function engineHeard(voice: TrafficVoice, id: TrafficVoiceId, speedMS: number, load: number): { rate: number; loudness: number } {
  if (voice.revs === null || id === "electric") {
    const share = Math.min(1, speedMS / ELECTRIC_LOOP_MS);
    return { rate: Math.max(0.2, speedMS / ELECTRIC_LOOP_MS), loudness: voice.level * share * (0.7 + 0.3 * load) };
  }
  const rpm = trafficRpm(voice.revs, speedMS);
  const working = (rpm - voice.revs.idleRpm) / (voice.revs.shiftRpm - voice.revs.idleRpm);
  const loudness = voice.level * (voice.idleLevel + (1 - voice.idleLevel) * Math.min(1, 0.5 * Math.max(0, working) + 0.5 * load));
  return { rate: rpm / TRAFFIC_LOOP_RPM[id], loudness };
}
