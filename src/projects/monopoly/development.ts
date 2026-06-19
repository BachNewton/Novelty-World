import { SPACES } from "./data";
import { hasMonopoly } from "./logic";
import type { GameState, PropertyColor } from "./types";

/** Standard US Monopoly building bank: 32 houses, 12 hotels. The remaining
 *  count is always derived from the board (`bankSupply`) — no separate counter
 *  is stored in `GameState`. */
export const TOTAL_HOUSES = 32;
export const TOTAL_HOTELS = 12;

/** Cost of one development tier (a house, or the hotel) by color group, per the
 *  official board. Every tier in a group costs the same, and the hotel is just
 *  the fifth tier — so developing a property from bare lot to hotel costs
 *  `5 * HOUSE_COST[color]`. Selling a tier back refunds half (`buildingRefundAt`). */
const HOUSE_COST: Readonly<Record<PropertyColor, number>> = {
  brown: 50,
  "light-blue": 50,
  pink: 100,
  orange: 100,
  red: 150,
  yellow: 150,
  green: 200,
  "dark-blue": 200,
};

/** Board positions of every property in each color group, in board order.
 *  Precomputed once — used to enforce the monopoly + even-build rules. */
const GROUP_POSITIONS: Readonly<Record<PropertyColor, readonly number[]>> =
  (() => {
    const groups: Record<PropertyColor, number[]> = {
      brown: [],
      "light-blue": [],
      pink: [],
      orange: [],
      red: [],
      yellow: [],
      green: [],
      "dark-blue": [],
    };
    SPACES.forEach((space, pos) => {
      if (space.kind === "property") groups[space.color].push(pos);
    });
    return groups;
  })();

/** Development level at a position: 0 bare lot, 1-4 houses, 5 hotel. */
export function developmentLevel(state: GameState, position: number): number {
  return state.houses[position] ?? 0;
}

/** Cost to add one tier (a house, or the hotel) on this property; null if the
 *  space isn't a property. */
export function houseCostAt(position: number): number | null {
  const space = SPACES[position];
  return space.kind === "property" ? HOUSE_COST[space.color] : null;
}

/** Cash refunded for selling one tier (house or hotel) back to the bank: half
 *  the tier cost, floored. Null for non-properties. */
export function buildingRefundAt(position: number): number | null {
  const cost = houseCostAt(position);
  return cost === null ? null : Math.floor(cost / 2);
}

/** The color group a position belongs to, or null if it isn't a property. */
export function colorAt(position: number): PropertyColor | null {
  const space = SPACES[position];
  return space.kind === "property" ? space.color : null;
}

/** Board positions of a color group, in board order. */
export function groupPositions(color: PropertyColor): readonly number[] {
  return GROUP_POSITIONS[color];
}

/** Built lots in a position's color group — the positions (including the lot
 *  itself) carrying a building. Empty when the whole set is bare; empty for
 *  railroads and utilities, which have no color group and can't hold buildings.
 *  `levelAt` looks up each position's level (the live levels, or a commit's
 *  post-build final levels, so "sell the set's houses then act on a lot" passes
 *  in one commit). This is the set-must-be-bare guard behind two official rules:
 *  a lot can't be mortgaged, nor traded, while a building stands anywhere in its
 *  set. */
export function builtLotsInGroup(
  position: number,
  levelAt: (pos: number) => number,
): number[] {
  const color = colorAt(position);
  if (color === null) return [];
  return groupPositions(color).filter((pos) => levelAt(pos) > 0);
}

/** Houses and hotels still available in the bank, derived from the board: a
 *  level of 1-4 holds that many houses; a hotel (5) holds one hotel and zero
 *  houses (the four it replaced went back to the bank when it was built). */
