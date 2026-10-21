import type { Rng } from "@/shared/lib/seeded-random";
import type { Seat } from "../../contract";
import { boardKey, type Board } from "../rule-v1/board";
import { Memo, memoFor } from "../memo";
import type { CapturePlan } from "../rule-v3/routes";
import { breakdown, evaluate } from "../rule-v4/evaluate";
import { failureBoard, placed, plans as v4Plans, successBoard, type PlanKind as V4PlanKind } from "../rule-v4/planner";
import type { Params } from "./params";
import { sweepPlans } from "./sweep";

// v5's planner: v4's plans (`rule-v4/planner.ts`) and the sweeps (`sweep.ts`), every one scored
// by v4's evaluation over the turn's possible ends, the best committed as v4 commits it.

export type PlanKind = V4PlanKind | "sweep";

export interface Plan {
  kind: PlanKind;
  /** The territories the plan takes, in order for a sweep; empty for a hold. */
  targets: number[];
  capture: CapturePlan | null;
  /** Armies to place, by territory. */
  place: Map<number, number>;
  value: number;
}

/** A sweep scored as v4 scores a capture: on its success and its likeliest failure. Every army
 *  to place is on its one launch stack, so none is left over to carry along it. */
function scoreSweep(b: Board, me: Seat, cp: CapturePlan, place: Map<number, number>, params: Params): number {
  const after = placed(b, place);
  const p = cp.pSuccess;
  const win = p > 0.001 ? evaluate(successBoard(after, me, cp), me, params) : 0;
  const lose = p < 0.999 ? evaluate(failureBoard(after, me, cp), me, params) : 0;
  return p * win + (1 - p) * lose;
}

/** Every plan for this position, scored: v4's, then the sweeps. */
export function plans(b: Board, me: Seat, toPlace: number, params: Params, rng: Rng): Plan[] {
  // v4 can score a plan over sampled dice; a sweep is scored exactly, and a bot that scored some
  // plans one way and some the other would compare unlike numbers.
  if (params.engine.outcomeSamples > 0) throw new Error("rule-v5 scores its sweeps exactly, so it plays no sampled outcomes");
  const out: Plan[] = v4Plans(b, me, toPlace, params, rng);
  for (const cp of sweepPlans(b, me, toPlace, breakdown(b, me, params).commonThreat)) {
    const place = new Map<number, number>();
    if (toPlace > 0) place.set(cp.routes[0].source, toPlace);
    out.push({ kind: "sweep", targets: cp.routes[0].path, capture: cp, place, value: scoreSweep(b, me, cp, place, params) });
  }
  return out;
}

const bestPlans = new WeakMap<Params, Memo<Plan>>();

/** The plan to commit to, as v4 commits: the best, with a kill held to the commit margin. The
 *  plan is a pure function of the board, so it is remembered: each move-in weighs the board the
 *  attack after it plans from. */
export function bestPlan(b: Board, me: Seat, toPlace: number, params: Params, rng: Rng): Plan {
  return memoFor(bestPlans, params, 30).get(`${me.toString()}|${toPlace.toString()}|${boardKey(b)}`, () => choosePlan(b, me, toPlace, params, rng));
}

function choosePlan(b: Board, me: Seat, toPlace: number, params: Params, rng: Rng): Plan {
  let best: Plan | null = null;
  let bestKill: Plan | null = null;
  for (const p of plans(b, me, toPlace, params, rng)) {
    if (p.kind === "kill") {
      if (bestKill === null || p.value > bestKill.value) bestKill = p;
    } else if (best === null || p.value > best.value) best = p;
  }
  if (best === null) throw new Error("the planner always has a hold");
  if (bestKill !== null && bestKill.value > best.value + params.prefs.killCommitMargin) return bestKill;
  return best;
}
