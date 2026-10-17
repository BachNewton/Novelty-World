import { FORAGE_KINDS, type ForageKind } from "../engine/regions";

/*
 * What foraging remembers: the basket (how many of each kind Elliott has
 * picked) and the spots picked, each by its id with the day it was picked,
 * so it can grow back. Nothing else about the world is kept: every spot
 * comes back the same from the seed. Until the game has its own saving, this
 * is kept on the device under a key of its own, which names the shape it is
 * kept in, so a later shape is kept under a new key and never misread.
 */

export type Basket = Record<ForageKind, number>;

export interface Foraged {
  basket: Basket;
  /** Each picked spot's id, with the day (a running count of days) it was picked. */
  picked: Record<string, number>;
}

export const SAVE_KEY = "hearthwood/forage/v1";

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

export function serializeForaged(foraged: Foraged): string {
  return JSON.stringify(foraged);
}

const isCount = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;

/** A kept record read back. Anything but the shape this key holds is a bug in what wrote it, and says so. */
export function parseForaged(text: string): Foraged {
  const data = JSON.parse(text) as { basket?: unknown; picked?: unknown };
  const { basket, picked } = data;
  if (typeof basket !== "object" || basket === null || typeof picked !== "object" || picked === null) throw new Error(`The kept forage under ${SAVE_KEY} isn't a basket and a picked list: ${text}`);
  const out = emptyForaged();
  for (const [kind, count] of Object.entries(basket)) {
    if (!(FORAGE_KINDS as readonly string[]).includes(kind) || !isCount(count)) throw new Error(`The kept basket holds ${String(count)} of ${kind}`);
    out.basket[kind as ForageKind] = count;
  }
  for (const [id, day] of Object.entries(picked)) {
    if (typeof day !== "number" || !Number.isFinite(day)) throw new Error(`The kept picked spot ${id} has no day: ${String(day)}`);
    out.picked[id] = day;
  }
  return out;
}

/** The device's storage, or null where the browser refuses it (a private window, blocked site data). */
function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** What was kept on this device, or an empty basket where nothing was (or the device keeps nothing). */
export function loadForaged(): Foraged {
  let text: string | null = null;
  try {
    text = storage()?.getItem(SAVE_KEY) ?? null;
  } catch {
    // Storage that throws on reading keeps nothing: the walk goes on unsaved.
    return emptyForaged();
  }
  return text === null ? emptyForaged() : parseForaged(text);
}

export function saveForaged(foraged: Foraged): void {
  try {
    storage()?.setItem(SAVE_KEY, serializeForaged(foraged));
  } catch {
    // A full or refused storage keeps nothing; the basket still holds it for this visit.
  }
}
