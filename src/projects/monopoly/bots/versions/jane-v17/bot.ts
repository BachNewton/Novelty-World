// ===========================================================================
// fable-v2 FACTORY — a VERBATIM copy of fable-v1's factory (self-contained
// snapshot rule; see ../fable-v1/bot.ts and PHILOSOPHY.md). fable-v2 differs
// from fable-v1 ONLY in the vector bound in ./index.ts (the 2026-07-17
// combined-space ES winner). The fable-v1 layer, for reference:
//
//   F1  a flow engine: the exact 2d6 next-roll landing distribution, per player
//       — expected outgo (with the worst single hit) and expected inflow —
//       driving a danger-aware liquidity floor (F1a), an EV-based jail decision
//       (F1b), and a tempo-aware build order (F1c).
//   F2  a trade-pricing overhaul: survival credit bounded by the cash that
//       actually erases distress (F2a), rival-threat cost scaled by the
//       RECIPIENT's standing (F2b), rail/utility synergy priced into the threat
//       (F2c), a heads-up threat multiplier (F2d), and a liquidity guard on
//       voluntary trades (F2e).
//   F3  a ring-proof transfer memory: a lot that was trade-transferred within
//       the last K turns may only move again to the completing rival.
//
// EVERY new lever has a NO-OP default, so this factory bound to the raw
// claude-v45 vector reproduces claude-v45 decision-for-decision (asserted by
// policy.test.ts) — the fable levers only change behavior once turned on in
// FABLE_V1_PARAMS. Imports only shared monopoly infrastructure; no
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

  // --- fable-v1 FLOW + TRADE levers. Every dimension defaults to a NO-OP so the
  //     factory bound to the raw claude-v45 vector reproduces claude-v45 exactly
  //     (policy.test.ts asserts it); see PHILOSOPHY.md for the evidence base. ---

  /** F1a — danger-aware liquidity floor: `flowFloorFrac × expected next-roll
   *  outgo + flowTailFrac × worst single next-roll hit`, min `baseFloor`, capped
   *  at `flowFloorCap`. 0 disables (falls back to the v45 static floor). */
  flowFloorFrac: number;
  /** F1a — weight on the worst single next-roll hit (the tail a mean hides). */
  flowTailFrac: number;
  /** F1a — cap on the flow floor (replaces v45's $100 `floorCap` when the flow
   *  floor is on; the static cap is the build-sell churn engine). */
  flowFloorCap: number;
  /** F8 (fable-v7) — TRADE-OUTFLOW tail guard: a voluntary trade spending cash
   *  must leave ≥ this fraction of the worst single board hit (position-
   *  independent — the F2e flow floor is next-roll-myopic while a trade's cash
   *  state persists). Transformative gains (delta ≥ liquidityRiskGain) are
   *  exempt, so set-completion boldness is untouched. 0 disables (= fable-v6). */
  tradeTailFrac: number;
  /** F9 (fable-v8) — fraction of the F8 reserve a TRANSFORMATIVE trade must
   *  still leave (the F8 exemption stops being total): a completer bought into
   *  total illiquidity strands its own bonus (probe game 4's $430-of-$442
   *  wallet drain, $7 left, no house ever built, dead). A floor on the price
   *  paid, never a discount on set value. 0 = fable-v7's full exemption. */
  transformTailFrac: number;
  /** F7 (comeback equity) — scale the F2a survival credit by my position-value
   *  share of the STRONGEST live opponent (clamped [0,1]): survival cash is
   *  worth the win probability it preserves, so a beaten seat stops accepting
   *  fire-sale prices that merely finance the leader's win. Evidence: the
   *  4q3y6i $55 States handover (seller paid $450 rent on that same lot two
   *  rolls later and died) and both Fable-played probe games' distress rail
   *  sales at ~book+$50 — every one cleared through the survival credit
   *  swamping the (fixed) rail/threat charge. 0 disables (= fable-v5's
   *  unconditional credit); 1 = full equity scaling. */
  survivalEquityGain: number;
  /** F6 (auction discipline) — 1 = cap VOLUNTARY auction bids at liquid
   *  capacity (`cash + mortgageable equity − flow floor`), so winning never
   *  forces a must-raise-cash liquidation of the prize itself. From a
   *  Fable-played probe game vs fable-v2: a bot at $166 cash counter-bid +$10
   *  to win a $260 lot, then instantly mortgaged the won lot to settle — a
   *  pure winner's curse a human exploits by bidding face+ε (the bots also
   *  ratchet any lowball up to face, so the human pays face either way and
   *  the bot bleeds liquidation costs when it "wins"). The acquisitionValue
   *  cap still applies on top — this only adds the liquidity ceiling.
   *  0 disables (= fable-v4). */
  auctionLiquidCap: number;
  /** F5 (fable-v4) — voluntary-spend TAIL GUARD: a discretionary spend
   *  (build / redeploy / unmortgage in `planBuild`) must also leave cash ≥
   *  this fraction of the WORST single next-roll landing, UNCAPPED — the flow
   *  floor's cap + small tail weight reserve a $950 hotel hit at ~$134, which
   *  is how a fable-v2 seat spent $506 unmortgaging bare greens three turns
   *  before dying to a $118 charge (game:review 4q3y6i T219→T222). Forced
   *  charges and trades are untouched — this gates only the build planner's
   *  voluntary spends. 0 disables (= fable-v3). */
  voluntaryTailFrac: number;
  /** F1 — fraction of a SECOND convolved roll blended into outgo estimates
   *  (mobility deferral horizon for jail / floor). */
  flowSecondRollFrac: number;
  /** F1b — EV jail rule: stay iff the expected cost of walking (next-roll outgo
   *  from just-visiting, minus the GO credit) exceeds this. 0 = v45's static
   *  `jailDangerRent` any-developed-lot rule. */
  jailStayThreshold: number;
  /** F1 — probability a JAILED opponent moves next roll (they may roll doubles
   *  or pay), scaling their contribution to my expected inflow. */
  jailExitProb: number;
  /** F1c — 1 = order buildable monopolies by next-2-roll opponent landing mass
   *  × marginal rent (build what the tokens approach); 0 = v45's static tier
   *  order. */
  buildTempo: number;
  /** F2a — 1 = bound the survival credit on incoming trade cash at the amount
   *  that actually erases my distress (`needToSafe`); 0 = v45's unbounded
   *  `cashIn × distress × survivalFactor` (the fire-sale / ring-reopening leak). */
  survivalBounded: number;
  /** F2b — scale `rivalThreatCost` by the RECIPIENT's standing: mult =
   *  1 + gain × (recipientPV / mean live-player PV − 1), clamped. 0 = flat v45
   *  pricing (a set handed to the runaway leader costs the same as to a
   *  laggard). */
  standingThreatGain: number;
  /** F2c — fraction of the rail/utility SYNERGY delta handed to an opponent
   *  that is priced into `rivalThreatCost` (0 = v45: synergy handed over free). */
  synergyThreatFrac: number;
  /** F2d — multiplier on threat costs when only TWO players are live (zero-sum
   *  endgame: strengthening the only rival is strengthening the only person who
   *  can beat me). 1 = v45. */
  headsUpThreatMult: number;
  /** F2e — a voluntary trade leaving me below `liqGuardFrac × flow floor` needs
   *  `delta ≥ liquidityRiskGain` (extends v45's postCash<0 veto — the human
   *  completer-scalp guard). 0 disables. */
  liqGuardFrac: number;
  /** F3 — a lot that was trade-transferred within this many TURN GROUPS may only
   *  move again to the one-short completing rival: such trades are declined and
   *  never proposed. 0 disables. Kills any A→B→A hot-potato by construction,
   *  independent of pricing. */
  transferMemoryTurns: number;
  /** F4 — 1 = proactively SELL a held completer to the one-short rival at their
   *  full solved premium (the v35 "premium extraction option", exercised instead
   *  of waited on). 0 = v45: only ever sells when the rival proposes. */
  extractionOn: number;
  /** F5 — fraction of the future extraction harvest (rival's monopolyBonus +
   *  book) I'll bid when BUYING/AUCTIONING a lot a one-short rival needs —
   *  buy-to-scalp. 0 = v45's flat `denyFactor` premium only. */
  scalpFrac: number;
  /** F2f — scale threat costs by MY OWN standing: a dominant leader stops
   *  arming rivals for cash (the win is worth more than the premium). 0 = off. */
  selfLeadGain: number;

  /** J1 (jane-v6) — 1 = mortgage non-monopoly singletons to fund house
   *  construction on monopolies that couldn't be built from cash alone.
   *  The fable factory never collateralizes: planBuild only builds from
   *  liquid cash, leaving capital stranded in undeveloped singletons.
   *  Monopoly rent massively exceeds mortgage interest (10%), so the swap
   *  is positive-EV. 0 disables (= fable-v8). */
  collateralDev: number;

  /** J2 (jane-v10) — 1 = replace the spread+push build heuristic with a
   *  greedy marginal-EV optimizer. Instead of building all monopolies to
   *  spreadFloor uniformly then pushing to desiredLevel, the optimizer
   *  evaluates every possible single-level upgrade across all monopolies
   *  and greedily picks the one with the highest expected-rent-per-dollar.
   *  This produces non-uniform final levels (e.g. orange to 5 while green
   *  stays at 3) and allocates constrained capital more efficiently.
   *  Fires every build turn — a structural change to the decision process,
   *  not a situational behavioral tweak. 0 disables (= jane-v6). */
  greedyBuild: number;

  /** J3 (jane-v11) — Scale factor for INCOME FLOW in positionValue. When > 0,
   *  positionValue adds `incomeFlow × inflowScale` where inflow = sum over my
   *  developed monopolies of (dice-based opponent landing probability × current
   *  rent). This makes the valuation OPPONENT-AWARE: a monopoly worth more when
   *  opponents are positioned to land on it. 0 = jane-v6's static book value. */
  incomeFlow: number;

  /** J4 (jane-v11) — Scale factor for THREAT EXPOSURE in positionValue. When > 0,
   *  positionValue subtracts `threatExposure × outflowScale` where outflow =
   *  expected rent I'll pay on my next roll landing on opponent properties.
   *  This discounts positions where I face high-rent threats. 0 = off. */
  threatExposure: number;

  /** J5 (jane-v13) — Income amortization horizon. When > 0, the incomeFlow
   *  term in positionValue is multiplied by a horizon factor that scales with
   *  game phase (measured by total developed properties on the board). Early
   *  game (few developments): horizon ≈ incomeHorizon × 1. Late game (many
   *  developments): horizon grows up to incomeHorizon × 3. This corrects the
   *  undervaluation of developed monopolies, which collect rent every turn for
   *  the rest of the game, not just once. 0 = jane-v11 behavior (single-turn). */
  incomeHorizon: number;

  /** J8 (jane-v17) — Rival deployability in trade evaluation. When > 0,
   *  rivalThreatCost is scaled by the opponent's post-trade ability to develop
   *  the newly completed monopoly. A cash-rich opponent who can immediately
   *  build 3+ houses is FAR more dangerous than a cash-starved one stuck at
   *  2× base rent. The multiplier ranges from ~0.7 (opponent can't afford any
   *  houses) to ~1.2 (opponent can fully develop). This makes the bot
   *  correctly price the REAL danger of arming opponents — not just the static
   *  monopoly bonus. 0 = jane-v13 behavior (flat threat pricing). */
  rivalDeployability: number;
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

