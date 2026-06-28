// ===========================================================================
// claude-v44 FACTORY — the 31-param claude-v38-shaped factory (claude-v38's
// valuation/trades/policy with the tuning constants read from a `ParamVector`,
// PLUS claude-v41's seller-side trade pricing: decoupled `rivalThreatFactor`,
// holder-side `denialPositionCost`, and the `deployabilityDiscount`).
//
// This is a SELF-CONTAINED copy of `optimize/bot.ts` — every piece of LOGIC is
// verbatim; the only edits are the import paths (one level deeper) and the
// `ParamVector` type inlined below so the snapshot stands alone (no `optimize/`
// import). With the no-op defaults it is byte-identical to claude-v38 (the
// authoritative fidelity guard is `optimize/param-fidelity.test.ts`); the v41
// levers default to a NO-OP (rivalThreatFactor = denyFactor; holder price = 0;
// discount = 0) and only change behavior once turned on.
//
// claude-v44 binds this factory to the COMBINED-SPACE maximin ES winner (the run
// that co-tuned the 28-param base AND the three v41 trade levers jointly — see
// `index.ts` and EVOLUTION.md). Imports only shared monopoly infrastructure; no
// cross-version / `optimize/` imports, no `Math.random` / `Date` — pure and
// deterministic (replay intact).
// ===========================================================================
import { HOUSE_COST, SPACES } from "../../../data";
import {
  bankSupply,
  builtLotsInGroup,
  colorAt,
  developmentLevel,
  groupPositions,
} from "../../../development";
import {
  auctionBidCap,
  BID_INCREMENT,
  firstNegativePlayer,
  projectTrade,
  tradeParticipants,
} from "../../../engine";
import {
  hasMonopoly,
  heldJailCard,
  mortgageValueAt,
  ownablePrice,
  rentAt,
} from "../../../logic";
import { manageSummary } from "../../../manage";
import type {
  GameState,
  Intent,
  ManageStaged,
  Player,
  PropertyColor,
  TradeTerms,
} from "../../../types";
import type { Bot, BotDecision } from "../../decision";

/** The tunable constants of a claude-v38-shaped bot, plus the three claude-v41
 *  seller-side trade levers appended at the end. Each field corresponds to a
 *  hand-tuned constant in claude-v38's valuation/policy/trades. Inlined verbatim
 *  from `optimize/params.ts` so this snapshot stands alone (no `optimize/` import). */
export interface ParamVector {
  /** Denial premium as a fraction of the rival set's monopoly bonus
   *  (`DENY_FACTOR`). v38 = 0.15. */
  denyFactor: number;
  /** Scales the from-first-principles monopoly bonus (`BONUS_SCALE`). v38 = 16489. */
  bonusScale: number;
  /** Multiplier on the railroad synergy table (`RAIL_SYNERGY`). 1.0 = v38. */
  railSynergyScale: number;
  /** Both-utilities pair bonus (`UTIL_PAIR_BONUS`). v38 = 40. */
  utilPairBonus: number;
  /** Bare voluntary-spend reserve floor (`BASE_FLOOR`). v38 = 60. */
  baseFloor: number;
  /** Fraction of worst board rent kept as voluntary-spend reserve
   *  (`FLOOR_RENT_FRACTION`). v38 = 0.3. */
  floorRentFraction: number;
  /** Cap on the rent-fraction reserve (`FLOOR_CAP`). v38 = 300. */
  floorCap: number;
  /** Spare cash above the floor that signals "flush" → push to hotels
   *  (`HOTEL_CUSHION`). v38 = 300. */
  hotelCushion: number;
  /** House-bank level below which houses are hoarded (`HOUSE_SCARCE`). v38 = 6. */
  houseScarce: number;
  /** Opponent rent that marks the board dangerous enough to sit in jail
   *  (`JAIL_DANGER_RENT`). v38 = 350. */
  jailDangerRent: number;
  /** Cushion past break-even when sweetening a trade (`ACCEPT_MARGIN`). v38 = 30. */
  acceptMargin: number;
  /** Extra value per dollar of cash to a fully-distressed seller
   *  (`SURVIVAL_FACTOR`). v38 = 1.5. */
  survivalFactor: number;
  /** A cash-negative trade is only stomached for a gain this large
   *  (`LIQUIDITY_RISK_GAIN`). v38 = 250. */
  liquidityRiskGain: number;
  /** Worth/price multiple to dip below the reserve for a buy (`DIP_WORTH_MULT`).
   *  v38 = 1.4. */
  dipWorthMult: number;
  /** Worth/price multiple to MORTGAGE to fund a buy (`RAISE_WORTH_MULT`).
   *  v38 = 1.25. */
  raiseWorthMult: number;

  // --- EXTENDED dimensions (per-color bonus multipliers, rail-synergy shape,
  //     distress ramp, spread floor). All default to a NO-CHANGE value vs v38. ---

  /** Per-color MULTIPLIER on that set's first-principles `MONOPOLY_BONUS`. Lets the
   *  ES RE-SHAPE the set-value ranking. 1.0 = v38 (no change). One field per color. */
  monoMultOrange: number;
  monoMultRed: number;
  monoMultLightBlue: number;
  monoMultPink: number;
  monoMultYellow: number;
  monoMultDarkBlue: number;
  monoMultGreen: number;
  monoMultBrown: number;

  /** Per-count railroad synergy values (`RAIL_SYNERGY[2..4]`), still multiplied by
   *  `railSynergyScale`. Defaults are the v38 table: [70, 180, 380]. */
  railSynergy2: number;
  railSynergy3: number;
  railSynergy4: number;

  /** Liquid-to-worst-rent ratio at which `sellerDistress` reaches 0. v38 = 1.5. */
  distressSafeRatio: number;

  /** The develop-floor every monopoly is brought to first in `planBuild`
   *  (`SPREAD_FLOOR`). v38 = 3. */
  spreadFloor: number;

  // --- v41 SELLER-SIDE TRADE PRICING. Three dims that default to a NO-OP so the
  //     defaults still reproduce claude-v38. Co-tuned with the base vector by the
  //     ES (a fixed-param base swap regresses — they are coupled; see EVOLUTION.md). ---

