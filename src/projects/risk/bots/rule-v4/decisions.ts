import type { Rng } from "@/shared/lib/seeded-random";
import type { Seat } from "../../contract";
import type { TerritoryId } from "../../map";
import { copyBoard, hasEnemyNeighbour, idx, IDS, type Board } from "../rule-v1/board";
import { evaluate } from "./evaluate";
import type { Params } from "./params";
import { bestPlan } from "./planner";

// The small decisions: which cards (v3's, which weigh no plan), the move-in, the fortify.
// Each is a cheap rule or a short list of choices scored by the same evaluation.

export { afterTrade, chooseBonus, chooseSet } from "../rule-v3/decisions";

/** The move-in (§2.5): the totals worth weighing, each scored by the best plan from
 *  the board it leaves. */
export function chooseOccupy(
  b: Board,
  me: Seat,
  from: number,
  to: number,
  min: number,
  max: number,
  params: Params,
  rng: Rng,
): number {
  const candidates = [...new Set([max, Math.round((min + max) / 2), min, Math.min(max, min + 2)])];
  let best = max;
  let bestValue = -Infinity;
  for (const m of candidates) {
    const board = copyBoard(b);
    board.armies[from] -= m - min;
    board.armies[to] += m - min;
    const value = bestPlan(board, me, 0, params, rng).value;
    if (value > bestValue + 1e-12) {
      bestValue = value;
      best = m;
    }
  }
  return best;
}

/** The fortify (§2.6): the strongest candidate moves, each scored by the evaluation,
 *  against not moving. */
export function chooseFortify(
  b: Board,
  me: Seat,
  moves: readonly { from: TerritoryId; to: TerritoryId; maxArmies: number }[],
  params: Params,
): { from: TerritoryId; to: TerritoryId; armies: number } | null {
  const candidates: { from: number; to: number; armies: number }[] = [];
  for (const m of moves) {
    const from = idx(m.from);
    const to = idx(m.to);
    if (!hasEnemyNeighbour(b, to) && hasEnemyNeighbour(b, from)) continue;
    candidates.push({ from, to, armies: m.maxArmies });
    const half = Math.floor(m.maxArmies / 2);
    if (half >= 1 && half !== m.maxArmies) candidates.push({ from, to, armies: half });
  }
  candidates.sort((x, y) => y.armies - x.armies || x.from - y.from || x.to - y.to);
  let best: (typeof candidates)[number] | null = null;
  let bestValue = evaluate(b, me, params);
  for (const c of candidates.slice(0, 40)) {
    const board = copyBoard(b);
    board.armies[c.from] -= c.armies;
    board.armies[c.to] += c.armies;
    const value = evaluate(board, me, params);
    if (value > bestValue + 1e-9) {
      bestValue = value;
      best = c;
    }
  }
  return best === null ? null : { from: IDS[best.from], to: IDS[best.to], armies: best.armies };
}
