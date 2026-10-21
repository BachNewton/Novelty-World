import type { Seat } from "../../contract";
import { ADJ, CONTINENT_MEMBERS, CONTINENT_OF, hasEnemyNeighbour, holdsContinent, N, type Board } from "../rule-v1/board";
import { expectedLoss, winProb } from "../rule-v1/odds";
import { SURE, sweepPath } from "../rule-v5/sweep";

// The sweeper's playbook (`ideas/sweeper-v1.md`), as rules on the bot's own board: one stack
// fed everything, sweeping thin territories while the next capture is sure, a card every turn,
// the stack brought home to a hub after the sweep, and a continent with one way in held by a
// guard on its gate.

/** The guard a one-way-in continent's gate keeps: the low end of the guards the human winner
 *  kept on Siam and Indonesia. */
export const GUARD = 6;

/** The fewest armies the sweep attacks with: below it the stack stops, still a stack to bring
 *  home. The winner's sweeps stopped with 4 to 19 left, most often about 6. */
export const STACK = 6;

/** The chance a turn's card capture must have, when the sweep took nothing. */
export const CARD_BAR = 0.5;

interface OneWayIn {
  continent: number;
  /** The member with the only edge out. */
  inside: number;
  /** The territory beyond that edge. */
  outside: number;
}

/** The continents with a single edge to the rest of the map: Australia, through Siam. */
export const ONE_WAY_IN: readonly OneWayIn[] = CONTINENT_MEMBERS.flatMap((members, continent) => {
  const edges = members.flatMap((t) => ADJ[t].filter((n) => CONTINENT_OF[n] !== continent).map((n) => ({ inside: t, outside: n })));
  return edges.length === 1 ? [{ continent, ...edges[0] }] : [];
});

/** Where the guard of a one-way-in continent I hold stands: on the territory beyond the edge
 *  when I hold it too, as the winner held Siam, else on the entrance itself. */
export function gate(b: Board, me: Seat): number | null {
  for (const c of ONE_WAY_IN) {
    if (holdsContinent(b, me, c.continent)) return b.owner[c.outside] === me ? c.outside : c.inside;
  }
  return null;
}

/** The armies `t` keeps whatever the stack does: the guard on the gate, one elsewhere. */
export function keep(t: number, guardAt: number | null): number {
  return t === guardAt ? GUARD : 1;
}

/** The territories a stack of `armies` on `t` would sweep, keeping what `t` must keep: v5's
 *  sweep, cut where fewer than `STACK` armies would be left to attack with. */
function sweepFrom(b: Board, me: Seat, t: number, armies: number, guardAt: number | null): number[] {
  const path = sweepPath(b, me, t, armies - keep(t, guardAt) + 1, () => true);
  let attackers = armies - keep(t, guardAt);
  for (let i = 0; i < path.length; i++) {
    if (attackers < STACK) return path.slice(0, i);
    attackers = Math.round(attackers - expectedLoss(attackers, b.armies[path[i]])) - 1;
  }
  return path;
}

/** While I hold no one-way-in continent, what the stack goes for first, as the winner took
 *  Australia by his tenth turn in both games: the continent's territories and the one beyond its
 *  edge, those I don't hold. */
export function aim(b: Board, me: Seat): Set<number> | null {
  if (gate(b, me) !== null) return null;
  const targets = new Set<number>();
  for (const c of ONE_WAY_IN) {
    for (const t of [...CONTINENT_MEMBERS[c.continent], c.outside]) if (b.owner[t] !== me) targets.add(t);
  }
  return targets;
}

/** The thinnest of `targets` beside `from` that a stack of `armies` there takes surely. */
function sureCapture(b: Board, me: Seat, from: number, armies: number, targets: ReadonlySet<number>): number | null {
  const attackers = armies - keep(from, gate(b, me));
  let best: number | null = null;
  for (const t of ADJ[from]) {
    if (!targets.has(t) || winProb(attackers, b.armies[t]) < SURE) continue;
    if (best === null || b.armies[t] < b.armies[best]) best = t;
  }
  return best;
}

/** The stack the turn feeds: while I aim at a one-way-in continent, the biggest territory that
 *  with everything placed on it takes one of its territories surely; otherwise the biggest
 *  territory facing an enemy that has a sweep, and the biggest facing an enemy when none has,
 *  so the stack grows. */
