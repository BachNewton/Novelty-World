// Exact battle odds (`COMBAT-2` to `COMBAT-5`, the defender always rolling the most
// dice, note `defender-dice`). "a against d" means a armies able to attack (the
// source holds a + its floor) against d defenders, fought with the most dice until
// one side is out: exactly what a blitz does.

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

// Win probabilities, filled bottom-up and grown on demand.
let winSize = 0;
let winTable = new Float64Array(0);

function growWin(size: number): void {
  const table = new Float64Array(size * size);
  for (let a = 0; a < size; a++) {
    for (let d = 0; d < size; d++) {
      if (d === 0) table[a * size + d] = a > 0 ? 1 : 0;
      else if (a === 0) table[a * size + d] = 0;
      else {
        const odds = rollOdds(a, d);
        const pairs = odds.length - 1;
        let p = 0;
        for (let k = 0; k <= pairs; k++) p += odds[k] * table[(a - k) * size + (d - (pairs - k))];
        table[a * size + d] = p;
      }
    }
  }
  winTable = table;
  winSize = size;
}

/** The chance `a` attackers capture a territory held by `d`. */
export function winProb(a: number, d: number): number {
  if (d <= 0) return 1;
  if (a <= 0) return 0;
  if (a >= winSize || d >= winSize) {
    if (Math.max(a, d) > 400) return winProb(Math.round((a * 400) / Math.max(a, d)), Math.round((d * 400) / Math.max(a, d)));
    growWin(Math.max(a, d, winSize * 2, 64) + 1);
  }
  return winTable[a * winSize + d];
}

/** How a blitz of `a` against `d` ends: `win[x]` is the chance it captures with x
 *  attackers left (x ≥ 1), `fail[y]` the chance it runs out with y defenders left. */
export interface BattleOutcome {
  win: Float64Array;
  fail: Float64Array;
  pWin: number;
  /** The fewest survivors with a chance worth counting: below it `win` is negligible. */
  winFrom: number;
}

/** Chances below this are dropped: far under any decision's resolution. */
const NEGLIGIBLE = 1e-12;

const outcomes = new Map<number, BattleOutcome>();

export function battleOutcome(a: number, d: number): BattleOutcome {
  const key = a * 100_000 + d;
  const known = outcomes.get(key);
  if (known) return known;
  const width = d + 1;
  const mass = new Float64Array((a + 1) * width);
  mass[a * width + d] = 1;
  const win = new Float64Array(a + 1);
  const fail = new Float64Array(d + 1);
  for (let total = a + d; total >= 1; total--) {
    for (let x = Math.min(a, total); x >= 0 && total - x <= d; x--) {
      const y = total - x;
      const m = mass[x * width + y];
      if (m === 0) continue;
      if (y === 0) {
        win[x] += m;
        continue;
      }
      if (x === 0) {
        fail[y] += m;
        continue;
      }
      const odds = rollOdds(x, y);
      const pairs = odds.length - 1;
      for (let k = 0; k <= pairs; k++) mass[(x - k) * width + (y - (pairs - k))] += m * odds[k];
    }
  }
  let pWin = 0;
  for (const p of win) pWin += p;
  let winFrom = 1;
  while (winFrom < a && win[winFrom] < NEGLIGIBLE) winFrom++;
  const result = { win, fail, pWin, winFrom };
  if (outcomes.size > 20_000) outcomes.clear();
  outcomes.set(key, result);
  return result;
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
  const key = `${armies}:${defenders.join(",")}`;
  const known = runs.get(key);
  if (known) return known;
  const run = computePathRun(armies, defenders);
  if (runs.size > 100_000) runs.clear();
  runs.set(key, run);
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