  /** Seller-side rival-threat factor (`RIVAL_THREAT_FACTOR`), DECOUPLED from
   *  `denyFactor` (claude-v41 #3b). Prices the harm of handing a rival a monopoly.
   *  Default 0.15 (= the v38 denyFactor) reproduces v38. */
  rivalThreatFactor: number;
  /** Holder-side denial price as a FRACTION of the buyer-side `denyFactor × bonus`
   *  premium (`denialPositionCost`). 0 = no holder price (the v38/v36 hot-potato
   *  ring); 1.0 = exact buyer/holder lockstep. Default 0 keeps v38 fidelity. */
  holderDenialFrac: number;
  /** Fractional discount on incoming cash in a set-handover-to-a-rival trade when
   *  the bot has no productive outlet for it (`deployabilityDiscount`, claude-v41
   *  #3c). 0 = cash at face (v38); 0.5 = idle cash worth half. Default 0 = v38. */
  deployabilityDiscount: number;
  /** RISK-AWARE: standing-scaled voluntary reserve. liquidityFloor is multiplied by
   *  clamp(1 + g*(s-1), 0.4, 2.5) where s = my positionValue / mean opponent
   *  positionValue. 0 = flat reserve. claude-v47's ES set this NEGATIVE (-0.783): a
   *  LEADER thins its buffer to press, a laggard fattens it to survive. */
  standingFloorGain: number;
  /** RISK-AWARE: standing-scaled auction aggression. The acquisition-value cap is
   *  multiplied by clamp(1 + g*(s-1), 0.4, 2.5) before the net-worth cap. 0 = v38.
   *  claude-v47's ES set this POSITIVE (+0.379): a leader bids harder, a laggard
   *  pulls back — the same "press your lead" posture as standingFloorGain. */
  standingAuctionGain: number;
}

// Static, non-tuned data carried verbatim from claude-v38.
const GROUP_WEIGHT: Readonly<Record<PropertyColor, number>> = {
  orange: 1.0,
  red: 0.8,
  yellow: 0.6,
  green: 0.5,
  "dark-blue": 0.55,
  pink: 0.85,
  "light-blue": 1.0,
  brown: 0.7,
};

const COLORS_BY_WEIGHT: readonly PropertyColor[] = [
  "orange",
  "red",
  "light-blue",
  "pink",
  "yellow",
  "dark-blue",
  "green",
  "brown",
];

const JAIL_FEE = 50;

const LANDING_PROB: Readonly<Record<number, number>> = {
  1: 2.13, 3: 2.16,
  6: 2.59, 8: 2.65, 9: 2.62,
  11: 2.91, 13: 2.69, 14: 2.72,
  16: 2.84, 18: 2.99, 19: 2.92,
  21: 2.95, 23: 2.84, 24: 3.16,
  26: 2.81, 27: 2.79, 29: 2.69,
  31: 2.67, 32: 2.63, 34: 2.45,
  37: 2.46, 39: 2.62,
};

const ACCEPT_MIN = 1;

function rent3House(pos: number): number {
  const s = SPACES[pos];
  return s.kind === "property" ? s.rent.houses[2] : 0;
}

/** Build a parameterized claude-v38-shaped bot. All tuning constants come from
 *  `p`; everything else is claude-v38 verbatim. */
