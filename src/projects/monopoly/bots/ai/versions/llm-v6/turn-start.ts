import { HOUSE_COST } from "../../../../data";
import { bankSupply, developmentLevel, groupPositions } from "../../../../development";
import { hasMonopoly, unmortgageCostAt } from "../../../../logic";
import type { GameState } from "../../../../types";
import { COLORS, playerById } from "./format";
import { aiSeat, currentTurnNumber } from "../../seat";

/** Cash moves the fingerprint only when it crosses into another band of this
 *  size, so a seat isn't asked again over every $10 of rent. */
const CASH_BAND = 250;

/** The facts a turn-start decision turns on, as one comparable string: who owns
 *  what (and so every monopoly), what is mortgaged, every building, who holds
 *  the Get Out of Jail Free cards, and which cash band the seat is in. Anything
 *  else (positions, other seats' cash, the log) is deliberately left out: it
 *  changes every turn without changing what the seat could build or trade. */
export function turnStartFingerprint(state: GameState, seat: string): string {
  const sorted = (record: Readonly<Record<number, unknown>>): [string, unknown][] =>
    Object.entries(record).sort(([a], [b]) => Number(a) - Number(b));
  return JSON.stringify({
    ownership: sorted(state.ownership),
    mortgaged: sorted(state.mortgaged).filter(([, m]) => m === true),
    houses: sorted(state.houses).filter(([, level]) => level !== 0),
    cards: [state.jailFreeCards.chance ?? null, state.jailFreeCards.communityChest ?? null],
    cashBand: Math.floor(playerById(state, seat).cash / CASH_BAND),
  });
}

/** Whether the seat owes its turn-start question now: at most once per
 *  turn-group (the same window the engine gives every player to manage and to
 *  trade), and only when there is something it could do with it.
 *  - It can build or lift a mortgage: asked every turn, since that choice is
 *    open whether or not anything changed.
 *  - It shares a color set with another player, so a trade could complete a
 *    set for one of them: asked when the board has changed since it was last
 *    asked (`turnStartFingerprint`), not every turn over the same board.
 *  Otherwise there is nothing to manage and no set to trade toward, and the
 *  seat just rolls with no model call. Pure. */
export function turnStartOwed(state: GameState, seat: string): boolean {
  const last = aiSeat(state, seat).turnStart;
  if (last?.turn === currentTurnNumber(state)) return false;
  if (canBuild(state, seat) || canUnmortgage(state, seat)) return true;
  if (!sharesASet(state, seat)) return false;
  return last === null || last.fingerprint !== turnStartFingerprint(state, seat);
}

/** Whether the seat holds a lot in a color set where another player holds one
 *  too: the only way a trade can complete a set for either of them. */
export function sharesASet(state: GameState, seat: string): boolean {
  return COLORS.some((color) => {
    const owners = groupPositions(color).flatMap((pos) => (pos in state.ownership ? [state.ownership[pos]] : []));
    return owners.includes(seat) && owners.some((owner) => owner !== seat);
  });
}

/** Whether the seat could afford to add a building to any set it owns outright. */
export function canBuild(state: GameState, seat: string): boolean {
  const cash = playerById(state, seat).cash;
  const supply = bankSupply(state);
  return COLORS.some((color) => {
    if (!hasMonopoly(state, color, seat)) return false;
    const lots = groupPositions(color);
    if (lots.some((pos) => state.mortgaged[pos])) return false;
    if (cash < HOUSE_COST[color]) return false;
    const lowest = Math.min(...lots.map((pos) => developmentLevel(state, pos)));
    if (lowest >= 5) return false;
    return lowest === 4 ? supply.hotels > 0 : supply.houses > 0;
  });
}

/** Whether the seat could afford to lift any of its mortgages. */
export function canUnmortgage(state: GameState, seat: string): boolean {
  const cash = playerById(state, seat).cash;
  return Object.entries(state.ownership).some(
    ([pos, owner]) =>
      owner === seat &&
      state.mortgaged[Number(pos)] &&
      (unmortgageCostAt(Number(pos)) ?? Infinity) <= cash,
  );
}