export function bankSupply(state: GameState): {
  houses: number;
  hotels: number;
} {
  let housesUsed = 0;
  let hotelsUsed = 0;
  for (const level of Object.values(state.houses)) {
    if (level === 5) hotelsUsed += 1;
    else housesUsed += level;
  }
  return {
    houses: TOTAL_HOUSES - housesUsed,
    hotels: TOTAL_HOTELS - hotelsUsed,
  };
}

/** One concrete building transaction in a committed plan, mapped to engine
 *  intents at commit time. `build` and `sell` move a single tier; `liquidate`
 *  is the whole-hotel shortage escape — a hotel goes straight to a bare lot in
 *  one step, used when the bank can't supply the houses to break it down
 *  evenly. The official rule for a house shortage (see `monopoly/CLAUDE.md`). */
export type DevStep =
  | { kind: "build"; position: number; toLevel: number; cost: number }
  | { kind: "sell"; position: number; toLevel: number; refund: number }
  | { kind: "liquidate"; position: number; refund: number };

/** Per-set advisory surfaced in the develop/sell panel. Currently the only
 *  note is that a set's hotels had to be liquidated (and possibly rebuilt)
 *  because of a house shortage, so the elevated cash cost reads as explained
 *  rather than surprising. */
export interface DevelopmentNote {
  color: PropertyColor;
  kind: "shortage-liquidation";
}

/** Result of planning a staged develop/sell commit. On success, `steps` is the
 *  ordered list of single-tier transactions to submit (already sequenced so the
 *  bank never runs dry mid-commit), `netCash` is the player's net change
 *  (positive = refund, negative = spend), and `notes` flags any set forced
 *  through the shortage escape. On failure, `reason` explains why the staged
 *  target can't be reached (uneven, not a monopoly, mortgaged, or not enough
 *  buildings in the bank). Cash-on-hand is NOT checked here — the caller gates
 *  Confirm on `netCash` against the player's balance. */
export type DevelopmentPlan =
  | {
      ok: true;
      steps: readonly DevStep[];
      netCash: number;
      notes: readonly DevelopmentNote[];
    }
  | { ok: false; reason: string };

/** Mutable per-position level map for the affected color groups, threaded
 *  through the simulation. */
type Levels = Map<number, number>;

/** Plan a develop/sell commit: turn a staged target (position -> desired level)
 *  into an ordered, supply-safe list of single-tier transactions, or explain
 *  why it can't be done.
 *
 *  The hard part is the bank: hotels are the fifth tier built on four houses,
 *  and the even-build rule forces a hotel to break down *through* four houses
 *  before it can drop further — so selling a hotel can transiently *demand*
 *  houses from the bank. When the bank can't supply them, the set falls back to
 *  the whole-hotel liquidation escape (and rebuilds if the target keeps houses).
 *  Sets are processed freeing-first so houses one set returns are available to
 *  another set that needs them in the same commit. */
