import type { Tier } from "./tiers";
import type { CarTuning } from "./tuning";
import type { CarEntry } from "./cars/character";
import { aska } from "./cars/aska";
import { orkan } from "./cars/orkan";
import { ankar } from "./cars/ankar";
import { berg } from "./cars/berg";
import { bris } from "./cars/bris";
import { dyning } from "./cars/dyning";
import { fjard } from "./cars/fjard";
import { grus } from "./cars/grus";
import { gnista } from "./cars/gnista";
import { holm } from "./cars/holm";
import { kobb } from "./cars/kobb";
import { ljus } from "./cars/ljus";
import { salta } from "./cars/salta";
import { skerryGt } from "./cars/skerry-gt";
import { sten } from "./cars/sten";
import { strom } from "./cars/strom";
import { sund } from "./cars/sund";
import { vik } from "./cars/vik";

/*
 * The cars a player can drive, each its own car: its wheels where its art has
 * them, its weight, engine, gears, tyres, springs and steering chosen for what
 * it is. The art reads each car's axles, track, wheels and ride height from
 * here, so a car sits on its wheels where the simulation has them. A car is
 * named by its id wherever it has to travel, as to another player.
 *
 * Each car is a file of its own (`cars/<id>.ts`), its tuning and its tier, and
 * a line here. The Skerry GT is written out in full; the rest are a character
 * each (`cars/character.ts`), a few numbers a driver would know a car by, and
 * the springs, dampers, inertia and forces follow from those by the same rules
 * for every car.
 */

/** Every car, under its tier (`tiers.ts`): a new car's line goes under its tier's header. */
const ENTRIES = {
  // A1
  aska,
  // A2
  orkan,
  // A3
  dyning,
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
} satisfies Record<string, CarEntry>;

export type CarId = keyof typeof ENTRIES;

export const CAR_IDS = Object.keys(ENTRIES) as readonly CarId[];

export const CARS: Readonly<Record<CarId, CarTuning>> = Object.fromEntries(CAR_IDS.map((id) => [id, ENTRIES[id].tuning])) as Record<CarId, CarTuning>;

/** The tier each car is entered in, or none. */
export const CAR_TIERS: Readonly<Record<CarId, Tier | null>> = Object.fromEntries(CAR_IDS.map((id) => [id, ENTRIES[id].tier])) as Record<CarId, Tier | null>;

export const DEFAULT_CAR: CarId = "skerry-gt";

export const isCarId = (id: string): id is CarId => (CAR_IDS as readonly string[]).includes(id);

/** The car a player starts in: one that drives well on and off the road, while the game is in development. */
export const PLAYER_START_CAR: CarId = "grus";

/** The car a link asks to start in (`?car=grus`), or `otherwise` when it asks for none. */
export function carAsked(search: string, otherwise: CarId = DEFAULT_CAR): CarId {
  const asked = new URLSearchParams(search).get("car");
  if (asked === null) return otherwise;
  if (!isCarId(asked)) throw new Error(`?car= takes ${CAR_IDS.join(", ")}, not ${asked}`);
  return asked;
}
