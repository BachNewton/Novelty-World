import type { Rng } from "@/shared/lib/seeded-random";
import type { CardId, Seat } from "../../contract";
import type { TerritoryId } from "../../map";
import {
  copyBoard,
  hasEnemyNeighbour,
  idx,
  IDS,
  type Board,
} from "./board";
import { setValue, territoryOf } from "../../cards";
import { CARD_DISCOUNT, handWorth, shapeOf, sub } from "./cards";
import { evaluate } from "./evaluate";
import type { Params } from "./params";
import { bestPlan } from "./planner";

// The small decisions: which cards, the move-in, the fortify.
// Each is a cheap rule or a short list of choices scored by the same evaluation.

/** Which set to trade (§2.2): the one whose armies, with the +2 when it pictures a
 *  territory of mine that faces an enemy, plus what the cards kept are worth, come to
 *  most. So a wild is kept unless it is what makes the set worth more. */
export function chooseSet(
  b: Board,
  me: Seat,
  hand: readonly CardId[],
  sets: readonly (readonly [CardId, CardId, CardId])[],
): readonly [CardId, CardId, CardId] {
  let best = sets[0];
  let bestScore = -Infinity;
  for (const set of sets) {
    const rest = hand.filter((c) => !set.includes(c));
    let bonus = 0;
    for (const c of set) {
      const t = territoryOf(c);
      if (t !== null && b.owner[idx(t)] === me) bonus = Math.max(bonus, hasEnemyNeighbour(b, idx(t)) ? 2 : 1);
    }
    const score = setValue(set) + bonus + CARD_DISCOUNT * handWorth(shapeOf(rest), 0);
    if (score > bestScore + 1e-9) {
      bestScore = score;
      best = set;
    }
  }
  return best;
}

/** Where the +2 goes when the set pictures several owned territories: the plan's
 *  launch stack if it is one, else the biggest that faces an enemy. */
export function chooseBonus(b: Board, choices: readonly TerritoryId[], launch: number | null): TerritoryId {
  const ids = choices.map(idx);
  if (launch !== null && ids.includes(launch)) return IDS[launch];
  let best = ids[0];
  for (const t of ids) {
    const score = (hasEnemyNeighbour(b, t) ? 1000 : 0) + b.armies[t];
    if (score > (hasEnemyNeighbour(b, best) ? 1000 : 0) + b.armies[best]) best = t;
  }
  return IDS[best];
}

/** The board once `set` is traded: its cards gone from my hand, its armies to place. */
export function afterTrade(b: Board, me: Seat, set: readonly CardId[]): { board: Board; armies: number } {
  const out = copyBoard(b);
  out.handSize[me] -= 3;
  out.known = sub(out.known, shapeOf(set));
  return { board: out, armies: setValue(set) };
}

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