/** Exact 2d6 probability mass, indexed by roll total 2..12 (F1 flow engine). */
const DICE_PMF: Readonly<Record<number, number>> = {
  2: 1 / 36, 3: 2 / 36, 4: 3 / 36, 5: 4 / 36, 6: 5 / 36, 7: 6 / 36,
  8: 5 / 36, 9: 4 / 36, 10: 3 / 36, 11: 2 / 36, 12: 1 / 36,
};

/** Standing-ratio ceiling for F2b (recipient PV / mean live PV); the floor is
 *  1 by construction — the mult only ever amplifies, never discounts. */
const STANDING_CLAMP_HI = 2.5;

function rent3House(pos: number): number {
  const s = SPACES[pos];
  return s.kind === "property" ? s.rent.houses[2] : 0;
}

/** Rent at a specific development level (0=base/mono, 1-4=houses, 5=hotel).
 *  Used by the greedy build optimizer for marginal-EV calculations. */
function rentAtLevel(pos: number, level: number): number {
  const s = SPACES[pos];
  if (s.kind !== "property") return 0;
  if (level <= 0) return s.rent.base * 2; // monopoly base rent
  if (level <= 4) return s.rent.houses[level - 1];
  return s.rent.hotel;
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

    // J3 — Income flow: expected rent my developed monopolies collect next
    // opponent turn. Opponent-aware: worth more when opponents are positioned
    // to land on my properties.
    // J5 (jane-v13) — Amortize over a game-phase-aware horizon: developed
    // monopolies collect rent every turn for the rest of the game, not just
    // once. The horizon scales with how late the game is (total developed lots
    // on the board). Early game it's ~incomeHorizon; late game up to ~3×.
    if (p.incomeFlow > 0) {
      let inflow = 0;
      for (const color of COLORS_BY_WEIGHT) {
        if (!hasMonopoly(state, color, pid)) continue;
        for (const pos of groupPositions(color)) {
          const lvl = developmentLevel(state, pos);
          if (lvl <= 0) continue;
          const rent = rentAtLevel(pos, lvl);
          if (rent <= 0) continue;
          inflow += rent * opponentLandingMass(state, pid, pos);
        }
      }
      let horizonMult = 1;
      if (p.incomeHorizon > 0) {
        let totalDev = 0;
        for (let dpos = 0; dpos < 40; dpos++) {
          totalDev += developmentLevel(state, dpos);
        }
        // totalDev ranges 0 (start) to ~40+ (fully developed endgame).
        // Scale horizon: 1× at totalDev=0, 3× at totalDev=40, linear between.
        const phase = Math.min(1, totalDev / 40);
        horizonMult = 1 + 2 * phase;
      }
      value += inflow * p.incomeFlow * horizonMult;
    }

    // J4 — Threat exposure: expected rent I pay on my next roll landing on
    // opponent properties. Discounts positions where I face high-rent threats.
    if (p.threatExposure > 0) {
      const myPos = player.position;
      let outflow = 0;
      for (let roll = 2; roll <= 12; roll++) {
        const dest = (myPos + roll) % 40;
        const owner = state.ownership[dest];
        if (owner === undefined || owner === pid) continue;
        if (state.mortgaged[dest]) continue;
        const rent = rentEstimateAt(state, dest);
        if (rent > 0) outflow += DICE_PMF[roll] * rent;
      }
      value -= outflow * p.threatExposure;
    }

    return value;
  }

  /** Dice-based probability that any opponent lands on `pos` on their next
   *  turn. Uses current opponent positions + jail status. Used by J3 (income
   *  flow) and the greedy build optimizer. */
  function opponentLandingMass(state: GameState, pid: string, pos: number): number {
    let mass = (LANDING_PROB[pos] ?? 0) / 100;
    for (const opp of activeOpponents(state, pid)) {
      const scale = opp.inJail ? p.jailExitProb : 1;
      for (let roll = 2; roll <= 12; roll++) {
        if ((opp.position + roll) % 40 === pos) {
          mass += scale * DICE_PMF[roll];
        }
      }
      if (p.flowSecondRollFrac > 0) {
        for (let roll1 = 2; roll1 <= 12; roll1++) {
          const mid = (opp.position + roll1) % 40;
          if (SPACES[mid].kind === "go-to-jail") continue;
          for (let roll2 = 2; roll2 <= 12; roll2++) {
            if ((mid + roll2) % 40 === pos) {
              mass += scale * DICE_PMF[roll1] * DICE_PMF[roll2] * p.flowSecondRollFrac;
            }
          }
        }
      }
    }
    return mass;
  }

  function withOwner(state: GameState, pos: number, pid: string): GameState {
    return { ...state, ownership: { ...state.ownership, [pos]: pid } };
  }

  /** `scalp` (F5, fable-v1) is passed ONLY from my own buy/auction decisions:
   *  a lot a one-short rival needs is a premium-extraction OPTION (the v35
   *  finding: the rival caves ~86% of the time and pays ~book+bonus), so I may
   *  bid toward that future harvest, not just the flat deny premium. It stays
   *  OFF in counterparty modeling (`rivalCanAcquire`) — the field doesn't
   *  price options. */
  function acquisitionValue(state: GameState, pid: string, pos: number, scalp = false): number {
    const mine = positionValue(withOwner(state, pos, pid), pid) - positionValue(state, pid);
    let deny = 0;
    const color = colorAt(pos);
    if (color !== null && !(pos in state.ownership)) {
      const total = groupPositions(color).length;
      for (const opp of activeOpponents(state, pid)) {
        if (ownedInColor(state, opp.id, color) === total - 1) {
          deny = Math.max(deny, Math.round(monopolyBonus(color) * p.denyFactor));
          if (scalp && p.scalpFrac > 0) {
            const harvest = monopolyBonus(color) + (ownablePrice(pos) ?? 0);
            deny = Math.max(deny, Math.round(harvest * p.scalpFrac));
          }
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

  function liquidityFloor(state: GameState, pid: string): number {
    // F1a — danger-aware flow floor: reserve against what MY token actually
    // faces over the next roll(s), not a static fraction of the board's worst
    // rent. Small when the geometry is safe (threats behind me, owners jailed),
    // large exactly when a hit looms — same aggression, timed.
    if (p.flowFloorFrac > 0) {
      const player = state.players.find((q) => q.id === pid);
      if (player) {
        // While jailed my token doesn't walk, so next-roll exposure is scaled
        // by the chance of leaving (doubles / choosing to pay).
        const cost = walkCost(state, pid, player.position);
        const scale = player.inJail ? p.jailExitProb : 1;
        const need = scale * (p.flowFloorFrac * cost.expected + p.flowTailFrac * cost.worst);
        return Math.min(p.flowFloorCap, Math.max(p.baseFloor, Math.round(need)));
      }
    }
    let worst = 0;
    for (const posStr in state.ownership) {
      if (state.ownership[posStr] === pid) continue;
      worst = Math.max(worst, rentEstimateAt(state, Number(posStr)));
    }
    return Math.min(p.floorCap, Math.max(p.baseFloor, Math.round(worst * p.floorRentFraction)));
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

  /** Graded distress plus the cash that would erase it (`needToSafe`) — the
   *  latter is what F2a bounds the survival credit by: survival is a liquidity
   *  story, so cash beyond the amount that reaches safety earns no premium. */
  function distressDetail(state: GameState, pid: string): { distress: number; needToSafe: number } {
    const player = state.players.find((q) => q.id === pid);
    if (!player) return { distress: 0, needToSafe: 0 };
    const liquid = player.cash + mortgageableTotal(state, pid);
    let worstRent = 0;
    for (const posStr in state.ownership) {
      if (state.ownership[posStr] === pid) continue;
      worstRent = Math.max(worstRent, rentEstimateAt(state, Number(posStr)));
    }
    if (worstRent === 0) return { distress: 0, needToSafe: 0 };
    const safe = worstRent * p.distressSafeRatio;
    if (liquid >= safe) return { distress: 0, needToSafe: 0 };
    const needToSafe = Math.round(safe - liquid);
    if (liquid <= worstRent) return { distress: 1, needToSafe };
    return { distress: (safe - liquid) / (safe - worstRent), needToSafe };
  }

  function sellerDistress(state: GameState, pid: string): number {
    return distressDetail(state, pid).distress;
  }

  // --- F1: the flow engine — exact 2d6 next-roll expectations (fable-v1) ---

  /** What landing on `pos` costs `pid` right now: rent owed to another player
   *  (mortgaged/own/unowned = $0), or the tax amount. Go-To-Jail and card
   *  squares are $0 — jail is free to enter, and card EV is ~small and roughly
   *  position-independent. */
  function landingCost(state: GameState, pid: string, pos: number): number {
    const s = SPACES[pos];
    if (s.kind === "tax") return s.amount;
    if (!(pos in state.ownership) || state.ownership[pos] === pid) return 0;
    if (state.mortgaged[pos]) return 0;
    return rentEstimateAt(state, pos);
  }

  interface RollCost {
    /** Probability-weighted payment over the 11 dice outcomes. */
    expected: number;
    /** The worst single outcome (the tail a mean hides). */
    worst: number;
    /** Probability-weighted GO salary collected by passing/landing on GO. */
    goCredit: number;
  }

  /** Exact one-roll cost distribution for a token at `from`. */
  function rollCost(state: GameState, pid: string, from: number): RollCost {
    let expected = 0;
    let worst = 0;
    let goCredit = 0;
    for (let roll = 2; roll <= 12; roll++) {
      const prob = DICE_PMF[roll];
      const dest = (from + roll) % 40;
      if (from + roll >= 40) goCredit += prob * 200;
      const cost = landingCost(state, pid, dest);
      expected += prob * cost;
      if (cost > worst) worst = cost;
    }
    return { expected: Math.round(expected), worst, goCredit: Math.round(goCredit) };
  }

  /** One roll plus `flowSecondRollFrac` of the convolved second roll — the
   *  short deferral horizon used by the flow floor and the jail EV. */
  function walkCost(state: GameState, pid: string, from: number): RollCost {
    const first = rollCost(state, pid, from);
    if (p.flowSecondRollFrac <= 0) return first;
    let expected2 = 0;
    let goCredit2 = 0;
    for (let roll = 2; roll <= 12; roll++) {
      const prob = DICE_PMF[roll];
      const dest = (from + roll) % 40;
      // A first-roll Go-To-Jail landing ends movement; the second roll never happens.
      if (SPACES[dest].kind === "go-to-jail") continue;
      const second = rollCost(state, pid, dest);
      expected2 += prob * second.expected;
      goCredit2 += prob * second.goCredit;
    }
    return {
      expected: Math.round(first.expected + p.flowSecondRollFrac * expected2),
      worst: first.worst,
      goCredit: Math.round(first.goCredit + p.flowSecondRollFrac * goCredit2),
    };
  }

  /** Next-2-roll probability mass of live opponents landing on `positions`,
   *  weighted by the rent uplift proxy `rentOf(pos)` — the F1c tempo score for
   *  ordering builds. Jailed opponents are scaled by `jailExitProb`. */
  function opponentApproachScore(
    state: GameState,
    pid: string,
    positions: readonly number[],
    rentOf: (pos: number) => number,
  ): number {
    const wanted = new Set(positions);
    let score = 0;
    for (const opp of activeOpponents(state, pid)) {
      const scale = opp.inJail ? p.jailExitProb : 1;
      for (let roll = 2; roll <= 12; roll++) {
        const prob = DICE_PMF[roll];
        const dest = (opp.position + roll) % 40;
        if (wanted.has(dest)) score += scale * prob * rentOf(dest);
        if (p.flowSecondRollFrac <= 0 || SPACES[dest].kind === "go-to-jail") continue;
        for (let roll2 = 2; roll2 <= 12; roll2++) {
          const dest2 = (dest + roll2) % 40;
          if (wanted.has(dest2)) {
            score += scale * prob * DICE_PMF[roll2] * p.flowSecondRollFrac * rentOf(dest2);
          }
        }
      }
    }
    return score;
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

  /** J2 (jane-v10) — GREEDY MARGINAL-EV BUILD OPTIMIZER. Instead of jane-v6's
   *  "spread all monopolies to spreadFloor (4), then push to desiredLevel"
   *  heuristic, this function evaluates every possible single-level upgrade
   *  across ALL monopolies and greedily picks the one with the highest
   *  expected-rent-per-dollar each step. Uses actual dice-based landing
   *  probabilities and opponent positions to compute marginal rent.
   *
   *  This produces non-uniform final levels (e.g. orange to 5 while green stays
   *  at 2) and allocates constrained capital more efficiently. It's a structural
   *  change to the decision PROCESS — replacing a heuristic with an optimizer. */
  function planGreedyBuild(
    state: GameState,
    pid: string,
    player: Player,
    playerCash: number,
    floor: number,
    flush: boolean,
    want: number,
    myMonopolies: {
      color: PropertyColor;
      positions: readonly number[];
      mortgagedMembers: number[];
      locked: boolean;
      floorOf: number;
    }[],
  ): BuildPlan | null {
    const mortgage: Record<number, boolean> = {};

    // First, handle locked (mortgaged) monopolies: unmortgage them if flush.
    for (const m of myMonopolies) {
      if (m.locked && flush) {
        for (const pos of m.mortgagedMembers) mortgage[pos] = false;
      }
    }

    // Track current level per monopoly — the SINGLE SOURCE OF TRUTH.
    // build{} is regenerated from this at the end, never modified incrementally.
    const currentLevels = new Map<PropertyColor, number>();
    for (const m of myMonopolies) {
      currentLevels.set(m.color, m.locked ? 0 : m.floorOf);
    }

    // Compute opponent landing probability mass per position.
    function landingMass(pos: number): number {
      let mass = (LANDING_PROB[pos] ?? 0) / 100;
      for (const opp of activeOpponents(state, pid)) {
        const scale = opp.inJail ? p.jailExitProb : 1;
        for (let roll = 2; roll <= 12; roll++) {
          if ((opp.position + roll) % 40 === pos) {
            mass += scale * DICE_PMF[roll];
          }
        }
        if (p.flowSecondRollFrac > 0) {
          for (let roll1 = 2; roll1 <= 12; roll1++) {
            const mid = (opp.position + roll1) % 40;
            if (SPACES[mid].kind === "go-to-jail") continue;
            for (let roll2 = 2; roll2 <= 12; roll2++) {
              if ((mid + roll2) % 40 === pos) {
                mass += scale * DICE_PMF[roll1] * DICE_PMF[roll2] * p.flowSecondRollFrac;
              }
            }
          }
        }
      }
      return mass;
    }

    const landingMassCache = new Map<number, number>();
    for (const m of myMonopolies) {
      for (const pos of m.positions) {
        if (!landingMassCache.has(pos)) landingMassCache.set(pos, landingMass(pos));
      }
    }

    // Helper: regenerate build{} from currentLevels.
    function buildFromLevels(): Record<number, number> {
      const b: Record<number, number> = {};
      for (const m of myMonopolies) {
        const lvl = currentLevels.get(m.color) ?? 0;
        if (lvl > 0) for (const pos of m.positions) b[pos] = lvl;
      }
      return b;
    }

    // Helper: validate a tentative state (levels + mortgages) against floor.
    function canAfford(tentativeLevels: Map<PropertyColor, number>, tentativeMortgage: Record<number, boolean>): boolean {
      const b: Record<number, number> = {};
      for (const m of myMonopolies) {
        const lvl = tentativeLevels.get(m.color) ?? 0;
        if (lvl > 0) for (const pos of m.positions) b[pos] = lvl;
      }
      const summary = manageSummary(state, pid, { build: b, mortgage: tentativeMortgage });
      return summary.ok && playerCash + summary.netCash >= floor;
    }

    const maxLevel = want;

    // --- Phase 1: Greedy loop with cash only ---
    let improved = true;
    while (improved) {
      improved = false;
      const candidates: { mono: typeof myMonopolies[number]; newLevel: number; score: number }[] = [];

      for (const m of myMonopolies) {
        if (m.locked && !flush) continue;
        const curLevel = currentLevels.get(m.color) ?? 0;
        if (curLevel >= maxLevel) continue;
        const newLevel = curLevel + 1;

        let marginalRent = 0;
        for (const pos of m.positions) {
          const lm = landingMassCache.get(pos) ?? 0;
          marginalRent += (rentAtLevel(pos, curLevel + 1) - rentAtLevel(pos, curLevel)) * lm;
        }
        const cost = m.positions.length * HOUSE_COST[m.color];
        if (cost <= 0) continue;

        candidates.push({ mono: m, newLevel, score: marginalRent / cost });
      }
      candidates.sort((a, b) => b.score - a.score);

      for (const c of candidates) {
        const tentative = new Map(currentLevels);
        tentative.set(c.mono.color, c.newLevel);
        if (canAfford(tentative, mortgage)) {
          currentLevels.set(c.mono.color, c.newLevel);
          improved = true;
          break; // restart outer loop with updated state
        }
      }
    }

    // --- Phase 2: Collateralized development (mortgage singletons for more builds) ---
    if (p.collateralDev > 0) {
      const collateral: number[] = [];
      for (const posStr in state.ownership) {
        if (state.ownership[posStr] !== pid) continue;
        const pos = Number(posStr);
        if (state.mortgaged[pos]) continue;
        const color = colorAt(pos);
        if (color !== null && hasMonopoly(state, color, pid)) continue;
        if (builtLotsInGroup(pos, (q) => developmentLevel(state, q)).length > 0) continue;
        if (pos in mortgage) continue;
        collateral.push(pos);
      }
      collateral.sort((a, b) => assetBase(state, a) - assetBase(state, b));

      if (collateral.length > 0) {
        let collateralImproved = true;
        while (collateralImproved) {
          collateralImproved = false;
          const candidates: { mono: typeof myMonopolies[number]; newLevel: number; score: number }[] = [];

          for (const m of myMonopolies) {
            if (m.locked) continue;
            const curLevel = currentLevels.get(m.color) ?? 0;
            if (curLevel >= maxLevel) continue;
            const newLevel = curLevel + 1;

            let marginalRent = 0;
            for (const pos of m.positions) {
              const lm = landingMassCache.get(pos) ?? 0;
              marginalRent += (rentAtLevel(pos, curLevel + 1) - rentAtLevel(pos, curLevel)) * lm;
            }
            const cost = m.positions.length * HOUSE_COST[m.color];
            if (cost <= 0) continue;

            candidates.push({ mono: m, newLevel, score: marginalRent / cost });
          }
          candidates.sort((a, b) => b.score - a.score);

          for (const c of candidates) {
            const tentative = new Map(currentLevels);
            tentative.set(c.mono.color, c.newLevel);
            // Try progressively adding collateral until affordable.
            const tentativeMortgage: Record<number, boolean> = { ...mortgage };
            for (const cpos of collateral) {
              if (cpos in tentativeMortgage) continue;
              tentativeMortgage[cpos] = true;
              if (canAfford(tentative, tentativeMortgage)) {
                currentLevels.set(c.mono.color, c.newLevel);
                Object.assign(mortgage, tentativeMortgage);
                collateralImproved = true;
                break;
              }
            }
            if (collateralImproved) break;
          }
        }
      }
    }

    // --- Generate output from currentLevels ---
    const build = buildFromLevels();
    const reasons: string[] = [];
    for (const m of myMonopolies) {
      const targetLevel = currentLevels.get(m.color) ?? 0;
      const existingLevel = m.floorOf;
      if (m.locked && m.mortgagedMembers.some((pos) => mortgage[pos] === false)) {
        reasons.push(
          `${colorName(m.color)} to ${levelPhrase(targetLevel)} (unmortgaged + greedy EV build)`,
        );
      } else if (targetLevel > existingLevel) {
        reasons.push(`${colorName(m.color)} to ${levelPhrase(targetLevel)} (greedy EV-optimal)`);
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
    const reasonStr = reasons.length > 0
      ? `Greedy EV build: ${reasons.join("; ")}.`
      : "Greedy EV build (no changes).";
    return { build: finalBuild, mortgage, reason: reasonStr };
  }

  function planBuild(state: GameState, pid: string): BuildPlan | null {
    const player = state.players.find((q) => q.id === pid);
    if (!player) return null;
    const playerCash = player.cash;
    // F5 — voluntary spends clear BOTH the blended flow floor AND the tail
    // guard (worst single next-roll hit, scaled by jail mobility, uncapped).
    const tailNeed =
      p.voluntaryTailFrac > 0
        ? Math.round(
            p.voluntaryTailFrac *
              walkCost(state, pid, player.position).worst *
              (player.inJail ? p.jailExitProb : 1),
          )
        : 0;
    const floor = Math.max(liquidityFloor(state, pid), tailNeed);
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

    // J2 (jane-v10) — GREEDY MARGINAL-EV BUILD OPTIMIZER: instead of spreading
    // all monopolies uniformly to spreadFloor then pushing to desiredLevel,
    // evaluate every possible single-level upgrade and greedily pick the one
    // with the highest expected-rent-per-dollar. This produces non-uniform
    // final levels and allocates constrained capital more efficiently.
    if (p.greedyBuild > 0 && myMonopolies.length > 0) {
      return planGreedyBuild(state, pid, player, playerCash, floor, flush, want, myMonopolies);
    }

    // --- jane-v6 spread+push heuristic (unchanged) ---
    if (p.buildTempo > 0 && myMonopolies.length > 1) {
      // F1c — fund the set the tokens are actually approaching first: order by
      // next-2-roll opponent landing mass × 3-house rent, static tier as the
      // tiebreak. Stable sort keeps the v45 order when scores tie (all far).
      const tempoScore = new Map<PropertyColor, number>();
      for (const m of myMonopolies) {
        tempoScore.set(
          m.color,
          opponentApproachScore(state, pid, m.positions, (pos) => rent3House(pos)),
        );
      }
      myMonopolies.sort((a, b) => (tempoScore.get(b.color) ?? 0) - (tempoScore.get(a.color) ?? 0));
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

    // J1 (jane-v6) — COLLATERALIZED DEVELOPMENT: if the standard passes
    // couldn't build desired levels from cash alone, mortgage non-monopoly
    // singletons to fund additional house construction on monopolies. The
    // fable factory never does this — capital stays stranded in idle
    // singletons while monopolies sit underdeveloped.
    if (p.collateralDev > 0) {
      // Find unmortgaged non-monopoly properties (singletons not in any set
      // I fully own). Railroads and utilities are fair game too — their
      // income is dwarfed by even one extra monopoly house.
      const collateral: number[] = [];
      for (const posStr in state.ownership) {
        if (state.ownership[posStr] !== pid) continue;
        const pos = Number(posStr);
        if (state.mortgaged[pos]) continue;
        // Skip anything in a monopoly I own (it's producing monopoly rent)
        const color = colorAt(pos);
        if (color !== null && hasMonopoly(state, color, pid)) continue;
        // Skip if this property is in a group with houses (shouldn't happen
        // since we skipped monopolies, but defensive)
        if (builtLotsInGroup(pos, (q) => developmentLevel(state, q)).length > 0) continue;
        // Skip if already staged for mortgage/unmortgage
        if (pos in mortgage) continue;
        collateral.push(pos);
      }
      // Sort collateral by least essential (lowest value first)
      collateral.sort((a, b) => assetBase(state, a) - assetBase(state, b));
      // For each monopoly that still has room to build, try collateralizing
      if (collateral.length > 0) {
        for (const m of myMonopolies) {
          if (m.locked) continue;
          const builtLevel = Math.max(
            ...m.positions.map((q) => build[q] ?? developmentLevel(state, q)),
          );
          const stop = builtLevel + 1;
          if (want < stop) continue;
          // Try building the desired level using collateral
          for (let level = want; level >= stop; level--) {
            const candidateBuild: Record<number, number> = { ...build };
            for (const pos of m.positions) candidateBuild[pos] = level;
            // Greedily add collateral until affordable
            const candidateMortgage: Record<number, boolean> = { ...mortgage };
            let attemptPositions = [...collateral];
            let foundPlan = false;
            while (attemptPositions.length > 0) {
              const trialMortgage: Record<number, boolean> = {
                ...candidateMortgage,
                [attemptPositions[0]]: true,
              };
              const summary = manageSummary(state, pid, {
                build: candidateBuild,
                mortgage: trialMortgage,
              });
              if (summary.ok && playerCash + summary.netCash >= floor) {
                // Success — this collateral package funds the build
                candidateMortgage[attemptPositions[0]] = true;
                // Apply the build
                for (const pos of m.positions) build[pos] = level;
                Object.assign(mortgage, candidateMortgage);
                reasons.push(
                  `${colorName(m.color)} to ${levelPhrase(level)} (collateralized — mortgaging idle singletons)`,
                );
                foundPlan = true;
                break;
              }
              attemptPositions.shift();
            }
            if (foundPlan) break;
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

  /** F1b — the real cost of walking out of jail: expected payments over the
   *  next roll(s) from just-visiting, net of the GO salary I'd collect. */
  function jailWalkCost(state: GameState, pid: string): number {
    const cost = walkCost(state, pid, 10);
    return cost.expected - cost.goCredit;
  }

  function jailChoice(
    state: GameState,
    pid: string,
    heldCard: "chance" | "communityChest" | null,
  ): { intent: Intent | null; reason: string } {
    const player = state.players.find((q) => q.id === pid);
    const cash = player?.cash ?? 0;
    if (p.jailStayThreshold > 0) {
      // EV rule: only the rents actually REACHABLE from jail matter, not
      // whether a developed lot exists somewhere on the board (v45's rule).
      const walk = jailWalkCost(state, pid);
      if (walk > p.jailStayThreshold) {
        return {
          intent: null,
          reason: `Staying in jail — walking out costs ~$${Math.round(walk).toString()} in expected rent, so I'll sit, collect, and roll for doubles.`,
        };
      }
    } else if (boardIsDangerous(state, pid)) {
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

  /** F2b — how much MORE a set in this recipient's hands hurts: their position
   *  value relative to the mean live player, clamped. 1 at parity and below —
   *  the mult only ever AMPLIFIES a leader's threat, never discounts a
   *  laggard's below the flat v45 price (a laggard discount turned out to fuel
   *  asset churn: the proposer starts feeding cheap sets downhill). Gain 0 =
   *  flat v45 pricing. */
  /** A player's position value relative to the live-player mean, clamped. */
  function standingRatio(state: GameState, pid: string): number {
    const live = state.players.filter((q) => !q.bankrupt);
    if (live.length < 2) return 1;
    let total = 0;
    for (const q of live) total += positionValue(state, q.id);
    const mean = total / live.length;
    if (mean <= 0) return 1;
    return Math.min(STANDING_CLAMP_HI, positionValue(state, pid) / mean);
  }

  function standingMult(state: GameState, oppId: string): number {
    if (p.standingThreatGain <= 0) return 1;
    return Math.max(1, 1 + p.standingThreatGain * (standingRatio(state, oppId) - 1));
  }

  /** F2f — MY dominance scales the threat of arming ANY rival: a leader
   *  converting a locked win into premium-cash-plus-variance is pure downside,
   *  so the price of handing out a set rises with my own standing. Runs through
   *  the same threat term, so it governs both extraction PROPOSALS (the
   *  candidate dies at `mine.accept`) and passive ACCEPTS of a rival's offer. */
  function leadDefenseMult(state: GameState, pid: string): number {
    if (p.selfLeadGain <= 0) return 1;
    return Math.max(1, 1 + p.selfLeadGain * (standingRatio(state, pid) - 1));
  }

  /** F2c — the rail/utility SYNERGY delta a trade hands `oppId`, apportioned by
   *  my contribution (mirrors the color-set apportioning below). v45 prices only
   *  color-set completions; the 3rd/4th railroad rode along free. */
  function synergyThreatShare(
    state: GameState,
    after: GameState,
    pid: string,
    oppId: string,
    terms: TradeTerms,
  ): number {
    if (p.synergyThreatFrac <= 0) return 0;
    let railsBefore = 0;
    let railsAfter = 0;
    let utilsBefore = 0;
    let utilsAfter = 0;
    const count = (st: GameState, into: (kind: string) => void): void => {
      for (const posStr in st.ownership) {
        if (st.ownership[posStr] !== oppId) continue;
        into(SPACES[Number(posStr)].kind);
      }
    };
    count(state, (k) => {
      if (k === "railroad") railsBefore += 1;
      else if (k === "utility") utilsBefore += 1;
    });
    count(after, (k) => {
      if (k === "railroad") railsAfter += 1;
      else if (k === "utility") utilsAfter += 1;
    });
    let received = 0;
    let fromPid = 0;
    for (const [posStr, to] of Object.entries(terms.propertyTo)) {
      const pos = Number(posStr);
      const kind = SPACES[pos].kind;
      if (to !== oppId || (kind !== "railroad" && kind !== "utility")) continue;
      received += 1;
      if (state.ownership[pos] === pid) fromPid += 1;
    }
    if (received === 0) return 0;
    let gain = railSynergy[Math.min(railsAfter, 4)] - railSynergy[Math.min(railsBefore, 4)];
    if (utilsAfter === 2 && utilsBefore < 2) gain += p.utilPairBonus;
    if (gain <= 0) return 0;
    return gain * RIVAL_THREAT_FACTOR * p.synergyThreatFrac * (fromPid / received);
  }

  /** J8 (jane-v17) — Scale factor for rival threat based on how many house
   *  levels the opponent can afford to build on the completed set post-trade.
   *  Uses the POST-TRADE state (after) to account for cash exchanged.
   *  Returns a multiplier: ~0.7 when they can't build (cash-starved), ~1.0 at
   *  3 levels (neutral), ~1.2 at 5 levels (fully capitalized). */
  function rivalDeployabilityMult(after: GameState, oppId: string, color: PropertyColor): number {
    if (p.rivalDeployability <= 0) return 1;
    const opp = after.players.find((q) => q.id === oppId);
    if (!opp) return 1;
    const positions = groupPositions(color);
    const perLevel = positions.length * HOUSE_COST[color];
    if (perLevel <= 0) return 1;
    const levels = Math.min(5, Math.floor(opp.cash / perLevel));
    // Linear: 0.7 at 0 levels, 1.0 at 3 levels, 1.2 at 5 levels.
    return 1 + p.rivalDeployability * (levels - 3) * 0.1;
  }

  function rivalThreatCost(
    state: GameState,
    after: GameState,
    pid: string,
    terms: TradeTerms,
    selfView: boolean,
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
        share +=
          monopolyBonus(color) *
          RIVAL_THREAT_FACTOR *
          (fromPid / received) *
          rivalDeployabilityMult(after, opp.id, color);
      }
      if (selfView) {
        share += synergyThreatShare(state, after, pid, opp.id, terms);
        share *= standingMult(state, opp.id) * leadDefenseMult(state, pid);
      }
      worst = Math.max(worst, share);
    }
    // F2d — heads-up the game is zero-sum: anything that strengthens the only
    // rival strengthens the only person who can beat me.
    if (selfView && p.headsUpThreatMult > 1 && activeOpponents(state, pid).length === 1) {
      worst *= p.headsUpThreatMult;
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

  // --- F3: the ring-proof transfer memory (fable-v1) ---

  /** True iff `pos` moved in an EXECUTED trade within the last
   *  `transferMemoryTurns` turn groups. Auction/bankruptcy transfers don't
   *  count — the hot-potato is a trade phenomenon. */
  function recentlyTraded(state: GameState, pos: number): boolean {
    if (p.transferMemoryTurns <= 0) return false;
    const from = Math.max(0, state.turns.length - p.transferMemoryTurns);
    for (let i = state.turns.length - 1; i >= from; i--) {
      for (const e of state.turns[i].events) {
        if (e.kind === "trade" && pos in e.propertyTo) return true;
      }
    }
    return false;
  }

  /** True iff `to` receiving `pos` completes the color set for them — the
   *  legitimate cash-out a recently-traded lot may still make. */
  function completesSetFor(state: GameState, to: string, pos: number): boolean {
    const color = colorAt(pos);
    if (color === null) return false;
    return ownedInColor(state, to, color) === groupPositions(color).length - 1;
  }

  /** F3 — a lot that just changed hands may only move again to the completing
   *  rival. Whatever pricing leak a tuner re-opens, A→B→A dies here: the second
   *  hop is inside the memory window and completes nothing. */
  function violatesTransferMemory(state: GameState, terms: TradeTerms): boolean {
    if (p.transferMemoryTurns <= 0) return false;
    for (const [posStr, to] of Object.entries(terms.propertyTo)) {
      const pos = Number(posStr);
      if (!recentlyTraded(state, pos)) continue;
      if (!completesSetFor(state, to, pos)) return true;
    }
    return false;
  }

  function evaluateTrade(
    state: GameState,
    pid: string,
    terms: TradeTerms,
    selfView = true,
  ): TradeVerdict {
    // F3 — my own hard veto on churning a just-traded lot (counterparties are
    // modeled WITHOUT fable levers: the field consensus is v45-shaped).
    if (selfView && violatesTransferMemory(state, terms)) {
      return {
        accept: false,
        delta: 0,
        reason: "that lot just changed hands — I'm not churning it back",
      };
    }

    const after = postTradeState(state, terms);
    const rawDelta = positionValue(after, pid) - positionValue(state, pid);
    const postCash = after.players.find((q) => q.id === pid)?.cash ?? 0;

    const myMono = monopolyGain(state, after, pid);
    const threatCost = rivalThreatCost(state, after, pid, terms, selfView);
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
    // F2a — survival is a liquidity story: only the cash that actually ERASES my
    // distress earns the survival premium. v45 credited the full check
    // (cashIn × distress × survivalFactor, unbounded in cashIn) — the leak that
    // priced a complete Park+Boardwalk handover at $250 and re-opened the
    // hot-potato clearing band on any developed board.
    const { distress, needToSafe } = distressDetail(state, pid);
    const survivalBase = selfView && p.survivalBounded > 0 ? Math.min(cashIn, needToSafe) : cashIn;
    // F7 — survival cash is worth its COMEBACK EQUITY, not its face: a beaten
    // seat "surviving" by feeding the board's strongest position is not
    // surviving, it is financing its own loss (three observed fire-sales:
    // 4q3y6i's $55 States handover, and both probe games' distress rail
    // sales). Scale the premium by my position-value share of the strongest
    // live opponent, clamped to [0,1]; gain 0 disables (= the prior credit).
    let equityMult = 1;
    if (selfView && p.survivalEquityGain > 0 && distress > 0) {
      const myPV = positionValue(state, pid);
      let bestOpp = 0;
      for (const opp of activeOpponents(state, pid)) {
        bestOpp = Math.max(bestOpp, positionValue(state, opp.id));
      }
      const equity = bestOpp > 0 ? Math.min(1, myPV / bestOpp) : 1;
      equityMult = 1 - p.survivalEquityGain * (1 - equity);
    }
    const effectiveDelta = cashIn > 0
      ? delta + Math.round(survivalBase * distress * p.survivalFactor * equityMult) - deployabilityPenalty
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
    // F2e — the completer-scalp guard: a voluntary trade that leaves me too thin
    // to develop what I bought needs a transformative gain (extends the
    // postCash<0 veto above; v45 happily paid $500 premiums down to pocket change).
    if (
      selfView &&
      p.liqGuardFrac > 0 &&
      postCash < liquidityFloor(state, pid) * p.liqGuardFrac &&
      effectiveDelta < p.liquidityRiskGain
    ) {
      return {
        accept: false,
        delta: effectiveDelta,
        // Note tracks the cash direction (a cash-RECEIVING decline saying
        // "develop what I get" was the probe-game-3 miswired-rationale defect).
        reason:
          cashIn > 0
            ? "even with the cash I'd stay too thin to be safe"
            : "it would leave me too thin to develop what I get",
      };
    }
    // F8 (fable-v7) — TRADE-OUTFLOW tail guard: a voluntary trade SPENDING cash
    // must leave enough to survive the worst single hit ON THE BOARD, position-
    // independent. F2e uses the danger-aware flow floor, which reads ~zero when
    // the threat is outside the CURRENT roll window — but a trade's cash state
    // persists across many rolls (probe game 3: a seat paid a wallet-pegged
    // $735 for a marginal 4th rail down to $38 under a 3-house board it wasn't
    // yet facing, and died on the landing). The transformative exception
    // (delta ≥ liquidityRiskGain) keeps set-completion boldness intact.
    if (selfView && p.tradeTailFrac > 0) {
      // F9 (fable-v8) — a TRANSFORMATIVE trade (delta ≥ liquidityRiskGain, the
      // F8 exemption) keeps its acquisition boldness but must still leave a
      // REDUCED reserve (`transformTailFrac` × the F8 reserve): probe game 4
      // watched a seat pay $430 of a $442 wallet for a completer through the
      // exemption, keep $7, never afford a single house on the set it just
      // completed, and die — the POINT of completing is developing, and a
      // completer bought into total illiquidity strands its own bonus. This is
      // a floor on the PRICE PAID, not a discount on what a set is worth — the
      // rejected cash-scaled-monopoly-value idea stays rejected (bots/CLAUDE.md).
      const transformative = effectiveDelta >= p.liquidityRiskGain;
      const reserveFrac = transformative ? p.tradeTailFrac * p.transformTailFrac : p.tradeTailFrac;
      const cashOut = (terms.cashDelta[pid] ?? 0) < 0 ? -(terms.cashDelta[pid] ?? 0) : 0;
      if (cashOut > 0 && reserveFrac > 0) {
        let worstHit = 0;
        for (const posStr in state.ownership) {
          if (state.ownership[posStr] === pid) continue;
          worstHit = Math.max(worstHit, rentEstimateAt(state, Number(posStr)));
        }
        if (postCash < Math.round(reserveFrac * worstHit)) {
          return {
            accept: false,
            delta: effectiveDelta,
            reason: "it would leave me too thin to survive a big hit",
          };
        }
      }
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
    const oppDelta = evaluateTrade(state, oppId, base, false).delta;
    if (oppDelta >= p.acceptMargin) return base;
    const relief = 1 + sellerDistress(state, oppId) * p.survivalFactor;
    const cash = Math.ceil((p.acceptMargin - oppDelta) / relief);
    const myCash = state.players.find((q) => q.id === pid)?.cash ?? 0;
    if (myCash - cash < 0) return null;
    return { ...base, cashDelta: { [pid]: -cash, [oppId]: cash } };
  }

  /** F4 (generalized) — price a 2-party proposal TO THE MARGIN in the other
   *  direction: when the counterparty's surplus exceeds the accept margin,
   *  charge the excess as cash to me (bounded by their cash — their delta is
   *  linear in it). v45 only ever solves the sweetener I PAY; a swap that
   *  completes their set was leaving their whole surplus on the table. No-op
   *  when the sweetener path already priced them to ~margin. */
  function chargeSurplus(
    state: GameState,
    pid: string,
    oppId: string,
    terms: TradeTerms,
  ): TradeTerms {
    if (p.extractionOn <= 0) return terms;
    const oppDelta = evaluateTrade(state, oppId, terms, false).delta;
    const excess = Math.floor(oppDelta - p.acceptMargin);
    if (excess <= 0) return terms;
    const oppCash =
      (state.players.find((q) => q.id === oppId)?.cash ?? 0) + (terms.cashDelta[oppId] ?? 0);
    const charge = Math.min(excess, oppCash);
    if (charge <= 0) return terms;
    return {
      ...terms,
      cashDelta: {
        ...terms.cashDelta,
        [pid]: (terms.cashDelta[pid] ?? 0) + charge,
        [oppId]: (terms.cashDelta[oppId] ?? 0) - charge,
      },
    };
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
      const delta = evaluateTrade(state, sId, base, false).delta;
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
    const holderDelta = evaluateTrade(state, holder, giveToRival, false).delta;
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
              terms: chargeSurplus(state, pid, oppId, swap),
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

      // F4 — the EXTRACTION engine (fable-v1): proactively SELL a completer I
      // hold to the one-short rival at the highest cash they'll pay. The v35
      // finding: the rival caves and pays a premium ~86% of the time — but the
      // archive only ever waits for the rival to propose. A held completer is an
      // option; this is the exercise. Their evaluator values completion at
      // monopolyBonus + book, and their delta is linear in the cash, so the
      // premium solves in closed form (no search): X = their surplus − margin,
      // capped by their cash. My own evaluator (threat- and standing-priced)
      // then decides whether that X clears MY side — a poor rival's small X is
      // rejected there, so this can never fire-sale a completer downhill.
      if (p.extractionOn > 0) {
        for (const color of COLORS_BY_WEIGHT) {
          const positions = groupPositions(color);
          if (ownedInColor(state, opp.id, color) !== positions.length - 1) continue;
          const missing = positions.filter((q) => state.ownership[q] !== opp.id);
          if (missing.length !== 1 || state.ownership[missing[0]] !== pid) continue;
          const pos = missing[0];
          if (builtLotsInGroup(pos, (q) => developmentLevel(state, q)).length > 0) continue;
          const bare: TradeTerms = { propertyTo: { [pos]: opp.id }, gojfTo: {}, cashDelta: {} };
          const surplus = evaluateTrade(state, opp.id, bare, false).delta;
          const premium = Math.min(opp.cash, Math.floor(surplus - p.acceptMargin));
          if (premium <= 0) continue;
          candidates.push({
            terms: {
              ...bare,
              cashDelta: { [pid]: premium, [opp.id]: -premium },
            },
            delta: 0,
            reason: `Selling ${spaceName(pos)} to ${opp.name} — completing the ${colorName(color)} set is worth a $${premium.toString()} premium to them.`,
          });
        }

        // F4b — RAIL extraction: railroads compound ($25→$200 by count), so a
        // 2-3-rail holder pays synergy + book for one of mine — and no bot in
        // the archive constructs rail trades at all, so the surplus just sits
        // there. My own evaluator (synergy-threat- and standing-priced) still
        // arbitrates the sale.
        let oppRails = 0;
        for (const posStr in state.ownership) {
          if (state.ownership[posStr] === opp.id && SPACES[Number(posStr)].kind === "railroad") {
            oppRails += 1;
          }
        }
        if (oppRails >= 2 && oppRails <= 3) {
          for (const posStr in state.ownership) {
            if (state.ownership[posStr] !== pid) continue;
            const pos = Number(posStr);
            if (SPACES[pos].kind !== "railroad") continue;
            const bare: TradeTerms = { propertyTo: { [pos]: opp.id }, gojfTo: {}, cashDelta: {} };
            const surplus = evaluateTrade(state, opp.id, bare, false).delta;
            const premium = Math.min(opp.cash, Math.floor(surplus - p.acceptMargin));
            if (premium <= 0) continue;
            candidates.push({
              terms: { ...bare, cashDelta: { [pid]: premium, [opp.id]: -premium } },
              delta: 0,
              reason: `Selling ${spaceName(pos)} to ${opp.name} — a ${(oppRails + 1).toString()}-railroad network is worth a $${premium.toString()} premium to them.`,
            });
          }
        }
      }
    }

    let best: { cand: Candidate; effective: number } | null = null;
    for (const cand of candidates) {
      if (!isProposable(state, cand.terms)) continue;
      // F3 — never PROPOSE churning a just-traded lot either (the deny-buy path
      // below bypasses `mine.accept`, so the veto must sit here explicitly).
      if (violatesTransferMemory(state, cand.terms)) continue;
      const mine = evaluateTrade(state, pid, cand.terms);
      const denyBonus = cand.denyBonus ?? 0;
      const effective = mine.delta + denyBonus;
      if (denyBonus > 0 ? effective <= ACCEPT_MIN : !mine.accept) continue;
      const others = [...tradeParticipants(state, cand.terms)].filter((id) => id !== pid);
      if (!others.every((id) => evaluateTrade(state, id, cand.terms, false).accept)) continue;
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

    const worth = acquisitionValue(state, pid, pos, true);
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
    let cap = Math.min(acquisitionValue(state, pid, a.position, true), auctionBidCap(state, pid));
    // F6 — never bid past what I can settle WITHOUT liquidating the prize:
    // cash plus my own mortgageable equity, less the flow floor.
    if (p.auctionLiquidCap > 0) {
      const player = state.players.find((q) => q.id === pid);
      if (player) {
        const liquid = Math.max(
          0,
          player.cash + mortgageableTotal(state, pid) - liquidityFloor(state, pid),
        );
        cap = Math.min(cap, liquid);
      }
    }
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
