import { balancedFight, captureChance, fairFight } from "../../blitz";

// Exact attack odds under the ranked rules: a blitz is resolved by Balanced Blitz
// (`COMBAT-8`, `blitz.ts`), a single battle by fair dice (`COMBAT-4`). "a against d"
// means a armies able to attack (the source holds a + the number it keeps) against
// d defenders.
//
// The two can be mixed, and the mix beats either: balancing favours the favourite,
// so an attacker that is not yet the favourite rolls single battles, fair, until it
// is, and then blitzes. The bot's capture odds are those of that best mix: at every
// (a, d), whichever of "blitz now" and "roll one battle, then play on as well" has
// the better chance of the capture. A favourite always blitzes.

/** For each attacker dice (1–3) and defender dice (1–2): the chance the attacker loses
 *  k armies, k = 0 … pairs. Worked out by enumerating every roll. */
const ROLL: number[][][] = [];
for (let ad = 1; ad <= 3; ad++) {
  ROLL[ad] = [];
  for (let dd = 1; dd <= 2; dd++) {
    const pairs = Math.min(ad, dd);
    const counts = new Array<number>(pairs + 1).fill(0);
    const total = 6 ** (ad + dd);
    for (let code = 0; code < total; code++) {
      let c = code;
      const a: number[] = [];
      const d: number[] = [];
      for (let i = 0; i < ad; i++, c = Math.floor(c / 6)) a.push(c % 6);
      for (let i = 0; i < dd; i++, c = Math.floor(c / 6)) d.push(c % 6);
      a.sort((x, y) => y - x);
      d.sort((x, y) => y - x);
      let lost = 0;
      for (let i = 0; i < pairs; i++) if (a[i] <= d[i]) lost++;
      counts[lost]++;
    }
    ROLL[ad][dd] = counts.map((n) => n / total);
  }
}

/** The chance the attacker loses k armies in one battle of `a` attackers against `d`. */
export function rollOdds(a: number, d: number): readonly number[] {
  return ROLL[Math.min(3, a)][Math.min(2, d)];
}

/** How an attack of `a` against `d` ends when played the best way: `win[x]` is the
 *  chance it captures with x attackers left (x ≥ 1), `fail[y]` the chance it runs out
 *  with y defenders left. */
export interface BattleOutcome {
  win: Float64Array;
  fail: Float64Array;
  pWin: number;
  /** The fewest survivors with a chance worth counting: below it `win` is negligible. */
  winFrom: number;
  /** Whether the best way starts with a single battle rather than a blitz. */
  roll: boolean;
}

/** Chances below this are dropped: far under any decision's resolution. */
const NEGLIGIBLE = 1e-12;
/** Past this many armies a side, rolling is not weighed: the table it needs grows as
 *  the square of the fight, and a fight that large is never close for long. */
const ROLL_LIMIT = 60;

/** Past this many armies in all, a fight is worked out at the same ratio scaled down to it:
 *  an exact balanced fight costs as much as its two sides multiplied, and a stalemate's
 *  stacks of hundreds would make a single decision take seconds. A fight that large is
 *  decided by its ratio. */
const EXACT_LIMIT = 300;

const outcomes = new Map<number, BattleOutcome>();

/** A large fight's outcome from the same fight scaled down, its survivors scaled back up. */
function scaledOutcome(a: number, d: number): BattleOutcome {
  const f = EXACT_LIMIT / (a + d);
  const sa = Math.max(1, Math.round(a * f));
  const sd = Math.max(1, Math.round(d * f));
  const small = battleOutcome(sa, sd);
  const win = new Float64Array(a + 1);
  const fail = new Float64Array(d + 1);
  for (let x = 1; x <= sa; x++) win[Math.min(a, Math.max(1, Math.round((x * a) / sa)))] += small.win[x];
  for (let y = 1; y <= sd; y++) fail[Math.min(d, Math.max(1, Math.round((y * d) / sd)))] += small.fail[y];
  return finish(win, fail, small.roll);
}

function blitzOutcome(a: number, d: number): BattleOutcome {
  const fight = balancedFight(a, d) ?? fairFight(a, d);
  const win = new Float64Array(a + 1);
  const fail = new Float64Array(d + 1);
  for (let lost = 0; lost < a; lost++) win[a - lost] = fight.attackerLost[lost];
  for (let lost = 0; lost < d; lost++) fail[d - lost] = fight.defenderLost[lost];
  return finish(win, fail, false);
}

function finish(win: Float64Array, fail: Float64Array, roll: boolean): BattleOutcome {
  let pWin = 0;
  for (const p of win) pWin += p;
  let winFrom = 1;
  while (winFrom < win.length - 1 && win[winFrom] < NEGLIGIBLE) winFrom++;
  return { win, fail, pWin, winFrom, roll };
}

/** One battle with the most dice, then the best play from wherever it leaves the fight. */
function rollOutcome(a: number, d: number): BattleOutcome {
  const win = new Float64Array(a + 1);
  const fail = new Float64Array(d + 1);
  const odds = rollOdds(a, d);
  const pairs = odds.length - 1;
  for (let k = 0; k <= pairs; k++) {
    const x = a - k;
    const y = d - (pairs - k);
    const p = odds[k];
    if (y === 0) win[x] += p;
    else if (x === 0) fail[y] += p;
    else {
      const next = battleOutcome(x, y);
      for (let s = 1; s <= x; s++) win[s] += p * next.win[s];
      for (let s = 1; s <= y; s++) fail[s] += p * next.fail[s];
    }
  }
  return finish(win, fail, true);
}

