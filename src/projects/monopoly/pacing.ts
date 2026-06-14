import { botIntent } from "./bots/policy";
import { driverRole } from "./driver";
import type { GameState, Intent } from "./types";

/** Default per-client turn budget. One whole turn — glide to the active
 *  player, slide their token, hold on the landing — plays out over roughly
 *  this long. Per-client local preference (see the store's `turnMs`); this is
 *  the fallback when none is set. */
export const DEFAULT_TURN_MS = 2000;

/** How a turn's time budget splits between its two visible phases. The glide
 *  phase (camera re-anchors on the new active player, then an orient hold) gets
 *  the smaller share; the slide phase (the token moves, then a longer landing
 *  hold) gets the larger — "favor landing over orient". They sum to 1 so a
 *  plain turn (one glide + one slide) totals `TURN_MS`. A doubles turn has an
 *  extra slide and legitimately runs longer; non-visual commits (a bot buy, a
 *  must-raise-cash mortgage) are `settle` transitions that claim no time and
 *  fold into the preceding landing hold. */
const GLIDE_FRACTION = 0.35;
const SLIDE_FRACTION = 0.65;

// Distance scaling for the in-phase animations. The camera glide and token
// slide each run distance-proportionally but are capped *below* their phase
// budget so a hold always remains afterward — the orient hold after a glide,
// the longer landing hold after a slide. The base/step values (ms per px, ms
// per row) carry over the board's hand-tuned feel; the cap keeps them inside
// whatever `TURN_MS` the viewer picked, so a slow pace just lengthens the
// holds rather than the motion.
const GLIDE_ANIM_BASE_MS = 180;
const GLIDE_ANIM_PER_PX = 0.35;
const GLIDE_ANIM_CAP = 0.7; // ≤70% of the glide budget; ≥30% stays orient hold
const SLIDE_ANIM_BASE_MS = 140;
const SLIDE_ANIM_PER_ROW_MS = 40;
const SLIDE_ANIM_CAP = 0.5; // ≤50% of the slide budget; the rest is landing hold

/** One authoritative snapshot in a client's playback buffer: the full
 *  `GameState` at a given optimistic-concurrency `version`. Full snapshots
 *  (never deltas) are what make a dropped or coalesced Realtime update
 *  harmless — the playback head animates across the gap, worst case a snap. */
export interface Snapshot {
  version: number;
  state: GameState;
}

/** What this client should send to the backend to make the active turn
 *  progress: a mechanical `step` (roll / drain to the next decision) or a
 *  decision `intent` proxied for a bot seat. */
export type DriveOp = { kind: "step" } | { kind: "intent"; intent: Intent };

/** The bare turn op for a state, ignoring playback position: the mechanical
 *  beat for the active seat (`pre-roll` → step, `post-roll` → end-turn) when
 *  this client drives it, or the first bot decision a proxied seat owes. A
 *  human's own decisions (buy, raise-cash, trade) are left to their UI, so
 *  this returns null for them. Mirrors the old in-store `pacerOp`. */
function turnOp(state: GameState, myPlayerId: string | null): DriveOp | null {
  if (state.status !== "active") return null;
  if (state.turn.paused) return null;
  const { phase, playerId } = state.turn;

  if (phase === "pre-roll") {
    return driverRole(state, myPlayerId) === "none" ? null : { kind: "step" };
  }
  if (phase === "post-roll") {
    return driverRole(state, myPlayerId) === "none"
      ? null
      : { kind: "intent", intent: { kind: "end-turn", playerId } };
  }
  if (
    phase === "buy-decision" ||
    phase === "must-raise-cash" ||
    phase === "trade-pending"
  ) {
    for (const p of state.players) {
      if (!p.isBot) continue;
      const intent = botIntent(state, p.id);
      if (intent) return { kind: "intent", intent };
    }
  }
  return null;
}

/** The op this client should drive the backend with right now, or null to
 *  wait. The two gating rules from the playback-head design:
 *
 *  1. Drive only when the playback head has caught up to the authoritative
 *     head (`caughtUp`). While snapshots are still queued ahead, this client
 *     is mid-animation and must not run the backend forward into a turn its
 *     eyes haven't reached yet.
 *  2. Drive off the **playback-head** state, not the authoritative state — so
 *     a lagging viewer never fires steps for a turn it hasn't visually
 *     reached. `turnOp` reads `driverRole`, so another connected human's turn
 *     naturally returns null: the row physically cannot advance past that
 *     human until their own client drives it. That makes every human turn a
 *     hard sync barrier where all clients reconverge — no presence or
 *     coordination needed; the CAS still dedups concurrent bot-drivers. */
