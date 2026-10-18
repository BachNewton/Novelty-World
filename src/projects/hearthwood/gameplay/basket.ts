import { FORAGE_KINDS, type ForageKind } from "../engine/regions";

/*
 * What foraging remembers: the basket (how many of each kind Elliott has
 * picked) and the spots picked, each by its id with the day it was picked,
 * so it can grow back. Nothing else about the world is kept: every spot
 * comes back the same from the seed. It lasts only this visit: every visit
 * starts with an empty basket.
 */

export type Basket = Record<ForageKind, number>;

export interface Foraged {
  basket: Basket;
  /** Each picked spot's id, with the game day (since the calendar began, fractional) it was picked. */
  picked: Record<string, number>;
}

export function emptyBasket(): Basket {
  return Object.fromEntries(FORAGE_KINDS.map((k) => [k, 0])) as Basket;
}

export function emptyForaged(): Foraged {
  return { basket: emptyBasket(), picked: {} };
}

/** How many things are in the basket, of every kind. */
export function basketTotal(basket: Basket): number {
  return FORAGE_KINDS.reduce((sum, k) => sum + basket[k], 0);
}

/** One of a kind taken out of the basket (a treat given), which must hold one. */
export function takeOne(foraged: Foraged, kind: ForageKind): Foraged {
  if (foraged.basket[kind] <= 0) throw new Error(`The basket holds no ${kind} to take`);
  return { basket: { ...foraged.basket, [kind]: foraged.basket[kind] - 1 }, picked: foraged.picked };
}
