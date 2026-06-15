import {
  bankSupply,
  buildingsBlockingMortgage,
  developmentLevel,
  planDevelopment,
} from "./development";
import { firstNegativePlayer } from "./engine";
import { mortgageValueAt, unmortgageCostAt } from "./logic";
import type { DevelopmentNote } from "./development";
import type { GameState, ManageStaged } from "./types";

// `ManageStaged` now lives in the authoritative `GameState` (`turn.manageStaged`)
// and is broadcast like a trade draft; re-exported here so the manage helpers and
// their callers keep a single import site.
export type { ManageStaged };

/** Who the manage UI is acting as: the queued manager during `managing`, or the
 *  current debtor (`firstNegativePlayer`, possibly off-turn) during
 *  `must-raise-cash`. Null when neither phase is active. */
export function manageActorId(state: GameState): string | null {
  const { phase, managerId } = state.turn;
  if (phase === "managing") return managerId ?? null;
  if (phase === "must-raise-cash") return firstNegativePlayer(state);
  return null;
}

/** Apply a staged mortgage map to a copy of the state, so the build planner
 *  previews "unmortgage-then-build" / "mortgage-then-sell" against the world the
 *  player is staging — not the live one. Only the `mortgaged` map changes. */
export function withStagedMortgage(
  state: GameState,
  mortgage: Readonly<Record<number, boolean>>,
): GameState {
  if (Object.keys(mortgage).length === 0) return state;
  const mortgaged: Record<number, boolean> = { ...state.mortgaged };
  for (const [posStr, flag] of Object.entries(mortgage)) {
    if (flag) mortgaged[Number(posStr)] = true;
    else delete mortgaged[Number(posStr)];
  }
  return { ...state, mortgaged };
}

/** Net cash the mortgage side of a staged commit moves: +value for each newly
 *  mortgaged property, −unmortgage-cost for each newly unmortgaged one. Entries
 *  that match the live state are ignored (no-op flips). */
function mortgageNetCash(
  state: GameState,
  mortgage: Readonly<Record<number, boolean>>,
): number {
  let net = 0;
  for (const [posStr, flag] of Object.entries(mortgage)) {
    const pos = Number(posStr);
    const currentlyMortgaged = state.mortgaged[pos] === true;
    if (flag === currentlyMortgaged) continue;
    if (flag) {
      const value = mortgageValueAt(pos);
      if (value !== null) net += value;
    } else {
      const cost = unmortgageCostAt(pos);
      if (cost !== null) net -= cost;
    }
  }
  return net;
}

/** Combined preview of a staged manage commit: the build plan (run against the
 *  state with staged mortgages already applied, so unmortgage-then-build reads
 *  correctly), the combined net cash, and any shortage-liquidation notes.
 *
 *  `ok` is false when the build target itself is illegal (uneven, not a
 *  monopoly, bank short); the caller surfaces the reason and disables Commit. */
export type ManageSummary =
  | {
      ok: true;
      /** +refund / −spend across both build and mortgage sides. */
      netCash: number;
      notes: readonly DevelopmentNote[];
    }
  | { ok: false; reason: string };

export function manageSummary(
  state: GameState,
  playerId: string,
  staged: ManageStaged,
): ManageSummary {
  const previewState = withStagedMortgage(state, staged.mortgage);
  const plan = planDevelopment(previewState, playerId, staged.build);
  if (!plan.ok) return { ok: false, reason: plan.reason };
  // A staged mortgage is illegal while any property in its color set still has
  // a building once the build side runs (official rule). Checked against the
  // build's final levels, so "sell the set's houses then mortgage a lot" passes.
  const finalLevel = (pos: number): number =>
    staged.build[pos] ?? developmentLevel(state, pos);
  for (const [posStr, flag] of Object.entries(staged.mortgage)) {
    const pos = Number(posStr);
    if (!flag || state.mortgaged[pos] === true) continue;
    if (buildingsBlockingMortgage(pos, finalLevel).length > 0) {
      return { ok: false, reason: "sell the set's buildings before mortgaging" };
    }
  }
  const netCash = plan.netCash + mortgageNetCash(state, staged.mortgage);
  return { ok: true, netCash, notes: plan.notes };
}

/** Has the player staged anything that differs from the live state? Drives the
 *  Commit-enabled gate (combined with affordability + plan legality). */
export function hasStagedChanges(state: GameState, staged: ManageStaged): boolean {
  for (const [posStr, level] of Object.entries(staged.build)) {
    if (level !== developmentLevel(state, Number(posStr))) return true;
  }
  for (const [posStr, flag] of Object.entries(staged.mortgage)) {
    if (flag !== (state.mortgaged[Number(posStr)] === true)) return true;
  }
  return false;
}

/** Re-export so the panel reads bank supply from one place. */
export { bankSupply };
