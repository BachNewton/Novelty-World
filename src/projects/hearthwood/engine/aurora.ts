import { createRng } from "@/shared/lib/seeded-random";
import type { Sun } from "./astronomy";
import type { CalendarDate, Season } from "./calendar";

/*
 * The northern lights: on some clear nights, seeded so no two nights are
 * alike, curtains hang in the north, some nights faint and some nights a
 * show. Mostly in the long dark of autumn and winter; summer's bright nights
 * hide them.
 */

/** The chance of the northern lights on a night, by the season. */
const CHANCE: Record<Season, number> = { autumn: 0.45, winter: 0.4, spring: 0.25, summer: 0.06 };

/** The night a date falls in: a night belongs to the day whose evening it began on. */
export function nightOf(date: CalendarDate): number {
  return date.hour < 12 ? date.day - 1 : date.day;
}

/** How strong a night's northern lights are, 0 for none: seeded by the night, so it is always the same night's show. */
export function auroraTonight(date: CalendarDate): number {
  const rng = createRng(`hearthwood-aurora-${nightOf(date)}`);
  if (rng.next() >= CHANCE[date.season]) return 0;
  return 0.3 + 0.7 * Math.pow(rng.next(), 1.5);
}

/** How lively the show is through the night: brightest round midnight, at a seeded hour, quieter in the evening and towards dawn. */
function activity(date: CalendarDate): number {
  const rng = createRng(`hearthwood-aurora-peak-${nightOf(date)}`);
  const peak = (rng.next() - 0.5) * 3;
  const fromMidnight = ((date.hour + 12) % 24) - 12;
  return 0.3 + 0.7 * Math.exp(-((fromMidnight - peak) ** 2) / (2 * 2.2 * 2.2));
}

function smooth(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** How bright the northern lights are now, 0 to 1: the night's show (or `held`, when one is held on), how lively it is, and how dark the sky is. */
export function auroraAt(date: CalendarDate, sun: Sun, held: number | null = null): number {
  const dark = 1 - smooth(-14, -7, sun.elevation);
  if (dark === 0) return 0;
  return (held ?? auroraTonight(date)) * activity(date) * dark;
}
