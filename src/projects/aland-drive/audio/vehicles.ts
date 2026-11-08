import type { Gearbox } from "../sim/gearbox";
import { CAR_IDS, CARS, type CarId } from "../sim/cars";
import { aska } from "./voices/aska";
import { ankar } from "./voices/ankar";
import { berg } from "./voices/berg";
import { bris } from "./voices/bris";
import { fjard } from "./voices/fjard";
import { grus } from "./voices/grus";
import { gnista } from "./voices/gnista";
import { holm } from "./voices/holm";
import { kobb } from "./voices/kobb";
import { ljus } from "./voices/ljus";
import { salta } from "./voices/salta";
import { skerryGt } from "./voices/skerry-gt";
import { sten } from "./voices/sten";
import { strom } from "./voices/strom";
import { sund } from "./voices/sund";
import { vik } from "./voices/vik";

/*
 * What each car's engine sounds like, as numbers: its voice in a file of its
 * own (`voices/<id>.ts`) and a line here, its gearbox the simulation's own
 * (`sim/cars.ts`), so in the game the sound hears that car's real gear and revs,
 * and in the audition it runs that same gearbox.
 */

export type EngineId = CarId;
export type VehicleId = EngineId | "bike";

export const ENGINE_IDS: readonly EngineId[] = CAR_IDS;
export const VEHICLE_IDS: readonly VehicleId[] = [...ENGINE_IDS, "bike"];

export const vehicleLabel = (id: VehicleId) => (id === "bike" ? "Bicycle" : CARS[id].name);

export interface Harmonic {
  /** Multiple of the firing frequency. */
  order: number;
  wave: OscillatorType;
  level: number;
  /** Detuned by this many cents, so two partials beat rather than sit dead still. */
  cents: number;
}

/** How an engine sounds, apart from its revs and gears. */
export interface Voice {
  /** The draw of the firings' unevenness in the rendered cycle: any number, the car's own, so its lope is the same every time. */
  seed: number;

  /** Firings per crankshaft turn: half the cylinders in a four-stroke, or a motor's poles. */
  firesPerRev: number;

  /** One firing's ring, as multiples of the firing frequency, in the rendered cycle. */
  pulseOrders: readonly number[];
  /** How long a firing rings, as a share of the gap to the next. */
  pulseDecay: number;
  /** How unevenly the cylinders fire, by amplitude: burble and lope. */
  unevenness: number;
  harmonics: readonly Harmonic[];
  cycleLevel: number;

  /** The exhaust's low-pass: closed at idle, open with revs and load. */
  exhaustHz: readonly [closed: number, revs: number, load: number];
  /** The silencer's resonance, fixed however the revs move. */
  bodyHz: number;
  bodyDb: number;
  /** How hard the load drives the soft clipper: more is more rasp. */
  drive: number;

  /** The intake: noise beaten by the firings, in a band that rises with the revs. */
  intakeHz: readonly [low: number, high: number];
  intakeQ: number;
  intakeLevel: number;
  /** Fixed-pitch clatter's share of the intake: a diesel's knock. */
  firingBeat: number;

  level: number;
  /** The share of its level the engine keeps at idle with no load. */
  idleLevel: number;
}

export type EngineSpec = Gearbox & Voice;

/** Every car's voice, under its tier as `sim/cars.ts` has it. */
const VOICES: Readonly<Record<EngineId, Voice>> = {
  // A1
  aska,
  // A2
  // A3
  // A4
  sund,
  // A5
  "skerry-gt": skerryGt,
  strom,
  ankar,
  // A6
  bris,
  sten,
  // A7
  ljus,
  // B1
  grus,
  gnista,
  // B2
  fjard,
  // B3
  holm,
  // B4
  berg,
  // C1
  // C2
  // C3
  vik,
  // C4
  salta,
  // Outside the tiers
  kobb,
};

/** Each car's voice on its own gearbox. */
export const ENGINES: Record<EngineId, EngineSpec> = Object.fromEntries(ENGINE_IDS.map((id) => [id, { ...CARS[id].gearbox, ...VOICES[id] }])) as Record<EngineId, EngineSpec>;

export const BIKE = {
  wheelRadiusM: 0.34,
  /** The speed wind and tyres read as flat out on a bicycle. */
  fullSpeedMS: 14,
  /** Pedal turns per second at full speed, with the gears a rider would pick. */
  fullCadenceHz: 1.7,
  chainringTeeth: 42,
  /** Freewheel clicks per turn of the rear wheel. */
  pawlClicks: 30,
  /** The wheel speed the freewheel's loop is rendered at, turns a second. */
  renderedTurnsHz: 3,
} as const;
