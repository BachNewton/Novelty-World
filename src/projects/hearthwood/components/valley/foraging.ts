import { DAY_SECONDS, FIRST_HOUR } from "../../engine/day";
import { makeForage, type Forage, type ForageSpot } from "../../engine/forage";
import type { ForageKind } from "../../engine/regions";
import type { World } from "../../engine/world";
import { emptyForaged, loadForaged, saveForaged, type Basket, type Foraged } from "../../gameplay/basket";
import { pick, regrow } from "../../gameplay/picking";
import type { ValleyClock } from "./clock";

/*
 * A walk's foraging, between the scene, the overlay over it and the probe:
 * what grows where, what has been picked, the spot on offer, and the picks
 * still popping into the basket. The day it is comes from the day of the
 * year the walk began on and the day's turn since; `?doy=<0-365>` begins it
 * on another, until the calendar keeps the date. The overlay reads it as an
 * external store.
 */

/** The day of the year a walk begins on unless told otherwise: late August, when most of the forest is ripe. */
export const DEFAULT_DAY_OF_YEAR = 236;

export interface ForageShown {
  /** The kind on offer to pick, if any. */
  offered: ForageKind | null;
  basket: Basket;
  /** The last kind picked, and how many picks there have been, so the basket can show it arriving. */
  lastPicked: ForageKind | null;
  picks: number;
  /** Whether the basket is held open. */
  open: boolean;
}

export interface Foraging {
  forage: Forage;
  foraged: Foraged;
  /** The day of the year the walk began on, at the day's turn's start. */
  startDay: number;
  /** The spot on offer, set by the scene each frame. */
  target: ForageSpot | null;
  /** Picks the scene has yet to show popping into the basket. */
  popping: ForageSpot[];
  /** What a tap on the screen picks, given to it by the scene, which knows the camera. */
  tapAt: ((x: number, y: number) => ForageSpot | null) | null;
  /** Whether everything the camera wants is placed and drawn. */
  settled: boolean;
  shown: ForageShown;
  listeners: Set<() => void>;
}

export function readDayOfYear(search: string): number {
  const doy = new URLSearchParams(search).get("doy");
  if (doy === null) return DEFAULT_DAY_OF_YEAR;
  const day = Number(doy);
  if (!(Number.isInteger(day) && day >= 0 && day <= 365)) throw new Error(`?doy must be a whole day of the year, 0 to 365, not ${doy}`);
  return day;
}

export function createForaging(world: World, startDay: number): Foraging {
  const foraged = loadForaged();
  return {
    forage: makeForage(world),
    foraged,
    startDay,
    target: null,
    popping: [],
    tapAt: null,
    settled: false,
    shown: { offered: null, basket: foraged.basket, lastPicked: null, picks: 0, open: false },
    listeners: new Set(),
  };
}

/** The running count of days now, fractional through the day. */
export function forageDay(foraging: Foraging, clock: ValleyClock): number {
  return foraging.startDay + FIRST_HOUR / 24 + clock.day / DAY_SECONDS;
}

function show(foraging: Foraging, change: Partial<ForageShown>): void {
  foraging.shown = { ...foraging.shown, ...change };
  for (const listener of foraging.listeners) listener();
}

export function subscribeForaging(foraging: Foraging, listener: () => void): () => void {
  foraging.listeners.add(listener);
  return () => {
    foraging.listeners.delete(listener);
  };
}

/** The scene says what a tap on the screen picks, or that nothing can be tapped. */
export function answerTaps(foraging: Foraging, tapAt: Foraging["tapAt"]): void {
  foraging.tapAt = tapAt;
}

/** The scene says whether everything the camera wants is placed and drawn. */
export function reportSettled(foraging: Foraging, settled: boolean): void {
  foraging.settled = settled;
}

/** The picks the scene is yet to show popping into the basket, handed over once. */
export function takePopping(foraging: Foraging): ForageSpot[] {
  return foraging.popping.splice(0);
}

/** The scene has found what is on offer this frame. */
export function offer(foraging: Foraging, spot: ForageSpot | null): void {
  foraging.target = spot;
  const offered = spot?.kind ?? null;
  if (offered !== foraging.shown.offered) show(foraging, { offered });
}

export function pickSpot(foraging: Foraging, spot: ForageSpot, day: number): void {
  foraging.foraged = regrow(pick(foraging.foraged, spot, day), day);
  saveForaged(foraging.foraged);
  foraging.popping.push(spot);
  if (foraging.target === spot) offer(foraging, null);
  show(foraging, { basket: foraging.foraged.basket, lastPicked: spot.kind, picks: foraging.shown.picks + 1 });
}

export function setBasketOpen(foraging: Foraging, open: boolean): void {
  show(foraging, { open });
}

/** Begins today on another day of the year, the day's turn going on from where it is. */
export function setDayOfYear(foraging: Foraging, clock: ValleyClock, dayOfYear: number): void {
  foraging.startDay = dayOfYear - Math.floor(FIRST_HOUR / 24 + clock.day / DAY_SECONDS);
}

/** Empties the basket and forgets every pick, here and on the device. */
export function forgetForaging(foraging: Foraging): void {
  foraging.foraged = emptyForaged();
  saveForaged(foraging.foraged);
  show(foraging, { basket: foraging.foraged.basket, lastPicked: null });
}
