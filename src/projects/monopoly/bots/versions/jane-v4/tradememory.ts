import type { GameState } from "../../../types";

/**
 * Trade memory — structural anti-churn gate for jane-v4.
 *
 * The hot-potato ring: bots compete for the premium-collector position on a
 * rival's set-completer lot. Turn after turn, the lot rotates among non-rivals
 * as each bot tries to be the one holding it when the rival pays out. Each hop
 * is net-zero but wastes turns and produces indecisive games.
 *
 * v35 fixed this with pricing symmetry (denialPositionCost). jane-v4 fixes it
 * structurally: don't PROPOSE to acquire a lot that recently changed hands via
 * trade unless something material changed on the board.
 *
 * This helper scans the turn log for trades involving `pos` within the last
 * `window` turns. If found, the lot is "hot" and should not be re-acquired
 * for denial purposes — the premium-collection rotation is unproductive.
 *
 * Unlike v34's temporal cooldown (which blocked ALL re-trades and made the
 * bot stop collecting premiums entirely), this only blocks DENIAL trades
 * (Offer C). Completion trades (Offer A/B) are always allowed — completing
 * your own monopoly is a genuine structural reason to acquire a lot.
 */

/** How many recent turns to scan for trade churn. */
const CHURN_WINDOW = 8;

/**
 * Returns true if `pos` changed hands via trade within the last CHURN_WINDOW
 * turns. Used to suppress denial-only re-acquisition of recently-churned lots.
 */
export function recentlyTraded(state: GameState, pos: number): boolean {
  const turns = state.turns;
  if (turns.length === 0) return false;
  const currentTurn = turns[turns.length - 1].turn;
  for (let i = turns.length - 1; i >= 0; i--) {
    const tg = turns[i];
    if (currentTurn - tg.turn > CHURN_WINDOW) break;
    for (const ev of tg.events) {
      if (ev.kind === "trade" || ev.kind === "trade-declined") {
        if (pos in ev.propertyFrom || pos in ev.propertyTo) return true;
      }
    }
  }
  return false;
}

/**
 * Returns the set of positions that recently changed hands via trade.
 * More efficient than calling recentlyTraded per-position when checking
 * multiple candidates.
 */
export function recentTradeLots(state: GameState): Set<number> {
  const turns = state.turns;
  const hot = new Set<number>();
  if (turns.length === 0) return hot;
  const currentTurn = turns[turns.length - 1].turn;
  for (let i = turns.length - 1; i >= 0; i--) {
    const tg = turns[i];
    if (currentTurn - tg.turn > CHURN_WINDOW) break;
    for (const ev of tg.events) {
      if (ev.kind === "trade" || ev.kind === "trade-declined") {
        for (const posStr of Object.keys(ev.propertyFrom)) hot.add(Number(posStr));
        for (const posStr of Object.keys(ev.propertyTo)) hot.add(Number(posStr));
      }
    }
  }
  return hot;
}
