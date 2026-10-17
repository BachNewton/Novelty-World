import type { World } from "../../engine/world";
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
import { takeIngredients, type Foraging } from "./foraging";

/*
 * Cooking at the camp's fire, between the scene, the overlay over it and
 * the probe: whether the fire is offered to cook at, a turn at it (what is
 * chosen, the dish cooking and the dish served), the recipe book, and the
 * larder (the dishes in the basket and every dish ever made), kept on the
 * device. The scene steps the hearth's clock each frame and moves the
 * camera to the fire while a turn is on; the overlay reads what is shown as
 * an external store.
 */

export interface HearthShown {
  /** Whether the fire is offered to cook at. */
  offered: boolean;
  /** A turn at the fire, while one is on. */
  session: Session | null;
  /** Whether the recipe book is open. */
  book: boolean;
  larder: Larder;
  /** How many dishes have been served, and the last, so the basket can show one arriving. */
  served: number;
  lastServed: DishId | null;
}

export interface Hearth {
  camp: { x: number; y: number; z: number };
  foraging: Foraging;
  /** How strongly the fire is offered this frame, before forage and the animals have their say, or null where it isn't. */
  candidate: number | null;
  /** The hearth's clock, in seconds: what a dish cooks by, stepped by the scene. */
  time: number;
  /** Held, a dish stays this far cooked (0 to 1), for screenshots; null lets it cook. */
  heldCooking: number | null;
  /** What a tap on the screen says of the fire, given by the scene, which knows the camera. */
  tapAt: ((x: number, y: number) => boolean) | null;
  shown: HearthShown;
  listeners: Set<() => void>;
}

export function createHearth(world: World, foraging: Foraging): Hearth {
  return {
    camp: world.camp,
    foraging,
    candidate: null,
    time: 0,
    heldCooking: null,
    tapAt: null,
    shown: { offered: false, session: null, book: false, larder: loadLarder(), served: 0, lastServed: null },
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

/** The fire as something offered, like a berry or a cat: aimed at over its flames, reached from a few steps off. */
export function offerableFire(hearth: Hearth): Offerable {
  const { camp } = hearth;
  return { heart: { x: camp.x, y: camp.y + 0.55, z: camp.z }, spread: 0.75, reach: { first: 4.2, third: 3.4 } };
}

/** After forage and the animals have had their say: whether the fire is offered now. */
export function settleFire(hearth: Hearth, othersOffered: boolean): void {
  const offered = !othersOffered && hearth.shown.session === null && hearth.candidate !== null;
  if (offered !== hearth.shown.offered) show(hearth, { offered });
}

/** Sits down at the fire to cook. */
export function openCooking(hearth: Hearth): void {
  if (hearth.shown.session !== null) return;
  show(hearth, { session: beginSession(), offered: false, book: false });
}

/** Gets up from the fire; a dish still cooking is in the basket already, so it is never lost. */
export function closeCooking(hearth: Hearth): void {
  show(hearth, { session: null, book: false });
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

/** The hearth's clock moves on; a dish cooked through is served, and shows arriving in the basket. */
export function stepHearth(hearth: Hearth, seconds: number): void {
  if (hearth.heldCooking === null) hearth.time += seconds;
  const s = hearth.shown.session;
  if (s?.phase !== "cooking" || hearth.heldCooking !== null) return;
  const next = stepSession(s, hearth.time);
  if (next.phase === "served") show(hearth, { session: next, served: hearth.shown.served + 1, lastServed: next.dish });
}

/** Another dish after one served. */
export function cookMore(hearth: Hearth): void {
  show(hearth, { session: cookAgain(session(hearth), hearth.foraging.foraged.basket) });
}

export function setBookOpen(hearth: Hearth, open: boolean): void {
  show(hearth, { book: open });
}

/** One dish taken from the basket, given to an animal. */
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
