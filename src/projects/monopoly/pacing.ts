import { BOTS, type Bot } from "./bots/registry";
import { driverRole } from "./driver";
import type { GameState, Intent } from "./types";

/** Default per-client turn budget. One whole turn — glide to the active
 *  player, slide their token, hold on the landing — plays out over roughly
 *  this long. Per-client local preference (see the store's `turnMs`); this is
 *  the fallback when none is set. */
export const DEFAULT_TURN_MS = 2500;

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
// slide each run distance-proportionally and are capped *below* their phase
// budget so a hold always remains afterward — the orient hold after a glide,
// the longer landing hold after a slide. The base/step values (ms per px, ms
// per row) are the board's hand-tuned feel at `MOTION_REFERENCE_MS`; both the
// tuned duration and the cap scale linearly with the viewer's `turnMs`, so a
// slower pace stretches the motion and its trailing hold together (the whole
// turn slows down) rather than darting at a fixed speed into a longer wait.
//
// The reference is fixed (not `DEFAULT_TURN_MS`) on purpose: the default pace
// is a separate, tunable knob, and tying the scale to it would re-anchor "1×"
// to whatever the default is — so changing the default would only lengthen the
// holds and leave the motion speed put, the exact plateau this scaling removes.
const MOTION_REFERENCE_MS = 2000;
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

/** Resolve the bot policy for a seat, or null if the seat isn't a bot. Injected
 *  into `turnOp` / `driveOp` (defaulting to the strategy registry) so a test can
 *  supply a policy that exercises the proactive path without standing up a real
 *  bot strategy. */
export type BotResolver = (state: GameState, playerId: string) => Bot | null;

const registryBot: BotResolver = (state, playerId) => {
  const p = state.players.find((pl) => pl.id === playerId);
  return p && p.botStrategy !== null ? BOTS[p.botStrategy] : null;
};

/** Whether a `set-queue` arm would be a no-op against the current queue (the
 *  bot is already armed / already not armed for that kind). The engine treats
 *  the redundant arm as an idempotent no-op, but submitting it still bumps the
 *  version and re-triggers the drive — so an already-armed bot would spin.
 *  Skipping it lets the pacer fall through to `step`, which is what drains the
 *  armed queue into its intermission. */
function isNoOpArm(
  state: GameState,
  intent: Extract<Intent, { kind: "set-queue" }>,
): boolean {
  const present = state.boundaryQueue.some(
    (e) => e.playerId === intent.playerId && e.kind === intent.queue,
  );
  return intent.armed === present;
}

/** The bare turn op for a state, ignoring playback position: the mechanical
 *  beat for the active seat (`pre-roll` → step, `post-roll` → end-turn) when
 *  this client drives it, or the intent a proxied BOT seat owes. A bot policy is
 *  consulted in three roles:
 *  - its reactive decision phases (`buy-decision`, `auction`, `must-raise-cash`,
 *    `trade-pending`, `jail-decision`), some of which can wait on an OFF-turn
 *    bot (a bidder, a trade debtor, a vote);
 *  - its own `pre-roll`, where the policy may PROACTIVELY arm a boundary action
 *    (build / propose-trade) via a `set-queue` intent before rolling;
 *  - a `managing` / `trade-building` intermission whose actor is a bot, which
 *    the policy drives to a commit (cancelling as a fallback).
 *  A human's own decisions (buy, raise-cash, manage, trade) are left to their
 *  UI, so this returns null for them. */
