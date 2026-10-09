/*
 * Picking a choice laid out on the screen: under a pointer, under the
 * screen-centre reticle, or the next one along. Pure functions of screen
 * positions, in CSS pixels with y running down, so every input method and
 * every presentation (the 3D house, a 2D board, a list) can share them.
 */

export interface Point {
  x: number;
  y: number;
}

/** A choice where it shows on the screen. */
export interface ScreenPoint extends Point {
  id: string;
}

/** A choice's pointer target: the outline it covers on the screen, and the
 *  point it is drawn round. */
export interface Target {
  id: string;
  outline: Point[];
  anchor: Point;
}

function inside(point: Point, outline: readonly Point[]): boolean {
  let result = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[i];
    const b = outline[j];
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}

/**
 * The choice under a pointer: one whose outline holds the point (the nearest
 * by anchor, where outlines overlap), or else the nearest anchor within
 * `reach` pixels, so a choice drawn small on the screen is still a target a
 * finger can hit.
 */
export function pickTarget(targets: readonly Target[], point: Point, reach: number): string | null {
  const distance = (target: Target) => Math.hypot(target.anchor.x - point.x, target.anchor.y - point.y);
  const nearest = (candidates: Target[]) => candidates.reduce<Target | null>((best, target) => (!best || distance(target) < distance(best) ? target : best), null);
  const under = nearest(targets.filter((target) => inside(point, target.outline)));
  if (under) return under.id;
  const close = nearest(targets.filter((target) => distance(target) <= reach));
  return close?.id ?? null;
}

/** The choice the screen-centre reticle selects, and where the reticle shows:
 *  the choice under the centre, or else the nearest one within `snap` pixels,
 *  with the reticle snapped onto its anchor. Null on open floor, where the
 *  reticle stays at the centre and selects nothing. */
export function reticleTarget(targets: readonly Target[], centre: Point, snap: number): { id: string; at: Point } | null {
  const id = pickTarget(targets, centre, snap);
  const target = targets.find((candidate) => candidate.id === id);
  return target ? { id: target.id, at: target.anchor } : null;
}

/**
 * The choice a "next" (1) or "previous" (-1) jump goes to, in the order the
 * choices read across the screen: left to right, top to bottom where they
 * line up. From `current` it steps along that order, wrapping round; with
 * nothing selected it takes the first one past `centre` that way.
 */
export function cycleChoice(points: readonly ScreenPoint[], current: string | null, step: 1 | -1, centre: Point): string | null {
  if (points.length === 0) return null;
  const order = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const at = order.findIndex((point) => point.id === current);
  if (at !== -1) return order[(at + step + order.length) % order.length].id;
  const past = step === 1 ? order.find((point) => point.x > centre.x) : order.findLast((point) => point.x < centre.x);
  return (past ?? (step === 1 ? order[0] : order[order.length - 1])).id;
}

/** The floor a floor-up (1) or floor-down (-1) control shows, from `floors`
 *  listed bottom to top; from a view of every floor, it goes to `home`. It
 *  stays at the top and bottom rather than wrapping. */
export function stepFloor<F extends string>(floors: readonly F[], showing: F | "all", step: 1 | -1, home: F): F {
  if (showing === "all") return home;
  const at = floors.indexOf(showing);
  return floors[Math.min(floors.length - 1, Math.max(0, at + step))];
}
