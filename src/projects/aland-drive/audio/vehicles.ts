import type { Gearbox } from "../sim/gearbox";
import type { Firing } from "./firing";
import { CAR_IDS, CARS, type CarId } from "../sim/cars";
import { altura } from "./voices/altura";
import { aska } from "./voices/aska";
import { blixt } from "./voices/blixt";
import { ankar } from "./voices/ankar";
import { berg } from "./voices/berg";
import { bris } from "./voices/bris";
import { brus } from "./voices/brus";
import { dyning } from "./voices/dyning";
import { fjard } from "./voices/fjard";
import { frost } from "./voices/frost";
import { flod } from "./voices/flod";
import { grus } from "./voices/grus";
import { gnista } from "./voices/gnista";
import { hagel } from "./voices/hagel";
import { holm } from "./voices/holm";
import { kobb } from "./voices/kobb";
import { orkan } from "./voices/orkan";
import { rimfrost } from "./voices/rimfrost";
import { ljus } from "./voices/ljus";
import { salta } from "./voices/salta";
import { skerryGt } from "./voices/skerry-gt";
import { sten } from "./voices/sten";
import { strimma } from "./voices/strimma";
import { strom } from "./voices/strom";
import { span } from "./voices/span";
import { sund } from "./voices/sund";
import { varg } from "./voices/varg";
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

/**
 * A combustion engine: when it fires, what a firing sounds of leaving the port, the pipe it rings down, the intake it
 * breathes through and the mechanicals ticking over. Rendered into loops at two revs, on and off load
 * (`synthesis.ts`), and steered between them (`model.ts`), so the timbre itself changes with the throttle.
 */
export interface Combustion {
  /** When each cylinder fires and which exhaust it leaves by (`firing.ts`). */
  firing: Firing;
  /** How differently the cylinders burn, 0 to about 0.4: a lumpy cam's or a tired engine's lope. */
  lope: number;
  /** How much each firing strays from the last time round, 0 to about 0.3: the life in a held note. */
  jitter: number;
  /** The second exhaust against the first: its loudness, its header's ring as a multiple of the first's, and how much later its pulses arrive, ms (a longer pipe). One exhaust leaves this 1, 1, 0. */
  banks: { gain: number; ring: number; delayMs: number };
  /** How long a pulse lasts leaving the port, ms: short is hard and barky, long is soft. */
  pulseMs: number;
  /** The header's ring in each pulse, Hz. */
  headerHz: number;
  /** The share of a pulse that is turbulence rather than thump, 0 to 1: a hard-worked engine and a diesel are rough. */
  roughness: number;
  /** A diesel's clatter: each firing rings the block at `knockHz`, 0 for petrol, about 1 for an old diesel. */
  knock: number;
  knockHz: number;
  /** Valve gear ticking, 0 to 1: heard from the cockpit, and loud on an air-cooled engine. */
  chatter: number;
  /** An air-cooled engine's cooling fan: its whine as a multiple of the crank's turns, and how loud. */
  fan: { order: number; level: number } | null;
  /** The exhaust pipe's own ring, its lowest note in Hz (at most 300, a render quantum's delay) and how long it rings, 0 to 0.8: what makes the note swell and drone through the revs. */
  pipeHz: number;
  pipeRing: number;
  /** The silencer's low-pass, Hz: closed at idle, opened by the revs and by the load. */
  exhaustHz: readonly [closed: number, revs: number, load: number];
  /** The silencer's own resonance, fixed however the revs move. */
  silencerHz: number;
  silencerDb: number;
  /** How hard the load drives the exhaust into rasp: more is more edge flat out. */
  rasp: number;
  /** The intake: the airbox's resonance, Hz, its sharpness, and how loud the induction roar is under load. */
  intakeHz: number;
  intakeQ: number;
  intake: number;
  /** How fast the limiter cuts the fuel at the redline, Hz: a road car's slow bounce, a race car's fast stutter. */
  limiterHz: number;
}

/** A turbocharger: boost that builds with load and revs after its lag, the whistle of its shaft, and what it does on a lift. */
export interface Turbo {
  /** The share of the redline below which it makes no boost. */
  boostFrom: number;
  /** How long it takes to spool up, s, at mid revs: a big old turbo is slow. */
  spoolS: number;
  /** The shaft's whistle from barely turning to flat out, Hz. */
  whistleHz: readonly [low: number, high: number];
  whistle: number;
  /** The rush of air through the compressor under boost. */
  hiss: number;
  /** What a lift with boost up sounds of: a blow-off valve's psssh, or the compressor's flutter with none. */
  blowOff: "valve" | "flutter";
  blowOffLevel: number;
}

/** An electric motor's voice: an electric car's only one, a hybrid's under its engine. */
export interface Electric {
  /** The motor's turns a minute for each m/s of road speed; null when the motor is the car's engine and its revs are the gearbox's. */
  rpmPerMS: number | null;
  /** The motor's whine, as multiples of its turns, each with its level: pole pairs and the slots' harmonics. */
  orders: readonly (readonly [order: number, level: number])[];
  level: number;
  /** The inverter's switching tone, Hz, with its sidebands at twice the motor's electrical rate either side; and how loud under full current. */
  carrierHz: number;
  polePairs: number;
  inverter: number;
  /** The share of the drive's whine heard on the lift, regenerating. */
  regen: number;
}

/** How an engine sounds, apart from its revs and gears. A car session fills these in by number (`audio/CLAUDE.md`, "How to voice a car"). */
export interface Voice {
  /** The draw of the firings' unevenness: any number, the car's own, so its lope is the same every time. */
  seed: number;
  /** Null for an electric car. */
  combustion: Combustion | null;
  /** Null for a car with no motor. */
  electric: Electric | null;
  turbo: Turbo | null;
  /** A supercharger's whine, as a multiple of the crank's turns, and how loud under load. */
  supercharger: { order: number; level: number } | null;
  /** Pops and crackles a second in the exhaust just after a lift at high revs; anti-lag's bangs a second off throttle, for a rally or Group B car. */
  overrun: { crackle: number; antiLag: number };
  /** The gearbox's whine: its teeth meshing per turn of the engine (or motor), and how loud: a straight-cut race box is loud. */
  gearWhine: { teeth: number; level: number };
  /** How much of the outside reaches the driver's seat, 0 to 1: 0 a sealed saloon, 1 an open roadster. */
  cabin: number;
  level: number;
  /** The share of its level the engine keeps at idle with no load. */
  idleLevel: number;
}

export type EngineSpec = Gearbox & Voice;

/** Every car's voice, under its tier as `sim/cars.ts` has it. */
const VOICES: Readonly<Record<EngineId, Voice>> = {
  // A1
  aska,
  blixt,
  // A2
  orkan,
  varg,
  // A3
  dyning,
  span,
  strimma,
  // A4
  brus,
  sund,
  flod,
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
  hagel,
  // B2
  fjard,
  // B3
  holm,
  // B4
  berg,
  // C1
  frost,
  altura,
  // C2
  rimfrost,
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
