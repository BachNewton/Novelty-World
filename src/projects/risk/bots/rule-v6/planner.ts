import type { Seat } from "../../contract";
import {
  ADJ,
  boardKey,
  CONTINENT_BONUS,
  CONTINENT_MEMBERS,
  CONTINENT_OF,
  copyBoard,
  eliminateIfEmpty,
  hasEnemyNeighbour,
  holdsContinent,
  N,
  type Board,
} from "../rule-v1/board";
import { forcedTrade } from "../rule-v1/cards";
import { winProb } from "../rule-v1/odds";
import { Memo, memoFor } from "../memo";
import { failureBoard, placed, successBoard } from "../rule-v4/planner";
import { expectedIncome } from "../rule-v4/worth";
import { sweepPlans } from "../rule-v5/sweep";
import { breakdown } from "./evaluate";
import { killChance } from "./kills";
import type { Params } from "./params";
import { planCapture, type CapturePlan } from "./routes";

// v5's planner (`rule-v5/planner.ts`): v4's plans and v5's sweeps, scored by the evaluation
// over the turn's possible ends, the best committed. v6 keeps it whole and switches in three
// fixes (`ideas/rule-bot-v6.md`): `fork` (the capture planner at a fork), `movein` (a single
// capture scored on the move-in the bot would make) and `homeward` (the turn's fortify still to
// come). With all three off it is v5's planner, plan for plan.

export type PlanKind = "hold" | "capture" | "continent" | "kill" | "sweep";

export interface Plan {
  kind: PlanKind;
  /** The territories the plan takes, in order for a sweep; empty for a hold. */
  targets: number[];
  capture: CapturePlan | null;
  /** Armies to place, by territory. */
  place: Map<number, number>;
  value: number;
}

function addPlace(place: Map<number, number>, t: number, armies: number): void {
  if (armies > 0) place.set(t, (place.get(t) ?? 0) + armies);
}

/** Leftover armies onto the front stack: the biggest territory with an enemy beside it (v4). */
function stackAllocation(b: Board, me: Seat, armies: number, place: Map<number, number>): void {
  if (armies <= 0) return;
  let best = -1;
  for (let t = 0; t < N; t++) {
    if (b.owner[t] !== me || !hasEnemyNeighbour(b, t)) continue;
    const here = b.armies[t] + (place.get(t) ?? 0);
    if (best < 0 || here > b.armies[best] + (place.get(best) ?? 0)) best = t;
  }
  if (best < 0) best = b.owner.indexOf(me);
  addPlace(place, best, armies);
}

/** Leftover armies where they most cut the expected loss to each territory's strongest
 *  attacker (v4). */
function guardAllocation(b: Board, me: Seat, armies: number, place: Map<number, number>, income: number[], H: number): void {
  if (armies <= 0) return;
  const front: { t: number; attackers: number; bonus: number }[] = [];
  for (let t = 0; t < N; t++) {
    if (b.owner[t] !== me) continue;
    let attackers = 0;
    for (const n of ADJ[t]) {
      if (b.owner[n] !== me) attackers = Math.max(attackers, b.armies[n] - 1 + Math.round(income[b.owner[n]]));
    }
    if (attackers === 0) continue;
    const c = CONTINENT_OF[t];
    front.push({ t, attackers, bonus: holdsContinent(b, me, c) ? H * CONTINENT_BONUS[c] : 0 });
  }
  if (front.length === 0) return stackAllocation(b, me, armies, place);
  const loss = (f: (typeof front)[number], extra: number) => {
    const held = b.armies[f.t] + (place.get(f.t) ?? 0) + extra;
    return winProb(f.attackers, held) * (held + f.bonus);
  };
  let left = armies;
  const chunk = Math.max(1, Math.ceil(armies / 4));
  while (left > 0) {
    const step = Math.min(chunk, left);
    let best = front[0];
    let bestGain = -Infinity;
    for (const f of front) {
      const gain = loss(f, 0) - loss(f, step) + step;
      if (gain > bestGain) {
        bestGain = gain;
        best = f;
      }
    }
    addPlace(place, best.t, step);
    left -= step;
  }
}

/** v4's carrying: armies placed on a launch stack beyond what its routes were costed with
 *  march with its first route. */
function carrying(b: Board, after: Board, cp: CapturePlan): CapturePlan {
  const spare = new Map<number, number>();
  cp.routes.forEach((r, i) => spare.set(r.source, (spare.get(r.source) ?? after.armies[r.source] - b.armies[r.source]) - cp.alloc[i]));
  const arrive = cp.routes.map((r, i) => {
    const extra = Math.max(0, spare.get(r.source) ?? 0);
    spare.delete(r.source);
    return cp.arrive[i] + extra;
  });
  return { ...cp, arrive };
}