export function launch(b: Board, me: Seat, toPlace: number): number {
  const guardAt = gate(b, me);
  const targets = aim(b, me);
  const size = (t: number) => b.armies[t] - keep(t, guardAt);
  let best = -1;
  let bestRank = -1;
  for (let t = 0; t < N; t++) {
    if (b.owner[t] !== me || !hasEnemyNeighbour(b, t)) continue;
    const rank =
      targets !== null && sureCapture(b, me, t, b.armies[t] + toPlace, targets) !== null ? 2
      : sweepFrom(b, me, t, b.armies[t] + toPlace, guardAt).length > 0 ? 1
      : 0;
    if (rank > bestRank || (rank === bestRank && size(t) > size(best))) {
      best = t;
      bestRank = rank;
    }
  }
  if (best < 0) throw new Error(`seat ${me.toString()} has no territory facing an enemy`);
  return best;
}

/** How many armies the gate is short of its guard, if I hold a one-way-in continent. */
export function guardShortfall(b: Board, me: Seat): { gate: number; short: number } | null {
  const at = gate(b, me);
  if (at === null || b.armies[at] >= GUARD) return null;
  return { gate: at, short: GUARD - b.armies[at] };
}

/** The sweep's next capture from the stack at `head`: what it aims at, while a capture of it
 *  is sure, even below `STACK`; else the thinnest sure capture beside it. */
export function sweepTarget(b: Board, me: Seat, head: number): number | null {
  const targets = aim(b, me);
  const aimed = targets === null ? null : sureCapture(b, me, head, b.armies[head], targets);
  if (aimed !== null) return aimed;
  const path = sweepFrom(b, me, head, b.armies[head], gate(b, me));
  return path.length > 0 ? path[0] : null;
}

/** The turn's card, when the sweep took nothing: the surest capture anywhere, if it is at
 *  least even. */
export function cardCapture(b: Board, me: Seat): { from: number; to: number } | null {
  const guardAt = gate(b, me);
  let best: { from: number; to: number } | null = null;
  let bestChance = CARD_BAR;
  for (let from = 0; from < N; from++) {
    if (b.owner[from] !== me) continue;
    const attackers = b.armies[from] - keep(from, guardAt);
    for (const to of ADJ[from]) {
      if (b.owner[to] === me) continue;
      const chance = winProb(attackers, b.armies[to]);
      if (chance >= bestChance && (best === null || chance > bestChance || b.armies[to] < b.armies[best.to])) {
        best = { from, to };
        bestChance = chance;
      }
    }
  }
  return best;
}

/** The armies in a captured territory once moved in: everything but what the source keeps,
 *  unless the capture is a dead end and the source still faces an enemy, when the stack stays
 *  behind to go on. */
export function moveIn(b: Board, me: Seat, from: number, to: number, min: number, max: number): number {
  const clamp = (x: number) => Math.min(max, Math.max(min, x));
  if (!hasEnemyNeighbour(b, to) && hasEnemyNeighbour(b, from)) return min;
  return clamp(b.armies[from] + b.armies[to] - keep(from, gate(b, me)));
}

/** Steps on the map from `from` to every territory. */
function steps(from: number): Int32Array {
  const dist = new Int32Array(N).fill(-1);
  dist[from] = 0;
  const queue = [from];
  for (let k = 0; k < queue.length; k++) {
    for (const n of ADJ[queue[k]]) {
      if (dist[n] < 0) {
        dist[n] = dist[queue[k]] + 1;
        queue.push(n);
      }
    }
  }
  return dist;
}

/** Where a sweep that ended on `end` goes home to, of where it stands and the territories it
 *  can reach: the one nearest the territory it set out from, the winner's hub, that still
 *  faces an enemy. Staying put wins a tie; with no front in reach the stack stays. */
export function hub(b: Board, end: number, start: number, reachable: readonly number[]): number {
  const dist = steps(start);
  let best = end;
  for (const t of reachable) {
    if (!hasEnemyNeighbour(b, t)) continue;
    if (!hasEnemyNeighbour(b, best) || dist[t] < dist[best]) best = t;
  }
  return best;
}
