import type { Rng } from "@/shared/lib/seeded-random";
import type { Seat } from "../../contract";
import {
  ADJ,
  CONTINENT_BONUS,
  CONTINENT_MEMBERS,
  CONTINENT_OF,
  copyBoard,
  eliminateIfEmpty,
  hasEnemyNeighbour,
  holdsContinent,
  N,
  boardKey,
  type Board,
} from "../rule-v1/board";
import { Memo, memoFor } from "../memo";
import { forcedTrade } from "../rule-v1/cards";
import { breakdown, evaluate, expectedIncome } from "./evaluate";
import { battleOutcome, winProb } from "../rule-v1/odds";
import type { Params } from "./params";
import { killChance, planCapture, type CapturePlan } from "./routes";

// The turn planner (`ideas/rule-bot-v1.md` §2.4): a few dozen whole-turn plans, each
// one coherent intent (hold, take a card spot or break a continent, take a small
// continent, eliminate a player), each with its own placement, scored by the
// evaluation over the turn's possible ends, the best committed. A bot is a pure
// function of its view, so it plans afresh at every decision: placing, after every
// blitz, at every move-in. That is the design's re-plan after a blitz that fell
// short, taken every time.

export type PlanKind = "hold" | "capture" | "continent" | "kill";

export interface Plan {
  kind: PlanKind;
  /** The territories the plan takes; empty for a hold. */
  targets: number[];
  capture: CapturePlan | null;
  /** Armies to place, by territory. */
  place: Map<number, number>;
  value: number;
}

function addPlace(place: Map<number, number>, t: number, armies: number): void {
  if (armies > 0) place.set(t, (place.get(t) ?? 0) + armies);
}

/** Leftover armies onto the front stack: the biggest territory with an enemy beside it. */
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

/** Leftover armies where they most cut the expected loss to each territory's
 *  strongest attacker (with that attacker's reinforcements), in chunks. */
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

export function placed(b: Board, place: Map<number, number>): Board {
  const out = copyBoard(b);
  for (const [t, a] of place) out.armies[t] += a;
  return out;
}

/** The forced trades of `ELIM-3`, their armies placed on my front stack. The victim's
 *  cards are unseen, so the hand kept is counted as unseen too. */
function forcedTrades(b: Board, me: Seat): void {
  const { armies, kept } = forcedTrade(b.handSize[me]);
  if (armies === 0) return;
  b.handSize[me] = kept;
  b.known = [0, 0, 0, 0];
  const place = new Map<number, number>();
  stackAllocation(b, me, armies, place);
  for (const [t, a] of place) b.armies[t] += a;
}

/** Takes `t` from `from` with `survivors` armies arriving. A run moves them all on; a
 *  single capture (`split`) divides them as the move-in would: the least into a
 *  territory with no enemy beside it, everything out of a source left with none,
 *  otherwise half each. */
function takeOne(b: Board, me: Seat, from: number, t: number, survivors: number, split: boolean): void {
  const victim = b.owner[t];
  b.owner[t] = me;
  let into = survivors;
  if (split) {
    if (!hasEnemyNeighbour(b, t)) into = Math.min(3, survivors);
    else if (hasEnemyNeighbour(b, from)) into = Math.ceil(survivors / 2);
  }
  into = Math.max(1, into);
  b.armies[t] = into;
  b.armies[from] = 1 + Math.max(0, survivors - into);
  if (eliminateIfEmpty(b, victim, me)) forcedTrades(b, me);
  b.cardEarned = true;
}

/** Route `r` run on `b`, taking its first `upTo` territories, the last arriving with
 *  `arrive` armies (the rest keep one each). */
function runRoute(b: Board, me: Seat, r: CapturePlan["routes"][number], upTo: number, arrive: number): void {
  // A route forks where its next target isn't beside the last one taken (two targets of one
  // launch stack, say): the armies can't march from one branch's end to the next, so they
  // finish shared among the branch ends, not all on the last (v2). v1 pictured them all on
  // the last, leaving every other end on one army.
  const ends: number[] = [];
  for (let k = 0; k < upTo; k++) {
    if (k === upTo - 1 || !ADJ[r.path[k]].includes(r.path[k + 1])) ends.push(k);
  }
  const visited = [r.source];
  for (let k = 0; k < upTo; k++) {
    const t = r.path[k];
    // The attack comes from the latest territory of the run beside it: after a fork, the
    // launch stack it forked from.
    const from = visited.findLast((v) => ADJ[v].includes(t)) ?? visited[visited.length - 1];
    const end = ends.indexOf(k);
    const share = end < 0 ? 1 : Math.max(1, Math.floor(arrive / ends.length) + (end < arrive % ends.length ? 1 : 0));
    takeOne(b, me, from, t, share, r.path.length === 1);
    visited.push(t);
  }
}

