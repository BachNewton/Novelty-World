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
  // A group no stack of the attacker's can reach, the way a route goes in, leaves the planner
  // no route: the kill is out once the screen has had its say.
  let unreachable = false;
  if (grouped.length < b.owner.length) grouped = new Uint8Array(b.owner.length);
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
    const near = launchNear(b, attacker, victim, group);
    if (near < 0) unreachable = true;
    const attackers = Math.max(0, near) + toPlace;
    if (attackers < group.length) {
      ungroup(targets);
      return 0;
    }
    screen *= walkedRun(attackers, group.map((t) => b.armies[t]).sort((x, y) => x - y));
  }
  ungroup(targets);
  if (screen < KILL_SCREEN) return screen;
  if (unreachable) return 0;
  return planCapture(b, attacker, targets, toPlace, 1, fork)?.pSuccess ?? 0;
}

/** The victim's territories `killChance` has grouped, reused and cleared after: allocating it
 *  per call cost more than the grouping. */
let grouped = new Uint8Array(0);

function ungroup(targets: readonly number[]): void {
  for (const t of targets) grouped[t] = 0;
}

/** The most armies a stack of the attacker's beside `group`, or one third player's territory
 *  away, can bring to it (at least 0), or -1 when it has no such stack. */
function launchNear(b: Board, attacker: Seat, victim: Seat, group: readonly number[]): number {
  let found = false;
  let best = 0;
  for (const t of group) {
    for (const n of ADJ[t]) {
      if (b.owner[n] === attacker) {
        found = true;
        best = Math.max(best, b.armies[n] - 1);
      } else if (b.owner[n] !== victim) {
        for (const s of ADJ[n]) {
          if (b.owner[s] === attacker) {
            found = true;
            best = Math.max(best, b.armies[s] - 1 - (b.armies[n] + 1));
          }
        }
      }
    }
  }
  return found ? best : -1;
}

function walkedRun(attackers: number, defenders: readonly number[]): number {
  let a = attackers;
  let p = 1;
  for (const d of defenders) {
    if (a <= 0) return 0;
    const o = battleOutcome(a, d);
    p *= o.pWin;
    if (p < KILL_SCREEN) return p;
    a = Math.round(o.survivors / o.pWin) - 1;
  }
  return p;
}
