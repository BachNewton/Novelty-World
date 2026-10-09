/*
 * Moving a focus cursor among choices laid out on the screen, and picking a
 * choice under a pointer: pure functions of screen positions, in CSS pixels
 * with y running down, so every input method and every presentation (the 3D
 * house, a 2D board, a list) can share them.
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

/** Choices more than this far off the pressed direction are not in it. */
const CONE = (70 * Math.PI) / 180;
/** How much being off the line counts against a choice, against its distance along it. */
const OFF_LINE_WEIGHT = 2;

/**
 * The choice a direction moves the focus to from `from`: the nearest one
 * within a cone round the direction, where being off the line counts against
 * a choice twice as much as distance along it. Null when nothing lies that
 * way, so the focus stays put.
 */
export function nextInDirection(points: readonly ScreenPoint[], from: string, direction: Point): string | null {
  const origin = points.find((point) => point.id === from);
  const length = Math.hypot(direction.x, direction.y);
  if (!origin || length === 0) return null;
  const ux = direction.x / length;
  const uy = direction.y / length;
  let best: string | null = null;
  let bestScore = Infinity;
  for (const point of points) {
    if (point.id === from) continue;
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    const along = dx * ux + dy * uy;
    const off = Math.abs(dx * uy - dy * ux);
    if (along <= 0 || Math.atan2(off, along) > CONE) continue;
    const score = along + off * OFF_LINE_WEIGHT;
    if (score < bestScore) {
      best = point.id;
      bestScore = score;
    }
  }
  return best;
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
