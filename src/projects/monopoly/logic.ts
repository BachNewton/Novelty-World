import { SPACES } from "./data";
import type { CardSource, GameState, PropertyColor } from "./types";

const PROPS_PER_COLOR: Readonly<Record<PropertyColor, number>> = {
  brown: 2,
  "light-blue": 3,
  pink: 3,
  orange: 3,
  red: 3,
  yellow: 3,
  green: 3,
  "dark-blue": 2,
};

const RAILROAD_RENT: readonly [number, number, number, number] = [25, 50, 100, 200];
const UTILITY_MULT_PARTIAL = 4;
const UTILITY_MULT_FULL = 10;

/** Buy price of an ownable square (property, railroad, utility), or null
 *  for any other space. Used by the engine to validate buy intents, by the
 *  bot pacer to decide buy vs. decline, and by the action bar to show the
 *  player what they'd pay. */
export function ownablePrice(position: number): number | null {
  const space = SPACES[position];
  if (space.kind === "property") return space.price;
  if (space.kind === "railroad") return space.price;
  if (space.kind === "utility") return space.price;
  return null;
}

/** Cash a player collects when mortgaging this square. Official rule: half
 *  the printed price, rounded down for the odd dollar (Monopoly's price
 *  table only has even prices today, so the floor is a safety net). Null
 *  for non-ownable spaces. */
export function mortgageValueAt(position: number): number | null {
  const price = ownablePrice(position);
  if (price === null) return null;
  return Math.floor(price / 2);
}

/** Cash a player must pay to lift a mortgage on this square. Official rule:
 *  mortgage value plus 10% interest, rounded up to the nearest dollar. Null
 *  for non-ownable spaces.
 *
 *  Integer math (`value * 11 / 10`) because `value * 1.1` in IEEE 754 can
 *  drift — e.g. `200 * 1.1` is `220.00000000000003`, which `Math.ceil`
 *  would round up to 221 and produce off-by-one for round-number rents. */
export function unmortgageCostAt(position: number): number | null {
  const value = mortgageValueAt(position);
  if (value === null) return null;
  return Math.ceil((value * 11) / 10);
}

/** The 10% mortgage interest alone (un-mortgage cost minus the principal) —
 *  what a player must pay the bank when they take on a mortgaged property in a
 *  trade and keep it mortgaged. Official rule. Null for non-ownable spaces. */
export function mortgageInterestAt(position: number): number | null {
  const value = mortgageValueAt(position);
  const cost = unmortgageCostAt(position);
  if (value === null || cost === null) return null;
  return cost - value;
}

/** The Get-Out-of-Jail-Free card source this player holds, or null if they
 *  hold none. Prefers Chance when they hold both — an arbitrary but stable
 *  choice so "use a card" consumes a deterministic one. Used by the engine
 *  (use-jail-card), the bot policy, and the jail prompt to know whether the
 *  "Use card" option is available. */
export function heldJailCard(
  state: GameState,
  playerId: string,
): CardSource | null {
  if (state.jailFreeCards.chance === playerId) return "chance";
  if (state.jailFreeCards.communityChest === playerId) return "communityChest";
  return null;
}

/** True when ownerId holds every property of `color`. */
export function hasMonopoly(
  state: GameState,
  color: PropertyColor,
  ownerId: string,
): boolean {
  let count = 0;
  for (const [posStr, oid] of Object.entries(state.ownership)) {
    if (oid !== ownerId) continue;
    const space = SPACES[Number(posStr)];
    if (space.kind === "property" && space.color === color) count++;
  }
  return count === PROPS_PER_COLOR[color];
}

function countOwnedByKind(
  state: GameState,
  ownerId: string,
  kind: "railroad" | "utility",
): number {
  let count = 0;
  for (const [posStr, oid] of Object.entries(state.ownership)) {
    if (oid !== ownerId) continue;
    if (SPACES[Number(posStr)].kind === kind) count++;
  }
  return count;
}

/** What to display in the rent column. Utility rent depends on the dice roll
 *  and is reported as a multiplier the UI can render with a die icon. */
export type RentDisplay =
  | { kind: "dollars"; amount: number }
  | { kind: "dice-multiplier"; multiplier: number };

/** Concrete dollar rent the active player owes on landing — utility
 *  multiplier resolved against the actual dice roll, mortgage taken into
 *  account, self-owned and unowned squares return null.
 *
 *  Returns null when:
 *  - the square isn't owned by anyone (nobody to pay),
 *  - the square is owned by the lander themselves (you don't pay yourself),
 *  - the property is mortgaged (Monopoly rule: no rent collected).
 *
 *  Otherwise returns the exact amount. Use this from the engine; `rentAt`
 *  is the display variant for the UI and doesn't need a dice roll. */
export function rentDue(
  state: GameState,
  position: number,
  diceTotal: number,
  landerId: string,
): number | null {
  const ownerId = state.ownership[position];
  if (!ownerId) return null;
  if (ownerId === landerId) return null;
  if (state.mortgaged[position]) return null;
  const display = rentAt(state, position);
  if (!display) return null;
  if (display.kind === "dollars") return display.amount;
  return display.multiplier * diceTotal;
}

/** Rent owed if a player landed on this square right now. Returns null when
 *  the space is unowned or unownable — callers can show the buy price or
 *  nothing as appropriate. */
export function rentAt(state: GameState, position: number): RentDisplay | null {
  const space = SPACES[position];
  const ownerId = state.ownership[position];
  if (!ownerId) return null;

  if (space.kind === "property") {
    const houses = state.houses[position] ?? 0;
    if (houses === 5) return { kind: "dollars", amount: space.rent.hotel };
    if (houses === 4) return { kind: "dollars", amount: space.rent.houses[3] };
    if (houses === 3) return { kind: "dollars", amount: space.rent.houses[2] };
    if (houses === 2) return { kind: "dollars", amount: space.rent.houses[1] };
    if (houses === 1) return { kind: "dollars", amount: space.rent.houses[0] };
    const monopoly = hasMonopoly(state, space.color, ownerId);
    return { kind: "dollars", amount: monopoly ? space.rent.base * 2 : space.rent.base };
  }
  if (space.kind === "railroad") {
    const count = countOwnedByKind(state, ownerId, "railroad");
    if (count === 1) return { kind: "dollars", amount: RAILROAD_RENT[0] };
    if (count === 2) return { kind: "dollars", amount: RAILROAD_RENT[1] };
    if (count === 3) return { kind: "dollars", amount: RAILROAD_RENT[2] };
    if (count === 4) return { kind: "dollars", amount: RAILROAD_RENT[3] };
    return { kind: "dollars", amount: 0 };
  }
  if (space.kind === "utility") {
    const count = countOwnedByKind(state, ownerId, "utility");
    return {
      kind: "dice-multiplier",
      multiplier: count === 2 ? UTILITY_MULT_FULL : UTILITY_MULT_PARTIAL,
    };
  }
  return null;
}
