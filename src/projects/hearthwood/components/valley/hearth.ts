import {
  addDish,
  beginSession,
  canCook,
  chooseCookware,
  cookAgain,
  cooked,
  emptyLarder,
  foodsOf,
  loadLarder,
  saveLarder,
  startCooking,
  stepSession,
  takeDish,
  toggleIngredient,
  type Larder,
  type Session,
} from "../../gameplay/cooking";
import type { Offerable } from "../../gameplay/offering";
import type { Cookware, DishId, Ingredient } from "../../gameplay/recipes";
import {
  addBrew,
  beginBrewing,
  brewAgain,
  brewedSoFar,
  canBrew,
  chooseForm,
  emptySatchel,
  forageOf,
  hushOf,
  loadSatchel,
  saveSatchel,
  startBrewing,
  stepBrewing,
  takeBrew,
  toggleBrewIngredient,
  workCharm,
  type BrewSession,
  type Satchel,
} from "../../gameplay/brewing";
import type { BrewForm, BrewId, BrewIngredient, Charm } from "../../gameplay/brews";
import { packUpCamp, pitchedSite, type Camping } from "./camping";
import { takeIngredients, type Foraging } from "./foraging";

/*
 * Cooking and brewing at the camp's fire, between the scene, the overlay
 * over it and the probe: whether the fire is offered, a turn at it (cooking
 * or brewing, whichever Elliott chose last: what is chosen, the dish
 * cooking or the brew brewing, and what is made), the recipe book and the
 * brew book, the larder (the dishes in the basket and every dish ever
 * made) and the satchel (the teas and salves, every brew ever made, and the
 * charms at work), each kept on the device. The scene steps the hearth's
 * clock each frame, tells it the calendar's day and whether a full moon is
 * up, and moves the camera to the fire while a turn is on; the overlay
 * reads what is shown as an external store.
 */

/** Cooking or brewing: the two crafts that share a turn at the fire. */
export type Craft = "cook" | "brew";

export interface HearthShown {
  /** Whether the fire is offered to cook at. */
  offered: boolean;
  /** A turn at the fire, while one is on. */
  session: Session | null;
  /** Whether the book of the craft at hand (the recipe book or the brew book) is open. */
  book: boolean;
  larder: Larder;
  /** How many dishes have been served, and the last, so the basket can show one arriving. */
  served: number;
  lastServed: DishId | null;
  /** The craft at hand: cooking or brewing, kept from one turn to the next. */
  craft: Craft;
  /** A turn at the cauldron, beside the turn at the pan, while one is on. */
  brewing: BrewSession | null;
  satchel: Satchel;
  /** How many brews have been made, and the last, so the basket can show one arriving. */
  brewed: number;
  lastBrewed: BrewId | null;
  /** Whether a full moon is up, so the card can show its blessing. */
  fullMoon: boolean;
}

export interface Hearth {
  /** Where camp is, and so the fire, or that it is carried. */
  camping: Camping;
  foraging: Foraging;
  /** How strongly the fire is offered this frame, before forage and the animals have their say, or null where it isn't. */
  candidate: number | null;
  /** The hearth's clock, in seconds: what a dish cooks by, stepped by the scene. */
  time: number;
  /** Held, a dish stays this far cooked (0 to 1), for screenshots; null lets it cook. */
  heldCooking: number | null;
  /** The calendar's game days now, which the charms are timed by, told by the scene. */
  days: number;
  /** What a tap on the screen says of the fire, given by the scene, which knows the camera. */
  tapAt: ((x: number, y: number) => boolean) | null;
  shown: HearthShown;
  listeners: Set<() => void>;
}

export function createHearth(camping: Camping, foraging: Foraging): Hearth {
  return {
    camping,
    foraging,
    candidate: null,
    time: 0,
    heldCooking: null,
    days: 0,
    tapAt: null,
    shown: { offered: false, session: null, book: false, larder: loadLarder(), served: 0, lastServed: null, craft: "cook", brewing: null, satchel: loadSatchel(), brewed: 0, lastBrewed: null, fullMoon: false },
    listeners: new Set(),
  };
}

function show(hearth: Hearth, change: Partial<HearthShown>): void {
  hearth.shown = { ...hearth.shown, ...change };
  for (const listener of hearth.listeners) listener();
}

export function subscribeHearth(hearth: Hearth, listener: () => void): () => void {
  hearth.listeners.add(listener);
  return () => {
    hearth.listeners.delete(listener);
  };
}

/** The scene says what a tap on the screen says of the fire, or that it can't be tapped. */
export function answerFireTaps(hearth: Hearth, tapAt: Hearth["tapAt"]): void {
  hearth.tapAt = tapAt;
}

