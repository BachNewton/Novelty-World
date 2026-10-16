/*
 * Balanced Blitz (`COMBAT-8`): how a blitz is resolved, as RISK: Global Domination resolves it in
 * its ranked games. Pure, so the engine resolves blitzes with it and the screen and the bots read
 * the same odds from it.
 *
 * A fight is `a` armies able to attack (the attacking territory's armies less the number it stops
 * at) against `d` defenders. Its outcomes are two arrays, in GD's own layout:
 * - `attackerLost[i]`, i < a: the chance the attacker captures having lost i armies;
 *   `attackerLost[a]`: the chance the defender holds.
 * - `defenderLost[j]`, j < d: the chance the defender holds having lost j armies;
 *   `defenderLost[d]`: the chance the attacker captures.
 * In "combined order", best for the attacker first, the outcomes run `attackerLost[0 … a − 1]`, then
 * `defenderLost[d − 1]` down to `defenderLost[0]`.
 */

export interface Fight {
  attackerLost: Float64Array;
  defenderLost: Float64Array;
}

/** One battle with `attackDice` against `defendDice`: each (attacker losses, defender losses) and
 *  its chance. Fair six-sided dice, highest paired with highest, ties to the defender (`COMBAT-4`). */
type RoundOutcomes = readonly { attackerLosses: number; defenderLosses: number; p: number }[];