/** The board when every route succeeds, each arriving with its expected armies. */
export function successBoard(b: Board, me: Seat, cp: CapturePlan): Board {
  const out = copyBoard(b);
  cp.routes.forEach((r, i) => runRoute(out, me, r, r.path.length, Math.max(1, Math.round(cp.arrive[i]))));
  return out;
}

/** The board when the plan falls short in its likeliest way: routes better than even
 *  succeed, the rest stop at their likeliest stopping place (at least one stops). */
export function failureBoard(b: Board, me: Seat, cp: CapturePlan): Board {
  const out = copyBoard(b);
  let weakest = 0;
  cp.pRoute.forEach((p, i) => {
    if (p < cp.pRoute[weakest]) weakest = i;
  });
  const allSucceed = cp.pRoute.every((p) => p >= 0.5);
  cp.routes.forEach((r, i) => {
    const fails = cp.pRoute[i] < 0.5 || (allSucceed && i === weakest);
    if (!fails) {
      runRoute(out, me, r, r.path.length, Math.max(1, Math.round(cp.arrive[i])));
      return;
    }
    const at = stopIndex(out.armies[r.source], r.path.map((t) => out.armies[t]));
    const stopped = r.path[at];
    const half = Math.max(1, Math.ceil(out.armies[stopped] / 2));
    runRoute(out, me, r, at, 1);
    out.armies[at === 0 ? r.source : r.path[at - 1]] = 1;
    out.armies[stopped] = half;
  });
  return out;
}

function stopIndex(armies: number, defenders: readonly number[]): number {
  // The defender at which the run is likeliest to stop, approximated by walking the
  // expected armies forward (exact stop chances are in `pathRun`; this keeps it cheap).
  let a = armies - 1;
  for (let i = 0; i < defenders.length; i++) {
    const p = winProb(a, defenders[i]);
    if (p < 0.5) return i;
    a -= defenders[i] + 1;
    if (a <= 0) return Math.min(i + 1, defenders.length - 1);
  }
  return defenders.length - 1;
}

/** One sampled attack, played the best way: the attackers and defenders left. */
function sampleBattle(a: number, d: number, rng: Rng): [number, number] {
  if (a <= 0) return [0, d];
  const o = battleOutcome(a, d);
  let r = rng.next();
  for (let x = o.win.length - 1; x >= 1; x--) {
    if (r < o.win[x]) return [x, 0];
    r -= o.win[x];
  }
  for (let y = 1; y < o.fail.length; y++) {
    if (r < o.fail[y]) return [0, y];
    r -= o.fail[y];
  }
  return [0, d];
}

/** One end of the plan with sampled dice. */
function sampledBoard(b: Board, me: Seat, cp: CapturePlan, rng: Rng): Board {
  const out = copyBoard(b);
  for (const r of cp.routes) {
    let from = r.source;
    for (let k = 0; k < r.path.length; k++) {
      const t = r.path[k];
      const [a, d] = sampleBattle(out.armies[from] - 1, out.armies[t], rng);
      if (d > 0) {
        out.armies[from] = a + 1;
        out.armies[t] = d;
        break;
      }
      takeOne(out, me, from, t, a, r.path.length === 1);
      from = t;
    }
  }
  return out;
}

/** The plan with the armies placed on its launch stacks beyond what its routes were costed
 *  with carried along each stack's first route (v2): in play they march with the run, and
 *  the move-ins decide where they stop. v1's success board dropped them, so the same
 *  position scored lower while placing than once placed. */
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

function scorePlan(b: Board, me: Seat, plan: Plan, params: Params, rng: Rng): number {
  const after = placed(b, plan.place);
  const cp = plan.capture;
  if (cp === null) return evaluate(after, me, params);
  const samples = params.engine.outcomeSamples;
  if (samples > 0) {
    let sum = 0;
    for (let i = 0; i < samples; i++) sum += evaluate(sampledBoard(after, me, cp, rng), me, params);
    return sum / samples;
  }
  const p = cp.pSuccess;
  const win = p > 0.001 ? evaluate(successBoard(after, me, carrying(b, after, cp)), me, params) : 0;
  const lose = p < 0.999 ? evaluate(failureBoard(after, me, cp), me, params) : 0;
  return p * win + (1 - p) * lose;
}