/** A plan's end of turn, valued. With `homeward` on, a run that ends behind my lines leaves its
 *  stack there for the turn's fortify to take back to the front, so the stack at the run's end
 *  isn't charged as idle. v5's sweeps end deep in what they took, and the evaluation charged the
 *  stack there as idle, so a 9-capture sweep lost to holding one territory (9VFL, turn 68). */
function valueOf(b: Board, me: Seat, params: Params, cp: CapturePlan | null = null): number {
  const bd = breakdown(b, me, params);
  if (params.fixes.homeward === 0 || cp === null) return bd.value;
  let stranded = 0;
  for (const r of cp.routes) {
    const end = r.path[r.path.length - 1];
    if (b.owner[end] === me && !hasEnemyNeighbour(b, end)) stranded = Math.max(stranded, b.armies[end] - 1);
  }
  return bd.value + (params.prefs.idleWeight * stranded) / bd.total;
}

/** A single capture's success, as the move-in that keeps the fewest armies in would leave it:
 *  three or what arrives, the rest staying on the source. */
function fewestIn(after: Board, me: Seat, cp: CapturePlan): Board {
  const out = copyBoard(after);
  const source = cp.routes[0].source;
  const t = cp.routes[0].path[0];
  const survivors = Math.max(1, Math.round(cp.arrive[0]));
  const victim = out.owner[t];
  const into = Math.min(3, survivors);
  out.owner[t] = me;
  out.armies[t] = into;
  out.armies[source] = 1 + survivors - into;
  if (eliminateIfEmpty(out, victim, me)) {
    const { armies, kept } = forcedTrade(out.handSize[me]);
    if (armies > 0) {
      out.handSize[me] = kept;
      out.known = [0, 0, 0, 0];
      const place = new Map<number, number>();
      stackAllocation(out, me, armies, place);
      for (const [x, a] of place) out.armies[x] += a;
    }
  }
  out.cardEarned = true;
  return out;
}

function scorePlan(b: Board, me: Seat, plan: Plan, params: Params): number {
  const after = placed(b, plan.place);
  const cp = plan.capture;
  if (cp === null) return valueOf(after, me, params);
  const p = cp.pSuccess;
  let win = 0;
  if (p > 0.001) {
    const carried = carrying(b, after, cp);
    const success = successBoard(after, me, carried);
    win = valueOf(success, me, params, cp);
    // v4's success board splits a single capture's armies evenly between the two territories
    // when both face an enemy, but the move-in weighs keeping them home too: at 9VFL's turn 72 a
    // 1-army neighbour, a sure card, scored below holding for the half stack it moved away.
    if (params.fixes.movein === 1 && cp.routes.length === 1 && cp.routes[0].path.length === 1) {
      const { source, path } = cp.routes[0];
      if (hasEnemyNeighbour(success, source) && hasEnemyNeighbour(success, path[0])) win = Math.max(win, valueOf(fewestIn(after, me, carried), me, params, cp));
    }
  }
  const lose = p < 0.999 ? valueOf(failureBoard(after, me, cp), me, params) : 0;
  return p * win + (1 - p) * lose;
}

/** Target sets worth a plan (v4): single captures, small continents to complete, victims. */
function candidateTargets(b: Board, me: Seat, toPlace: number, threat: Seat | null, fork: boolean): { kind: PlanKind; targets: number[] }[] {
  const out: { kind: PlanKind; targets: number[] }[] = [];
  const ally = (t: number) => threat !== null && threat !== me && b.owner[t] !== threat;
  const allyBlocked = (targets: readonly number[]) =>
    targets.some((t) => ally(t) && (b.cardEarned || holdsContinent(b, b.owner[t], CONTINENT_OF[t])));
  const buffers = new Set<Seat>();
  const alive = b.alive.filter(Boolean).length;
  for (let v = 0; v < b.players; v++) if (v !== me && b.alive[v] && b.handSize[v] === 0 && alive >= 5) buffers.add(v);
  const finishesBuffer = (targets: readonly number[]) =>
    [...buffers].some((v) => {
      for (let t = 0; t < N; t++) if (b.owner[t] === v && !targets.includes(t)) return false;
      return true;
    });

  const singles: { t: number; score: number }[] = [];
  for (let t = 0; t < N; t++) {
    if (b.owner[t] === me) continue;
    let source = 0;
    for (const n of ADJ[t]) if (b.owner[n] === me) source = Math.max(source, b.armies[n]);
    if (source === 0 || finishesBuffer([t]) || allyBlocked([t])) continue;
    const p = winProb(source - 1 + toPlace, b.armies[t]);
    if (p < 0.25) continue;
    const c = CONTINENT_OF[t];
    const breaks = holdsContinent(b, b.owner[t], c) ? 1 : 0;
    singles.push({ t, score: p * (1 + breaks) - 0.05 * b.armies[t] });
  }
  singles.sort((x, y) => y.score - x.score || x.t - y.t);
  for (const s of singles.slice(0, 8)) out.push({ kind: "capture", targets: [s.t] });

  for (let c = 0; c < CONTINENT_MEMBERS.length; c++) {
    const missing = CONTINENT_MEMBERS[c].filter((t) => b.owner[t] !== me);
    if (missing.length >= 2 && missing.length <= Math.ceil(CONTINENT_MEMBERS[c].length / 2) && !finishesBuffer(missing) && !allyBlocked(missing)) {
      out.push({ kind: "continent", targets: missing });
    }
  }

  for (let v = 0; v < b.players; v++) {
    if (v === me || !b.alive[v] || buffers.has(v)) continue;
    if (threat !== null && threat !== me && v !== threat && b.handSize[v] + b.handSize[me] < 5) continue;
    if (killChance(b, me, v, toPlace, fork) > 0.02) {
      const targets: number[] = [];
      for (let t = 0; t < N; t++) if (b.owner[t] === v) targets.push(t);
      if (targets.length > 0) out.push({ kind: "kill", targets });
    }
  }
  return out;
}

