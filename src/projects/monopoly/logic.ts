import { SPACES } from "./data";
import type { GameState, PropertyColor } from "./types";

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
