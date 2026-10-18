import type { Seat } from "../../contract";
import { ADJ, type Board } from "../rule-v1/board";
import { battleOutcome } from "../rule-v1/odds";
import { planCapture } from "../rule-v3/routes";

/** Below this, the screen's chance is the answer: a kill this unlikely isn't worth planning
 *  routes for. */
const KILL_SCREEN = 0.01;

/** The chance `attacker` eliminates `victim` this turn with `toPlace` armies.
 *
 *  First a screen, which only the work of planning routes depends on. The victim's territories
 *  fall into groups that touch, and the capture planner takes each group from one launch stack:
 *  beside it, or one third player's territory away. Every capture leaves an army behind, so a
 *  stack with fewer attackers than its group has territories, everything to place included, has
 *  no chance at all. Otherwise the best stack's run through the group is walked forward, and the
 *  groups' chances multiplied; the plan's own chance is used wherever that reaches the screen.
 *  v3 called any kill whose armies near the victim fell short of 0.8 of its defenders and an
 *  army each impossible, so one territory going from 4 armies to 2 moved a kill from 0 to 78%. */
export function killChance(b: Board, attacker: Seat, victim: Seat, toPlace: number): number {
  const targets: number[] = [];
  for (let t = 0; t < b.owner.length; t++) if (b.owner[t] === victim) targets.push(t);
  if (targets.length === 0) return 0;
  let screen = 1;
  const grouped = new Uint8Array(b.owner.length);
  for (const start of targets) {
    if (grouped[start] === 1) continue;
    const group = [start];
    grouped[start] = 1;
    for (let i = 0; i < group.length; i++) {
      for (const n of ADJ[group[i]]) {
        if (b.owner[n] === victim && grouped[n] === 0) {
          grouped[n] = 1;
          group.push(n);
        }
      }
    }
    const attackers = launchNear(b, attacker, victim, group) + toPlace;
    if (attackers < group.length) return 0;
    screen *= walkedRun(attackers, group.map((t) => b.armies[t]).sort((x, y) => x - y));
  }
  if (screen < KILL_SCREEN) return screen;
  return planCapture(b, attacker, targets, toPlace, 1)?.pSuccess ?? 0;
}

/** The attackers `attacker`'s best launch stack can bring against `group`: one beside it, or
 *  one a third player's territory away less what breaking through it costs. */
function launchNear(b: Board, attacker: Seat, victim: Seat, group: readonly number[]): number {
  let best = 0;
  for (const t of group) {
    for (const n of ADJ[t]) {
      if (b.owner[n] === attacker) best = Math.max(best, b.armies[n] - 1);
      else if (b.owner[n] !== victim) {
        for (const s of ADJ[n]) if (b.owner[s] === attacker) best = Math.max(best, b.armies[s] - 1 - (b.armies[n] + 1));
      }
    }
  }
  return best;
}

/** The chance `attackers` take every one of `defenders` in turn, each capture's survivors moving
 *  on less the one left behind, walked forward on their expected number. Cheap, and not
 *  `pathRun`: the planner relies on the runs it remembers, and a screen's many would push them out. */
function walkedRun(attackers: number, defenders: readonly number[]): number {
  let a = attackers;
  let p = 1;
  for (const d of defenders) {
    if (a <= 0) return 0;
    const o = battleOutcome(a, d);
    p *= o.pWin;
    if (p < KILL_SCREEN) return p;
    let survivors = 0;
    for (let x = 1; x < o.win.length; x++) survivors += x * o.win[x];
    a = Math.round(survivors / o.pWin) - 1;
  }
  return p;
}
