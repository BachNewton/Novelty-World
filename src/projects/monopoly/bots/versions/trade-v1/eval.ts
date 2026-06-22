// ===========================================================================
// trade-v1 EVAL FUNCTION — multi-factor board evaluation from any player's seat.
//
// Kyle's design: "a strong eval function that takes in many factors." This
// replaces v3's single `positionValue` yardstick with a richer, parameterized
// function that can model DIFFERENT players' perspectives by adjusting weight
// factors. The same function evaluates both our position and our opponents'.
//
// The opponent model (in opponent-model.ts) calibrates these weights per player
// by learning from their accept/reject behavior — closing the gap between what
// we THINK they value and what they ACTUALLY value.
// ===========================================================================
import { SPACES } from "../../../data";
import {
  builtLotsInGroup,
  colorAt,
  developmentLevel,
  groupPositions,
} from "../../../development";
import { hasMonopoly, mortgageValueAt, ownablePrice, rentAt } from "../../../logic";
import type { GameState, Player, PropertyColor } from "../../../types";

// Re-export color helpers for the trade engine.
export { colorName, spaceName } from "../jane-v3/valuation";

// ---------------------------------------------------------------------------/
// Color set strategic weights — same as v3's but exposed for the eval function.
// ---------------------------------------------------------------------------/
export const GROUP_WEIGHT: Readonly<Record<PropertyColor, number>> = {
  orange: 1.0,
  red: 0.8,
  yellow: 0.6,
  green: 0.5,
  "dark-blue": 0.55,
  pink: 0.85,
  "light-blue": 1.0,
  brown: 0.7,
};

export const COLORS_BY_WEIGHT: readonly PropertyColor[] = [
  "orange", "red", "light-blue", "pink", "yellow", "dark-blue", "green", "brown",
];

const RAIL_SYNERGY: readonly number[] = [0, 0, 70, 180, 380];
const UTIL_PAIR_BONUS = 40;

/** Per-player calibration weights that adjust how the eval function scores a
 *  position. These are the knobs the learning loop tunes. A player who
 *  consistently accepts trades that look bad on cash is revealing a higher
 *  CASH_WEIGHT bias; one who overvalues monopolies has a higher MONOPOLY_WEIGHT. */
export interface EvalWeights {
  /** How much weight to put on raw cash (vs properties). Default 1.0. */
  cashWeight: number;
  /** How much to value completed monopolies. Default 1.0. */
  monopolyWeight: number;
  /** How much to value being CLOSE to a monopoly (2/3 of a set). Default 1.0. */
  nearMonopolyWeight: number;
  /** How much to value development potential (building houses). Default 1.0. */
  developmentWeight: number;
  /** How much to weight the THREAT of opponents' monopolies. Default 1.0. */
  threatWeight: number;
  /** Distress sensitivity — how much a player overvalues cash when desperate.
   *  Bots: ~1.0 (rational). Humans: varies (some give up, some chase hope). */
  distressBias: number;
  /** Acceptance threshold — minimum eval delta for a player to accept a trade.
   *  Represents how "tight" or "loose" they are. Default 30. */
  acceptThreshold: number;
}

export const DEFAULT_WEIGHTS: EvalWeights = {
  cashWeight: 1.0,
  monopolyWeight: 1.0,
  nearMonopolyWeight: 1.0,
  developmentWeight: 1.0,
  threatWeight: 1.0,
  distressBias: 1.0,
  acceptThreshold: 30,
};

// ---------------------------------------------------------------------------/
// Core eval function — scores a player's position with calibrated weights.
// ---------------------------------------------------------------------------/

/** Total printed price of a color group. */
const SET_TOTAL_PRICE: Readonly<Record<PropertyColor, number>> = (() => {
  const totals: Record<PropertyColor, number> = {
    orange: 0, red: 0, "light-blue": 0, yellow: 0, pink: 0,
    "dark-blue": 0, green: 0, brown: 0,
  };
  for (const color of COLORS_BY_WEIGHT) {
    for (const pos of groupPositions(color)) {
      totals[color] += ownablePrice(pos) ?? 0;
    }
  }
  return totals;
})();

export function monopolyBonus(color: PropertyColor): number {
  return Math.round(SET_TOTAL_PRICE[color] * GROUP_WEIGHT[color]);
}

/** How many lots of `color` `pid` owns. */
export function ownedInColor(state: GameState, pid: string, color: PropertyColor): number {
  let n = 0;
  for (const pos of groupPositions(color)) {
    if (state.ownership[pos] === pid) n += 1;
  }
  return n;
}

/** Non-bankrupt players other than `pid`. */
export function activeOpponents(state: GameState, pid: string): Player[] {
  return state.players.filter((p) => p.id !== pid && !p.bankrupt);
}

/** Raw asset base of a single ownable (printed price, halved if mortgaged). */
function assetBase(state: GameState, pos: number): number {
  const price = ownablePrice(pos) ?? 0;
  return state.mortgaged[pos] ? Math.floor(price / 2) : price;
}

function ownedOfKind(state: GameState, pid: string, kind: "railroad" | "utility"): number {
  let n = 0;
  for (const [posStr, owner] of Object.entries(state.ownership)) {
    if (owner === pid && SPACES[Number(posStr)].kind === kind) n += 1;
  }
  return n;
}