/** The fire as something offered, like a berry or a cat: aimed at over its flames, reached from a few steps off; nothing while camp is carried. */
export function offerableFire(hearth: Hearth): Offerable | null {
  const camp = pitchedSite(hearth.camping);
  if (camp === null) return null;
  return { heart: { x: camp.x, y: camp.y + 0.55, z: camp.z }, spread: 0.75, reach: { first: 4.2, third: 3.4 } };
}

/** After forage and the animals have had their say: whether the fire is offered now. */
export function settleFire(hearth: Hearth, othersOffered: boolean): void {
  const offered = !othersOffered && hearth.shown.session === null && hearth.candidate !== null;
  if (offered !== hearth.shown.offered) show(hearth, { offered });
}

/** Sits down at the fire, to cook or brew, whichever was done last. */
export function openCooking(hearth: Hearth): void {
  if (hearth.shown.session !== null) return;
  show(hearth, { session: beginSession(), brewing: beginBrewing(), offered: false, book: false });
}

/** Gets up from the fire; a dish still cooking or a brew still brewing is made already, so it is never lost. */
export function closeCooking(hearth: Hearth): void {
  show(hearth, { session: null, brewing: null, book: false });
}

/** Gets up from the fire and packs camp up, to pitch it somewhere new; never while something is over the flames. */
export function packUpFromTheFire(hearth: Hearth): void {
  if (busyAtTheFire(hearth)) return;
  closeCooking(hearth);
  packUpCamp(hearth.camping);
}

/** Whether the turn at the fire is busy over the flames, cooking or brewing, so the craft can't change. */
export const busyAtTheFire = (hearth: Hearth) => hearth.shown.session?.phase === "cooking" || hearth.shown.brewing?.phase === "brewing";

/** Turns from cooking to brewing or back, between dishes and brews. */
export function setCraft(hearth: Hearth, craft: Craft): void {
  if (busyAtTheFire(hearth) || craft === hearth.shown.craft) return;
  show(hearth, { craft, book: false });
}

function session(hearth: Hearth): Session {
  const s = hearth.shown.session;
  if (s === null) throw new Error("No turn at the fire is on");
  return s;
}

export function chooseIngredient(hearth: Hearth, ingredient: Ingredient): void {
  show(hearth, { session: toggleIngredient(session(hearth), ingredient, hearth.foraging.foraged.basket) });
}

export function chooseWay(hearth: Hearth, cookware: Cookware): void {
  show(hearth, { session: chooseCookware(session(hearth), cookware) });
}

export const readyToCook = (hearth: Hearth) => hearth.shown.session !== null && canCook(hearth.shown.session, hearth.foraging.foraged.basket);

/** What is chosen goes over the fire: the food comes out of the basket and the dish it makes goes in, both at once. */
export function cook(hearth: Hearth): void {
  const started = startCooking(session(hearth), hearth.foraging.foraged.basket, hearth.shown.larder, hearth.time);
  takeIngredients(hearth.foraging, foodsOf(started.session));
  saveLarder(started.larder);
  show(hearth, { session: started.session, larder: started.larder, book: false });
}

/** How far the dish on the fire has cooked, 0 to 1. */
export function cookedSoFar(hearth: Hearth): number {
  const s = hearth.shown.session;
  if (s === null) return 0;
  if (s.phase === "cooking" && hearth.heldCooking !== null) return hearth.heldCooking;
  return cooked(s, hearth.time);
}

/** The hearth's clock moves on; a dish cooked through is served and a brew come through is made, each showing arriving in the basket. */
export function stepHearth(hearth: Hearth, seconds: number): void {
  if (hearth.heldCooking === null) hearth.time += seconds;
  if (hearth.heldCooking !== null) return;
  const s = hearth.shown.session;
  if (s?.phase === "cooking") {
    const next = stepSession(s, hearth.time);
    if (next.phase === "served") show(hearth, { session: next, served: hearth.shown.served + 1, lastServed: next.dish });
  }
  const b = hearth.shown.brewing;
  if (b?.phase === "brewing") {
    const next = stepBrewing(b, hearth.time);
    if (next.phase === "brewed") show(hearth, { brewing: next, brewed: hearth.shown.brewed + 1, lastBrewed: next.brew });
  }
}

/** The scene tells the hearth the calendar's day and whether a full moon is up. */
export function tellHearthSky(hearth: Hearth, days: number, fullMoon: boolean): void {
  hearth.days = days;
  if (fullMoon !== hearth.shown.fullMoon) show(hearth, { fullMoon });
}