export function planDevelopment(
  state: GameState,
  playerId: string,
  target: Readonly<Record<number, number>>,
): DevelopmentPlan {
  // 1. Which positions actually change, and which color groups they touch.
  const changed: number[] = [];
  for (const [posStr, level] of Object.entries(target)) {
    const pos = Number(posStr);
    if (level !== developmentLevel(state, pos)) changed.push(pos);
  }
  if (changed.length === 0) {
    return { ok: true, steps: [], netCash: 0, notes: [] };
  }

  // 2. Every changed position must be a property the player owns.
  for (const pos of changed) {
    if (colorAt(pos) === null) {
      return { ok: false, reason: "only properties can be developed" };
    }
    if (state.ownership[pos] !== playerId) {
      return { ok: false, reason: "you don't own that property" };
    }
    const level = target[pos];
    if (level < 0 || level > 5 || !Number.isInteger(level)) {
      return { ok: false, reason: "invalid development level" };
    }
  }

  const affectedColors = new Set<PropertyColor>();
  for (const pos of changed) {
    // colorAt is non-null here (checked above).
    affectedColors.add(colorAt(pos)!);
  }

  // 3. Build the working level map: every position of every affected group,
  //    at its current level, plus the per-position target.
  const levels: Levels = new Map();
  const targets: Levels = new Map();
  for (const color of affectedColors) {
    for (const pos of groupPositions(color)) {
      levels.set(pos, developmentLevel(state, pos));
      targets.set(pos, target[pos] ?? developmentLevel(state, pos));
    }
  }

  // 4. Per-group legality: building requires a full, unmortgaged monopoly; the
  //    final config of every affected group must be even (within one tier).
  for (const color of affectedColors) {
    const positions = groupPositions(color);
    const building = positions.some(
      (pos) => targets.get(pos)! > levels.get(pos)!,
    );
    if (building) {
      if (!hasMonopoly(state, color, playerId)) {
        return { ok: false, reason: "you must own the whole color set to build" };
      }
      if (positions.some((pos) => state.mortgaged[pos])) {
        return { ok: false, reason: "unmortgage the whole set before building" };
      }
    }
    const finalLevels = positions.map((pos) => targets.get(pos)!);
    if (Math.max(...finalLevels) - Math.min(...finalLevels) > 1) {
      return { ok: false, reason: "houses must be even across the color set" };
    }
  }

  // 5. Search for a legal, supply-safe order to resolve all affected groups,
  //    preferring schedules that need no shortage liquidation.
  const bank = bankSupply(state);
  const solution = solveGroups([...affectedColors], levels, targets, bank);
  if (!solution) return { ok: false, reason: "not enough houses in the bank" };

  const netCash = solution.steps.reduce((sum, step) => {
    return step.kind === "build" ? sum - step.cost : sum + step.refund;
  }, 0);

  return { ok: true, steps: solution.steps, netCash, notes: solution.notes };
}

interface SolveResult {
  steps: DevStep[];
  notes: DevelopmentNote[];
}

/** Find the CHEAPEST legal order to resolve every affected color group to its
 *  target, threading the bank through so a group that returns buildings can run
 *  before one that needs them — regardless of board order. Explores every group
 *  ordering (and, per group, whether to take the liquidation escape) and keeps
 *  the schedule with the best net cash, so a needless liquidation is never
 *  chosen when reordering yields a clean breakdown. Returns null when no legal
 *  schedule exists.
 *
 *  Groups process whole, one at a time: a group's transient house demand
 *  (breaking hotels, or building up to them) resolves by the time it finishes,
 *  so no cross-group interleaving is ever required. The search is memoized on
 *  (remaining groups, bank) — the only things that determine a subproblem,
 *  since unprocessed groups always sit at their original levels — so it stays
 *  cheap even when a player develops many sets at once. */
