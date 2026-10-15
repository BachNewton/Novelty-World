import type { Direction } from "@/shared/lib/gamepad";
import type { BoardPoint } from "./camera";

/*
 * Moving a focus between territories by direction (a d-pad, a stick, the arrow keys), pure. The
 * board wraps east to west, as the world does: Alaska's west is Kamchatka.
 */

export interface Placed extends BoardPoint {
  id: string;
}

const WAY: Record<Direction, BoardPoint> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

/** How much a step sideways of the way pressed costs against a step along it: a territory
 *  straight ahead beats a nearer one off to the side. */
const SIDEWAYS_COST = 2.5;

/**
 * The territory a move from `from` lands on: among `candidates` lying that way (within about 60°
 * of it), the one nearest along it, sideways distance weighing more. Left and right look round
 * the board's edge too, `width` being the board's width. Null when nothing lies that way.
 */
export function nextTerritory(candidates: readonly Placed[], from: BoardPoint, direction: Direction, width: number): string | null {
  const way = WAY[direction];
  const shifts = direction === "left" || direction === "right" ? [0, -width, width] : [0];
  let best: { id: string; cost: number } | null = null;
  for (const candidate of candidates) {
    if (candidate.x === from.x && candidate.y === from.y) continue;
    for (const shift of shifts) {
      const dx = candidate.x + shift - from.x;
      const dy = candidate.y - from.y;
      const along = dx * way.x + dy * way.y;
      const across = Math.abs(dx * way.y - dy * way.x);
      if (along <= 0.5 || across > along * 1.75) continue;
      const cost = along + SIDEWAYS_COST * across;
      if (best === null || cost < best.cost) best = { id: candidate.id, cost };
    }
  }
  return best?.id ?? null;
}

/** Where a focus starts: the candidate nearest a point (the middle of what's on screen). */
export function nearestTo(candidates: readonly Placed[], point: BoardPoint): string | null {
  let best: { id: string; distance: number } | null = null;
  for (const candidate of candidates) {
    const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
    if (best === null || distance < best.distance) best = { id: candidate.id, distance };
  }
  return best?.id ?? null;
}
