import type { Seat } from "../../contract";
import type { TerritoryId } from "../../map";
import { ADJ, CONTINENT_MEMBERS, hasEnemyNeighbour, idx, IDS, type Board } from "./board";
import { winProb } from "./odds";
import type { Params } from "./params";

// Setup placement (§2.1), kept apart: setup is becoming the deal's automatic
// placement (RISK: Global Domination's Auto Placement), and with it this file goes.
// Nothing else in v1 depends on it.

const SOUTH_AMERICA = 1;
const AFRICA = 3;
const AUSTRALIA = 5;

/** Setup (`SETUP-5`, §2.1): one army at a time, re-scored every time. */
export function setupPlacement(b: Board, me: Seat, own: readonly TerritoryId[], params: Params): TerritoryId {
  const mine = own.map(idx);
  const armies = (t: number) => b.armies[t];

  // A small continent three quarters mine (Africa only at 3 players): build to take
  // the rest on the first turn at 85% or better. Never build toward the big ones.
  const small = b.players === 3 ? [SOUTH_AMERICA, AUSTRALIA, AFRICA] : [SOUTH_AMERICA, AUSTRALIA];
  if (params.prefs.myContinentWeight > 0) {
    for (const c of small) {
      const members = CONTINENT_MEMBERS[c];
      const missing = members.filter((t) => b.owner[t] !== me);
      if (missing.length !== 1 && !(c === AFRICA && missing.length === 2)) continue;
      const target = missing[0];
      let launch = -1;
      for (const n of ADJ[target]) if (b.owner[n] === me && (launch < 0 || armies(n) > armies(launch))) launch = n;
      if (launch >= 0 && winProb(armies(launch) - 1, armies(target) + 2) < 0.85) return IDS[launch];
    }
  }

  // Block: an opponent holds all of a continent but one territory, and it is mine.
  for (const members of CONTINENT_MEMBERS) {
    const mineHere = members.filter((t) => b.owner[t] === me);
    if (mineHere.length !== 1) continue;
    const others = new Set(members.filter((t) => b.owner[t] !== me).map((t) => b.owner[t]));
    if (others.size !== 1) continue;
    const t = mineHere[0];
    let threat = 0;
    for (const n of ADJ[t]) if (b.owner[n] !== me) threat = Math.max(threat, armies(n) - 1 + 3);
    if (threat > 0 && winProb(threat, armies(t)) > 0.5 && armies(t) < 12) return IDS[t];
  }

  // Stacks: seeds that border weak enemy territories inside a cluster of mine, spread
  // apart; the smallest seed grows next.
  const front = mine.filter((t) => hasEnemyNeighbour(b, t));
  if (front.length === 0) return IDS[mine[0]];
  const quality = (t: number) => {
    let q = 0;
    for (const n of ADJ[t]) q += b.owner[n] === me ? 0.4 : 1 / armies(n);
    return q + 0.5 * armies(t);
  };
  const ranked = [...front].sort((x, y) => quality(y) - quality(x) || x - y);
  const seeds: number[] = [];
  const want = params.prefs.stackTarget[b.players] ?? 3;
  for (const t of ranked) {
    if (seeds.length >= want) break;
    if (seeds.some((s) => ADJ[s].includes(t))) continue;
    seeds.push(t);
  }
  if (seeds.length === 0) seeds.push(ranked[0]);
  // The seed facing the strongest enemy relative to its own size grows first.
  let pick = seeds[0];
  let worst = -Infinity;
  for (const s of seeds) {
    let enemy = 0;
    for (const n of ADJ[s]) if (b.owner[n] !== me) enemy = Math.max(enemy, armies(n));
    const pressure = enemy - armies(s) + quality(s) * 0.01;
    if (pressure > worst) {
      worst = pressure;
      pick = s;
    }
  }
  return IDS[pick];
}
