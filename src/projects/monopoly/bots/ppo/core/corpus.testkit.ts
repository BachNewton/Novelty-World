import { autoStep, apply, firstNegativePlayer, isLegal } from "../../../engine";
import { freshGame } from "../../../mocks";
import { driveOp, type BotResolver } from "../../../pacing";
import type { BotStrategy, GameState, Intent, PlayerCount } from "../../../types";
import { forcedRaiseStep } from "../../fallback";
import { botFor } from "../../registry";
import { pendingDecision } from "./decision";

// ---------------------------------------------------------------------------
// TEST-ONLY state corpus. Not imported by any production module — it exists so
// `core/`'s tests can drive the encoder and action space over states that REAL
// games actually reach (developed boards, live auctions, in-flight trades,
// liquidation), rather than a handful of hand-built fixtures.
//
// The driver mirrors the training environment's own advance loop: every beat
// goes through the pacer `driveOp` with a resolver that hands each seat an
// archive bot, and the two phases the
// pacer has no bot answer for are drained mechanically — `must-raise-cash` via
// `forcedRaiseStep`, `raising-cash` via buy-else-`cancel-manage`. Those two are
// exactly the phases `pendingDecision` returns null for, so without the drain
// the corpus would stop dead at the first liquidation and never see a late
// game.
// ---------------------------------------------------------------------------

/** One snapshot: a state a real game passed through, plus who owed the decision
 *  (null for the mechanical phases, which are sampled too so the encoder is
 *  exercised on them). */
export interface Snap {
  state: GameState;
  /** The seat `pendingDecision` named, or null on a mechanical phase. */
  seat: string | null;
  phase: string;
  /** `pendingDecision(state) !== null` — the decision-point flag. */
  decision: boolean;
}

/** Archive labels used to drive the corpus games. A spread of lineages and
 *  eras: different policies decline different buys (→ auctions), arm different
 *  intermissions (→ trade-building / managing) and develop at different rates,
 *  which is what gets the phase histogram off `pre-roll`/`post-roll`. */
export const CORPUS_BOTS: readonly BotStrategy[] = [
  "dumb",
  "claude-v1",
  "claude-v47",
  "jane-v20",
  "fable-v15",
  "opt-v4",
  "kyle-v3",
  "trade-v1",
];

function applyOrThrow(state: GameState, intent: Intent): GameState {
  const result = apply(state, intent);
  if (!result.ok) throw new Error(`intent "${intent.kind}" rejected: ${result.reason}`);
  return result.state;
}

/** Drain the two policy-headless phases exactly as the rig does, or null when
 *  this phase is not one of them. */
function mechanicalStep(state: GameState): GameState | null {
  const { phase } = state.turn;
  if (phase === "must-raise-cash") {
    const debtor = firstNegativePlayer(state);
    if (debtor === null) return autoStep(state).state;
    const forced = forcedRaiseStep(state, debtor);
    return forced === null ? null : applyOrThrow(state, forced);
  }
  if (phase === "raising-cash") {
    const buyer = state.turn.playerId;
    const buy: Intent = { kind: "buy", playerId: buyer };
    return isLegal(state, buy)
      ? applyOrThrow(state, buy)
      : applyOrThrow(state, { kind: "cancel-manage", playerId: buyer });
  }
  if (phase === "managing") {
    const manager = state.turn.managerId;
    if (manager === undefined) return null;
    const cancel: Intent = { kind: "cancel-manage", playerId: manager };
    return isLegal(state, cancel) ? applyOrThrow(state, cancel) : null;
  }
  return null;
}

export interface CorpusOptions {
  /** Distinct game seeds; each also picks the seat→bot assignment. */
  seeds: number;
  /** Hard cap on collected snapshots (the driver stops early once hit). */
  maxSnaps: number;
  /** Engine steps allowed per game before it is abandoned. */
  stepBudget?: number;
  /** Keep at most this many snapshots per (phase) bucket, so the common
   *  `pre-roll` / `post-roll` mass does not crowd out `auction` /
   *  `trade-pending` / `trade-building`. */
  perPhaseCap?: number;
}

/** Play `seeds` games with archive bots in every seat, snapshotting the state at
 *  every decision point (and at the mechanical phases, capped the same way). */
export function buildCorpus(opts: CorpusOptions): Snap[] {
  const perPhaseCap = opts.perPhaseCap ?? 120;
  const stepBudget = opts.stepBudget ?? 20_000;
  const snaps: Snap[] = [];
  const perPhase = new Map<string, number>();

  const take = (state: GameState, seat: string | null, decision: boolean): void => {
    const key = `${state.turn.phase}${decision ? "" : ":mech"}`;
    const n = perPhase.get(key) ?? 0;
    if (n >= perPhaseCap) return;
    perPhase.set(key, n + 1);
    snaps.push({ state, seat, phase: state.turn.phase, decision });
  };

  for (let s = 0; s < opts.seeds && snaps.length < opts.maxSnaps; s++) {
    const count = ((s % 3) + 2) as PlayerCount; // 2, 3, 4 players in rotation
    const seeded = freshGame(`corpus-${s.toString()}`, undefined, count);
    // Seat i gets a bot chosen by (seed, seat) so lineups differ across seeds.
    const lineup = seeded.players.map(
      (_, i) => CORPUS_BOTS[(s + i * 3) % CORPUS_BOTS.length],
    );
    // `freshGame` leaves seat 0 human (`botStrategy: null`); the pacer's
    // `driverRole` then reads that seat as "another connected human", returns
    // "none" at pre-roll, and the game never advances a single beat. Make every
    // seat a proxied bot so the whole board is pacer-driven.
    let state: GameState = {
      ...seeded,
      players: seeded.players.map((p, i) => ({ ...p, botStrategy: lineup[i] })),
    };
    const bySeat = new Map(seeded.players.map((p, i) => [p.id, lineup[i]]));
    const resolver: BotResolver = (_st, playerId) => {
      const label = bySeat.get(playerId);
      return label === undefined ? null : botFor(label);
    };

    for (let guard = 0; guard < stepBudget; guard++) {
      if (state.status !== "active") break;
      if (snaps.length >= opts.maxSnaps) break;
      const decision = pendingDecision(state);
      take(state, decision === null ? null : decision.seatId, decision !== null);

      const op = driveOp(state, true, null, resolver);
      if (op === null) {
        const mech = mechanicalStep(state);
        if (mech === null) break; // genuinely stuck — abandon this game
        state = mech;
        continue;
      }
      const after =
        op.kind === "step" ? autoStep(state).state : applyOrThrow(state, op.intent);
      if (after === state) {
        const mech = mechanicalStep(state);
        if (mech === null) break;
        state = mech;
        continue;
      }
      state = after;
    }
  }
  return snaps;
}

/** Snapshot count per `phase[:mech]` bucket — the coverage evidence a raw corpus
 *  size does not give. */
export function phaseHistogram(snaps: readonly Snap[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of snaps) {
    const key = `${s.phase}${s.decision ? "" : ":mech"}`;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}
