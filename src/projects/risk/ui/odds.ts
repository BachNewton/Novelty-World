/*
 * The odds of a planned assault, exact: how likely a blitz is to capture, and what it is likely to
 * cost. A blitz rolls the most dice it may without taking the attacking territory below the
 * armies kept back (`min(3, armies - keep)`), the defender always rolls the most it may
 * (`COMBAT-3`), and ties go to the defender (`COMBAT-4`), as the engine plays it.
 */

/** One battle's outcomes: the chance of each (attacker losses, defender losses). */
type Outcomes = readonly { attackerLosses: number; defenderLosses: number; p: number }[];

const battles = new Map<string, Outcomes>();

/** Every roll of `attack` dice against `defend` dice, counted out. */
export function battleOutcomes(attack: number, defend: number): Outcomes {
  const key = `${attack}v${defend}`;
  const known = battles.get(key);
  if (known) return known;
  const counts = new Map<string, number>();
  const total = 6 ** (attack + defend);
  for (let roll = 0; roll < total; roll++) {
    const faces = Array.from({ length: attack + defend }, (_, i) => Math.floor(roll / 6 ** i) % 6);
    const a = faces.slice(0, attack).sort((x, y) => y - x);
    const d = faces.slice(attack).sort((x, y) => y - x);
    let attackerLosses = 0;
    for (let i = 0; i < Math.min(attack, defend); i++) if (a[i] <= d[i]) attackerLosses++;
    const outcome = `${attackerLosses},${Math.min(attack, defend) - attackerLosses}`;
    counts.set(outcome, (counts.get(outcome) ?? 0) + 1);
  }
  const outcomes = [...counts].map(([outcome, count]) => {
    const [attackerLosses, defenderLosses] = outcome.split(",").map(Number);
    return { attackerLosses, defenderLosses, p: count / total };
  });
  battles.set(key, outcomes);
  return outcomes;
}

export interface BlitzOdds {
  /** The chance the territory is captured. */
  capture: number;
  /** The armies the attacking territory is expected to lose. */
  attackerLosses: number;
  /** The armies the defender is expected to lose. */
  defenderLosses: number;
}

/** A blitz from a territory of `attackers` armies, keeping at least `keep` back, against `defenders`. */
export function blitzOdds(attackers: number, defenders: number, keep: number): BlitzOdds {
  const memo = new Map<string, BlitzOdds>();
  const from = (a: number, d: number): BlitzOdds => {
    if (d === 0) return { capture: 1, attackerLosses: attackers - a, defenderLosses: defenders };
    if (a <= keep) return { capture: 0, attackerLosses: attackers - a, defenderLosses: defenders - d };
    const key = `${a},${d}`;
    const known = memo.get(key);
    if (known) return known;
    const result = { capture: 0, attackerLosses: 0, defenderLosses: 0 };
    for (const { attackerLosses, defenderLosses, p } of battleOutcomes(Math.min(3, a - keep), Math.min(2, d))) {
      const next = from(a - attackerLosses, d - defenderLosses);
      result.capture += p * next.capture;
      result.attackerLosses += p * next.attackerLosses;
      result.defenderLosses += p * next.defenderLosses;
    }
    memo.set(key, result);
    return result;
  };
  return from(attackers, defenders);
}
