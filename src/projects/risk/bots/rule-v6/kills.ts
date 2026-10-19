import type { Seat } from "../../contract";
import { ADJ, type Board } from "../rule-v1/board";
import { battleOutcome } from "../rule-v1/odds";
import { planCapture } from "./routes";

// v4's kill chance (`rule-v4/kills.ts`), on v6's capture planner: with `fork` on, a victim
// whose land has split is costed cheap group first. Everything else is v4's, line for line.

/** Below this, the screen's chance is the answer: a kill this unlikely isn't worth planning
 *  routes for. */
const KILL_SCREEN = 0.01;

/** The chance `attacker` eliminates `victim` this turn with `toPlace` armies (v4). */
export function killChance(b: Board, attacker: Seat, victim: Seat, toPlace: number, fork: boolean): number {
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
  return planCapture(b, attacker, targets, toPlace, 1, fork)?.pSuccess ?? 0;
}

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