/** Every plan for this position, scored: v4's, then v5's sweeps. */
export function plans(b: Board, me: Seat, toPlace: number, params: Params): Plan[] {
  if (params.engine.outcomeSamples > 0) throw new Error("rule-v6 scores its plans exactly, so it plays no sampled outcomes");
  const fork = params.fixes.fork === 1;
  const income = expectedIncome(b, me);
  const threat = breakdown(b, me, params).commonThreat;
  const H = params.prefs.incomeHorizon;
  const out: Plan[] = [];
  const add = (kind: PlanKind, targets: number[], capture: CapturePlan | null, place: Map<number, number>) => {
    const plan: Plan = { kind, targets, capture, place, value: 0 };
    plan.value = scorePlan(b, me, plan, params);
    out.push(plan);
  };

  const stack = new Map<number, number>();
  stackAllocation(b, me, toPlace, stack);
  add("hold", [], null, stack);
  if (toPlace > 0) {
    const guard = new Map<number, number>();
    guardAllocation(b, me, toPlace, guard, income, H);
    add("hold", [], null, guard);
  }

  for (const { kind, targets } of candidateTargets(b, me, toPlace, threat, fork)) {
    const variants = toPlace > 0 ? [0.9, 0.99, 1] : [1];
    for (const enough of variants) {
      const cp = planCapture(b, me, targets, toPlace, enough, fork);
      if (cp === null) continue;
      if (cp.routes.some((r, i) => b.armies[r.source] + cp.alloc[i] < 2)) continue;
      const place = new Map<number, number>();
      cp.routes.forEach((r, i) => addPlace(place, r.source, cp.alloc[i]));
      if (enough < 1) guardAllocation(b, me, cp.leftover, place, income, H);
      else if (cp.routes.length > 0) addPlace(place, cp.routes[0].source, cp.leftover);
      add(kind, targets, cp, place);
      if (cp.leftover === 0 && enough < 1) break;
    }
  }

  for (const cp of sweepPlans(b, me, toPlace, threat)) {
    const place = new Map<number, number>();
    if (toPlace > 0) place.set(cp.routes[0].source, toPlace);
    const after = placed(b, place);
    const p = cp.pSuccess;
    const win = p > 0.001 ? valueOf(successBoard(after, me, cp), me, params, cp) : 0;
    const lose = p < 0.999 ? valueOf(failureBoard(after, me, cp), me, params) : 0;
    out.push({ kind: "sweep", targets: cp.routes[0].path, capture: cp, place, value: p * win + (1 - p) * lose });
  }
  return out;
}

const bestPlans = new WeakMap<Params, Memo<Plan>>();

/** The plan to commit to (v4): the best, with a kill held to the commit margin, remembered. */
export function bestPlan(b: Board, me: Seat, toPlace: number, params: Params): Plan {
  return memoFor(bestPlans, params, 30).get(`${me.toString()}|${toPlace.toString()}|${boardKey(b)}`, () => choosePlan(b, me, toPlace, params));
}

function choosePlan(b: Board, me: Seat, toPlace: number, params: Params): Plan {
  let best: Plan | null = null;
  let bestKill: Plan | null = null;
  for (const p of plans(b, me, toPlace, params)) {
    if (p.kind === "kill") {
      if (bestKill === null || p.value > bestKill.value) bestKill = p;
    } else if (best === null || p.value > best.value) best = p;
  }
  if (best === null) throw new Error("the planner always has a hold");
  if (bestKill !== null && bestKill.value > best.value + params.prefs.killCommitMargin) return bestKill;
  return best;
}
