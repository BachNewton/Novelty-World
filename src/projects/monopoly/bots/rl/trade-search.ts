import { builtLotsInGroup, developmentLevel, groupPositions } from "../../development";
import { projectTrade, tradeParticipants } from "../../engine";
import { spaceName } from "../../logic";
import type { GameState, PropertyColor, TradeTerms } from "../../types";
import type { ValueFn } from "./value-net-stub";

// ---------------------------------------------------------------------------
// Value-guided TRADE CONSTRUCTION — the generator the action layer needs for the
// genuinely combinatorial phase. The rule-based bots already do exactly this
// search, scored by `positionValue` (see `versions/claude-v2/trades.ts`); this is
// the same shape scored by an arbitrary `value: ValueFn`, so swapping in a trained
// `V(encode(...))` makes it the learned agent's trade brain.
//
// `bestTrade(state, pid, value)` returns the most valuable monopoly-completing
// deal `pid` could PROPOSE right now that the counterparty would also accept — or
// null. The whole thing is "value + search":
//   - GENERATE candidate asset moves toward completing a set I'm one lot short of:
//     a mutual-completion swap (each side completes a set) and a cash purchase of
//     the missing lot.
//   - SOLVE the cash so the counterparty accepts: the minimal sweetener (binary
//     search) that lifts THEIR value, modeled with the same `value` (the self-play
//     assumption — every seat shares V). Minimal cash = maximal value left for me.
//   - SCORE by my value of the executed outcome (`projectTrade`, the engine's own
//     pure projection, so the what-if equals the real execution) and keep the best.
//
// Capability vs the heuristic stand-in: this can construct and propose any
// completing trade, but the HAND value doesn't model "handing a rival a monopoly
// is bad for me" (the real bots price that explicitly), so the stub may give sets
// away too cheaply. A trained value that predicts WIN probability captures rival
// threat on its own — this generator doesn't need to change.
//
// Termination guards mirror the rule-based bot (one proposal per turn-group; never
// re-pitch an asset bundle that was just declined without sweetening the
// decliner), so a proposing agent can't loop the turn boundary.
// ---------------------------------------------------------------------------

const COLORS: readonly PropertyColor[] = [
  "brown",
  "light-blue",
  "pink",
  "orange",
  "red",
  "yellow",
  "green",
  "dark-blue",
];

function playerCash(state: GameState, pid: string): number {
  return state.players.find((p) => p.id === pid)?.cash ?? 0;
}

function ownedInColor(state: GameState, pid: string, color: PropertyColor): number {
  let n = 0;
  for (const pos of groupPositions(color)) if (state.ownership[pos] === pid) n++;
  return n;
}

/** The board as it would be after `terms` execute — the engine's own pure trade
 *  projection (ownership + cash incl. mortgage interest), so what-if scoring
 *  matches real execution exactly. */
function postTradeState(state: GameState, terms: TradeTerms): GameState {
  const proj = projectTrade(state, terms);
  return {
    ...state,
    ownership: proj.ownership,
    jailFreeCards: proj.jailFreeCards,
    players: state.players.map((p) => ({ ...p, cash: proj.cashById[p.id] ?? p.cash })),
  };
}

/** Base asset terms plus a cash transfer of `x` from `pid` to `oppId`. */
function withCash(base: TradeTerms, pid: string, oppId: string, x: number): TradeTerms {
  return x > 0 ? { ...base, cashDelta: { [pid]: -x, [oppId]: x } } : { ...base, cashDelta: {} };
}

/** Does `oppId`'s value improve under `terms`? The counterparty-acceptance model
 *  (same `value` for every seat — the self-play assumption). */
function oppAccepts(state: GameState, oppId: string, terms: TradeTerms, value: ValueFn): boolean {
  return value(postTradeState(state, terms), oppId) > value(state, oppId);
}

/** The minimal cash sweetener (binary search) that makes `oppId` accept the base
 *  asset moves, or null if `pid` can't afford enough to flip them. Minimal cash =
 *  maximal value retained for `pid`. Assumes the opponent's value is monotonic in
 *  the cash they receive — true for the hand value and typical of a trained one. */
function sweetenFor(
  state: GameState,
  pid: string,
  oppId: string,
  base: TradeTerms,
  value: ValueFn,
): TradeTerms | null {
  if (oppAccepts(state, oppId, withCash(base, pid, oppId, 0), value)) {
    return withCash(base, pid, oppId, 0);
  }
  const cap = playerCash(state, pid);
  if (cap < 1) return null;
  if (!oppAccepts(state, oppId, withCash(base, pid, oppId, cap), value)) return null;
  let lo = 0;
  let hi = cap;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (oppAccepts(state, oppId, withCash(base, pid, oppId, mid), value)) hi = mid;
    else lo = mid;
  }
  return withCash(base, pid, oppId, hi);
}

