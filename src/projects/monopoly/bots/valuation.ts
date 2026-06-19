import { SPACES } from "../data";
import {
  bankSupply,
  builtLotsInGroup,
  colorAt,
  developmentLevel,
  groupPositions,
} from "../development";
import { hasMonopoly, mortgageValueAt, ownablePrice, rentAt } from "../logic";
import { manageSummary } from "../manage";
import type { GameState, Intent, Player, PropertyColor } from "../types";

// ---------------------------------------------------------------------------
// The Claude bot's strategic model — pure scoring + planning, no React, no RNG.
// Everything the policy (`claude.ts`) decides flows from a single yardstick,
// `positionValue`: the dollar-equivalent worth of a seat's whole position. A
// move is good iff it raises my position value; a property is worth its
// position-value contribution; a trade is good iff both sides gain. Reasoning
// strings are produced HERE, next to the decision, and surfaced as "BOT" notes.
// ---------------------------------------------------------------------------

/** Strategic weight per color set — the multiplier on a set's printed value that
 *  yields its `monopolyBonus`. TUNED (not raw price) so the resulting monopoly
 *  VALUES rank the way pros rank sets, correcting for the fact that the costly
 *  sets (green/yellow/dark-blue) have big printed prices but worse traffic/ROI:
 *  orange tops, red just behind (the prize — heaviest post-jail traffic), then
 *  the high-rent mid sets, with the cheap light-blue/pink lower in ABSOLUTE
 *  value (their edge is cheap, fast ROI, which their low price already reflects)
 *  and brown weakest. Resulting bonuses ≈ orange 560 > red 544 > yellow 480 >
 *  green 460 > dark-blue 412 > pink 374 > light-blue 320 > brown 84.
 *  Railroads/utilities are scored separately (they can't be developed). */
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

/** Fixed color order so every scan is deterministic (no `Object.keys` ordering
 *  reliance) and ties break the same way every call. Ordered by DEVELOP
 *  PRIORITY (the classic tier list — cheap high-traffic sets first), which is
 *  what `planBuild` walks; the absolute `monopolyBonus` ordering above is a
 *  separate, value axis. */
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

/** Extra position value for HOLDING k railroads, beyond their raw asset base —
 *  railroad rent ($25/$50/$100/$200) jumps with each one owned, so the synergy
 *  of a second/third/fourth is real. Indexed by count (0–4). */
const RAIL_SYNERGY: readonly number[] = [0, 0, 70, 180, 380];

/** Both utilities together are marginally better than one (10× vs 4× dice), but
 *  utilities are near-worthless for income — a small pair bonus only. */
const UTIL_PAIR_BONUS = 40;

/** How much denying an opponent their monopoly is worth to me, as a fraction of
 *  that set's monopoly bonus. Blocking a rival's orange is nearly as valuable as
 *  half-owning it myself. */
const DENY_FACTOR = 0.6;

/** A bare reserve every floor calculation clamps up to — never voluntarily spend
 *  to truly zero, even on a quiet board. */
const BASE_FLOOR = 120;

/** Fraction of the worst board rent the bot keeps as a VOLUNTARY-spend reserve,
 *  and the cap on it. Reserving the FULL worst-case rent would refuse to develop
 *  against any hotel — far too passive; a pro keeps a moderate buffer and leans
 *  on liquidating assets (must-raise-cash) for the rare big hit, so it can still
 *  fight back by building. */
const FLOOR_RENT_FRACTION = 0.5;
const FLOOR_CAP = 500;

/** Below this many houses left in the 32-house bank, houses are a scarce
 *  resource worth hoarding to starve opponents (the housing-shortage lever). */
const HOUSE_SCARCE = 6;

/** Spare cash (above the liquidity floor) that signals "flush" — enough to push
 *  a set to hotels for max rent when houses aren't a weapon. */
const HOTEL_CUSHION = 600;

/** Opponent rent (single landing) that marks the board "dangerous" enough that
 *  jail is a safer place to sit than to walk out onto. ~a 3-house mid-set rent. */
const JAIL_DANGER_RENT = 350;

const JAIL_FEE = 50;