function solveGroups(
  affected: readonly PropertyColor[],
  levels: Levels,
  targets: Levels,
  startBank: { houses: number; hotels: number },
): SolveResult | null {
  interface Scored {
    steps: DevStep[];
    notes: DevelopmentNote[];
    netCash: number;
  }
  const memo = new Map<string, Scored | null>();

  const best = (
    remaining: readonly PropertyColor[],
    bank: { houses: number; hotels: number },
  ): Scored | null => {
    if (remaining.length === 0) return { steps: [], notes: [], netCash: 0 };
    const key = `${[...remaining].sort().join(",")}|${bank.houses}|${bank.hotels}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;

    let winner: Scored | null = null;
    for (const color of remaining) {
      for (const allowEscape of [false, true]) {
        const sim = simulateGroup(groupPositions(color), levels, targets, bank, allowEscape);
        if (!sim.ok) continue;
        // The escape pass is only interesting when it actually escapes — a pure
        // resolution is already covered by the allowEscape=false pass.
        if (allowEscape && !sim.usedEscape) continue;
        const sub = best(remaining.filter((c) => c !== color), sim.endBank);
        if (!sub) continue;
        const simCash = sim.steps.reduce(
          (s, st) => (st.kind === "build" ? s - st.cost : s + st.refund),
          0,
        );
        const netCash = simCash + sub.netCash;
        if (winner === null || netCash > winner.netCash) {
          const notes = sim.usedEscape
            ? [{ color, kind: "shortage-liquidation" as const }, ...sub.notes]
            : sub.notes;
          winner = { steps: [...sim.steps, ...sub.steps], notes, netCash };
        }
      }
    }
    memo.set(key, winner);
    return winner;
  };

  const result = best(affected, startBank);
  return result && { steps: result.steps, notes: result.notes };
}

type SimResult =
  | {
      ok: true;
      steps: DevStep[];
      usedEscape: boolean;
      endLevels: Map<number, number>;
      endBank: { houses: number; hotels: number };
    }
  | { ok: false; reason: string };

/** Walk one group from its current levels to its target, one legal tier at a
 *  time, against a copy of the bank. Prefers moves that *free* buildings
 *  (selling houses, building hotels) over moves that consume them, so the bank
 *  stays as full as possible. When `allowEscape` is set and the group is stuck
 *  on a hotel breakdown the bank can't fund, it liquidates every hotel in the
 *  group to a bare lot at once (the official shortage rule) and continues.
 *  Returns the full step list + end state, or a failure reason. */
function simulateGroup(
  positions: readonly number[],
  liveLevels: Levels,
  targets: Levels,
  liveBank: { houses: number; hotels: number },
  allowEscape: boolean,
): SimResult {
  const levels = new Map<number, number>();
  for (const pos of positions) levels.set(pos, liveLevels.get(pos)!);
  const bank = { ...liveBank };
  const steps: DevStep[] = [];
  let usedEscape = false;

  const atTarget = (): boolean =>
    positions.every((pos) => levels.get(pos) === targets.get(pos));

  // Does moving `pos` to `next` keep the group within one tier of itself?
  const evenAfter = (pos: number, next: number): boolean => {
    let min = next;
    let max = next;
    for (const other of positions) {
      if (other === pos) continue;
      const lvl = levels.get(other)!;
      if (lvl < min) min = lvl;
      if (lvl > max) max = lvl;
    }
    return max - min <= 1;
  };

  // Guard against a pathological non-terminating loop: each tier change moves
  // a position one step closer to its target, bounded by 5 tiers per position.
  const maxSteps = positions.length * 6 + 2;
  let guard = 0;

  while (!atTarget()) {
    if (guard++ > maxSteps) {
      return { ok: false, reason: "could not resolve the build evenly" };
    }

    const move = pickMove(positions, levels, targets, bank, evenAfter);
    if (move) {
      applyMove(move, levels, bank, steps);
      continue;
    }

    // Stuck: a hotel breakdown the bank can't fund blocks all further selling.
    // The official shortage rule lets a player always sell buildings back for
    // cash, so escape by liquidating every member that still needs to come down
    // straight to a bare lot — hotels return to the bank, houses return as
    // houses — then let the rebuild phase climb back to any non-zero target.
    //
    // This must also rescue a set that PARTIALLY broke down before stranding:
    // selling a three-hotel set with only enough bank houses to break two of
    // them leaves [4,4,5] with an empty bank, where the all-still-hotel form of
    // the escape no longer fits. Liquidating the already-broken house members to
    // bare alongside the surviving hotel reaches the (pre-validated even) target.
    // Without it a heavily-developed forced settler would be frozen into a false
    // bankruptcy while still holding sellable buildings.
    const hotelBlocking = positions.some(
      (pos) => levels.get(pos) === 5 && targets.get(pos)! < 5,
    );
    const toLiquidate = positions.filter((pos) => levels.get(pos)! > targets.get(pos)!);
    if (allowEscape && hotelBlocking && toLiquidate.length > 0) {
      for (const pos of toLiquidate) {
        const level = levels.get(pos)!;
        const refundUnit = buildingRefundAt(pos) ?? 0;
        if (level === 5) {
          // A hotel sells back as five tiers and returns the hotel to the bank.
          steps.push({ kind: "liquidate", position: pos, refund: refundUnit * 5 });
          bank.hotels += 1;
        } else {
          // Already-broken houses sell back in one shot, returning to the bank.
          steps.push({ kind: "sell", position: pos, toLevel: 0, refund: refundUnit * level });
          bank.houses += level;
        }
        levels.set(pos, 0);
      }
      usedEscape = true;
      continue;
    }

    return { ok: false, reason: "not enough houses in the bank" };
  }

  return {
    ok: true,
    steps,
    usedEscape,
    endLevels: levels,
    endBank: bank,
  };
}

interface Move {
  position: number;
  next: number;
  /** Lower runs first: frees before consumes. */
  priority: number;
}

/** Pick the next single-tier move toward target that the bank can fund,
 *  preferring building-freeing moves. Returns null when no funded legal move
 *  remains (the caller then tries the escape). */
function pickMove(
  positions: readonly number[],
  levels: Levels,
  targets: Levels,
  bank: { houses: number; hotels: number },
  evenAfter: (pos: number, next: number) => boolean,
): Move | null {
  let best: Move | null = null;
  for (const pos of positions) {
    const level = levels.get(pos)!;
    const want = targets.get(pos)!;
    if (level === want) continue;
    const next = level + (want > level ? 1 : -1);
    if (!evenAfter(pos, next)) continue;

    let priority: number;
    let funded: boolean;
    if (next > level) {
      if (next === 5) {
        // Build a hotel: needs a hotel, returns four houses (a net freer).
        priority = 1;
        funded = bank.hotels >= 1;
      } else {
        // Build a house: consumes one (the most deferrable move).
        priority = 3;
        funded = bank.houses >= 1;
      }
    } else if (level === 5) {
      // Break a hotel down to four houses: needs four houses from the bank.
      priority = 2;
      funded = bank.houses >= 4;
    } else {
      // Sell a house: always returns one to the bank (do these first).
      priority = 0;
      funded = true;
    }
    if (!funded) continue;
    if (best === null || priority < best.priority) {
      best = { position: pos, next, priority };
    }
  }
  return best;
}

/** Apply a chosen move to the working levels + bank and append its step. */
function applyMove(
  move: Move,
  levels: Levels,
  bank: { houses: number; hotels: number },
  steps: DevStep[],
): void {
  const { position, next } = move;
  const level = levels.get(position)!;
  if (next > level) {
    const cost = houseCostAt(position) ?? 0;
    steps.push({ kind: "build", position, toLevel: next, cost });
    if (next === 5) {
      bank.hotels -= 1;
      bank.houses += 4; // the four houses it replaced go back
    } else {
      bank.houses -= 1;
    }
  } else {
    const refund = buildingRefundAt(position) ?? 0;
    steps.push({ kind: "sell", position, toLevel: next, refund });
    if (level === 5) {
      bank.hotels += 1;
      bank.houses -= 4; // four houses placed to replace the hotel
    } else {
      bank.houses += 1;
    }
  }
  levels.set(position, next);
}

/** Maximum cash a player could raise from selling every building they own back
 *  to the bank at half price, ignoring even-build ordering (the raise-cash
 *  ceiling, paired with mortgage value in `maxRaisableCash`). Each tier on a
 *  property — houses and the hotel alike — refunds half its cost. */
export function maxBuildingSaleValue(state: GameState, ownerId: string): number {
  let total = 0;
  for (const [posStr, oid] of Object.entries(state.ownership)) {
    if (oid !== ownerId) continue;
    const pos = Number(posStr);
    const level = developmentLevel(state, pos);
    if (level === 0) continue;
    const refund = buildingRefundAt(pos);
    if (refund === null) continue;
    // A hotel is five tiers (four houses + the hotel); houses are `level` tiers.
    const tiers = level === 5 ? 5 : level;
    total += refund * tiers;
  }
  return total;
}