/** The CORE eval function — a weighted, multi-factor score of `pid`'s position.
 *  Unlike v3's `positionValue`, this is parameterized by `weights` so it can
 *  model different players' subjective valuations.
 *
 *  Factors:
 *    1. Cash (× cashWeight) — liquid buying power, survival buffer
 *    2. Property assets — raw deed value (mortgaged at half)
 *    3. Completed monopolies (× monopolyWeight) — the big premium
 *    4. Near-monopolies (× nearMonopolyWeight) — 2-of-3 or 1-of-2, potential
 *    5. Development level (× developmentWeight) — houses/hotels income potential
 *    6. Railroad/utility synergy
 *    7. Rival threat penalty (× threatWeight) — opponents' monopolies hurt me
 *    8. Distress adjustment (× distressBias) — survival value of cash when desperate */
export function evaluate(
  state: GameState,
  pid: string,
  weights: EvalWeights = DEFAULT_WEIGHTS,
): number {
  const player = state.players.find((p) => p.id === pid);
  if (!player) return 0;

  // 1. Cash
  let score = player.cash * weights.cashWeight;

  // 2. Property assets
  for (const [posStr, owner] of Object.entries(state.ownership)) {
    if (owner === pid) score += assetBase(state, Number(posStr));
  }

  // 3. Completed monopoly premiums
  for (const color of COLORS_BY_WEIGHT) {
    if (hasMonopoly(state, color, pid)) {
      score += monopolyBonus(color) * weights.monopolyWeight;
    }
  }

  // 4. Near-monopoly potential — partial sets are worth something (the option
  //    value of completing them). Scaled by how close (2/3 > 1/3).
  for (const color of COLORS_BY_WEIGHT) {
    const owned = ownedInColor(state, pid, color);
    const total = groupPositions(color).length;
    if (owned > 0 && owned < total) {
      // Fraction of set owned × its monopoly bonus, discounted (it's just potential).
      const fraction = owned / total;
      score += monopolyBonus(color) * fraction * 0.3 * weights.nearMonopolyWeight;
    }
  }

  // 5. Development income potential — existing houses/hotels generate rent.
  for (const color of COLORS_BY_WEIGHT) {
    if (!hasMonopoly(state, color, pid)) continue;
    for (const pos of groupPositions(color)) {
      const level = developmentLevel(state, pos);
      if (level > 0) {
        // Each house level adds rent potential proportional to the set's value.
        score += monopolyBonus(color) * 0.1 * level * weights.developmentWeight;
      }
    }
  }

  // 6. Railroad/utility synergy
  const rails = ownedOfKind(state, pid, "railroad");
  score += RAIL_SYNERGY[Math.min(rails, 4)];
  if (ownedOfKind(state, pid, "utility") === 2) score += UTIL_PAIR_BONUS;

  // 7. Rival threat penalty — opponents' monopolies and developments reduce
  //    my expected game outcome. Each rival monopoly costs me proportional to
  //    its strength.
  for (const opp of activeOpponents(state, pid)) {
    for (const color of COLORS_BY_WEIGHT) {
      if (hasMonopoly(state, color, opp.id)) {
        score -= monopolyBonus(color) * 0.05 * weights.threatWeight;
      }
    }
  }

  return Math.round(score);
}

/** How distressed is `pid` — 0 (healthy) to 1 (on the brink). Carried from v3. */
export function sellerDistress(state: GameState, pid: string): number {
  const player = state.players.find((p) => p.id === pid);
  if (!player) return 0;
  const liquid = player.cash + mortgageableTotal(state, pid);
  let worstRent = 0;
  for (const [posStr, owner] of Object.entries(state.ownership)) {
    if (owner === pid) continue;
    const display = rentAt(state, Number(posStr));
    if (!display) continue;
    const rent = display.kind === "dollars" ? display.amount : display.multiplier * 7;
    worstRent = Math.max(worstRent, rent);
  }
  if (worstRent === 0) return 0;
  if (liquid >= worstRent * 1.5) return 0;
  if (liquid <= worstRent) return 1;
  return (worstRent * 1.5 - liquid) / (worstRent * 0.5);
}

/** Total mortgageable equity of `pid`. */
function mortgageableTotal(state: GameState, pid: string): number {
  let total = 0;
  for (const [posStr, owner] of Object.entries(state.ownership)) {
    if (owner !== pid) continue;
    const pos = Number(posStr);
    if (state.mortgaged[pos]) continue;
    if (builtLotsInGroup(pos, (p) => developmentLevel(state, p)).length > 0) continue;
    const mv = mortgageValueAt(pos);
    if (mv !== null) total += mv;
  }
  return total;
}

/** Evaluate the delta of a hypothetical state change (e.g., a trade) for `pid`,
 *  using the given weights. Positive = good for that player. */
export function evalDelta(
  before: GameState,
  after: GameState,
  pid: string,
  weights: EvalWeights = DEFAULT_WEIGHTS,
): number {
  return evaluate(after, pid, weights) - evaluate(before, pid, weights);
}
