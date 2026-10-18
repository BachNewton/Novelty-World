import { FORAGE_FORM, inSeason, type ForageSpot } from "../engine/forage";
import type { ForageKind } from "../engine/regions";
import type { Foraged } from "./basket";
import { bestOffered, type Offerable, type Point3, type Viewer } from "./offering";

/*
 * Picking, as rules: which spot Elliott is looking at and can reach, whether
 * it can be picked (ripe, and not picked lately), what picking it does (one
 * more in the basket, and the spot remembered as picked that day) and when a
 * picked spot grows back (some days on, if it is in season then). Time is
 * the calendar's: the game days since it began, which a picked spot counts
 * to grow back, and the real day of the year a game day stands for, which
 * says what is in season.
 */

/** How many game days a picked spot takes to grow back: about a month of the real year it stands for. */
export const REGROW_DAYS = 2;

/** When it is, for foraging. */
export interface ForageTime {
  /** Game days since the calendar began, fractional through the day. */
  day: number;
  /** The real day of the year the day stands for, 0 (1 January) to 365. */
  dayOfYear: number;
}

/** How far Elliott can reach, in metres: from their eyes in first person, from where they stand in third, and to a spot tapped. */
export const REACH = { first: 3, third: 2.2, tap: 3.4 } as const;

/** How high above the ground each kind's middle is as drawn, in metres: where the eye aims at it. */
const HEART: Record<ForageKind, number> = {
  bilberry: 0.17,
  lingonberry: 0.09,
  "wild-strawberry": 0.1,
  raspberry: 0.6,
  cloudberry: 0.16,
  chanterelle: 0.09,
  porcini: 0.15,
  "funnel-chanterelle": 0.09,
  "fly-agaric": 0.16,
  yarrow: 0.42,
  meadowsweet: 0.8,
  juniper: 0.55,
};

/** How wide each kind is to the eye as drawn, in metres: looking anywhere across it looks at it. */
const SPREAD: Record<ForageKind, number> = {
  bilberry: 0.35,
  lingonberry: 0.3,
  "wild-strawberry": 0.28,
  raspberry: 0.45,
  cloudberry: 0.28,
  chanterelle: 0.24,
  porcini: 0.22,
  "funnel-chanterelle": 0.25,
  "fly-agaric": 0.2,
  yarrow: 0.3,
  meadowsweet: 0.35,
  juniper: 0.55,
};

export function isPicked(foraged: Foraged, id: string, day: number): boolean {
  const at = foraged.picked[id] as number | undefined;
  return at !== undefined && day - at < REGROW_DAYS;
}

export function isRipe(spot: ForageSpot, time: ForageTime): boolean {
  return inSeason(spot.kind, time.dayOfYear, spot.shift);
}

export function canPick(spot: ForageSpot, foraged: Foraged, time: ForageTime): boolean {
  return isRipe(spot, time) && !isPicked(foraged, spot.id, time.day);
}

/** How a spot shows: a bush with its fruit or bare of it; a mushroom grown, cut, or not up at all. */
export type SpotLook = "ripe" | "bare" | "cut" | "none";

export function spotLook(spot: ForageSpot, foraged: Foraged, time: ForageTime): SpotLook {
  const picked = isPicked(foraged, spot.id, time.day);
  if (FORAGE_FORM[spot.kind] === "berry") return !picked && isRipe(spot, time) ? "ripe" : "bare";
  if (picked) return "cut";
  return isRipe(spot, time) ? "ripe" : "none";
}

/** Picking a spot: one more of its kind in the basket, and the spot remembered as picked today. */
export function pick(foraged: Foraged, spot: ForageSpot, time: ForageTime): Foraged {
  if (!canPick(spot, foraged, time)) throw new Error(`${spot.kind} at ${spot.id} can't be picked on day ${time.day} (${time.dayOfYear} of the year)`);
  return { basket: { ...foraged.basket, [spot.kind]: foraged.basket[spot.kind] + 1 }, picked: { ...foraged.picked, [spot.id]: time.day } };
}

/** Forgets the spots that have grown back, so what is kept stays small; the same record when none have. */
export function regrow(foraged: Foraged, day: number): Foraged {
  const kept = Object.entries(foraged.picked).filter(([, at]) => day - at < REGROW_DAYS);
  if (kept.length === Object.keys(foraged.picked).length) return foraged;
  return { basket: foraged.basket, picked: Object.fromEntries(kept) };
}

export type { Viewer } from "./offering";

/** What a spot is to the eye, to be offered by the rule every offered thing shares. */
function offerableSpot(spot: ForageSpot): Offerable {
  return { heart: heartOf(spot), spread: SPREAD[spot.kind] * spot.size, reach: REACH };
}

/**
 * The spot Elliott is looking at and can pick, with how strongly it is
 * offered, if any: in first person the one nearest the middle of the view,
 * in third the nearest one in front of them. Only a spot offered more
 * strongly than `beat` (something else on offer) counts.
 */
export function offeredSpot(spots: readonly ForageSpot[], viewer: Viewer, foraged: Foraged, time: ForageTime, beat = Infinity): { spot: ForageSpot; score: number } | null {
  const best = bestOffered(spots, viewer, (spot) => (canPick(spot, foraged, time) ? offerableSpot(spot) : null), beat);
  return best && { spot: best.offered, score: best.score };
}

/** The spot Elliott is looking at and can pick, if any (see `offeredSpot`). */
export function targetSpot(spots: readonly ForageSpot[], viewer: Viewer, foraged: Foraged, time: ForageTime, beat = Infinity): ForageSpot | null {
  return offeredSpot(spots, viewer, foraged, time, beat)?.spot ?? null;
}

/** Whether a spot is near enough to where Elliott stands to pick by tapping it. */
export function withinTapReach(spot: ForageSpot, x: number, z: number): boolean {
  return Math.hypot(spot.x - x, spot.z - z) <= REACH.tap;
}

/** Where on a spot the eye aims, above its ground. */
export function heartOf(spot: ForageSpot): Point3 {
  return { x: spot.x, y: spot.y + HEART[spot.kind] * spot.size, z: spot.z };
}
