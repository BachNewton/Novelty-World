import type { Seat } from "../../contract";
import { ADJ, hasEnemyNeighbour, N, type Board } from "../rule-v1/board";
import { battleOutcome, pathRun, winProb } from "../rule-v1/odds";
import type { CapturePlan } from "../rule-v3/routes";

// The sweep (`ideas/rule-bot-v5.md`): how the winner of G4FR attacked. Every army to place
// goes onto one stack, which blitzes into the thinnest territory beside it, moves all but one
// army in, and goes on from there while the next capture is sure. v4's plans take one
// territory, the rest of a continent or a player's last territories; none strings captures
// across players and continents, which is how one stack took 8, 11 and 19 territories in a turn.

/** A capture a sweep counts as sure: the opponent model's bar for an opponent's sweep against me
 *  (`rule-v4/opponents.ts`), so I believe of my stack what I believe of theirs. */
export const SURE = 0.9;

/** The armies that arrive, on average, when `a` attackers capture a territory held by `d`. */
function arriving(a: number, d: number): number {
  const o = battleOutcome(a, d);
  let armies = 0;
  for (let x = 1; x < o.win.length; x++) armies += o.win[x] * x;
  return o.pWin > 0 ? armies / o.pWin : 0;
}

/** The territories a stack of `armies` on `source` takes in a sweep, in order: always the
 *  thinnest enemy territory beside the stack that it is sure of, the one with more ways on
 *  first when two are as thin, until no capture is sure. `open` says which territories it may
 *  take. A path, never a fork: the whole stack moves on, as the winner's did. */
export function sweepPath(b: Board, me: Seat, source: number, armies: number, open: (t: number) => boolean): number[] {
  const taken = new Uint8Array(N);
  const path: number[] = [];
  let at = source;
  let a = armies - 1;
  for (;;) {
    let next = -1;
    let nextOnward = 0;
    for (const t of ADJ[at]) {
      if (b.owner[t] === me || taken[t] === 1 || !open(t) || winProb(a, b.armies[t]) < SURE) continue;
      let onward = 0;
      for (const n of ADJ[t]) if (b.owner[n] !== me && taken[n] === 0) onward++;
      if (next < 0 || b.armies[t] < b.armies[next] || (b.armies[t] === b.armies[next] && onward > nextOnward)) {
        next = t;
        nextOnward = onward;
      }
    }
    if (next < 0) return path;
    taken[next] = 1;
    path.push(next);
    a = Math.round(arriving(a, b.armies[next])) - 1;
    at = next;
    if (a <= 0) return path;
  }
}

/** The sweeps worth a plan this turn: from the stacks whose sweep runs longest, everything to
 *  place on the stack, the whole sweep and its first half. Under a common threat the sweep goes
 *  only through the threat's territories, and a card-less player left as a buffer at a big
 *  table is never finished: v4's rules for which captures a plan may make (`rule-v4/planner.ts`). */
export function sweepPlans(b: Board, me: Seat, toPlace: number, threat: Seat | null, launches = 2): CapturePlan[] {
  const held = new Array<number>(b.players).fill(0);
  for (let t = 0; t < N; t++) held[b.owner[t]]++;
  const alive = b.alive.filter(Boolean).length;
  const buffer = (s: Seat) => s !== me && b.handSize[s] === 0 && alive >= 5;
  const open = (t: number) => threat === null || threat === me || b.owner[t] === threat;
  /** The sweep up to the capture that would finish a buffer. */
  const sparing = (path: number[]): number[] => {
    const left = held.slice();
    for (let i = 0; i < path.length; i++) {
      const s = b.owner[path[i]];
      if (buffer(s) && --left[s] === 0) return path.slice(0, i);
    }
    return path;
  };

  const found: { source: number; path: number[] }[] = [];
  for (let t = 0; t < N; t++) {
    if (b.owner[t] !== me || !hasEnemyNeighbour(b, t) || b.armies[t] + toPlace < 3) continue;
    const path = sparing(sweepPath(b, me, t, b.armies[t] + toPlace, open));
    if (path.length >= 2) found.push({ source: t, path });
  }
  found.sort((x, y) => y.path.length - x.path.length || b.armies[y.source] - b.armies[x.source] || x.source - y.source);

  const out: CapturePlan[] = [];
  for (const { source, path } of found.slice(0, launches)) {
    const lengths = new Set([path.length, Math.ceil(path.length / 2)]);
    for (const k of lengths) {
      if (k < 2) continue;
      const route = path.slice(0, k);
      const run = pathRun(b.armies[source] + toPlace, route.map((t) => b.armies[t]));
      out.push({ routes: [{ source, path: route }], alloc: [toPlace], leftover: 0, pRoute: [run.pSuccess], pSuccess: run.pSuccess, arrive: [run.arrive] });
    }
  }
  return out;
}