export function driveOp(
  playHead: GameState,
  caughtUp: boolean,
  myPlayerId: string | null,
): DriveOp | null {
  if (!caughtUp) return null;
  return turnOp(playHead, myPlayerId);
}

/** Which animation a snapshot-to-snapshot transition reads as on screen. */
export type Phase = "glide" | "slide" | "settle";

/** A classified transition: the phase it animates as and how long the
 *  playback head should dwell on it before advancing, derived from the
 *  client's `TURN_MS`. */
export interface Pace {
  phase: Phase;
  durationMs: number;
}

function activePosition(state: GameState, playerId: string): number | undefined {
  return state.players.find((p) => p.id === playerId)?.position;
}

/** Classify a transition between two consecutive snapshots and budget its
 *  time. The active player of the destination snapshot is the subject:
 *
 *  - their seat changed (a handoff) → `glide`: re-anchor the camera on them,
 *    then an orient hold.
 *  - their position changed (a roll, or a doubles re-roll) → `slide`: move the
 *    token, then the longer landing hold.
 *  - neither (a buy, a mortgage, a trade vote) → `settle`: nothing visible
 *    moves, so it claims no time and folds into the preceding landing hold.
 *
 *  Pure and lookahead-free: each transition is classified from just its two
 *  endpoints, yet a plain turn (glide + slide) still totals `TURN_MS` because
 *  the fractions sum to 1 and `settle`s cost nothing. */
export function paceTransition(
  from: GameState,
  to: GameState,
  turnMs: number,
): Pace {
  const activeTo = to.turn.playerId;
  if (activeTo !== from.turn.playerId) {
    return { phase: "glide", durationMs: Math.round(turnMs * GLIDE_FRACTION) };
  }
  if (activePosition(to, activeTo) !== activePosition(from, activeTo)) {
    return { phase: "slide", durationMs: Math.round(turnMs * SLIDE_FRACTION) };
  }
  return { phase: "settle", durationMs: 0 };
}

/** How long the camera glide runs within a `glide` transition — distance
 *  scaled, but always shorter than the glide phase's budget so an orient hold
 *  remains after the camera settles. */
export function glideAnimMs(turnMs: number, distancePx: number): number {
  const budget = turnMs * GLIDE_FRACTION;
  return Math.min(
    budget * GLIDE_ANIM_CAP,
    GLIDE_ANIM_BASE_MS + distancePx * GLIDE_ANIM_PER_PX,
  );
}

/** How long the token slide runs within a `slide` transition — distance scaled
 *  (by board rows), but always shorter than the slide phase's budget so the
 *  longer landing hold remains after the token lands. */
export function slideAnimMs(turnMs: number, rows: number): number {
  const budget = turnMs * SLIDE_FRACTION;
  return Math.min(
    budget * SLIDE_ANIM_CAP,
    SLIDE_ANIM_BASE_MS + Math.abs(rows) * SLIDE_ANIM_PER_ROW_MS,
  );
}

/** Fold a freshly received authoritative snapshot into the playback buffer.
 *  The buffer holds only snapshots strictly ahead of the playback head
 *  (`version > playHeadVersion`), kept sorted ascending and deduplicated by
 *  version — the same version arrives twice routinely (a write's own route
 *  response plus its Realtime echo). A snapshot at or behind the head, or one
 *  already buffered, is dropped (returns the same array reference). Gaps are
 *  fine: full snapshots mean the head can animate straight across a missing
 *  version. */
export function ingestSnapshot(
  buffer: readonly Snapshot[],
  playHeadVersion: number,
  snap: Snapshot,
): readonly Snapshot[] {
  if (snap.version <= playHeadVersion) return buffer;
  if (buffer.some((s) => s.version === snap.version)) return buffer;
  const next = [...buffer, snap];
  next.sort((a, b) => a.version - b.version);
  return next;
}