/** Total printed price of a color group — the basis for its monopoly bonus. */
const SET_TOTAL_PRICE: Readonly<Record<PropertyColor, number>> = (() => {
  const totals: Record<PropertyColor, number> = {
    orange: 0,
    red: 0,
    "light-blue": 0,
    yellow: 0,
    pink: 0,
    "dark-blue": 0,
    green: 0,
    brown: 0,
  };
  for (const color of COLORS_BY_WEIGHT) {
    for (const pos of groupPositions(color)) {
      totals[color] += ownablePrice(pos) ?? 0;
    }
  }
  return totals;
})();

/** The premium a COMPLETED monopoly adds to a position, above the raw asset base
 *  of its lots — proportional to the set's price and strategic weight. A bare
 *  orange monopoly is worth ~$560 more than its three deeds; a brown one ~$50. */
function monopolyBonus(color: PropertyColor): number {
  return Math.round(SET_TOTAL_PRICE[color] * GROUP_WEIGHT[color]);
}

/** Display name for a color group, for reasoning notes. */
export function colorName(color: PropertyColor): string {
  return color === "dark-blue"
    ? "dark blues"
    : color === "light-blue"
      ? "light blues"
      : `${color}s`;
}

/** A space's printed name (property / railroad / utility), for reasoning notes. */
export function spaceName(pos: number): string {
  const s = SPACES[pos];
  return s.kind === "property" || s.kind === "railroad" || s.kind === "utility"
    ? s.name
    : "that space";
}

/** Non-bankrupt players other than `pid`. */
export function activeOpponents(state: GameState, pid: string): Player[] {
  return state.players.filter((p) => p.id !== pid && !p.bankrupt);
}

/** How many lots of `color` `pid` owns. */
function ownedInColor(state: GameState, pid: string, color: PropertyColor): number {
  let n = 0;
  for (const pos of groupPositions(color)) {
    if (state.ownership[pos] === pid) n += 1;
  }
  return n;
}

function ownedOfKind(
  state: GameState,
  pid: string,
  kind: "railroad" | "utility",
): number {
  let n = 0;
  for (const [posStr, owner] of Object.entries(state.ownership)) {
    if (owner === pid && SPACES[Number(posStr)].kind === kind) n += 1;
  }
  return n;
}

/** Raw, cash-like worth of a single ownable to whoever holds it: its printed
 *  price, halved if mortgaged. The strategic premiums (monopolies, synergy,
 *  denial) live in `positionValue` / `acquisitionValue`, not here. */
function assetBase(state: GameState, pos: number): number {
  const price = ownablePrice(pos) ?? 0;
  return state.mortgaged[pos] ? Math.floor(price / 2) : price;
}

/** The dollar-equivalent worth of `pid`'s entire position: cash, every owned
 *  deed at its asset base, the big premium for each completed monopoly, and
 *  railroad/utility synergy. This is the one yardstick the whole policy uses —
 *  any move (buy, build, trade) is good exactly when it raises this number. */
export function positionValue(state: GameState, pid: string): number {
  const player = state.players.find((p) => p.id === pid);
  if (!player) return 0;
  let value = player.cash;
  for (const [posStr, owner] of Object.entries(state.ownership)) {
    if (owner === pid) value += assetBase(state, Number(posStr));
  }
  for (const color of COLORS_BY_WEIGHT) {
    if (hasMonopoly(state, color, pid)) value += monopolyBonus(color);
  }
  const rails = ownedOfKind(state, pid, "railroad");
  value += RAIL_SYNERGY[Math.min(rails, 4)];
  if (ownedOfKind(state, pid, "utility") === 2) value += UTIL_PAIR_BONUS;
  return value;
}

/** The state as it would be if `pid` owned `pos` — for scoring an acquisition
 *  without mutating anything. Only ownership changes. */
function withOwner(state: GameState, pos: number, pid: string): GameState {
  return { ...state, ownership: { ...state.ownership, [pos]: pid } };
}

/** What acquiring `pos` adds to `pid`'s position value right now — set
 *  completion, partial progress, and railroad synergy fall straight out of the
 *  position-value delta — PLUS the value of denying an opponent who is one lot
 *  from a monopoly (taking the last open lot of their set). Excludes the price
 *  paid; the caller compares this worth to the price. */
