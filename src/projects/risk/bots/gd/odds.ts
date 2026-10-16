import { balancedFight, estimatedWinChance } from "../../blitz";

// The battle odds GD's AI reads (`BlitzC.GetCalculatedOrEstimatedAttackWinChance` and
// `GetCalculatedOrEstimatedIdealAttackUnits`): the Balanced Blitz capture chance, worked out for
// fights of up to 2000 armies on both sides together, and above that GD's fitted estimate put
// through `AppleWinChanceBalance`, the balancing reduced to the win chance alone.

const ESTIMATED_ABOVE = 2000;

/** `BlitzC.AppleWinChanceBalance` with GD's default balance (0.05, 1.3, 0.1). */
export function balanceWinChance(chance: number): number {
  let p = chance;
  if (0.05 > p) p = 0;
  else if (p > 1 - 0.05) p = 1;
  const push = p ** 1.3;
  const w = push / (push + (1 - p) ** 1.3);
  let win = w - 0.1;
  let hold = 1 - w - 0.1;
  if (0 > win) {
    hold += -win;
    win = 0;
  }
  if (0 > hold) {
    win += -hold;
    hold = 0;
  }
  return win / (win + hold);
}

/** The chance a blitz of `attack` armies takes `defend`. GD runs its odds on any count, so no
 *  attackers is no chance. */
export function winChance(attack: number, defend: number): number {
  if (attack <= 0) return 0;
  if (attack + defend > ESTIMATED_ABOVE) return balanceWinChance(estimatedWinChance(attack, defend));
  const fight = balancedFight(attack, defend);
  if (!fight) throw new Error(`no odds for ${attack} against ${defend}`);
  return fight.defenderLost[defend];
}

/** .NET's `Math.Round`: halves to even. */
export function roundHalfEven(x: number): number {
  const floor = Math.floor(x);
  const fraction = x - floor;
  if (fraction > 0.5) return floor + 1;
  if (fraction < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

const INT_MAX = 2147483647;

/** `GetCalculatedOrEstimatedIdealAttackUnits`: the fewest attackers whose chance of taking `defend`
 *  reaches `threshold`, by GD's doubling then halving search. Its lower bound starts at 1 and is
 *  never itself probed, so the answer is 1 only when the search starts there. */
export function idealAttackUnits(defend: number, threshold = Math.fround(0.9)): number {
  const key = `${defend}/${threshold}`;
  const known = IDEAL.get(key);
  if (known !== undefined) return known;
  const ideal = searchIdeal(defend, threshold);
  IDEAL.set(key, ideal);
  return ideal;
}

const IDEAL = new Map<string, number>();

function searchIdeal(defend: number, threshold: number): number {
  const d = Math.max(defend, 1);
  const required = Math.min(1, Math.max(0, threshold));
  const start = roundHalfEven(Math.fround(Math.fround(d) * Math.fround(0.2)));
  let lo = 1;
  let hi = Math.max(start, 1);
  while (required > winChance(hi, d)) {
    lo = hi;
    hi *= 2;
    if (hi > INT_MAX) {
      hi = INT_MAX;
      break;
    }
  }
  for (let probes = 0; ; probes++) {
    if (lo + 1 >= hi) return hi;
    const mid = Math.max(1, lo + Math.floor((hi - lo) / 2));
    if (winChance(mid, d) >= required) hi = mid;
    else lo = mid;
    if (probes >= 100) return INT_MAX;
  }
}