/** Strict proposability — mirrors the engine's propose validation (every moved lot
 *  owned, building-free, reassigned to a different active player; cash balances;
 *  ≥2 parties) and, stricter on purpose, requires everyone stays cash-non-negative,
 *  so a built offer is never route-rejected. */
function isProposable(state: GameState, terms: TradeTerms): boolean {
  const active = (id: string): boolean => {
    const p = state.players.find((pl) => pl.id === id);
    return p !== undefined && !p.bankrupt;
  };
  let moves = 0;
  for (const [posStr, to] of Object.entries(terms.propertyTo)) {
    const pos = Number(posStr);
    const owner = state.ownership[pos];
    if (!owner || owner === to || !active(to)) return false;
    if (builtLotsInGroup(pos, (p) => developmentLevel(state, p)).length > 0) return false;
    moves += 1;
  }
  if (Object.values(terms.cashDelta).reduce((a, b) => a + b, 0) !== 0) return false;
  if (Object.values(terms.cashDelta).some((v) => v !== 0)) moves += 1;
  if (moves === 0) return false;
  if (tradeParticipants(state, terms).size < 2) return false;
  return postTradeState(state, terms).players.every((p) => p.cash >= 0);
}

/** Stable signature of a trade's ASSET moves (cash excluded) — recognizes a
 *  previously-declined offer regardless of its cash sweetener. */
function assetSignature(terms: TradeTerms): string {
  const props = Object.entries(terms.propertyTo)
    .map(([pos, to]) => `${pos}:${to}`)
    .sort()
    .join(",");
  return `p[${props}]`;
}

/** Has `pid` already attempted a trade in the current turn group? Bounds any
 *  decline loop to one proposal per turn boundary. */
function proposedThisTurn(state: GameState, pid: string): boolean {
  const turn = state.turns[state.turns.length - 1];
  return turn.events.some(
    (e) => (e.kind === "trade" || e.kind === "trade-declined") && e.proposerId === pid,
  );
}

/** Did `pid` propose this exact asset bundle before and get declined, WITHOUT the
 *  new offer adding cash for whoever declined it? A "no" means it wasn't enough —
 *  only re-pitch with more cash for the decliner. */
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

interface Best {
  terms: TradeTerms;
  note: string;
  delta: number;
}

/** The best monopoly-completing trade `pid` should propose now (terms + a reason
 *  note), or null. Considers, per set `pid` is one lot short of: a mutual-completion
 *  swap and a cash purchase of the missing lot — each sweetened to the
 *  counterparty's acceptance and scored by `pid`'s value of the result. */
export function bestTrade(
  state: GameState,
  pid: string,
  value: ValueFn,
): { terms: TradeTerms; note: string } | null {
  if (proposedThisTurn(state, pid)) return null;
  const before = value(state, pid);
  const found: Best[] = [];

  const consider = (base: TradeTerms, oppId: string, note: string): void => {
    const terms = sweetenFor(state, pid, oppId, base, value);
    if (!terms) return;
    if (!isProposable(state, terms)) return;
    if (declinedWithoutImprovement(state, pid, terms)) return;
    const myAfter = value(postTradeState(state, terms), pid);
    if (myAfter <= before) return;
    found.push({ terms, note, delta: myAfter - before });
  };

  for (const color of COLORS) {
    const positions = groupPositions(color);
    if (ownedInColor(state, pid, color) !== positions.length - 1) continue;
    const missing = positions.find((pos) => state.ownership[pos] !== pid);
    if (missing === undefined) continue;
    const oppId = state.ownership[missing];
    if (!oppId || oppId === pid) continue; // unowned → buy on landing, not a trade
    if (builtLotsInGroup(missing, (p) => developmentLevel(state, p)).length > 0) continue;

    // Offer A — mutual completion: a set the opponent is one lot short of, whose
    // missing lot I hold. Both sides complete a monopoly.
    for (const other of COLORS) {
      if (other === color) continue;
      const otherPositions = groupPositions(other);
      if (ownedInColor(state, oppId, other) !== otherPositions.length - 1) continue;
      const oppMissing = otherPositions.find((pos) => state.ownership[pos] !== oppId);
      if (oppMissing === undefined || state.ownership[oppMissing] !== pid) continue;
      if (builtLotsInGroup(oppMissing, (p) => developmentLevel(state, p)).length > 0) continue;
      consider(
        { propertyTo: { [missing]: pid, [oppMissing]: oppId }, gojfTo: {}, cashDelta: {} },
        oppId,
        `swap my ${spaceName(oppMissing)} for ${spaceName(missing)} — we each complete a set`,
      );
    }

    // Offer B — cash for the missing lot.
    consider(
      { propertyTo: { [missing]: pid }, gojfTo: {}, cashDelta: {} },
      oppId,
      `cash for ${spaceName(missing)} to complete my ${color} set`,
    );
  }

  let best: Best | null = null;
  for (const cand of found) {
    if (!best || cand.delta > best.delta) best = cand;
  }
  return best ? { terms: best.terms, note: best.note } : null;
}
