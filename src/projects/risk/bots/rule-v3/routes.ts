// v3's copy of v2's capture planner (`../rule-v2/routes.ts`), with the changes marked v3.
import type { Seat } from "../../contract";
import { ADJ, type Board } from "../rule-v1/board";
import { pathRun } from "../rule-v1/odds";

// The capture planner: how a seat takes a set of territories this turn (a card spot,
// the rest of a continent, or every territory a victim holds), from which of its
// stacks, along which order, and how it splits the armies it has to place. Following
// Domination's elimination search: each connected group of targets is entered from
// the launch stack that gives the best run, and covered in an order that keeps the
// run a path where it can. A branch is costed as if the run went on in one line (the
// armies kept back at a fork fight the next branch), a slight optimism.

/** What a way in through a third player's territory gives up against a direct one, in the
 *  route score's units (1000 per certainty): a direct way in less sure by this much still wins. */
const THIRD_PARTY_COST = 30;

export interface Route {
  /** The launch territory, the seat's own. */
  source: number;
  /** Territories taken in order: a third player's on the way, then the targets. */
  path: number[];
}

export interface CapturePlan {
  routes: Route[];
  /** Armies placed on each route's source. */
  alloc: number[];
  /** Armies to place left over for defence. */
  leftover: number;
  /** Each route's chance to take all of its path, independent of the others. */
  pRoute: number[];
  pSuccess: number;
  /** Given success, each route's expected armies on its last territory. */
  arrive: number[];
}

/** The order a run takes a connected group of targets from `entry`: always the
 *  next target with the fewest untaken target neighbours, so the run stays a path
 *  where the group allows; at a dead end it branches from the latest capture that can. */
function coverOrder(b: Board, group: Group, entry: number): number[] {
  const order = [entry];
  const taken = new Uint8Array(b.owner.length);
  taken[entry] = 1;
  while (order.length < group.members.length) {
    let next = -1;
    for (let k = order.length - 1; k >= 0 && next < 0; k--) {
      let best = Infinity;
      for (const n of ADJ[order[k]]) {
        if (group.has[n] === 0 || taken[n] === 1) continue;
        let onward = 0;
        for (const m of ADJ[n]) if (group.has[m] === 1 && taken[m] === 0) onward++;
        const score = onward * 1000 + b.armies[n];
        if (score < best) {
          best = score;
          next = n;
        }
      }
    }
    if (next < 0) break;
    order.push(next);
    taken[next] = 1;
  }
  return order;
}

/** A connected group of targets: its members in the order the search found them, and
 *  a flag per territory for whether it is one. */
interface Group {
  members: number[];
  has: Uint8Array;
}

function groups(targets: readonly number[], territories: number): Group[] {
  const left = new Uint8Array(territories);
  for (const t of targets) left[t] = 1;
  const out: Group[] = [];
  for (const start of targets) {
    if (left[start] === 0) continue;
    const g: Group = { members: [start], has: new Uint8Array(territories) };
    g.has[start] = 1;
    left[start] = 0;
    const stack = [start];
    while (stack.length > 0) {
      const t = stack.pop() as number;
      for (const n of ADJ[t]) {
        if (left[n] === 1) {
          left[n] = 0;
          g.members.push(n);
          g.has[n] = 1;
          stack.push(n);
        }
      }
    }
    out.push(g);
  }
  return out;
}

const defendersOf = (b: Board, path: readonly number[]) => path.map((t) => b.armies[t]);

/** The plan for `seat` to take every one of `targets` this turn with `toPlace`
 *  armies to place, or null when some target can't be reached. Placement stops once
 *  the plan's chance reaches `enough` (1 spends every army that still helps). */
