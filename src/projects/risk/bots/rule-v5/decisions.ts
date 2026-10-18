import type { Rng } from "@/shared/lib/seeded-random";
import type { Seat } from "../../contract";
import { copyBoard, type Board } from "../rule-v1/board";
import type { Params } from "./params";
import { bestPlan } from "./planner";

// v4's small decisions (`rule-v4/decisions.ts`). Only the move-in weighs plans, so only it is
// v5's own: the same totals, each scored by v5's best plan from the board it leaves, so a sweep
// that goes on is seen as the armies move in.

export { afterTrade, chooseBonus, chooseFortify, chooseSet } from "../rule-v4/decisions";

export function chooseOccupy(b: Board, me: Seat, from: number, to: number, min: number, max: number, params: Params, rng: Rng): number {
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