export function battleOutcome(a: number, d: number): BattleOutcome {
  const id = a * 100_000 + d;
  const known = outcomes.get(id);
  if (known) return known;
  if (a + d > EXACT_LIMIT) {
    const scaled = scaledOutcome(a, d);
    outcomes.set(id, scaled);
    return scaled;
  }
  const blitz = blitzOutcome(a, d);
  let result = blitz;
  if (a <= ROLL_LIMIT && d <= ROLL_LIMIT && blitz.pWin < 1) {
    const roll = rollOutcome(a, d);
    if (roll.pWin > blitz.pWin + 1e-9) result = roll;
  }
  if (outcomes.size > 50_000) outcomes.clear();
  outcomes.set(id, result);
  return result;
}

/** The chance `a` attackers capture a territory held by `d`, played the best way. */
export function winProb(a: number, d: number): number {
  if (d <= 0) return 1;
  if (a <= 0) return 0;
  return battleOutcome(a, d).pWin;
}

/** The fewest attackers whose blitz is as sure of the capture as committing all `a`:
 *  the rest stay home whatever happens, and a smaller blitz costs no more. The chance
 *  grows with the attackers, so the fewest is found by halving. Past `EXACT_LIMIT` the
 *  exact odds are weighed only up to it: a blitz that is sure within it is sure, and
 *  otherwise every army goes. */
export function blitzCommit(a: number, d: number): number {
  const most = Math.min(a, EXACT_LIMIT - d);
  if (most < 1) return a;
  const best = captureChance(most, d);
  if (most < a && best < 0.995) return a;
  let lo = 1;
  let hi = most;
  while (lo < hi) {
    const k = (lo + hi) >> 1;
    if (captureChance(k, d) >= best - 0.005) hi = k;
    else lo = k + 1;
  }
  return lo;
}

/** A run along a path: `armies` stand on the launch territory, the defenders are
 *  taken one after another, each capture moving all but one army forward. */
export interface PathRun {
  /** The chance every defender falls. */
  pSuccess: number;
  /** Given success, the expected armies on the last territory taken. */
  arrive: number;
  /** The chance the run stops at defender i (0-based). */
  stopAt: Float64Array;
}

const runs = new Map<string, PathRun>();

/** Path runs are pure and the planner asks for the same ones over and over (every
 *  plan's threat model checks the same kills), so they are remembered. */
export function pathRun(armies: number, defenders: readonly number[]): PathRun {
  const id = `${armies}:${defenders.join(",")}`;
  const known = runs.get(id);
  if (known) return known;
  const run = computePathRun(armies, defenders);
  if (runs.size > 100_000) runs.clear();
  runs.set(id, run);
  return run;
}

function computePathRun(armies: number, defenders: readonly number[]): PathRun {
  // dist[x]: the chance x attackers (the holder's armies less the one left behind) are ready.
  const attackers = Math.max(0, armies - 1);
  let dist = new Float64Array(attackers + 1);
  dist[attackers] = 1;
  const stopAt = new Float64Array(defenders.length);
  for (let i = 0; i < defenders.length; i++) {
    const next = new Float64Array(dist.length);
    let lost = 0;
    for (let x = 0; x < dist.length; x++) {
      const m = dist[x];
      if (m < NEGLIGIBLE) continue;
      if (x === 0) {
        lost += m;
        continue;
      }
      const o = battleOutcome(x, defenders[i]);
      lost += m * (1 - o.pWin);
      // x' survivors move in; x' − 1 of them can attack the next defender.
      for (let s = o.winFrom; s < o.win.length; s++) next[s - 1] += m * o.win[s];
    }
    stopAt[i] = lost;
    dist = next;
  }
  let pSuccess = 0;
  let arrive = 0;
  for (let x = 0; x < dist.length; x++) {
    pSuccess += dist[x];
    arrive += dist[x] * (x + 1);
  }
  return { pSuccess, arrive: pSuccess > 0 ? arrive / pSuccess : 0, stopAt };
}

/** The expected attackers lost taking a territory, given the capture. */
export function expectedLoss(a: number, d: number): number {
  const o = battleOutcome(a, d);
  if (o.pWin === 0) return a;
  let survivors = 0;
  for (let x = 1; x < o.win.length; x++) survivors += x * o.win[x];
  return a - survivors / o.pWin;
}

/** The armies the defender loses beyond what the attacker loses when `a` attack `d`
 *  to the end, or 0 when the attacker would come off worse (it wouldn't attack). */
export function exchange(a: number, d: number): number {
  const o = battleOutcome(a, d);
  let attackerLost = 0;
  let defenderLost = 0;
  for (let x = 1; x < o.win.length; x++) {
    attackerLost += o.win[x] * (a - x);
    defenderLost += o.win[x] * d;
  }
  for (let y = 1; y < o.fail.length; y++) {
    attackerLost += o.fail[y] * a;
    defenderLost += o.fail[y] * (d - y);
  }
  return Math.max(0, defenderLost - attackerLost);
}
