import type { Seat } from "../../contract";
import type { TerritoryId } from "../../map";
import { copyBoard, countOf, hasEnemyNeighbour, idx, IDS, opponentsInOrder, type Board } from "../rule-v1/board";
import { sweepCost } from "../rule-v4/opponents";
import { expectedIncome } from "../rule-v4/worth";
import { evaluate } from "./evaluate";
import { sweepOf } from "./opponents";
import type { Params } from "./params";
import { bestPlan } from "./planner";

// v5's small decisions (v4's, with v5's move-in) on v6's planner and evaluation, and one fix of
// v6's switchable in the fortify: `gather`.

export { afterTrade, chooseBonus, chooseSet } from "../rule-v4/decisions";

/** The move-in (v5): the totals worth weighing, each scored by the best plan from the board it
 *  leaves. */
export function chooseOccupy(b: Board, me: Seat, from: number, to: number, min: number, max: number, params: Params): number {
  const candidates = [...new Set([max, Math.round((min + max) / 2), min, Math.min(max, min + 2)])];
  let best = max;
  let bestValue = -Infinity;
  for (const m of candidates) {
    const board = copyBoard(b);
    board.armies[from] -= m - min;
    board.armies[to] += m - min;
    const value = bestPlan(board, me, 0, params).value;
    if (value > bestValue + 1e-12) {
      bestValue = value;
      best = m;
    }
  }
  return best;
}

interface Candidate {
  from: number;
  to: number;
  armies: number;
}

/** v4's fortify candidates: every move whole and halved, but never off the front into the
 *  interior, the biggest first. */
function candidates(b: Board, moves: readonly { from: TerritoryId; to: TerritoryId; maxArmies: number }[]): Candidate[] {
  const out: Candidate[] = [];
  for (const m of moves) {
    const from = idx(m.from);
    const to = idx(m.to);
    if (!hasEnemyNeighbour(b, to) && hasEnemyNeighbour(b, from)) continue;
    out.push({ from, to, armies: m.maxArmies });
    const half = Math.floor(m.maxArmies / 2);
    if (half >= 1 && half !== m.maxArmies) out.push({ from, to, armies: half });
  }
  out.sort((x, y) => y.armies - x.armies || x.from - y.from || x.to - y.to);
  return out.slice(0, 40);
}

function moved(b: Board, c: Candidate): Board {
  const board = copyBoard(b);
  board.armies[c.from] -= c.armies;
  board.armies[c.to] += c.armies;
  return board;
}

/** What the opponents' believed sweeps cost me on `b`, summed, and the most territories one of
 *  them takes. */
function believedSweeps(b: Board, me: Seat, params: Params, income: readonly number[]): { cost: number; most: number } {
  let cost = 0;
  let most = 0;
  for (const q of opponentsInOrder(b, me)) {
    const sweep = sweepOf(b, me, q, Math.round(income[q]), params.fixes.thirdParty === 1);
    cost += sweepCost(b, me, sweep, params.prefs.incomeHorizon, params.prefs.myContinentWeight);
    let taken = 0;
    for (let t = 0; t < b.owner.length; t++) if (b.owner[t] === me && sweep.owner[t] !== me) taken++;
    most = Math.max(most, taken);
  }
  return { cost, most };
}

/** The gathering fortify (`ideas/rule-bot-v6.md`, fix 3): when an opponent's sweep is believed to
 *  take a third of my territories or more, the move that most cuts what the believed sweeps cost
 *  me, if any does. A stack moved onto a choke point stops a sweep there, and stacks moved
 *  together are one a sweep can't take. In 9VFL v4 believed the winner's sweep would take 20 of
 *  its 24 territories (he took 21) and fortified forward, its biggest stack 11. */
function gatherMove(b: Board, me: Seat, params: Params, options: readonly Candidate[]): Candidate | null {
  const income = expectedIncome(b, me);
  const now = believedSweeps(b, me, params, income);
  if (now.most < 2 || 3 * now.most < countOf(b, me)) return null;
  let best: Candidate | null = null;
  let bestCost = now.cost;
  for (const c of options) {
    const cost = believedSweeps(moved(b, c), me, params, income).cost;
    if (cost < bestCost - 1e-9) {
      bestCost = cost;
      best = c;
    }
  }
  return best;
}

/** The fortify (v4): the strongest candidate moves, each scored by the evaluation, against not
 *  moving; with `gather` on, the gathering fortify first. */
export function chooseFortify(
  b: Board,
  me: Seat,
  moves: readonly { from: TerritoryId; to: TerritoryId; maxArmies: number }[],
  params: Params,
): { from: TerritoryId; to: TerritoryId; armies: number } | null {
  const options = candidates(b, moves);
  let best = params.fixes.gather === 1 ? gatherMove(b, me, params, options) : null;
  if (best === null) {
    let bestValue = evaluate(b, me, params);
    for (const c of options) {
      const value = evaluate(moved(b, c), me, params);
      if (value > bestValue + 1e-9) {
        bestValue = value;
        best = c;
      }
    }
  }
  return best === null ? null : { from: IDS[best.from], to: IDS[best.to], armies: best.armies };
}