export function planCapture(
  b: Board,
  seat: Seat,
  targets: readonly number[],
  toPlace: number,
  enough: number,
): CapturePlan | null {
  const routes: Route[] = [];
  const used = new Set<number>();
  const isTarget = new Uint8Array(b.owner.length);
  for (const t of targets) isTarget[t] = 1;
  for (const group of groups(targets, b.owner.length)) {
    const entries: { source: number; prefix: number[]; entry: number }[] = [];
    for (const e of group.members) {
      for (const s of ADJ[e]) {
        if (b.owner[s] === seat) entries.push({ source: s, prefix: [], entry: e });
        else if (group.has[s] === 0 && isTarget[s] === 0) {
          // One territory of a third player's on the way in.
          for (const s2 of ADJ[s]) if (b.owner[s2] === seat) entries.push({ source: s2, prefix: [s], entry: e });
        }
      }
    }
    let route: Route | null = null;
    let bestScore = -Infinity;
    // Many launch stacks share a way in, and the order from it is the same for each.
    const orders = new Map<number, number[]>();
    for (const { source, prefix, entry } of entries) {
      let order = orders.get(entry);
      if (order === undefined) orders.set(entry, (order = coverOrder(b, group, entry)));
      const path = [...prefix, ...order];
      // A stack already leading another route keeps its armies to place for that one, and
      // has only what that route leaves it (v2): its defenders, and an army on each
      // territory it takes. v1 counted the whole stack again, so two groups beside
      // different stacks were both launched from the first and joined into one run.
      const earlier = routes.find((r) => r.source === source);
      const left = earlier ? b.armies[source] - defendersOf(b, earlier.path).reduce((x, d) => x + d + 1, 0) : b.armies[source];
      const p = pathRun(Math.max(1, left) + (used.has(source) ? 0 : toPlace), defendersOf(b, path)).pSuccess;
      // A way in through a third player's territory costs a fight with someone the plan isn't
      // about, so a direct way in wins any near tie (v3). Balanced Blitz makes many ways in
      // sure, and v2 took whichever came first in the neighbour list.
      const score = p * 1000 + left - (prefix.length > 0 ? THIRD_PARTY_COST : 0);
      if (score > bestScore) {
        bestScore = score;
        route = { source, path };
      }
    }
    if (route === null) return null;
    const chosen = route;
    const sameSource = routes.find((r) => r.source === chosen.source);
    if (sameSource) sameSource.path.push(...chosen.path);
    else routes.push(chosen);
    used.add(chosen.source);
  }

  const alloc = routes.map(() => 0);
  const defenders = routes.map((r) => defendersOf(b, r.path));
  const runs = routes.map((r, i) => pathRun(b.armies[r.source], defenders[i]));
  const product = () => runs.reduce((p, r) => p * r.pSuccess, 1);
  let left = toPlace;
  const chunk = Math.max(1, Math.ceil(toPlace / 10));
  while (left > 0 && product() < enough) {
    const step = Math.min(chunk, left);
    const current = product();
    let bestI = -1;
    let bestP = current;
    let bestRun = runs[0];
    let weakest = 0;
    for (let i = 0; i < routes.length; i++) {
      if (runs[i].pSuccess < runs[weakest].pSuccess) weakest = i;
      const run = pathRun(b.armies[routes[i].source] + alloc[i] + step, defenders[i]);
      const p = runs.reduce((q, r, j) => q * (j === i ? run.pSuccess : r.pSuccess), 1);
      if (p > bestP + 1e-9) {
        bestP = p;
        bestI = i;
        bestRun = run;
      }
    }
    if (bestI < 0) {
      // While two routes are both hopeless no single chunk shows a gain: feed the weaker.
      if (current > 0 || runs[weakest].pSuccess >= 0.999) break;
      bestI = weakest;
      bestRun = pathRun(b.armies[routes[weakest].source] + alloc[weakest] + step, defenders[weakest]);
    }
    alloc[bestI] += step;
    left -= step;
    runs[bestI] = bestRun;
  }
  return {
    routes,
    alloc,
    leftover: left,
    pRoute: runs.map((r) => r.pSuccess),
    pSuccess: product(),
    arrive: runs.map((r) => r.arrive),
  };
}

/** The chance `attacker` eliminates `victim` this turn with `toPlace` armies, or 0
 *  when its armies near the victim plainly can't cover the cost. Near means as far as a
 *  route reaches: beside the victim, or one third player's territory away, less what
 *  breaking through it costs (v2). v1 counted only stacks beside the victim, so it saw no
 *  kill whose way in crossed a third player, though its routes take that way. */
export function killChance(b: Board, attacker: Seat, victim: Seat, toPlace: number): number {
  const targets: number[] = [];
  let need = 0;
  for (let t = 0; t < b.owner.length; t++) {
    if (b.owner[t] === victim) {
      targets.push(t);
      need += b.armies[t] + 1;
    }
  }
  if (targets.length === 0) return 0;
  let force = toPlace;
  const counted = new Uint8Array(b.owner.length);
  for (const t of targets) {
    for (const n of ADJ[t]) {
      if (b.owner[n] === attacker && counted[n] === 0) {
        counted[n] = 1;
        force += b.armies[n] - 1;
      }
    }
  }
  for (const t of targets) {
    for (const n of ADJ[t]) {
      if (b.owner[n] === attacker || b.owner[n] === victim) continue;
      for (const s of ADJ[n]) {
        if (b.owner[s] === attacker && counted[s] === 0) {
          counted[s] = 1;
          force += Math.max(0, b.armies[s] - 1 - (b.armies[n] + 1));
        }
      }
    }
  }
  if (force < 0.8 * need) return 0;
  return planCapture(b, attacker, targets, toPlace, 1)?.pSuccess ?? 0;
}