export function makeParamBot(p: ParamVector): Bot {
  // --- monopolyBonus, derived from the tunable BONUS_SCALE (claude-v38's ROI
  //     formula) — memoized once per bot since the inputs are static given `p`. ---
  // Rail synergy: the per-count values [2..4], each still scaled uniformly by
  // railSynergyScale. Defaults [70,180,380] × 1.0 reproduce the v38 table.
  const railSynergyValues: readonly number[] = [0, 0, p.railSynergy2, p.railSynergy3, p.railSynergy4];
  const railSynergy = railSynergyValues.map((v) => Math.round(v * p.railSynergyScale));
  // Per-color multiplier on each set's computed bonus — the ES re-shapes the
  // set-value ranking. All 1.0 by default (no change vs v38).
  const monoMultByColor: Readonly<Record<PropertyColor, number>> = {
    orange: p.monoMultOrange,
    red: p.monoMultRed,
    "light-blue": p.monoMultLightBlue,
    pink: p.monoMultPink,
    yellow: p.monoMultYellow,
    "dark-blue": p.monoMultDarkBlue,
    green: p.monoMultGreen,
    brown: p.monoMultBrown,
  };
  const monopolyBonusByColor: Record<PropertyColor, number> = (() => {
    const bonuses: Record<PropertyColor, number> = {
      orange: 0, red: 0, "light-blue": 0, yellow: 0,
      pink: 0, "dark-blue": 0, green: 0, brown: 0,
    };
    for (const color of COLORS_BY_WEIGHT) {
      let expectedRent = 0;
      let capital = 0;
      for (const pos of groupPositions(color)) {
        expectedRent += ((LANDING_PROB[pos] ?? 0) / 100) * rent3House(pos);
        capital += (ownablePrice(pos) ?? 0) + 3 * HOUSE_COST[color];
      }
      const base = capital > 0 ? (expectedRent / capital) * p.bonusScale : 0;
      bonuses[color] = Math.round(base * monoMultByColor[color]);
    }
    return bonuses;
  })();

  function monopolyBonus(color: PropertyColor): number {
    return monopolyBonusByColor[color];
  }

  function activeOpponents(state: GameState, pid: string): Player[] {
    return state.players.filter((q) => q.id !== pid && !q.bankrupt);
  }

  function ownedInColor(state: GameState, pid: string, color: PropertyColor): number {
    let n = 0;
    for (const pos of groupPositions(color)) {
      if (state.ownership[pos] === pid) n += 1;
    }
    return n;
  }

  function assetBase(state: GameState, pos: number): number {
    const price = ownablePrice(pos) ?? 0;
    return state.mortgaged[pos] ? Math.floor(price / 2) : price;
  }

  function positionValue(state: GameState, pid: string): number {
    const player = state.players.find((q) => q.id === pid);
    if (!player) return 0;
    let value = player.cash;
    let rails = 0;
    let utils = 0;
    for (const posStr in state.ownership) {
      if (state.ownership[posStr] !== pid) continue;
      const pos = Number(posStr);
      value += assetBase(state, pos);
      const kind = SPACES[pos].kind;
      if (kind === "railroad") rails += 1;
      else if (kind === "utility") utils += 1;
    }
    for (const color of COLORS_BY_WEIGHT) {
      if (hasMonopoly(state, color, pid)) value += monopolyBonus(color);
    }
    value += railSynergy[Math.min(rails, 4)];
    if (utils === 2) value += p.utilPairBonus;
    return value;
  }

  function withOwner(state: GameState, pos: number, pid: string): GameState {
    return { ...state, ownership: { ...state.ownership, [pos]: pid } };
  }

  function acquisitionValue(state: GameState, pid: string, pos: number): number {
    const mine = positionValue(withOwner(state, pos, pid), pid) - positionValue(state, pid);
    let deny = 0;
    const color = colorAt(pos);
    if (color !== null && !(pos in state.ownership)) {
      const total = groupPositions(color).length;
      for (const opp of activeOpponents(state, pid)) {
        if (ownedInColor(state, opp.id, color) === total - 1) {
          deny = Math.max(deny, Math.round(monopolyBonus(color) * p.denyFactor));
        }
      }
    }
    return mine + deny;
  }

  function rentEstimateAt(state: GameState, pos: number): number {
    const display = rentAt(state, pos);
    if (!display) return 0;
    return display.kind === "dollars" ? display.amount : display.multiplier * 7;
  }

  /** Standing ratio s = my positionValue / mean active-opponent positionValue.
   *  >1 leading, <1 trailing. Only used by the risk-aware standing levers. */
  function standingRatio(state: GameState, pid: string): number {
    const opps = activeOpponents(state, pid);
    if (opps.length === 0) return 1;
    let sum = 0;
    for (const o of opps) sum += positionValue(state, o.id);
    const mean = sum / opps.length;
    if (mean <= 0) return 1;
    return positionValue(state, pid) / mean;
  }

  /** Standing-scaled multiplier clamp(1 + gain*(s-1), 0.4, 2.5); gain 0 ⇒ exactly 1. */
  function standingFactor(state: GameState, pid: string, gain: number): number {
    if (gain === 0) return 1;
    const s = standingRatio(state, pid);
    return Math.min(2.5, Math.max(0.4, 1 + gain * (s - 1)));
  }

  function liquidityFloor(state: GameState, pid: string): number {
    let worst = 0;
    for (const posStr in state.ownership) {
      if (state.ownership[posStr] === pid) continue;
      worst = Math.max(worst, rentEstimateAt(state, Number(posStr)));
    }
    const base = Math.min(p.floorCap, Math.max(p.baseFloor, Math.round(worst * p.floorRentFraction)));
    if (p.standingFloorGain === 0) return base;
    return Math.round(base * standingFactor(state, pid, p.standingFloorGain));
  }

  function mortgageableTotal(state: GameState, pid: string): number {
    let total = 0;
    for (const posStr in state.ownership) {
      if (state.ownership[posStr] !== pid) continue;
      const pos = Number(posStr);
      if (state.mortgaged[pos]) continue;
      if (builtLotsInGroup(pos, (q) => developmentLevel(state, q)).length > 0) continue;
      total += mortgageValueAt(pos) ?? 0;
    }
    return total;
  }

  function sellerDistress(state: GameState, pid: string): number {
    const player = state.players.find((q) => q.id === pid);
    if (!player) return 0;
    const liquid = player.cash + mortgageableTotal(state, pid);
    let worstRent = 0;
    for (const posStr in state.ownership) {
      if (state.ownership[posStr] === pid) continue;
      worstRent = Math.max(worstRent, rentEstimateAt(state, Number(posStr)));
    }
    if (worstRent === 0) return 0;
    const safe = worstRent * p.distressSafeRatio;
    if (liquid >= safe) return 0;
    if (liquid <= worstRent) return 1;
    return (safe - liquid) / (safe - worstRent);
  }

  // --- build planning (claude-v38 verbatim, constants from `p`) ---
  interface BuildPlan {
    build: Record<number, number>;
    mortgage: Record<number, boolean>;
    reason: string;
  }

  function maxLevelInSet(state: GameState, color: PropertyColor): number {
    let max = 0;
    for (const pos of groupPositions(color)) {
      max = Math.max(max, developmentLevel(state, pos));
    }
    return max;
  }

  function opponentsWantHouses(state: GameState, pid: string): boolean {
    return activeOpponents(state, pid).some((opp) =>
      COLORS_BY_WEIGHT.some(
        (color) =>
          hasMonopoly(state, color, opp.id) &&
          groupPositions(color).every((pos) => !state.mortgaged[pos]) &&
          maxLevelInSet(state, color) < 4,
      ),
    );
  }

  function desiredLevel(state: GameState, pid: string): { level: number; why: string } {
    const player = state.players.find((q) => q.id === pid);
    const cash = player?.cash ?? 0;
    const scarce = bankSupply(state).houses <= p.houseScarce;
    const flush = cash > liquidityFloor(state, pid) + p.hotelCushion;
    if (scarce && opponentsWantHouses(state, pid)) {
      return { level: 4, why: "holding at 4 to starve the house bank" };
    }
    if (flush && !scarce) {
      return { level: 5, why: "hotels for max rent" };
    }
    return { level: 3, why: "the best rent-per-dollar jump" };
  }

  function levelPhrase(level: number): string {
    if (level === 5) return "hotels";
    return `${level.toString()} ${level === 1 ? "house" : "houses"}`;
  }

  function redeployReason(
    color: PropertyColor,
    level: number,
    locked: boolean,
    why: string,
    atTarget: boolean,
  ): string {
    const name = colorName(color);
    if (locked) {
      return level === 0
        ? `unmortgaging ${name} to restore its monopoly rent`
        : `unmortgaging ${name} and building to ${levelPhrase(level)}`;
    }
    const rationale = atTarget ? why : "as far as cash allows";
    return `${name} to ${levelPhrase(level)} (${rationale})`;
  }

  function planBuild(state: GameState, pid: string): BuildPlan | null {
    const player = state.players.find((q) => q.id === pid);
    if (!player) return null;
    const playerCash = player.cash;
    const floor = liquidityFloor(state, pid);
    const flush = playerCash > floor + p.hotelCushion;
    const { level: want, why } = desiredLevel(state, pid);
    const build: Record<number, number> = {};
    const mortgage: Record<number, boolean> = {};
    const reasons: string[] = [];

    function tryLevel(
      color: PropertyColor,
      positions: readonly number[],
      mortgagedMembers: readonly number[],
      level: number,
    ): boolean {
      const candidateBuild = { ...build };
      if (level > 0) for (const pos of positions) candidateBuild[pos] = level;
      const candidateMortgage = { ...mortgage };
      for (const pos of mortgagedMembers) candidateMortgage[pos] = false;
      const summary = manageSummary(state, pid, {
        build: candidateBuild,
        mortgage: candidateMortgage,
      });
      if (summary.ok && playerCash + summary.netCash >= floor) {
        if (level > 0) for (const pos of positions) build[pos] = level;
        for (const pos of mortgagedMembers) mortgage[pos] = false;
        return true;
      }
      return false;
    }

    const myMonopolies: {
      color: PropertyColor;
      positions: readonly number[];
      mortgagedMembers: number[];
      locked: boolean;
      floorOf: number;
    }[] = [];
    for (const color of COLORS_BY_WEIGHT) {
      if (!hasMonopoly(state, color, pid)) continue;
      const positions = groupPositions(color);
      const mortgagedMembers = positions.filter((pos) => state.mortgaged[pos]);
      const locked = mortgagedMembers.length > 0;
      if (locked && !flush) continue;
      const floorOf = maxLevelInSet(state, color);
      myMonopolies.push({ color, positions, mortgagedMembers, locked, floorOf });
    }

    const SPREAD_FLOOR = p.spreadFloor;
    for (const m of myMonopolies) {
      const stop = m.locked ? 0 : m.floorOf + 1;
      const target = Math.max(stop, Math.min(SPREAD_FLOOR, want));
      if (target <= m.floorOf && !m.locked) continue;
      for (let level = target; level >= stop; level--) {
        if (tryLevel(m.color, m.positions, m.mortgagedMembers, level)) {
          reasons.push(redeployReason(m.color, level, m.locked, why, level === want));
          break;
        }
      }
    }

    if (want > SPREAD_FLOOR) {
      for (const m of myMonopolies) {
        if (m.locked) continue;
        const builtLevel = Math.max(...m.positions.map((q) => build[q] ?? developmentLevel(state, q)));
        const stop = builtLevel + 1;
        if (want < stop) continue;
        for (let level = want; level >= stop; level--) {
          if (tryLevel(m.color, m.positions, m.mortgagedMembers, level)) {
            reasons.push(redeployReason(m.color, level, false, why, level === want));
            break;
          }
        }
      }
    }

    const finalBuild: Record<number, number> = {};
    for (const [posStr, level] of Object.entries(build)) {
      const pos = Number(posStr);
      if (level !== developmentLevel(state, pos)) finalBuild[pos] = level;
    }
    if (Object.keys(finalBuild).length === 0 && Object.keys(mortgage).length === 0) {
      return null;
    }
    return { build: finalBuild, mortgage, reason: `Developing: ${reasons.join("; ")}.` };
  }

  // --- forced liquidation (claude-v38 verbatim) ---
  function essentialness(state: GameState, pid: string, pos: number): number {
    const color = colorAt(pos);
    if (color !== null) return hasMonopoly(state, color, pid) ? 4 : 1;
    return SPACES[pos].kind === "railroad" ? 3 : 0.5;
  }

  function raiseCashStep(state: GameState, pid: string): { intent: Intent; reason: string } | null {
    let pick: { pos: number; score: number } | null = null;
    for (const posStr in state.ownership) {
      if (state.ownership[posStr] !== pid) continue;
      const pos = Number(posStr);
      if (state.mortgaged[pos]) continue;
      if (builtLotsInGroup(pos, (q) => developmentLevel(state, q)).length > 0) continue;
      if (mortgageValueAt(pos) === null) continue;
      const score = essentialness(state, pid, pos) * 100000 + assetBase(state, pos);
      if (pick === null || score < pick.score) pick = { pos, score };
    }
    if (pick !== null) {
      return {
        intent: { kind: "mortgage", playerId: pid, position: pick.pos },
        reason: `Raising cash: mortgaging ${spaceName(pick.pos)} — my least essential asset, monopolies untouched.`,
      };
    }
    let weakest: { color: PropertyColor; weight: number } | null = null;
    for (const color of COLORS_BY_WEIGHT) {
      const positions = groupPositions(color);
      if (!positions.some((pos) => developmentLevel(state, pos) > 0)) continue;
      if (state.ownership[positions[0]] !== pid) continue;
      if (weakest === null || GROUP_WEIGHT[color] < weakest.weight) {
        weakest = { color, weight: GROUP_WEIGHT[color] };
      }
    }
    if (weakest !== null) {
      const build: Record<number, number> = {};
      for (const pos of groupPositions(weakest.color)) build[pos] = 0;
      return {
        intent: { kind: "manage", playerId: pid, build, mortgage: {} },
        reason: `Raising cash: selling the ${colorName(weakest.color)} houses — my weakest developed set.`,
      };
    }
    return null;
  }

  function planRaiseByMortgage(
    state: GameState,
    pid: string,
    need: number,
  ): Record<number, boolean> | null {
    const lots: { pos: number; value: number; ess: number }[] = [];
    for (const posStr in state.ownership) {
      if (state.ownership[posStr] !== pid) continue;
      const pos = Number(posStr);
      if (state.mortgaged[pos]) continue;
      if (builtLotsInGroup(pos, (q) => developmentLevel(state, q)).length > 0) continue;
      const value = mortgageValueAt(pos);
      if (value === null) continue;
      lots.push({ pos, value, ess: essentialness(state, pid, pos) });
    }
    lots.sort((a, b) => a.ess - b.ess || a.value - b.value);
    const mortgage: Record<number, boolean> = {};
    let raised = 0;
    for (const lot of lots) {
      if (raised >= need) break;
      mortgage[lot.pos] = true;
      raised += lot.value;
    }
    return raised >= need ? mortgage : null;
  }

  // --- jail (claude-v38 verbatim) ---
  function boardIsDangerous(state: GameState, pid: string): boolean {
    for (const posStr in state.ownership) {
      if (state.ownership[posStr] === pid) continue;
      const pos = Number(posStr);
      if (developmentLevel(state, pos) > 0 && rentEstimateAt(state, pos) >= p.jailDangerRent) {
        return true;
      }
    }
    return false;
  }

  function jailChoice(
    state: GameState,
    pid: string,
    heldCard: "chance" | "communityChest" | null,
  ): { intent: Intent | null; reason: string } {
    const player = state.players.find((q) => q.id === pid);
    const cash = player?.cash ?? 0;
    if (boardIsDangerous(state, pid)) {
      return {
        intent: null,
        reason:
          "Staying in jail — developed boards are out there, so it's safer to sit, collect rent, and roll for doubles.",
      };
    }
    if (heldCard !== null) {
      return {
        intent: { kind: "use-jail-card", playerId: pid },
        reason: "Out of jail with the free card — board's still safe and I want to keep buying.",
      };
    }
    if (cash >= JAIL_FEE) {
      return {
        intent: { kind: "pay-to-leave-jail", playerId: pid },
        reason: "Paying out of jail — early, safe board; better to be moving and acquiring.",
      };
    }
    return { intent: null, reason: "No card and can't spare the fine — rolling for doubles." };
  }

  // --- trades (claude-v38 base + claude-v41 seller-side pricing, constants from `p`) ---
  const RIVAL_THREAT_FACTOR = p.rivalThreatFactor; // v41: DECOUPLED from denyFactor (#3b); default 0.15 = denyFactor = v38

  function postTradeState(state: GameState, terms: TradeTerms): GameState {
    const proj = projectTrade(state, terms);
    return {
      ...state,
      ownership: proj.ownership,
      jailFreeCards: proj.jailFreeCards,
      players: state.players.map((q) => ({ ...q, cash: proj.cashById[q.id] ?? q.cash })),
    };
  }

  function monopolyGain(before: GameState, after: GameState, pid: string): number {
    let gain = 0;
    for (const color of COLORS_BY_WEIGHT) {
      if (hasMonopoly(after, color, pid) && !hasMonopoly(before, color, pid)) {
        gain += monopolyBonus(color);
      }
    }
    return gain;
  }

  function rivalThreatCost(
    state: GameState,
    after: GameState,
    pid: string,
    terms: TradeTerms,
  ): number {
    let worst = 0;
    for (const opp of activeOpponents(state, pid)) {
      let share = 0;
      for (const color of COLORS_BY_WEIGHT) {
        if (!hasMonopoly(after, color, opp.id) || hasMonopoly(state, color, opp.id)) continue;
        let received = 0;
        let fromPid = 0;
        for (const [posStr, to] of Object.entries(terms.propertyTo)) {
          const pos = Number(posStr);
          if (to !== opp.id || colorAt(pos) !== color) continue;
          received += 1;
          if (state.ownership[pos] === pid) fromPid += 1;
        }
        if (received === 0) continue;
        share += monopolyBonus(color) * RIVAL_THREAT_FACTOR * (fromPid / received);
      }
      worst = Math.max(worst, share);
    }
    return Math.round(worst);
  }

  /** claude-v41 / claude-v35 HOLDER-SIDE denial price — the seller-side mirror of
   *  the buyer's `denyFactor × bonus` premium. A completer `pid` holds against a
   *  one-short rival is a premium-extraction option; handing it to anyone BUT that
   *  rival forfeits the premium, so charge `denyFactor × bonus × holderDenialFrac`.
   *  holderDenialFrac=1 is the exact buyer/holder lockstep (bots/CLAUDE.md); =0 (the
   *  v38/v36 default) turns it off and the hot-potato ring returns. Selling TO the
   *  rival is the cash-out (priced by rivalThreatCost; recipient is the rival xor
   *  not, so no double-count). */
  function denialPositionCost(state: GameState, pid: string, terms: TradeTerms): number {
    if (p.holderDenialFrac <= 0) return 0;
    let cost = 0;
    for (const [posStr, to] of Object.entries(terms.propertyTo)) {
      const pos = Number(posStr);
      if (state.ownership[pos] !== pid) continue; // only a lot I currently hold
      const color = colorAt(pos);
      if (color === null) continue;
      const others = groupPositions(color).filter((q) => q !== pos);
      if (others.length === 0) continue;
      // A one-short rival owns ALL the other lots, isn't me, and isn't the recipient.
      const rival = state.ownership[others[0]];
      if (!rival || rival === pid || rival === to) continue;
      if (!others.every((q) => state.ownership[q] === rival)) continue;
      if (developmentLevel(state, pos) > 0 || others.some((q) => developmentLevel(state, q) > 0)) {
        continue;
      }
      const rivalPlayer = state.players.find((q) => q.id === rival);
      if (rivalPlayer === undefined || rivalPlayer.bankrupt) continue;
      cost += monopolyBonus(color) * p.denyFactor * p.holderDenialFrac;
    }
    return Math.round(cost);
  }

  /** claude-v41 (#3c) — does `pid` have a productive outlet for cash? (a near-
   *  monopoly to complete, a buildable monopoly, or a mortgage to redeem). If not,
   *  incoming cash in a set-handover is worth less than face. */
  function hasProductiveOutlet(state: GameState, pid: string): boolean {
    for (const color of COLORS_BY_WEIGHT) {
      const positions = groupPositions(color);
      const owned = positions.filter((q) => state.ownership[q] === pid).length;
      if (owned >= positions.length - 1) return true;
    }
    for (const color of COLORS_BY_WEIGHT) {
      if (hasMonopoly(state, color, pid)) {
        const positions = groupPositions(color);
        const maxDev = Math.max(...positions.map((q) => developmentLevel(state, q)));
        if (maxDev < 5) return true;
      }
    }
    for (const posStr in state.ownership) {
      if (state.ownership[posStr] === pid && state.mortgaged[Number(posStr)]) return true;
    }
    return false;
  }

  interface TradeVerdict {
    accept: boolean;
    delta: number;
    reason: string;
  }

  function evaluateTrade(state: GameState, pid: string, terms: TradeTerms): TradeVerdict {
    const after = postTradeState(state, terms);
    const rawDelta = positionValue(after, pid) - positionValue(state, pid);
    const postCash = after.players.find((q) => q.id === pid)?.cash ?? 0;

    const myMono = monopolyGain(state, after, pid);
    const threatCost = rivalThreatCost(state, after, pid, terms);
    // v41: forfeiting a held completer to a NON-rival gives up the denial premium —
    // priced symmetrically with the buyer side, scaled by holderDenialFrac (0 at
    // default → this term vanishes and we are back to v38).
    const positionCost = denialPositionCost(state, pid, terms);
    const delta = rawDelta - threatCost - positionCost;

    const cashIn = (terms.cashDelta[pid] ?? 0) > 0 ? (terms.cashDelta[pid] ?? 0) : 0;
    // v41 (#3c): discount idle cash when handing a rival a set with no outlet for it
    // (0 discount at default → no penalty → v38).
    const deployabilityPenalty =
      p.deployabilityDiscount > 0 && cashIn > 0 && threatCost > 0 && !hasProductiveOutlet(after, pid)
        ? Math.round(cashIn * p.deployabilityDiscount)
        : 0;
    const effectiveDelta = cashIn > 0
      ? delta + Math.round(cashIn * sellerDistress(state, pid) * p.survivalFactor) - deployabilityPenalty
      : delta;

    if (effectiveDelta <= ACCEPT_MIN) {
      return {
        accept: false,
        delta: effectiveDelta,
        reason:
          threatCost > 0
            ? "the rival monopoly it creates outweighs what I get"
            : positionCost > 0
              ? "I'd be giving up my hold on a rival's completer for too little"
              : "it doesn't improve my position",
      };
    }
    if (postCash < 0 && effectiveDelta < p.liquidityRiskGain) {
      return { accept: false, delta: effectiveDelta, reason: "it would leave me short of cash" };
    }
    const reason =
      myMono > 0
        ? "it completes a monopoly for me"
        : threatCost > 0
          ? "the cash outweighs the monopoly I'm handing over"
          : positionCost > 0
            ? "the cash outweighs the denial position I'm giving up"
            : "it nets me real value";
    return { accept: true, delta: effectiveDelta, reason };
  }

  function assetSignature(terms: TradeTerms): string {
    const props = Object.entries(terms.propertyTo)
      .map(([pos, to]) => `${pos}:${to}`)
      .sort()
      .join(",");
    const cards = Object.entries(terms.gojfTo)
      .map(([src, to]) => `${src}:${to}`)
      .sort()
      .join(",");
    return `p[${props}]g[${cards}]`;
  }

  function proposedThisTurn(state: GameState, pid: string): boolean {
    const turn = state.turns[state.turns.length - 1];
    return turn.events.some(
      (e) => (e.kind === "trade" || e.kind === "trade-declined") && e.proposerId === pid,
    );
  }

  function declinedWithoutImprovement(state: GameState, pid: string, terms: TradeTerms): boolean {
    const sig = assetSignature(terms);
    for (let i = state.turns.length - 1; i >= 0; i--) {
      const events = state.turns[i].events;
      for (let j = events.length - 1; j >= 0; j--) {
        const e = events[j];
        if (e.kind !== "trade-declined" || e.proposerId !== pid) continue;
        if (assetSignature(e) !== sig) continue;
        const oldCash = e.cashDelta[e.declinedBy] ?? 0;
        const newCash = terms.cashDelta[e.declinedBy] ?? 0;
        return newCash <= oldCash;
      }
    }
    return false;
  }

  function sweetenFor(
    state: GameState,
    pid: string,
    oppId: string,
    base: TradeTerms,
  ): TradeTerms | null {
    const oppDelta = evaluateTrade(state, oppId, base).delta;
    if (oppDelta >= p.acceptMargin) return base;
    const relief = 1 + sellerDistress(state, oppId) * p.survivalFactor;
    const cash = Math.ceil((p.acceptMargin - oppDelta) / relief);
    const myCash = state.players.find((q) => q.id === pid)?.cash ?? 0;
    if (myCash - cash < 0) return null;
    return { ...base, cashDelta: { [pid]: -cash, [oppId]: cash } };
  }

  function sweetenForAll(
    state: GameState,
    pid: string,
    sellers: readonly string[],
    base: TradeTerms,
  ): TradeTerms | null {
    const sweeteners: Record<string, number> = {};
    let total = 0;
    for (const sId of sellers) {
      const delta = evaluateTrade(state, sId, base).delta;
      if (delta >= p.acceptMargin) continue;
      const relief = 1 + sellerDistress(state, sId) * p.survivalFactor;
      const cash = Math.ceil((p.acceptMargin - delta) / relief);
      sweeteners[sId] = cash;
      total += cash;
    }
    if (total === 0) return base;
    const myCash = state.players.find((q) => q.id === pid)?.cash ?? 0;
    if (myCash - total < 0) return null;
    return { ...base, cashDelta: { ...sweeteners, [pid]: -total } };
  }

  function isProposable(state: GameState, terms: TradeTerms): boolean {
    const active = (id: string): boolean => {
      const q = state.players.find((pl) => pl.id === id);
      return q !== undefined && !q.bankrupt;
    };
    let moves = 0;
    for (const [posStr, to] of Object.entries(terms.propertyTo)) {
      const pos = Number(posStr);
      const owner = state.ownership[pos];
      if (!owner || owner === to || !active(to)) return false;
      if (builtLotsInGroup(pos, (q) => developmentLevel(state, q)).length > 0) return false;
      moves += 1;
    }
    if (Object.values(terms.cashDelta).reduce((a, b) => a + b, 0) !== 0) return false;
    if (Object.values(terms.cashDelta).some((v) => v !== 0)) moves += 1;
    if (moves === 0) return false;
    if (tradeParticipants(state, terms).size < 2) return false;
    const after = postTradeState(state, terms);
    return after.players.every((q) => q.cash >= 0);
  }

  function rivalCanAcquire(state: GameState, rivalId: string, pos: number, holder: string): boolean {
    const giveToRival: TradeTerms = { propertyTo: { [pos]: rivalId }, gojfTo: {}, cashDelta: {} };
    const holderDelta = evaluateTrade(state, holder, giveToRival).delta;
    const need = Math.ceil(p.acceptMargin - holderDelta);
    const rival = state.players.find((q) => q.id === rivalId);
    if ((rival?.cash ?? 0) < need) return false;
    return acquisitionValue(state, rivalId, pos) - need >= p.acceptMargin;
  }

  interface Candidate {
    terms: TradeTerms;
    delta: number;
    reason: string;
    denyBonus?: number;
  }

  function proposeBestTrade(
    state: GameState,
    pid: string,
  ): { terms: TradeTerms; reason: string } | null {
    if (proposedThisTurn(state, pid)) return null;

    const candidates: Candidate[] = [];

    for (const color of COLORS_BY_WEIGHT) {
      const positions = groupPositions(color);
      const owned = ownedInColor(state, pid, color);
      if (owned === 0 || owned === positions.length) continue;

      const missingLots: { pos: number; owner: string }[] = [];
      let tradable = true;
      for (const pos of positions) {
        if (state.ownership[pos] === pid) continue;
        const owner = state.ownership[pos];
        if (!owner || owner === pid) { tradable = false; break; }
        if (builtLotsInGroup(pos, (q) => developmentLevel(state, q)).length > 0) {
          tradable = false;
          break;
        }
        missingLots.push({ pos, owner });
      }
      if (!tradable || missingLots.length === 0) continue;
      const sellers = new Set(missingLots.map((m) => m.owner));
      const single = missingLots.length === 1 ? missingLots[0] : undefined;

      if (single !== undefined) {
        const oppId = single.owner;
        for (const d of COLORS_BY_WEIGHT) {
          if (d === color) continue;
          const dPos = groupPositions(d);
          if (ownedInColor(state, oppId, d) !== dPos.length - 1) continue;
          const oppMissing = dPos.find((pos) => state.ownership[pos] !== oppId);
          if (oppMissing === undefined || state.ownership[oppMissing] !== pid) continue;
          if (builtLotsInGroup(oppMissing, (q) => developmentLevel(state, q)).length > 0) continue;
          const swap = sweetenFor(
            state,
            pid,
            oppId,
            { propertyTo: { [single.pos]: pid, [oppMissing]: oppId }, gojfTo: {}, cashDelta: {} },
          );
          if (swap !== null) {
            candidates.push({
              terms: swap,
              delta: 0,
              reason: `Proposing a swap — my ${colorName(d)} lot for ${spaceName(single.pos)}, so we each complete a monopoly.`,
            });
          }
        }
      }

      const propertyTo: Record<number, string> = {};
      for (const m of missingLots) propertyTo[m.pos] = pid;
      const buy = sweetenForAll(state, pid, [...sellers], {
        propertyTo,
        gojfTo: {},
        cashDelta: {},
      });
      if (buy !== null) {
        const reason =
          single !== undefined
            ? `Offering cash for ${spaceName(single.pos)} to complete my ${colorName(color)} monopoly.`
            : `Buying the ${missingLots.length.toString()} missing ${colorName(color)} ` +
              `from ${sellers.size === 1 ? "its owner" : `${sellers.size.toString()} owners`} to complete the monopoly.`;
        candidates.push({ terms: buy, delta: 0, reason });
      }
    }

    for (const opp of activeOpponents(state, pid)) {
      for (const color of COLORS_BY_WEIGHT) {
        const positions = groupPositions(color);
        if (ownedInColor(state, opp.id, color) !== positions.length - 1) continue;
        const missing = positions.filter((pos) => state.ownership[pos] !== opp.id);
        if (missing.length !== 1) continue;
        const pos = missing[0];
        const holder = state.ownership[pos];
        if (!holder || holder === pid || holder === opp.id) continue;
        if (builtLotsInGroup(pos, (q) => developmentLevel(state, q)).length > 0) continue;
        if (!rivalCanAcquire(state, opp.id, pos, holder)) continue;
        const buy = sweetenFor(state, pid, holder, {
          propertyTo: { [pos]: pid },
          gojfTo: {},
          cashDelta: {},
        });
        if (buy === null) continue;
        const holderName = state.players.find((q) => q.id === holder)?.name ?? "its owner";
        candidates.push({
          terms: buy,
          delta: 0,
          denyBonus: Math.round(monopolyBonus(color) * p.denyFactor),
          reason: `Buying ${spaceName(pos)} from ${holderName} to deny ${opp.name} the ${colorName(color)} monopoly.`,
        });
      }
    }

    let best: { cand: Candidate; effective: number } | null = null;
    for (const cand of candidates) {
      if (!isProposable(state, cand.terms)) continue;
      const mine = evaluateTrade(state, pid, cand.terms);
      const denyBonus = cand.denyBonus ?? 0;
      const effective = mine.delta + denyBonus;
      if (denyBonus > 0 ? effective <= ACCEPT_MIN : !mine.accept) continue;
      const others = [...tradeParticipants(state, cand.terms)].filter((id) => id !== pid);
      if (!others.every((id) => evaluateTrade(state, id, cand.terms).accept)) continue;
      if (declinedWithoutImprovement(state, pid, cand.terms)) continue;
      if (best === null || effective > best.effective) {
        best = { cand, effective };
      }
    }
    return best === null ? null : { terms: best.cand.terms, reason: best.cand.reason };
  }

  // --- policy dispatcher (claude-v38 verbatim, constants from `p`) ---
  const RAISE_WORTH_MULT = p.raiseWorthMult;
  const DIP_WORTH_MULT = p.dipWorthMult;

  function preRoll(state: GameState, pid: string): BotDecision | null {
    const proposal = proposeBestTrade(state, pid);
    if (proposal !== null) {
      return {
        intent: { kind: "set-queue", playerId: pid, queue: "trade", armed: true },
        note: proposal.reason,
      };
    }
    if (state.turn.playerId === pid) {
      const plan = planBuild(state, pid);
      if (plan !== null) {
        return {
          intent: { kind: "set-queue", playerId: pid, queue: "manage", armed: true },
          note: plan.reason,
        };
      }
    }
    return null;
  }

  function buyContext(state: GameState, pid: string, pos: number): string {
    const color = colorAt(pos);
    if (color === null) return "";
    const total = groupPositions(color).length;
    if (ownedInColor(state, pid, color) === total - 1) {
      return ` to complete my ${colorName(color)} monopoly`;
    }
    for (const opp of activeOpponents(state, pid)) {
      if (ownedInColor(state, opp.id, color) === total - 1) {
        return ` to deny ${opp.name} the ${colorName(color)}`;
      }
    }
    return "";
  }

  function buyDecision(state: GameState, pid: string): BotDecision | null {
    if (state.turn.playerId !== pid) return null;
    const pos = state.turn.pendingBuy;
    if (pos === undefined) return null;
    const price = ownablePrice(pos);
    const player = state.players.find((q) => q.id === pid);
    if (price === null || !player) return null;

    const worth = acquisitionValue(state, pid, pos);
    const floor = liquidityFloor(state, pid);
    const context = buyContext(state, pid, pos);
    const name = spaceName(pos);

    if (player.cash >= price) {
      if (player.cash - price >= floor) {
        return {
          intent: { kind: "buy", playerId: pid },
          note: context
            ? `Buying ${name}${context}.`
            : `Buying ${name} — land is leverage, and I keep my reserve.`,
        };
      }
      if (worth >= price * DIP_WORTH_MULT) {
        return {
          intent: { kind: "buy", playerId: pid },
          note: `Buying ${name}${context || " — worth dipping into my reserve for"}.`,
        };
      }
      return {
        intent: { kind: "decline-buy", playerId: pid },
        note: `Passing on ${name} — not worth spending below my rent reserve.`,
      };
    }

    if (
      worth >= price * RAISE_WORTH_MULT &&
      player.cash + mortgageableTotal(state, pid) >= price
    ) {
      return {
        intent: { kind: "raise-cash", playerId: pid },
        note: `${name} is worth owning${context} — raising cash to buy it.`,
      };
    }
    return {
      intent: { kind: "decline-buy", playerId: pid },
      note: `Passing on ${name} — can't afford it and it's not worth liquidating for.`,
    };
  }

  function raisingCash(state: GameState, pid: string): BotDecision | null {
    if (state.turn.playerId !== pid) return null;
    const pos = state.turn.pendingBuy;
    const player = state.players.find((q) => q.id === pid);
    const price = pos === undefined ? null : ownablePrice(pos);
    if (pos === undefined || price === null || !player) {
      return { intent: { kind: "cancel-manage", playerId: pid } };
    }
    const need = price - player.cash;
    const mortgage = need > 0 ? planRaiseByMortgage(state, pid, need) : {};
    if (mortgage === null) {
      return { intent: { kind: "cancel-manage", playerId: pid } };
    }
    const staged: ManageStaged = { build: {}, mortgage };
    const current = state.turn.manageStaged ?? { build: {}, mortgage: {} };
    if (sameStaging(current, staged)) {
      return {
        intent: { kind: "buy", playerId: pid },
        note: `Raised the cash — completing the buy of ${spaceName(pos)}.`,
      };
    }
    return { intent: { kind: "update-manage-staging", playerId: pid, staged } };
  }

  function auction(state: GameState, pid: string): BotDecision | null {
    const a = state.turn.auction;
    if (!a || !a.active.includes(pid) || a.leaderId === pid) return null;
    const next = a.highBid + BID_INCREMENT;
    const worth =
      p.standingAuctionGain === 0
        ? acquisitionValue(state, pid, a.position)
        : Math.round(
            acquisitionValue(state, pid, a.position) *
              standingFactor(state, pid, p.standingAuctionGain),
          );
    const cap = Math.min(worth, auctionBidCap(state, pid));
    if (next <= cap) {
      return { intent: { kind: "bid", playerId: pid, amount: next } };
    }
    return {
      intent: { kind: "pass-bid", playerId: pid },
      note: `Dropping out — ${spaceName(a.position)} isn't worth a $${next.toString()} bid to me.`,
    };
  }

  function mustRaiseCash(state: GameState, pid: string): BotDecision | null {
    if (firstNegativePlayer(state) !== pid) return null;
    const step = raiseCashStep(state, pid);
    return step === null ? null : { intent: step.intent, note: step.reason };
  }

  function managing(state: GameState, pid: string): BotDecision | null {
    if (state.turn.managerId !== pid) return null;
    const plan = planBuild(state, pid);
    if (plan === null) return null;
    return {
      intent: { kind: "manage", playerId: pid, build: plan.build, mortgage: plan.mortgage },
    };
  }

  function tradeBuilding(state: GameState, pid: string): BotDecision | null {
    const draft = state.turn.tradeDraft;
    if (!draft || draft.proposerId !== pid) return null;
    const proposal = proposeBestTrade(state, pid);
    if (proposal === null) return null;
    if (sameTerms(draft, proposal.terms)) {
      return { intent: { kind: "propose-trade", playerId: pid } };
    }
    return { intent: { kind: "update-trade-draft", playerId: pid, terms: proposal.terms } };
  }

  function tradePending(state: GameState, pid: string): BotDecision | null {
    const pending = state.turn.pendingTrade;
    if (!pending || !(pid in pending.approvals) || pending.approvals[pid]) return null;
    const verdict = evaluateTrade(state, pid, pending);
    return verdict.accept
      ? {
          intent: { kind: "accept-trade", playerId: pid, tradeId: pending.id },
          note: `Accepting — ${verdict.reason}.`,
        }
      : {
          intent: { kind: "decline-trade", playerId: pid, tradeId: pending.id },
          note: `Declining — ${verdict.reason}.`,
        };
  }

  function jailDecision(state: GameState, pid: string): BotDecision | null {
    if (state.turn.playerId !== pid) return null;
    const choice = jailChoice(state, pid, heldJailCard(state, pid));
    if (choice.intent !== null) return { intent: choice.intent, note: choice.reason };
    if (jailStayNoted(state, pid, choice.reason)) return null;
    return { intent: { kind: "bot-note", playerId: pid, text: choice.reason } };
  }

  function jailStayNoted(state: GameState, pid: string, text: string): boolean {
    const turn = state.turns[state.turns.length - 1];
    return turn.events.some(
      (e) => e.kind === "bot-note" && e.playerId === pid && e.text === text,
    );
  }

  return function paramBot(state: GameState, playerId: string): BotDecision | null {
    switch (state.turn.phase) {
      case "pre-roll":
        return preRoll(state, playerId);
      case "buy-decision":
        return buyDecision(state, playerId);
      case "raising-cash":
        return raisingCash(state, playerId);
      case "auction":
        return auction(state, playerId);
      case "must-raise-cash":
        return mustRaiseCash(state, playerId);
      case "managing":
        return managing(state, playerId);
      case "trade-building":
        return tradeBuilding(state, playerId);
      case "trade-pending":
        return tradePending(state, playerId);
      case "jail-decision":
        return jailDecision(state, playerId);
      default:
        return null;
    }
  };
}

// --- shared, parameter-free helpers (reasoning-note text; claude-v38 verbatim) ---
function colorName(color: PropertyColor): string {
  return color === "dark-blue"
    ? "dark blues"
    : color === "light-blue"
      ? "light blues"
      : `${color}s`;
}

function spaceName(pos: number): string {
  const s = SPACES[pos];
  return s.kind === "property" || s.kind === "railroad" || s.kind === "utility"
    ? s.name
    : "that space";
}

function sortedEntries(o: Readonly<Record<number | string, unknown>>): string {
  return Object.keys(o)
    .sort()
    .map((k) => `${k}:${String(o[k])}`)
    .join(",");
}

function sameStaging(a: ManageStaged, b: ManageStaged): boolean {
  return (
    sortedEntries(a.build) === sortedEntries(b.build) &&
    sortedEntries(a.mortgage) === sortedEntries(b.mortgage)
  );
}

function sameTerms(a: TradeTerms, b: TradeTerms): boolean {
  return (
    sortedEntries(a.propertyTo) === sortedEntries(b.propertyTo) &&
    sortedEntries(a.gojfTo) === sortedEntries(b.gojfTo) &&
    sortedEntries(a.cashDelta) === sortedEntries(b.cashDelta)
  );
}