export function acquisitionValue(
  state: GameState,
  pid: string,
  pos: number,
): number {
  const mine = positionValue(withOwner(state, pos, pid), pid) - positionValue(state, pid);
  let deny = 0;
  const color = colorAt(pos);
  if (color !== null && !(pos in state.ownership)) {
    const total = groupPositions(color).length;
    for (const opp of activeOpponents(state, pid)) {
      // `pos` is unowned, so the only seat one lot short of this set needs
      // exactly this lot — taking it blocks their monopoly.
      if (ownedInColor(state, opp.id, color) === total - 1) {
        deny = Math.max(deny, Math.round(monopolyBonus(color) * DENY_FACTOR));
      }
    }
  }
  return mine + deny;
}

/** Estimated dollar rent of landing on `pos` right now (utility resolved at the
 *  average roll of 7). Zero when unowned / mortgaged / self-owned-from-nobody. */
function rentEstimateAt(state: GameState, pos: number): number {
  const display = rentAt(state, pos);
  if (!display) return 0;
  return display.kind === "dollars" ? display.amount : display.multiplier * 7;
}

/** Cash `pid` wants to keep in reserve before any VOLUNTARY spend (buying a
 *  premium, building, sweetening a trade): enough to absorb the worst single
 *  rent currently sitting on the board, floored at a baseline. Forced charges
 *  (rent, tax) ignore this — they route through must-raise-cash regardless. */
export function liquidityFloor(state: GameState, pid: string): number {
  let worst = 0;
  for (const [posStr, owner] of Object.entries(state.ownership)) {
    if (owner === pid) continue;
    worst = Math.max(worst, rentEstimateAt(state, Number(posStr)));
  }
  return Math.min(FLOOR_CAP, Math.max(BASE_FLOOR, Math.round(worst * FLOOR_RENT_FRACTION)));
}

// ---------------------------------------------------------------------------
// Build planning. One commit per turn: compute the maximal, affordable, even
// development across my monopolies in priority order, with a per-set judgment of
// how high to push (3 for ROI / 4-and-hold to starve the bank / hotel when
// flush and houses aren't a weapon).
// ---------------------------------------------------------------------------

export interface BuildPlan {
  /** position -> target level, only entries that differ from the live board. */
  build: Record<number, number>;
  /** position -> false, for each mortgaged monopoly member this plan lifts before
   *  developing it. A monopoly with a mortgaged lot can't be built and earns
   *  nothing until unmortgaged, so reclaiming idle capital this way is part of
   *  the same commit as the build (the engine applies it raise-first, against the
   *  post-unmortgage state — `applyManageCommit`). Empty for a clean build. */
  mortgage: Record<number, boolean>;
  reason: string;
}

/** Highest live development level across a color group. */
function maxLevelInSet(state: GameState, color: PropertyColor): number {
  let max = 0;
  for (const pos of groupPositions(color)) {
    max = Math.max(max, developmentLevel(state, pos));
  }
  return max;
}

/** Does any opponent hold a full, unmortgaged monopoly that isn't maxed out —
 *  i.e., a rival who would gladly buy houses if the bank had them? If so, hoard. */
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

/** How high to develop one of my monopolies, the central build judgment:
 *  - houses scarce AND a rival could use them → 4 and HOLD (starve the bank;
 *    going to a hotel would hand four houses back), the housing-shortage lever;
 *  - flush AND houses aren't scarce → hotel for maximum rent (no denial to lose);
 *  - otherwise → 3 houses, the best rent-per-dollar jump, conserving cash. */
function desiredLevel(
  state: GameState,
  pid: string,
): { level: number; why: string } {
  const player = state.players.find((p) => p.id === pid);
  const cash = player?.cash ?? 0;
  const scarce = bankSupply(state).houses <= HOUSE_SCARCE;
  const flush = cash > liquidityFloor(state, pid) + HOTEL_CUSHION;
  if (scarce && opponentsWantHouses(state, pid)) {
    return { level: 4, why: "holding at 4 to starve the house bank" };
  }
  if (flush && !scarce) {
    return { level: 5, why: "hotels for max rent" };
  }
  return { level: 3, why: "the best rent-per-dollar jump" };
}

/** Phrase an achieved development level for a reasoning note. */
function levelPhrase(level: number): string {
  if (level === 5) return "hotels";
  return `${level.toString()} ${level === 1 ? "house" : "houses"}`;
}

