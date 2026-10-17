import { gameDayOfReal } from "../../engine/calendar";
import { makeForage, type Forage, type ForageSpot } from "../../engine/forage";
import type { ForageKind } from "../../engine/regions";
import type { World } from "../../engine/world";
import { emptyForaged, loadForaged, saveForaged, type Basket, type Foraged } from "../../gameplay/basket";
import { pick, regrow, type ForageTime } from "../../gameplay/picking";
import { setDay, type ValleyClock } from "./clock";

/*
 * A walk's foraging, between the scene, the overlay over it and the probe:
 * what grows where, what has been picked, the spot on offer, and the picks
 * still popping into the basket. When it is comes from the valley's
 * calendar. The overlay reads it as an external store.
 */

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

export function createForaging(world: World): Foraging {
  const foraged = loadForaged();
  return {
    forage: makeForage(world),
    foraged,
    target: null,
    popping: [],
    tapAt: null,
    settled: false,
    shown: { offered: null, basket: foraged.basket, lastPicked: null, picks: 0, open: false },
    listeners: new Set(),
  };
}

/** When it is now, for foraging: the calendar's day, and the real day of the year it stands for. */
export function forageTime(clock: ValleyClock): ForageTime {
  return { day: clock.date.days, dayOfYear: clock.date.realDayOfYear };
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

export function pickSpot(foraging: Foraging, spot: ForageSpot, time: ForageTime): void {
  foraging.foraged = regrow(pick(foraging.foraged, spot, time), time.day);
  saveForaged(foraging.foraged);
  foraging.popping.push(spot);
  if (foraging.target === spot) offer(foraging, null);
  show(foraging, { basket: foraging.foraged.basket, lastPicked: spot.kind, picks: foraging.shown.picks + 1 });
}

export function setBasketOpen(foraging: Foraging, open: boolean): void {
  show(foraging, { open });
}

/** Moves the calendar to the game day this year that stands for a real day of the year, for looking at a season's forage. */
export function goToDayOfYear(clock: ValleyClock, dayOfYear: number): void {
  setDay(clock, clock.date.day - clock.date.dayOfYear + gameDayOfReal(dayOfYear));
}

/** Empties the basket and forgets every pick, here and on the device. */
export function forgetForaging(foraging: Foraging): void {
  foraging.foraged = emptyForaged();
  saveForaged(foraging.foraged);
  show(foraging, { basket: foraging.foraged.basket, lastPicked: null });
}
