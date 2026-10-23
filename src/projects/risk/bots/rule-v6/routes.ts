import type { Seat } from "../../contract";
import { ADJ, type Board } from "../rule-v1/board";
import { planCapture as v3PlanCapture, type CapturePlan } from "../rule-v3/routes";

// The capture planner at a fork (`ideas/rule-bot-v6.md`, fix 1). v3's planner takes the
// targets' connected groups in the order the targets list them, and a launch stack already
// leading one group has only what that group's run leaves it for the next. So when a victim's
// land splits into a big group and a cheap one beside the same stack, the order decides the kill:
// costed big group first, the stack is spent before the cheap one, and a sure kill reads as
// none (9VFL, turn 57: v4 held with 42 armies beside a kill it had planned at 97%). Costed
// cheap group first, the stack drops a detachment for it and goes on with the rest, which is
// how the turn is played: the move-in leaves the detachment at the fork.

/** Each territory's mark while `cheapGroupsFirst` runs, reused and cleared after: allocating
 *  them per call cost more than the grouping. */
let isTarget = new Uint8Array(0);
let groupOf = new Int16Array(0);

/** `targets`, each connected group kept whole and in its own order, the cheapest group
 *  (its defenders and an army left on each) first. */
export function cheapGroupsFirst(b: Board, targets: readonly number[]): readonly number[] {
  if (groupOf.length < b.owner.length) {
    isTarget = new Uint8Array(b.owner.length);
    groupOf = new Int16Array(b.owner.length).fill(-1);
  }
  for (const t of targets) isTarget[t] = 1;
  const cost: number[] = [];
  for (const start of targets) {
    if (groupOf[start] >= 0) continue;
    const g = cost.length;
    cost.push(0);
    groupOf[start] = g;
    const stack = [start];
    while (stack.length > 0) {
      const t = stack.pop() as number;
      cost[g] += b.armies[t] + 1;
      for (const n of ADJ[t]) {
        if (isTarget[n] === 1 && groupOf[n] < 0) {
          groupOf[n] = g;
          stack.push(n);
        }
      }
    }
  }
  const ordered = cost.length === 1 ? targets : byGroupCost(targets, cost);
  for (const t of targets) {
    isTarget[t] = 0;
    groupOf[t] = -1;
  }
  return ordered;
}

function byGroupCost(targets: readonly number[], cost: readonly number[]): readonly number[] {
  const order = cost.map((_, g) => g).sort((x, y) => cost[x] - cost[y] || x - y);
  const rank = new Int16Array(order.length);
  order.forEach((g, r) => (rank[g] = r));
  // Already cheapest first: the sort would give the targets back as they are.
  let inOrder = true;
  for (let i = 1; i < targets.length && inOrder; i++) inOrder = rank[groupOf[targets[i - 1]]] <= rank[groupOf[targets[i]]];
  if (inOrder) return targets;
  return targets.map((t, i) => ({ t, i })).sort((x, y) => rank[groupOf[x.t]] - rank[groupOf[y.t]] || x.i - y.i).map((x) => x.t);
}

/** v3's capture plan, with the groups costed cheapest first when `fork` is on. */
export function planCapture(b: Board, seat: Seat, targets: readonly number[], toPlace: number, enough: number, fork: boolean): CapturePlan | null {
  return v3PlanCapture(b, seat, fork ? cheapGroupsFirst(b, targets) : targets, toPlace, enough);
}

export type { CapturePlan };
