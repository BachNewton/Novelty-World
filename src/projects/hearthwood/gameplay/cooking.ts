import type { Basket } from "./basket";
import { COOKWARE, DISHES, dishOf, isFood, MOST_INGREDIENTS, type Cookware, type DishId, type Food, type Ingredient } from "./recipes";

/*
 * Cooking, as rules: what it remembers (the dishes in the basket and every
 * dish Elliott has ever made, which the recipe book shows), and a turn at
 * the fire: choosing a few ingredients and a way to cook them, the short
 * while it cooks, and the dish served. A turn never fails and never
 * wastes: what the forest gave goes into the dish the moment it starts
 * cooking, and the dish into the basket with it, so a dish is never lost
 * halfway. Until the game has its own saving, the larder is kept on the
 * device under a key of its own, which names the shape it is kept in.
 */

export interface Larder {
  /** The dishes in the basket, by how many of each. */
  dishes: Partial<Record<DishId, number>>;
  /** Every dish made at least once, in the order first made: the recipe book's. */
  known: DishId[];
}

/** How long a dish cooks, in seconds: long enough to watch it, never long enough to wait. */
export const COOKING_SECONDS = 3.4;

export function emptyLarder(): Larder {
  return { dishes: {}, known: [] };
}

export const dishCount = (larder: Larder, dish: DishId) => larder.dishes[dish] ?? 0;

/** The dishes in the basket, in the book's order. */
export function dishesIn(larder: Larder): DishId[] {
  return DISHES.filter((d) => dishCount(larder, d) > 0);
}

/** A dish made: one more in the basket, and in the book if it is new. */
export function addDish(larder: Larder, dish: DishId): { larder: Larder; discovered: boolean } {
  const discovered = !larder.known.includes(dish);
  return { larder: { dishes: { ...larder.dishes, [dish]: dishCount(larder, dish) + 1 }, known: discovered ? [...larder.known, dish] : larder.known }, discovered };
}

/** One dish taken out of the basket (given to an animal), which must hold one. */
export function takeDish(larder: Larder, dish: DishId): Larder {
  const count = dishCount(larder, dish);
  if (count <= 0) throw new Error(`The basket holds no ${dish} to take`);
  const dishes = { ...larder.dishes };
  if (count === 1) delete dishes[dish];
  else dishes[dish] = count - 1;
  return { ...larder, dishes };
}

/** A turn at the fire: choosing, then cooking for a short while from `since` (seconds on the hearth's clock), then the dish served. */
export type Session =
  | { phase: "choosing"; chosen: Ingredient[]; cookware: Cookware }
  | { phase: "cooking"; chosen: Ingredient[]; cookware: Cookware; dish: DishId; discovered: boolean; since: number }
  | { phase: "served"; chosen: Ingredient[]; cookware: Cookware; dish: DishId; discovered: boolean };

/** A turn begins with nothing chosen, over the pot that hangs over every fire. */
export function beginSession(cookware: Cookware = "pot"): Session {
  return { phase: "choosing", chosen: [], cookware };
}

/** Whether an ingredient is to hand: a staple always, food while the basket holds one. */
export const toHand = (ingredient: Ingredient, basket: Basket) => !isFood(ingredient) || basket[ingredient] > 0;

/** An ingredient tapped while choosing: put back if it was chosen, else added if there is room and it is to hand. */
export function toggleIngredient(session: Session, ingredient: Ingredient, basket: Basket): Session {
  if (session.phase !== "choosing") return session;
  if (session.chosen.includes(ingredient)) return { ...session, chosen: session.chosen.filter((i) => i !== ingredient) };
  if (session.chosen.length >= MOST_INGREDIENTS || !toHand(ingredient, basket)) return session;
  return { ...session, chosen: [...session.chosen, ingredient] };
}

export function chooseCookware(session: Session, cookware: Cookware): Session {
  if (!(COOKWARE as readonly string[]).includes(cookware)) throw new Error(`${cookware} is no way to cook`);
  return session.phase === "choosing" ? { ...session, cookware } : session;
}

/** Whether what is chosen can be cooked: something from the forest, all of it to hand. */
export function canCook(session: Session, basket: Basket): boolean {
  return session.phase === "choosing" && session.chosen.some(isFood) && session.chosen.every((i) => toHand(i, basket));
}

/** The food a turn uses up from the basket. */
export const foodsOf = (session: Session): Food[] => session.chosen.filter(isFood);

/** What is chosen goes over the fire at `now`: the dish it makes is in the larder from this moment. */
export function startCooking(session: Session, basket: Basket, larder: Larder, now: number): { session: Session; larder: Larder } {
  if (session.phase !== "choosing" || !canCook(session, basket)) throw new Error(`Nothing to cook: ${session.chosen.join(", ") || "nothing chosen"}`);
  const dish = dishOf(session.chosen, session.cookware);
  const added = addDish(larder, dish);
  return { session: { ...session, phase: "cooking", dish, discovered: added.discovered, since: now }, larder: added.larder };
}

/** How far a dish has cooked, 0 to 1. */
export function cooked(session: Session, now: number): number {
  if (session.phase === "choosing") return 0;
  if (session.phase === "served") return 1;
  return Math.min(1, Math.max(0, (now - session.since) / COOKING_SECONDS));
}

/** The turn moved on to `now`: a dish cooked through is served. */
export function stepSession(session: Session, now: number): Session {
  if (session.phase !== "cooking" || cooked(session, now) < 1) return session;
  return { phase: "served", chosen: session.chosen, cookware: session.cookware, dish: session.dish, discovered: session.discovered };
}

/** Another dish after one served: the same way of cooking, and the same ingredients as far as they are still to hand. */
export function cookAgain(session: Session, basket: Basket): Session {
  if (session.phase !== "served") return session;
  return { phase: "choosing", cookware: session.cookware, chosen: session.chosen.filter((i) => toHand(i, basket)) };
}
