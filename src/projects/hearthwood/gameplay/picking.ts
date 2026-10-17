import { FORAGE_FORM, inSeason, type ForageSpot } from "../engine/forage";
import type { ForageKind } from "../engine/regions";
import type { Foraged } from "./basket";

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
};

/** Looking within this angle of a spot's middle always looks at it, however far it is. */
const LOOK_SLACK = 0.1;
/** In third person, only spots within this angle either side of the way Elliott faces are in front of them. */
const FRONT = 1.4;

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

interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** Where Elliott looks from: their eyes and the way they look (a unit vector) in first person, or where they stand and face in third. */
export type Viewer = { pointOfView: "first"; eye: Point3; look: Point3 } | { pointOfView: "third"; x: number; z: number; heading: number };

/** The spot Elliott is looking at and can pick, if any: in first person the one nearest the middle of the view, in third the nearest one in front of them. */
export function targetSpot(spots: readonly ForageSpot[], viewer: Viewer, foraged: Foraged, time: ForageTime): ForageSpot | null {
  let best: ForageSpot | null = null;
  let bestScore = Infinity;
  for (const spot of spots) {
    if (!canPick(spot, foraged, time)) continue;
    let score: number;
    if (viewer.pointOfView === "first") {
      const dx = spot.x - viewer.eye.x;
      const dy = spot.y + HEART[spot.kind] * spot.size - viewer.eye.y;
      const dz = spot.z - viewer.eye.z;
      const distance = Math.hypot(dx, dy, dz);
      if (distance > REACH.first || distance === 0) continue;
      const along = (dx * viewer.look.x + dy * viewer.look.y + dz * viewer.look.z) / distance;
      const angle = Math.acos(Math.min(1, Math.max(-1, along)));
      if (angle > Math.max(LOOK_SLACK, Math.atan((SPREAD[spot.kind] * spot.size) / distance))) continue;
      score = angle;
    } else {
      const dx = spot.x - viewer.x;
      const dz = spot.z - viewer.z;
      const distance = Math.hypot(dx, dz);
      if (distance > REACH.third) continue;
      const off = distance === 0 ? 0 : Math.abs(angleBetween(viewer.heading, Math.atan2(dx, dz)));
      if (off > FRONT) continue;
      score = distance * (1 + off);
    }
    if (score < bestScore) {
      bestScore = score;
      best = spot;
    }
  }
  return best;
}

/** Whether a spot is near enough to where Elliott stands to pick by tapping it. */
export function withinTapReach(spot: ForageSpot, x: number, z: number): boolean {
  return Math.hypot(spot.x - x, spot.z - z) <= REACH.tap;
}

/** The turn from one heading to another, the short way round, in radians. */
function angleBetween(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

/** Where on a spot the eye aims, above its ground. */
export function heartOf(spot: ForageSpot): Point3 {
  return { x: spot.x, y: spot.y + HEART[spot.kind] * spot.size, z: spot.z };
}
