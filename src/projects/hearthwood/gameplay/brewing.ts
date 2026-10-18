import type { Moon, Sun } from "../engine/astronomy";
import type { Basket } from "./basket";
import { ALL_BREWS, BREW_FORMS, brewOf, charmOf, CHARMS, fitsForm, formOf, isForageKind, MOST_IN_A_BREW, type BrewForm, type BrewId, type BrewIngredient, type Charm } from "./brews";
import type { ForageKind } from "../engine/regions";

/*
 * Brewing, as rules: what it remembers (the teas and salves in the basket,
 * every brew ever made, which the brew book shows, the ones made under a
 * full moon, and the charms at work), and a turn at the cauldron, the
 * sibling of cooking's turn at the pan: choosing a few things and a way to
 * brew them, the short while it brews, and the brew made. It never fails
 * and never wastes: what the forest gave goes into the brew the moment it
 * starts, and the brew is made with it, so nothing is lost halfway.
 *
 * A charm is worked as it is made: it hangs from camp's tripod, or is tied
 * at Elliott's belt, and does its gentle thing for a while (a few days of
 * flowers round camp, fireflies tonight, a day's hush, half a day's
 * clearing of the mist), coming on softly and fading softly at the end.
 * Made again while it works, it lasts on from then.
 *
 * The full moon is a gentle bonus, never needed: whatever is brewed while
 * it is up at night is moon-blessed (the book marks it), and a charm made
 * so works twice as long.
 */

export interface CharmAtWork {
  /** When it was worked, and when it is spent: game days since the calendar began. */
  from: number;
  until: number;
  /** Worked under a full moon. */
  moonlit: boolean;
}

export interface Satchel {
  /** The teas and salves in the basket, by how many of each. */
  brews: Partial<Record<BrewId, number>>;
  /** Every brew made at least once, in the order first made: the brew book's. */
  known: BrewId[];
  /** Every brew made at least once under a full moon. */
  moonlit: BrewId[];
  /** The charms at work. */
  charms: Partial<Record<Charm, CharmAtWork>>;
}

/** How long a brew takes, in seconds: long enough to watch the steam turn its colour, never long enough to wait. */
export const BREWING_SECONDS = 4.2;

/** How long each charm works, in game days, before the moon doubles it; the fireflies' is tonight, worked out from the hour. */
export const CHARM_DAYS: Record<Exclude<Charm, "fireflies">, number> = { bloom: 3, hush: 1, clearing: 0.5 };

/** How long a charm takes to come on, and to fade at its end, in game days. */
const COMES_ON = 0.04;
const FADES = 0.15;

/** The hour the fireflies leave in the morning, as a fraction of a day. */
const MORNING = 0.25;

export function emptySatchel(): Satchel {
  return { brews: {}, known: [], moonlit: [], charms: {} };
}

export const brewCount = (satchel: Satchel, brew: BrewId) => satchel.brews[brew] ?? 0;

/** The brews in the basket, in the book's order. */
export function brewsIn(satchel: Satchel): BrewId[] {
  return ALL_BREWS.filter((b) => brewCount(satchel, b) > 0);
}

/** When a charm worked at `days` is spent: its days on (twice under a full moon), or for the fireflies the next morning (a night more under a full moon). */
export function charmUntil(charm: Charm, days: number, moonlit: boolean): number {
  if (charm === "fireflies") return Math.floor(days - MORNING) + 1 + MORNING + (moonlit ? 1 : 0);
  return days + CHARM_DAYS[charm] * (moonlit ? 2 : 1);
}

/** A charm worked at `days`: at work from now, or, already working, on from now. */
export function workCharm(satchel: Satchel, charm: Charm, days: number, moonlit: boolean): Satchel {
  const working = satchel.charms[charm];
  const live = working !== undefined && days >= working.from && days < working.until;
  const until = Math.max(charmUntil(charm, days, moonlit), live ? working.until : -Infinity);
  return { ...satchel, charms: { ...satchel.charms, [charm]: { from: live ? working.from : days, until, moonlit: moonlit || (live && working.moonlit) } } };
}

/** How strongly a charm works at `days`, 0 to 1: coming on softly, fading softly at its end, nothing before or after. */
export function charmStrength(satchel: Satchel, charm: Charm, days: number): number {
  const working = satchel.charms[charm];
  if (working === undefined || days < working.from || days >= working.until) return 0;
  const on = Math.min(1, (days - working.from) / COMES_ON);
  const off = Math.min(1, (working.until - days) / FADES);
  return Math.min(on, off);
}

/** The charms at work at `days`. */
export function charmsAtWork(satchel: Satchel, days: number): Charm[] {
  return CHARMS.filter((c) => charmStrength(satchel, c, days) > 0);
}

/** How much quicker a shy animal warms to Elliott while the hush charm works: up to two and a half times. */
export function hushOf(satchel: Satchel, days: number): number {
  return 1 + 1.5 * charmStrength(satchel, "hush", days);
}