const ROUNDS: RoundOutcomes[][] = [];
for (let attackDice = 1; attackDice <= 3; attackDice++) {
  ROUNDS[attackDice] = [];
  for (let defendDice = 1; defendDice <= 2; defendDice++) {
    const counts = new Map<string, number>();
    const total = 6 ** (attackDice + defendDice);
    for (let roll = 0; roll < total; roll++) {
      const faces = Array.from({ length: attackDice + defendDice }, (_, i) => Math.floor(roll / 6 ** i) % 6);
      const attack = faces.slice(0, attackDice).sort((x, y) => y - x);
      const defend = faces.slice(attackDice).sort((x, y) => y - x);
      let attackerLosses = 0;
      let defenderLosses = 0;
      for (let i = 0; i < Math.min(attackDice, defendDice); i++) {
        if (attack[i] > defend[i]) defenderLosses++;
        else attackerLosses++;
      }
      const key = `${attackerLosses},${defenderLosses}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    ROUNDS[attackDice][defendDice] = [...counts].map(([key, count]) => {
      const [attackerLosses, defenderLosses] = key.split(",").map(Number);
      return { attackerLosses, defenderLosses, p: count / total };
    });
  }
}

/** The fair odds of fighting `a` against `d` to the end, both sides rolling the most dice they may
 *  (step 1 of `COMBAT-8`). */
export function fairFight(a: number, d: number): Fight {
  const width = d + 1;
  const chance = new Float64Array((a + 1) * width);
  chance[a * width + d] = 1;
  for (let total = a + d; total >= 2; total--) {
    for (let x = Math.min(a, total - 1); x >= Math.max(1, total - d); x--) {
      const y = total - x;
      const p = chance[x * width + y];
      if (p === 0) continue;
      for (const o of ROUNDS[Math.min(3, x)][Math.min(2, y)]) {
        chance[(x - o.attackerLosses) * width + (y - o.defenderLosses)] += o.p * p;
      }
    }
  }
  const attackerLost = new Float64Array(a + 1);
  const defenderLost = new Float64Array(d + 1);
  for (let x = 0; x <= a; x++) {
    for (let y = 0; y <= d; y++) {
      if (x !== 0 && y !== 0) continue;
      attackerLost[a - x] += chance[x * width + y];
      defenderLost[d - y] += chance[x * width + y];
    }
  }
  return { attackerLost, defenderLost };
}

// GD keeps its balance settings as doubles and casts each to a 32-bit float before using it.
const WIN_CHANCE_CUTOFF = Math.fround(0.05);
const WIN_CHANCE_POWER = Math.fround(1.3);
const OUTCOME_CUTOFF = Math.fround(0.1);
const OUTCOME_POWER = Math.fround(1.8);

/** Scales `values[from … from + length − 1]` to sum to `total`: all zero when `total` is not
 *  positive, an even share each when they sum to nothing. */
function scaleTo(values: Float64Array, total: number, from: number, length: number): void {
  if (total <= 0) {
    values.fill(0, from, from + length);
    return;
  }
  let sum = 0;
  for (let i = from; i < from + length; i++) sum += values[i];
  if (sum <= 0) {
    values.fill(total / length, from, from + length);
    return;
  }
  for (let i = from; i < from + length; i++) values[i] *= total / sum;
}

/** Steps 2 to 5 of `COMBAT-8`, on a copy of the fair odds. */
export function balance(fair: Fight): Fight {
  const al = Float64Array.from(fair.attackerLost);
  const dl = Float64Array.from(fair.defenderLost);
  const a = al.length - 1;
  const d = dl.length - 1;

  // 2. No long shots: a side with at most a 5% chance of winning loses for certain.
  if (WIN_CHANCE_CUTOFF >= dl[d]) {
    al.fill(0);
    al[a] = 1;
    dl[d] = 0;
    scaleTo(dl, 1, 0, d);
  }
  if (WIN_CHANCE_CUTOFF >= al[a]) {
    dl.fill(0);
    dl[d] = 1;
    al[a] = 0;
    scaleTo(al, 1, 0, a);
  }

  // 3. The favourite favoured.
  const pushWin = dl[d] ** WIN_CHANCE_POWER;
  const pushHold = al[a] ** WIN_CHANCE_POWER;
  const win = pushWin / (pushWin + pushHold);
  const hold = pushHold / (pushWin + pushHold);
  scaleTo(al, win, 0, a);
  scaleTo(dl, hold, 0, d);
  dl[d] = win;
  al[a] = hold;

  // 4. No flukes: the outermost 10% of chance cut from both ends of the combined order.
  const combined = new Float64Array(a + d);
  for (let i = 0; i < a; i++) combined[i] = al[i];
  for (let j = 0; j < d; j++) combined[a + d - 1 - j] = dl[j];
  trimFront(combined);
  combined.reverse();
  trimFront(combined);
  combined.reverse();
  for (let i = 0; i < a; i++) al[i] = combined[i];
  for (let j = 0; j < d; j++) dl[j] = combined[a + d - 1 - j];
  let captures = 0;
  let holds = 0;
  for (let i = 0; i < a; i++) captures += al[i];
  for (let j = 0; j < d; j++) holds += dl[j];
  const k = 1 / (holds + captures);
  scaleTo(al, captures * k, 0, a);
  scaleTo(dl, holds * k, 0, d);
  al[a] = holds * k;
  dl[d] = captures * k;

  // 5. The likeliest results: each outcome's chance to the power 1.8, each side kept at its chance.
  for (let i = 0; i < a; i++) al[i] **= OUTCOME_POWER;
  for (let j = 0; j < d; j++) dl[j] **= OUTCOME_POWER;
  scaleTo(al, dl[d], 0, a);
  scaleTo(dl, al[a], 0, d);
  return { attackerLost: al, defenderLost: dl };
}

function trimFront(values: Float64Array): void {
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (sum <= OUTCOME_CUTOFF) {
      values[i] = 0;
    } else {
      values[i] = sum - OUTCOME_CUTOFF;
      return;
    }
  }
}

/** Above this many armies on both sides together, GD estimates the fair odds instead of working
 *  them out; above `ROLLED_ABOVE` it rolls the fight battle by battle. */
const ESTIMATED_ABOVE = 2000;
const ROLLED_ABOVE = 100_000;

const balanced = new Map<number, Fight>();

/** The balanced odds of a blitz of `a` against `d`, or null when GD rolls a fight that large with
 *  fair dice instead. */
export function balancedFight(a: number, d: number): Fight | null {
  if (a + d > ROLLED_ABOVE) return null;
  const key = a * (ROLLED_ABOVE + 1) + d;
  const known = balanced.get(key);
  if (known) return known;
  const fight = balance(a + d > ESTIMATED_ABOVE ? estimateFight(a, d) : fairFight(a, d));
  if (balanced.size > 50_000) balanced.clear();
  balanced.set(key, fight);
  return fight;
}

/** The chance a blitz of `a` against `d` captures. */
export function captureChance(a: number, d: number): number {
  if (d <= 0) return 1;
  if (a <= 0) return 0;
  const fight = balancedFight(a, d);
  return fight ? fight.defenderLost[d] : fairFight(a, d).defenderLost[d];
}

export interface BlitzResult {
  attackerLosses: number;
  defenderLosses: number;
}

/** A blitz of `a` against `d`, resolved by one uniform draw `r` in [0, 1) from the balanced odds.
 *  A capture costs the attacker its outcome's losses; a hold costs the attacker all `a`. Fights too
 *  large to balance are rolled battle by battle with `roll`. */
export function resolveBlitz(a: number, d: number, r: number, roll: () => number): BlitzResult {
  const fight = balancedFight(a, d);
  if (!fight) return rollFight(a, d, roll);
  const draw = r <= 0 ? Number.MIN_VALUE : r;
  const { attackerLost: al, defenderLost: dl } = fight;
  if (dl[d] >= draw) {
    return { attackerLosses: pickOutcome(al, a, draw), defenderLosses: d };
  }
  return { attackerLosses: a, defenderLosses: pickOutcome(dl, d, draw - dl[d]) };
}

/** The first outcome below `end` whose running total reaches `draw`, or the likeliest one when
 *  rounding leaves the total just short. */
function pickOutcome(chances: Float64Array, end: number, draw: number): number {
  let sum = 0;
  let likeliest = 0;
  for (let i = 0; i < end; i++) {
    if (chances[i] > chances[likeliest]) likeliest = i;
    if (chances[i] <= 0) continue;
    sum += chances[i];
    if (sum >= draw) return i;
  }
  return likeliest;
}

/** A fight rolled battle by battle with fair dice; `roll` gives a uniform value in [0, 1). */
function rollFight(a: number, d: number, roll: () => number): BlitzResult {
  let x = a;
  let y = d;
  while (x > 0 && y > 0) {
    const attack = Array.from({ length: Math.min(3, x) }, () => 1 + Math.floor(roll() * 6)).sort((p, q) => q - p);
    const defend = Array.from({ length: Math.min(2, y) }, () => 1 + Math.floor(roll() * 6)).sort((p, q) => q - p);
    for (let i = 0; i < Math.min(attack.length, defend.length); i++) {
      if (attack[i] > defend[i]) y--;
      else x--;
    }
  }
  return { attackerLosses: a - x, defenderLosses: d - y };
}

// ---------------------------------------------------------------------------
// GD's estimate of the fair odds of a fight too large to work out
// ---------------------------------------------------------------------------

/** .NET's `Math.Round`: halves round to even. */
function roundHalfEven(x: number): number {
  const floor = Math.floor(x);
  const fraction = x - floor;
  if (fraction > 0.5) return floor + 1;
  if (fraction < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

function combinedOrder(fight: Fight): Float64Array {
  const a = fight.attackerLost.length - 1;
  const d = fight.defenderLost.length - 1;
  const combined = new Float64Array(a + d);
  for (let i = 0; i < a; i++) combined[i] = fight.attackerLost[i];
  for (let j = 0; j < d; j++) combined[a + d - 1 - j] = fight.defenderLost[j];
  return combined;
}

/** The first index of the combined order at which the running total reaches `target`. */
function outcomeIndex(combined: Float64Array, target: number): number {
  let sum = 0;
  for (let k = 0; k < combined.length; k++) {
    sum += combined[k];
    if (sum >= target) return k;
  }
  return combined.length - 1;
}

/** Least squares through the points: y ≈ slope · x + intercept. */
function fitLine(xs: readonly number[], ys: readonly number[]): { slope: number; intercept: number } {
  const n = xs.length;
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
    sxy += xs[i] * ys[i];
    sxx += xs[i] * xs[i];
  }
  const slope = (n * sxy - sy * sx) / (n * sxx - sx * sx);
  return { slope, intercept: sy / n - (sx / n) * slope };
}

/** GD's model of the capture chance as fights grow: a line when it hardly changes, otherwise an
 *  exponential approach to 1 (when it rises) or to 0 (when it falls), fitted from smaller fights. */
function winChanceModel(xs: readonly number[], ws: readonly number[]): (x: number) => number {
  const first = ws[0];
  const last = ws[ws.length - 1];
  if (Math.abs(last - first) <= 0.0001) {
    const { slope, intercept } = fitLine(xs, ws);
    return (x) => slope * x + intercept;
  }
  const rising = last > first;
  const kept = xs.map((x, i) => ({ x, y: rising ? 1 - ws[i] : ws[i] })).filter((p) => p.y > 0);
  let scale = 0;
  let rate = 0;
  if (kept.length >= 2) {
    const { slope, intercept } = fitLine(
      kept.map((p) => p.x),
      kept.map((p) => Math.log(p.y)),
    );
    scale = Math.exp(intercept);
    rate = -slope;
  }
  return rising ? (x) => 1 - scale * Math.exp(-rate * x) : (x) => scale * Math.exp(-rate * x);
}

/** Spreads `source[s0 … s1)` over `dest[t0 … t1)` in proportion, each source cell's chance shared
 *  among the destination cells its stretched span overlaps. */
function stretch(source: Float64Array, s0: number, s1: number, dest: Float64Array, t0: number, t1: number): void {
  if (s1 <= s0 || t1 <= t0) return;
  const scale = (t1 - t0) / (s1 - s0);
  for (let k = s0; k < s1; k++) {
    const start = t0 + (k - s0) * scale;
    const end = start + scale;
    for (let cell = Math.floor(start); cell < Math.min(t1, Math.ceil(end)); cell++) {
      const overlap = Math.min(end, cell + 1) - Math.max(start, cell);
      if (overlap > 0) dest[cell] += (source[k] * overlap) / scale;
    }
  }
}

interface EstimateSteps {
  xs: number[];
  ws: number[];
  best: number[];
  mid: number[];
  worst: number[];
  largest: Float64Array;
}

/** The ten exactly worked smaller fights of the proportions of `a` against `d` that GD fits its
 *  estimate to. */
function estimateSteps(a: number, d: number): EstimateSteps {
  const ratio = Math.fround(Math.fround(a) / Math.fround(d));
  const steps: EstimateSteps = { xs: [], ws: [], best: [], mid: [], worst: [], largest: new Float64Array(0) };
  for (let i = 0; i < 10; i++) {
    const total = i * (1900 / 9) + 100;
    const stepA = Math.max(1, roundHalfEven((ratio * total) / (ratio + 1)));
    const stepD = Math.max(1, roundHalfEven(total - roundHalfEven((ratio * total) / (ratio + 1))));
    const fight = fairFight(stepA, stepD);
    const combined = combinedOrder(fight);
    steps.xs.push(stepA + stepD);
    steps.ws.push(Math.min(1, Math.max(0, fight.defenderLost[stepD])));
    steps.best.push(outcomeIndex(combined, 0.01));
    steps.mid.push(outcomeIndex(combined, 0.5));
    steps.worst.push(outcomeIndex(combined, 0.99));
    steps.largest = combined;
  }
  return steps;
}

/** GD's `EstimateAttackWinChance`: the fair capture chance of `a` against `d` from its fitted
 *  model, unclamped. GD's AI reads it, balanced, for fights too large to work out. */
export function estimatedWinChance(a: number, d: number): number {
  const { xs, ws } = estimateSteps(a, d);
  return winChanceModel(xs, ws)(a + d);
}

/** GD's estimate of the fair odds of `a` against `d`: ten exactly worked smaller fights of the
 *  same proportions, a fitted capture chance, and the largest one's shape stretched to size. GD's
 *  arrays copy the defender's side one place off, and that is kept, so the odds match the game's. */
function estimateFight(a: number, d: number): Fight {
  const n = a + d;
  const { xs, ws, best, mid, worst, largest } = estimateSteps(a, d);
  const winChance = Math.min(1, Math.max(0, winChanceModel(xs, ws)(n)));
  const at = (ys: readonly number[]) => {
    const { slope, intercept } = fitLine(xs, ys);
    return Math.min(n - 1, Math.max(0, roundHalfEven(Math.fround(n * slope + intercept))));
  };
  const dest = new Float64Array(n);
  stretch(largest, best[9], mid[9], dest, at(best), at(mid));
  stretch(largest, mid[9], worst[9], dest, at(mid), at(worst));

  const attackerLost = new Float64Array(a + 1);
  const defenderLost = new Float64Array(d + 1);
  for (let i = 0; i < a; i++) attackerLost[i] = dest[i];
  for (let j = 0; j < d; j++) defenderLost[j] = dest[n - 2 - j];
  attackerLost[a] = 1 - winChance;
  defenderLost[d] = winChance;
  scaleTo(attackerLost, winChance, 0, a);
  scaleTo(defenderLost, 1 - winChance, 0, d);
  return { attackerLost, defenderLost };
}