/** Target sets worth a plan: single captures, small continents to complete, victims. */
function candidateTargets(
  b: Board,
  me: Seat,
  toPlace: number,
  threat: Seat | null,
): { kind: PlanKind; targets: number[] }[] {
  const out: { kind: PlanKind; targets: number[] }[] = [];
  // Under a common threat everyone else is my ally against it (Domination's AI; Risk4Ever:
  // "target the strongest player"): another player's territory is taken only for the
  // turn's card, never to break their continent, and they are finished only when their
  // cards force a trade at once (`ELIM-3`).
  const ally = (t: number) => threat !== null && threat !== me && b.owner[t] !== threat;
  const allyBlocked = (targets: readonly number[]) =>
    targets.some((t) => ally(t) && (b.cardEarned || holdsContinent(b, b.owner[t], CONTINENT_OF[t])));
  // A card-less victim at a table of 5 or 6 is left as a buffer (Domination drops
  // card-less elimination targets): its kill pays nothing, and it absorbs the others.
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
    if (
      missing.length >= 2 &&
      missing.length <= Math.ceil(CONTINENT_MEMBERS[c].length / 2) &&
      !finishesBuffer(missing) &&
      !allyBlocked(missing)
    ) {
      out.push({ kind: "continent", targets: missing });
    }
  }

  for (let v = 0; v < b.players; v++) {
    if (v === me || !b.alive[v] || buffers.has(v)) continue;
    if (threat !== null && threat !== me && v !== threat && b.handSize[v] + b.handSize[me] < 5) continue;
    if (killChance(b, me, v, toPlace) > 0.02) {
      const targets: number[] = [];
      for (let t = 0; t < N; t++) if (b.owner[t] === v) targets.push(t);
      // A victim's last territory is a kill too (v3): v2 offered it only as one of the
      // eight best single captures, so a card-holder's last stack could go unconsidered.
      if (targets.length > 0) out.push({ kind: "kill", targets });
    }
  }
  return out;
}

/** Every plan for this position, scored. */
export function plans(b: Board, me: Seat, toPlace: number, params: Params, rng: Rng): Plan[] {
  const income = expectedIncome(b, me);
  const threat = breakdown(b, me, params).commonThreat;
  const H = params.prefs.incomeHorizon;
  const out: Plan[] = [];
  const add = (kind: PlanKind, targets: number[], capture: CapturePlan | null, place: Map<number, number>) => {
    const plan: Plan = { kind, targets, capture, place, value: 0 };
    plan.value = scorePlan(b, me, plan, params, rng);
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

  for (const { kind, targets } of candidateTargets(b, me, toPlace, threat)) {
    // Placing until the plan is likely, until it is all but sure, or everything that helps.
    const variants = toPlace > 0 ? [0.9, 0.99, 1] : [1];
    for (const enough of variants) {
      const cp = planCapture(b, me, targets, toPlace, enough);
      if (cp === null) continue;
      // A run needs its launch stack able to attack once placing is done.
      if (cp.routes.some((r, i) => b.armies[r.source] + cp.alloc[i] < 2)) continue;
      const place = new Map<number, number>();
      cp.routes.forEach((r, i) => addPlace(place, r.source, cp.alloc[i]));
      if (enough < 1) guardAllocation(b, me, cp.leftover, place, income, H);
      else if (cp.routes.length > 0) addPlace(place, cp.routes[0].source, cp.leftover);
      add(kind, targets, cp, place);
      if (cp.leftover === 0 && enough < 1) break;
    }
  }
  return out;
}

const bestPlans = new WeakMap<Params, Memo<Plan>>();

/** The plan to commit to: the best, with a kill held to the commit margin. Without sampled
 *  outcomes the plan is a pure function of the board, so it is remembered: each move-in
 *  weighs the board the attack after it plans from. */
export function bestPlan(b: Board, me: Seat, toPlace: number, params: Params, rng: Rng): Plan {
  if (params.engine.outcomeSamples > 0) return choosePlan(b, me, toPlace, params, rng);
  return memoFor(bestPlans, params, 1_000).get(`${me.toString()}|${toPlace.toString()}|${boardKey(b)}`, () =>
    choosePlan(b, me, toPlace, params, rng),
  );
}

function choosePlan(b: Board, me: Seat, toPlace: number, params: Params, rng: Rng): Plan {
  const all = plans(b, me, toPlace, params, rng);
  let best: Plan | null = null;
  let bestKill: Plan | null = null;
  for (const p of all) {
    if (p.kind === "kill") {
      if (bestKill === null || p.value > bestKill.value) bestKill = p;
    } else if (best === null || p.value > best.value) best = p;
  }
  if (best === null) throw new Error("the planner always has a hold");
  if (bestKill !== null && bestKill.value > best.value + params.prefs.killCommitMargin) return bestKill;
  return best;
}