function brewSession(hearth: Hearth): BrewSession {
  const s = hearth.shown.brewing;
  if (s === null) throw new Error("No turn at the cauldron is on");
  return s;
}

export function chooseBrewIngredient(hearth: Hearth, ingredient: BrewIngredient): void {
  show(hearth, { brewing: toggleBrewIngredient(brewSession(hearth), ingredient, hearth.foraging.foraged.basket) });
}

export function chooseBrewForm(hearth: Hearth, form: BrewForm): void {
  show(hearth, { brewing: chooseForm(brewSession(hearth), form) });
}

export const readyToBrew = (hearth: Hearth) => hearth.shown.brewing !== null && canBrew(hearth.shown.brewing, hearth.foraging.foraged.basket);

/** What is chosen goes into the cauldron: what the forest gave comes out of the basket and the brew is made, both at once. */
export function brew(hearth: Hearth): void {
  const started = startBrewing(brewSession(hearth), hearth.foraging.foraged.basket, hearth.shown.satchel, hearth.time, hearth.days, hearth.shown.fullMoon);
  takeIngredients(hearth.foraging, forageOf(started.session));
  saveSatchel(started.satchel);
  show(hearth, { brewing: started.session, satchel: started.satchel, book: false });
}

/** How far the brew in the cauldron has come, 0 to 1. */
export function brewedNow(hearth: Hearth): number {
  const s = hearth.shown.brewing;
  if (s === null) return 0;
  if (s.phase === "brewing" && hearth.heldCooking !== null) return hearth.heldCooking;
  return brewedSoFar(s, hearth.time);
}

/** Another brew after one made. */
export function brewMore(hearth: Hearth): void {
  show(hearth, { brewing: brewAgain(brewSession(hearth), hearth.foraging.foraged.basket) });
}

/** How much quicker a shy animal warms to Elliott now, by the hush charm. */
export const hushNow = (hearth: Hearth) => hushOf(hearth.shown.satchel, hearth.days);

/** Puts a brew in the basket (or sets its charm to work) as if it had been brewed now: for screenshots and tests. */
export function stockBrew(hearth: Hearth, brewId: BrewId, count = 1, moonlit = false): void {
  let satchel = hearth.shown.satchel;
  for (let n = 0; n < count; n++) satchel = addBrew(satchel, brewId, hearth.days, moonlit).satchel;
  saveSatchel(satchel);
  show(hearth, { satchel });
}

/** Sets a charm to work from a given day, as if brewed then: for screenshots and tests. */
export function workCharmFrom(hearth: Hearth, charm: Charm, days: number, moonlit = false): void {
  const satchel = workCharm(hearth.shown.satchel, charm, days, moonlit);
  saveSatchel(satchel);
  show(hearth, { satchel });
}

/** Empties the satchel and the brew book, here and on the device. */
export function forgetBrewing(hearth: Hearth): void {
  const satchel = emptySatchel();
  saveSatchel(satchel);
  show(hearth, { satchel, brewing: hearth.shown.session === null ? null : beginBrewing(), book: false });
}

/** Another dish after one served. */
export function cookMore(hearth: Hearth): void {
  show(hearth, { session: cookAgain(session(hearth), hearth.foraging.foraged.basket) });
}

export function setBookOpen(hearth: Hearth, open: boolean): void {
  show(hearth, { book: open });
}

/** One tea or salve taken from the basket, given to someone. */
export function giveBrew(hearth: Hearth, brew: BrewId): void {
  const satchel = takeBrew(hearth.shown.satchel, brew);
  saveSatchel(satchel);
  show(hearth, { satchel });
}

/** One dish taken from the basket, given to an animal or a person. */
export function giveDish(hearth: Hearth, dish: DishId): void {
  const larder = takeDish(hearth.shown.larder, dish);
  saveLarder(larder);
  show(hearth, { larder });
}

/** Holds a dish cooking at a point, or lets it cook on with null: for screenshots. */
export function holdCooking(hearth: Hearth, at: number | null): void {
  hearth.heldCooking = at;
}

/** Puts a dish in the basket as if it had been cooked: for screenshots and tests. */
export function stockDish(hearth: Hearth, dish: DishId, count = 1): void {
  let larder = hearth.shown.larder;
  for (let n = 0; n < count; n++) larder = addDish(larder, dish).larder;
  saveLarder(larder);
  show(hearth, { larder });
}

/** Empties the larder and the recipe book, here and on the device. */
export function forgetCooking(hearth: Hearth): void {
  const larder = emptyLarder();
  saveLarder(larder);
  show(hearth, { larder, session: null, book: false });
}