/** Plan this turn's development: walk my monopolies best-set-first and raise each
 *  evenly toward its desired level, as far as cash-above-floor and the house bank
 *  allow, accumulating into one atomic commit. A monopoly with mortgaged members
 *  is dead weight — it can't be built and earns nothing — so when flush this also
 *  lifts those mortgages and develops the set in the SAME commit (the engine plans
 *  the build against the post-unmortgage state). Unmortgaging is gated on being
 *  comfortably above the rent reserve because it pays 10% interest and undoes a
 *  past raise; a thin bot leaves the set mortgaged. Returns null when nothing is
 *  worth (or can be afforded) now — which makes the pre-roll arm decision and the
 *  commit identical and keeps the bot from spinning. */
export function planBuild(state: GameState, pid: string): BuildPlan | null {
  const player = state.players.find((p) => p.id === pid);
  if (!player) return null;
  const floor = liquidityFloor(state, pid);
  const flush = player.cash > floor + HOTEL_CUSHION;
  const { level: want, why } = desiredLevel(state, pid);
  const build: Record<number, number> = {};
  const mortgage: Record<number, boolean> = {};
  const reasons: string[] = [];

  for (const color of COLORS_BY_WEIGHT) {
    if (!hasMonopoly(state, color, pid)) continue;
    const positions = groupPositions(color);
    const mortgagedMembers = positions.filter((pos) => state.mortgaged[pos]);
    const locked = mortgagedMembers.length > 0;
    if (locked && !flush) continue; // don't reclaim a mortgaged set while thin
    const floorOf = maxLevelInSet(state, color);
    // A locked set is worth unmortgaging even with no houses (level 0): it
    // restores the set's monopoly double-rent and unfreezes it for later
    // building. A clean set must climb strictly above its current max.
    const stop = locked ? 0 : floorOf + 1;
    if (want < stop) continue;
    // Try the highest affordable even level from `want` down to `stop`,
    // validating the WHOLE accumulated commit (build + unmortgages) each step.
    for (let level = want; level >= stop; level--) {
      const candidateBuild = { ...build };
      if (level > 0) for (const pos of positions) candidateBuild[pos] = level;
      const candidateMortgage = { ...mortgage };
      for (const pos of mortgagedMembers) candidateMortgage[pos] = false;
      const summary = manageSummary(state, pid, {
        build: candidateBuild,
        mortgage: candidateMortgage,
      });
      if (summary.ok && player.cash + summary.netCash >= floor) {
        if (level > 0) for (const pos of positions) build[pos] = level;
        for (const pos of mortgagedMembers) mortgage[pos] = false;
        reasons.push(redeployReason(color, level, locked, why, level === want));
        break;
      }
    }
  }

  // Prune build entries already at their live level, then confirm the commit
  // changes something (a build tier, or a mortgage lift).
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

/** Phrase one set's contribution to the development reason, distinguishing a
 *  clean build-up from reclaiming a mortgaged set (with or without houses). */
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

// ---------------------------------------------------------------------------
// Forced liquidation (must-raise-cash). Value-preserving order, the opposite of
// the dumb bot's cheapest-first: shed the least strategic asset that still
// clears the debt, protecting monopolies and their houses for as long as
// possible.
// ---------------------------------------------------------------------------

/** How much losing `pos` would hurt — higher = protect longer. A lot inside a
 *  monopoly I hold is most precious; a railroad earns steady rent; a lone
 *  property in an unfinished set matters little; a utility least of all. */
function essentialness(state: GameState, pid: string, pos: number): number {
  const color = colorAt(pos);
  if (color !== null) return hasMonopoly(state, color, pid) ? 4 : 1;
  return SPACES[pos].kind === "railroad" ? 3 : 0.5; // railroad : utility
}

export interface RaiseStep {
  intent: Intent;
  reason: string;
}

/** The single next liquidation the debtor `pid` should make to climb back toward
 *  solvency, value-preserving: mortgage the least-essential building-free lot
 *  first; only once nothing is left to mortgage, sell the buildings off the
 *  least valuable monopoly (weakest set first). Returns null only if the debtor
 *  has truly nothing left (the engine treats that as already settled / bust). */
export function raiseCashStep(state: GameState, pid: string): RaiseStep | null {
  // 1. Mortgage the least-essential building-free, un-mortgaged lot.
  let pick: { pos: number; score: number } | null = null;
  for (const [posStr, owner] of Object.entries(state.ownership)) {
    if (owner !== pid) continue;
    const pos = Number(posStr);
    if (state.mortgaged[pos]) continue;
    if (builtLotsInGroup(pos, (p) => developmentLevel(state, p)).length > 0) continue;
    if (mortgageValueAt(pos) === null) continue;
    // Sort by essentialness, then mortgage the lower-value lot first within a tier.
    const score = essentialness(state, pid, pos) * 100000 + assetBase(state, pos);
    if (pick === null || score < pick.score) pick = { pos, score };
  }
  if (pick !== null) {
    return {
      intent: { kind: "mortgage", playerId: pid, position: pick.pos },
      reason: `Raising cash: mortgaging ${spaceName(pick.pos)} — my least essential asset, monopolies untouched.`,
    };
  }

  // 2. Nothing left to mortgage: sell down the weakest built monopoly to bare.
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

// ---------------------------------------------------------------------------
// Raising cash to BUY (the lifted invariant): when a property is worth owning
// but cash is short, mortgage the least-essential lots to afford it outright,
// protecting monopolies. Mortgage-only on purpose — the bot won't tear down its
// own houses to buy a new lot.
// ---------------------------------------------------------------------------

/** Cash `pid` could raise by mortgaging its building-free, un-mortgaged lots
 *  (half printed price each) — the ceiling for a mortgage-funded purchase. */
export function mortgageableTotal(state: GameState, pid: string): number {
  let total = 0;
  for (const [posStr, owner] of Object.entries(state.ownership)) {
    if (owner !== pid) continue;
    const pos = Number(posStr);
    if (state.mortgaged[pos]) continue;
    if (builtLotsInGroup(pos, (p) => developmentLevel(state, p)).length > 0) continue;
    total += mortgageValueAt(pos) ?? 0;
  }
  return total;
}

/** The staged mortgage map to raise at least `need`, least-essential lots first
 *  (monopolies protected, cheapest within a tier), or null if mortgaging every
 *  eligible lot still falls short. Fed straight into a `raising-cash` commit. */
export function planRaiseByMortgage(
  state: GameState,
  pid: string,
  need: number,
): Record<number, boolean> | null {
  const lots: { pos: number; value: number; ess: number }[] = [];
  for (const [posStr, owner] of Object.entries(state.ownership)) {
    if (owner !== pid) continue;
    const pos = Number(posStr);
    if (state.mortgaged[pos]) continue;
    if (builtLotsInGroup(pos, (p) => developmentLevel(state, p)).length > 0) continue;
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

// ---------------------------------------------------------------------------
// Jail. Early / safe board: get out and keep moving. Dangerous board (developed
// rent out there): jail is a haven — sit, collect rent, don't volunteer to walk
// onto a hotel, and don't waste a held card or $50 doing it.
// ---------------------------------------------------------------------------

export interface JailChoice {
  /** null = roll for doubles (stay put / gamble); else the leave intent. */
  intent: Intent | null;
  reason: string;
}

/** Is the board developed enough that staying in jail beats walking out? */
function boardIsDangerous(state: GameState, pid: string): boolean {
  for (const [posStr, owner] of Object.entries(state.ownership)) {
    if (owner === pid) continue;
    const pos = Number(posStr);
    if (developmentLevel(state, pos) > 0 && rentEstimateAt(state, pos) >= JAIL_DANGER_RENT) {
      return true;
    }
  }
  return false;
}

/** Decide jail action for `pid` (already known to be the jailed active player).
 *  `heldCard` is the GOJF source they hold, or null. */
export function jailChoice(
  state: GameState,
  pid: string,
  heldCard: "chance" | "communityChest" | null,
): JailChoice {
  const player = state.players.find((p) => p.id === pid);
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

// ---------------------------------------------------------------------------
// Shared helpers used by the policy + the trade module.
// ---------------------------------------------------------------------------

export {
  GROUP_WEIGHT,
  monopolyBonus,
  assetBase,
  ownedInColor,
  BASE_FLOOR,
  COLORS_BY_WEIGHT,
};
