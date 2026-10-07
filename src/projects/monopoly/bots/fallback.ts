import {
  builtLotsInGroup,
  colorAt,
  developmentLevel,
  groupPositions,
  houseCostAt,
} from "../development";
import { mortgageValueAt } from "../logic";
import type { GameState, Intent, PropertyColor } from "../types";

/** The canonical legal cash-raising step for a player who is in the red and
 *  must settle: mortgage the cheapest un-mortgaged, building-free lot; once
 *  nothing is left to mortgage, sell the cheapest built set down to bare lots.
 *  One step per call — the forced-settle loop re-checks the debt and calls again
 *  until the player is back to ≥ 0.
 *
 *  It always returns a LEGAL step while the player is genuinely in
 *  `must-raise-cash` (a debtor who can't recover even after maxing out liquidation
 *  goes straight to bankruptcy at charge time, so they never enter the phase). So
 *  it doubles as the pacer's safe default for a misbehaving bot in
 *  `must-raise-cash`, and as the `dumb` baseline's settle logic — one
 *  implementation, no drift. Returns null only if there is nothing left to raise
 *  (not expected inside the phase). */
export function forcedRaiseStep(
  state: GameState,
  playerId: string,
): Intent | null {
  const toMortgage = cheapestMortgageable(state, playerId);
  if (toMortgage !== null) {
    return { kind: "mortgage", playerId, position: toMortgage };
  }
  // Only developed property is left — sell a built set's buildings. Without this
  // the debtor stalls (a built property can't be mortgaged), so the forced phase
  // would never clear.
  return sellCheapestBuiltSet(state, playerId);
}

/** Positions the player could mortgage right now: owned, un-mortgaged, and in a
 *  color set with no buildings (official rule — those buildings are sold via
 *  `manage` first). */
export function mortgageablePositions(
  state: GameState,
  playerId: string,
): number[] {
  const positions: number[] = [];
  for (const [posStr, ownerId] of Object.entries(state.ownership)) {
    if (ownerId !== playerId) continue;
    const pos = Number(posStr);
    if (state.mortgaged[pos]) continue;
    if (builtLotsInGroup(pos, (p) => developmentLevel(state, p)).length > 0) {
      continue;
    }
    if (mortgageValueAt(pos) === null) continue;
    positions.push(pos);
  }
  return positions;
}

/** Position of the cheapest un-mortgaged, building-free property the player
 *  owns, or null if none can be mortgaged. Cheapest first preserves the more
 *  valuable assets for as long as possible. */
function cheapestMortgageable(state: GameState, playerId: string): number | null {
  let best: { pos: number; value: number } | null = null;
  for (const pos of mortgageablePositions(state, playerId)) {
    const value = mortgageValueAt(pos) ?? 0;
    if (!best || value < best.value) best = { pos, value };
  }
  return best?.pos ?? null;
}

/** A `manage` intent that liquidates the cheapest color set the player has built
 *  on — every property in it back to a bare lot — or null if they have no
 *  buildings. The forced raise-cash branch of `applyManage` applies it and
 *  re-checks the debt, so the caller just keeps requesting steps until settled.
 *  Selling a whole set to zero is always supply-feasible (the planner's shortage
 *  liquidation escape covers any hotel shortage). Cheapest set first spares
 *  pricier development. */
function sellCheapestBuiltSet(state: GameState, playerId: string): Intent | null {
  const builtColors = new Set<PropertyColor>();
  for (const [posStr, ownerId] of Object.entries(state.ownership)) {
    if (ownerId !== playerId) continue;
    if (!developmentLevel(state, Number(posStr))) continue;
    const color = colorAt(Number(posStr));
    if (color) builtColors.add(color);
  }
  let cheapest: PropertyColor | null = null;
  let cheapestCost = Infinity;
  for (const color of builtColors) {
    const cost = houseCostAt(groupPositions(color)[0]) ?? Infinity;
    if (cost < cheapestCost) {
      cheapestCost = cost;
      cheapest = color;
    }
  }
  if (cheapest === null) return null;
  const build: Record<number, number> = {};
  for (const pos of groupPositions(cheapest)) build[pos] = 0;
  return { kind: "manage", playerId, build, mortgage: {} };
}