/** A brew made at `days`: a tea or a salve into the basket, a charm set to work; in the book if it is new, and marked if the moon was full. */
export function addBrew(satchel: Satchel, brew: BrewId, days: number, moonlit: boolean): { satchel: Satchel; discovered: boolean } {
  const discovered = !satchel.known.includes(brew);
  let out: Satchel = { ...satchel, known: discovered ? [...satchel.known, brew] : satchel.known, moonlit: moonlit && !satchel.moonlit.includes(brew) ? [...satchel.moonlit, brew] : satchel.moonlit };
  const charm = charmOf(brew);
  if (charm) out = workCharm(out, charm, days, moonlit);
  else if (formOf(brew) !== "charm") out = { ...out, brews: { ...out.brews, [brew]: brewCount(satchel, brew) + 1 } };
  return { satchel: out, discovered };
}

/** A tea or a salve out of the basket, given to someone. */
export function takeBrew(satchel: Satchel, brew: BrewId): Satchel {
  const count = brewCount(satchel, brew);
  if (count <= 0) throw new Error(`The basket holds no ${brew} to take`);
  const brews = { ...satchel.brews };
  if (count === 1) delete brews[brew];
  else brews[brew] = count - 1;
  return { ...satchel, brews };
}

/** A full moon up in the night sky: most of its face lit, above the horizon, the sun gone down past the twilight's first glow. */
export function underFullMoon(moon: Pick<Moon, "illuminated" | "elevation">, sun: Pick<Sun, "elevation">): boolean {
  return moon.illuminated >= 0.9 && moon.elevation > 0 && sun.elevation < -6;
}

/** A turn at the cauldron: choosing, then brewing for a short while from `since` (seconds on the hearth's clock), then the brew made. */
export type BrewSession =
  | { phase: "choosing"; chosen: BrewIngredient[]; form: BrewForm }
  | { phase: "brewing"; chosen: BrewIngredient[]; form: BrewForm; brew: BrewId; discovered: boolean; moonlit: boolean; since: number }
  | { phase: "brewed"; chosen: BrewIngredient[]; form: BrewForm; brew: BrewId; discovered: boolean; moonlit: boolean };

/** A turn at the cauldron begins with nothing chosen, for a tea. */
export function beginBrewing(form: BrewForm = "tea"): BrewSession {
  return { phase: "choosing", chosen: [], form };
}

/** Whether something is to hand for brewing: a staple always, the forest's while the basket holds one. */
export const brewToHand = (ingredient: BrewIngredient, basket: Basket) => !isForageKind(ingredient) || basket[ingredient] > 0;

/** A thing tapped while choosing: put back if it was chosen, else added if there is room, it is to hand and it suits the way. */
export function toggleBrewIngredient(session: BrewSession, ingredient: BrewIngredient, basket: Basket): BrewSession {
  if (session.phase !== "choosing") return session;
  if (session.chosen.includes(ingredient)) return { ...session, chosen: session.chosen.filter((i) => i !== ingredient) };
  if (session.chosen.length >= MOST_IN_A_BREW || !brewToHand(ingredient, basket) || !fitsForm(ingredient, session.form)) return session;
  return { ...session, chosen: [...session.chosen, ingredient] };
}

/** The way to brew chosen: what doesn't suit it is put back (the fly agaric out of a tea). */
export function chooseForm(session: BrewSession, form: BrewForm): BrewSession {
  if (!(BREW_FORMS as readonly string[]).includes(form)) throw new Error(`${form} is no way to brew`);
  return session.phase === "choosing" ? { ...session, form, chosen: session.chosen.filter((i) => fitsForm(i, form)) } : session;
}

/** Whether what is chosen can be brewed: something from the forest, all of it to hand. */
export function canBrew(session: BrewSession, basket: Basket): boolean {
  return session.phase === "choosing" && session.chosen.some(isForageKind) && session.chosen.every((i) => brewToHand(i, basket));
}

/** What a turn uses up from the basket. */
export const forageOf = (session: BrewSession): ForageKind[] => session.chosen.filter(isForageKind);

/** What is chosen goes into the cauldron at `now`: the brew it makes is made from this moment, at `days` of the calendar, under a full moon or not. */
export function startBrewing(session: BrewSession, basket: Basket, satchel: Satchel, now: number, days: number, moonlit: boolean): { session: BrewSession; satchel: Satchel } {
  if (session.phase !== "choosing" || !canBrew(session, basket)) throw new Error(`Nothing to brew: ${session.chosen.join(", ") || "nothing chosen"}`);
  const brew = brewOf(session.chosen, session.form);
  const added = addBrew(satchel, brew, days, moonlit);
  return { session: { ...session, phase: "brewing", brew, discovered: added.discovered, moonlit, since: now }, satchel: added.satchel };
}

/** How far a brew has come, 0 to 1. */
export function brewedSoFar(session: BrewSession, now: number): number {
  if (session.phase === "choosing") return 0;
  if (session.phase === "brewed") return 1;
  return Math.min(1, Math.max(0, (now - session.since) / BREWING_SECONDS));
}

/** The turn moved on to `now`: a brew come through is made. */
export function stepBrewing(session: BrewSession, now: number): BrewSession {
  if (session.phase !== "brewing" || brewedSoFar(session, now) < 1) return session;
  return { phase: "brewed", chosen: session.chosen, form: session.form, brew: session.brew, discovered: session.discovered, moonlit: session.moonlit };
}

/** Another brew after one made: the same way, and the same things as far as they are still to hand. */
export function brewAgain(session: BrewSession, basket: Basket): BrewSession {
  if (session.phase !== "brewed") return session;
  return { phase: "choosing", form: session.form, chosen: session.chosen.filter((i) => brewToHand(i, basket)) };
}
