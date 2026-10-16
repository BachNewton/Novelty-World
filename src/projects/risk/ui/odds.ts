import { balancedFight, captureChance, fairFight } from "../blitz";

/*
 * The odds of a planned blitz, as the engine resolves it (`COMBAT-8`, Balanced Blitz): how likely it
 * is to capture, and what it is likely to cost.
 */

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
  const a = attackers - keep;
  if (a <= 0) return { capture: 0, attackerLosses: 0, defenderLosses: 0 };
  const fight = balancedFight(a, defenders) ?? fairFight(a, defenders);
  let attackerLosses = a * fight.attackerLost[a];
  let defenderLosses = defenders * fight.defenderLost[defenders];
  for (let i = 0; i < a; i++) attackerLosses += i * fight.attackerLost[i];
  for (let j = 0; j < defenders; j++) defenderLosses += j * fight.defenderLost[j];
  return { capture: captureChance(a, defenders), attackerLosses, defenderLosses };
}