function turnOp(
  state: GameState,
  myPlayerId: string | null,
  botFor: BotResolver,
): DriveOp | null {
  if (state.status !== "active") return null;
  const { phase, playerId } = state.turn;

  if (phase === "pre-roll") {
    const role = driverRole(state, myPlayerId);
    if (role === "none") return null;
    // A bot's own pre-roll: let its policy arm a boundary action before rolling.
    // Only a `set-queue` arm is honored here (the one proactive move legal at
    // pre-roll), and only when it actually changes the queue. Off-turn
    // bot-initiated actions are out of scope — only the active bot is consulted.
    if (role === "proxy") {
      const bot = botFor(state, playerId);
      const arm = bot ? bot(state, playerId) : null;
      if (arm && arm.kind === "set-queue" && !isNoOpArm(state, arm)) {
        return { kind: "intent", intent: arm };
      }
    }
    return { kind: "step" };
  }
  if (phase === "post-roll") {
    return driverRole(state, myPlayerId) === "none"
      ? null
      : { kind: "intent", intent: { kind: "end-turn", playerId } };
  }
  if (phase === "jail-decision") {
    // A human in jail decides via their own UI (pay / card / roll), so only a
    // proxied (bot / disconnected) seat is driven here: pay or use a card per
    // the policy, else step the jail roll (the policy returns null for "roll").
    if (driverRole(state, myPlayerId) !== "proxy") return null;
    const bot = botFor(state, playerId);
    const intent = bot ? bot(state, playerId) : null;
    return intent ? { kind: "intent", intent } : { kind: "step" };
  }
  if (
    phase === "buy-decision" ||
    phase === "must-raise-cash" ||
    phase === "trade-pending" ||
    phase === "auction"
  ) {
    // These phases can wait on an OFF-turn seat (the current bidder, a debtor
    // after a trade, a vote), so iterate every bot rather than only the active
    // one. A bot policy returns null unless this bot is the one being waited on.
    for (const p of state.players) {
      const bot = botFor(state, p.id);
      if (!bot) continue;
      const intent = bot(state, p.id);
      if (intent) return { kind: "intent", intent };
    }
    return null;
  }
  // A boundary intermission whose ACTOR is a bot — drive it to a commit. A
  // human's own intermission (actor not a bot) is driven by their UI, so this
  // returns null for it. A bot that armed an intermission must resolve it; if
  // its policy returns null (a not-yet-implemented or misbehaving policy),
  // cancel rather than wedge the game by stalling the phase forever.
  if (phase === "managing") {
    const actor = state.turn.managerId;
    if (actor === undefined) return null;
    const bot = botFor(state, actor);
    if (!bot) return null;
    const intent = bot(state, actor) ?? { kind: "cancel-manage", playerId: actor };
    return { kind: "intent", intent };
  }
  if (phase === "trade-building") {
    const actor = state.turn.tradeDraft?.proposerId;
    if (actor === undefined) return null;
    const bot = botFor(state, actor);
    if (!bot) return null;
    const intent = bot(state, actor) ?? { kind: "cancel-trade", playerId: actor };
    return { kind: "intent", intent };
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
  botFor: BotResolver = registryBot,
): DriveOp | null {
  if (!caughtUp) return null;
  return turnOp(playHead, myPlayerId, botFor);
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

/** How long the camera glide runs within a `glide` transition — scaled by both
 *  distance and the viewer's `turnMs` (tuned at `MOTION_REFERENCE_MS`), but
 *  always shorter than the glide phase's budget so an orient hold remains after
 *  the camera settles. */
export function glideAnimMs(turnMs: number, distancePx: number): number {
  const scale = turnMs / MOTION_REFERENCE_MS;
  const budget = turnMs * GLIDE_FRACTION;
  return Math.min(
    budget * GLIDE_ANIM_CAP,
    (GLIDE_ANIM_BASE_MS + distancePx * GLIDE_ANIM_PER_PX) * scale,
  );
}

/** How long the token slide runs within a `slide` transition — scaled by both
 *  distance (board rows) and the viewer's `turnMs` (tuned at
 *  `MOTION_REFERENCE_MS`), but always shorter than the slide phase's budget so
 *  the longer landing hold remains after the token lands. */
export function slideAnimMs(turnMs: number, rows: number): number {
  const scale = turnMs / MOTION_REFERENCE_MS;
  const budget = turnMs * SLIDE_FRACTION;
  return Math.min(
    budget * SLIDE_ANIM_CAP,
    (SLIDE_ANIM_BASE_MS + Math.abs(rows) * SLIDE_ANIM_PER_ROW_MS) * scale,
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
