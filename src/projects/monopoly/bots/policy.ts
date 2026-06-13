import { mortgageValueAt, ownablePrice } from "../logic";
import type { GameState, Intent } from "../types";

/** Baseline bot policy: the decisions a human would otherwise make on their
 *  own turn. The store's auto-pacer calls this only as a "proxy" driver — for
 *  a bot seat or an absent human's turn (see `driver.ts`). A "self" driver
 *  leaves these phases to the live player's UI.
 *
 *  Returns one intent for a decision phase, or null when there's nothing to
 *  decide (the pacer drives mechanics with a `step` instead). Pure: same
 *  shape as the `Bot` interface sketched in `monopoly/CLAUDE.md`, so a smarter
 *  rule-based or learned policy can drop in here later.
 *
 *  Covers the two proxy-only decision phases:
 *  - `buy-decision`: buy whenever affordable, otherwise decline.
 *  - `must-raise-cash`: mortgage the cheapest un-mortgaged, building-free
 *    property — one per call. The engine auto-settles the debt once cash
 *    crosses the threshold, so the pacer fires again until the phase exits.
 *
 *  Mechanical phases (`pre-roll` → step, `post-roll` → end-turn) are handled by
 *  the pacer itself, not here, because they apply to "self" drivers too. */
export function botIntent(state: GameState, playerId: string): Intent | null {
  if (state.turn.playerId !== playerId) return null;
  const { phase, pendingBuy, pendingDebt } = state.turn;

  if (phase === "buy-decision" && pendingBuy !== undefined) {
    const player = state.players.find((p) => p.id === playerId);
    const price = ownablePrice(pendingBuy);
    if (!player || price === null) return null;
    return player.cash >= price
      ? { kind: "buy", playerId }
      : { kind: "decline-buy", playerId };
  }

  if (phase === "must-raise-cash" && pendingDebt) {
    const cheapest = cheapestMortgageable(state, playerId);
    if (cheapest === null) return null;
    return { kind: "mortgage", playerId, position: cheapest };
  }

  return null;
}

/** Position of the cheapest un-mortgaged, building-free property the player
 *  owns, or null if none can be mortgaged. Cheapest first preserves the more
 *  valuable assets for as long as possible — pure heuristic, swap in a real
 *  policy when bots learn. */
function cheapestMortgageable(
  state: GameState,
  playerId: string,
): number | null {
  let best: { pos: number; value: number } | null = null;
  for (const [posStr, ownerId] of Object.entries(state.ownership)) {
    if (ownerId !== playerId) continue;
    const pos = Number(posStr);
    if (state.mortgaged[pos]) continue;
    if (state.houses[pos]) continue;
    const value = mortgageValueAt(pos);
    if (value === null) continue;
    if (!best || value < best.value) best = { pos, value };
  }
  return best?.pos ?? null;
}
