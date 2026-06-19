import { BOTS, type Bot, type BotDecision } from "./bots/registry";
import { deckFor } from "./data";
import { driverRole } from "./driver";
import { hasPendingBoundary } from "./engine";
import type { CardSource, GameEvent, GameState, Intent } from "./types";

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

// A `redirect` turn — a roll that relocated the mover after they landed (an
// "advance to" / "back 3" card, or a Go-to-Jail tile / card) — plays in two
// visible beats: the rolled landing, a pause, then the redirect. Each beat is a
// slide phase, so the pause is the held breath between them and is budgeted as
// its own fraction on top. A non-jail redirect is two slides + a pause (~2× a
// plain turn, matching how a doubles re-roll reads — roll, move, pause, roll,
// move). A jail redirect is one slide onto the square, the pause, then — because
// "do not pass GO" forbids sliding the token there — a SNAP into the cell with
// the camera gliding to follow it (so the viewer still sees where they went),
// a hold, and finally the hand-off glide to the next player. Three-doubles is
// NOT a redirect — the engine never moves the token, so its existing
// snap-to-jail + glide is already right.
const REDIRECT_PAUSE_FRACTION = 0.3;

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
 *  decision `intent` proxied for a bot seat. A proxied bot decision may carry a
 *  `note` — the bot's reasoning — which the store prepends as a `bot-note`
 *  intent in the SAME atomic submit, so the explanation lands just before the
 *  action in the log. Pacer-internal intents (end-turn, the stall-fallback
 *  cancels) carry no note. */
export type DriveOp =
  | { kind: "step" }
  | { kind: "intent"; intent: Intent; note?: string };

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

/** Turn a bot's `BotDecision` into a proxied drive op, carrying its reasoning
 *  note through to the store (which logs it). */
function opFor(decision: BotDecision): DriveOp {
  return { kind: "intent", intent: decision.intent, note: decision.note };
}

/** The bare turn op for a state, ignoring playback position: the mechanical
 *  beat for the active seat (`pre-roll` → step, `post-roll` → end-turn) when
 *  this client drives it, or the decision a proxied BOT seat owes. A bot policy
 *  is consulted in these roles:
 *  - its reactive decision phases (`buy-decision`, `auction`, `raising-cash`,
 *    `must-raise-cash`, `trade-pending`, `jail-decision`), some of which can
 *    wait on an OFF-turn bot (a bidder, a trade debtor, a vote);
 *  - `pre-roll`, where the ACTIVE bot may arm its own build/trade AND any
 *    OFF-TURN bot may arm a trade at this turn boundary (a `set-queue` arm — the
 *    engine opens a queued intermission for whoever armed it, even off-turn);
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
    // role "none" = the active seat is another connected human; their client is
    // the sole driver of this boundary (including any off-turn bot arming that
    // rides on it), so we stay out.
    if (role === "none") return null;
    // Proactive arming: consult every bot — the ACTIVE bot for its own
    // build/trade, and any OFF-TURN bot for a trade it wants to open at this
    // turn boundary. The active player's own client is the single driver, so
    // off-turn arms ride on it; the engine opens the queued intermission for the
    // arming seat regardless of whose turn it is. Only a state-changing
    // `set-queue` arm is honored here (the lone proactive move legal at
    // pre-roll); a redundant arm the queue already reflects is skipped so the
    // pacer falls through to `step`, which drains the queue into the intermission.
    for (const p of state.players) {
      const bot = botFor(state, p.id);
      if (!bot) continue;
      const decision = bot(state, p.id);
      if (
        decision &&
        decision.intent.kind === "set-queue" &&
        !isNoOpArm(state, decision.intent)
      ) {
        return opFor(decision);
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
    // The jail decision is a pre-roll-like boundary: if anyone has armed a trade
    // / manage (the jailed player choosing to act before rolling, or an off-turn
    // player), drive the step that opens it — the active player's own client
    // drives this boundary, so it's gated like pre-roll (skip when another
    // connected human is active). The intermission resolves back to the jail
    // decision since the player is still jailed.
    if (driverRole(state, myPlayerId) !== "none" && hasPendingBoundary(state)) {
      return { kind: "step" };
    }
    // Otherwise a human decides via their own UI (pay / card / roll); only a
    // proxied (bot / disconnected) seat is driven: pay or use a card per the
    // policy, else step the jail roll (the policy returns null for "roll").
    if (driverRole(state, myPlayerId) !== "proxy") return null;
    const bot = botFor(state, playerId);
    const decision = bot ? bot(state, playerId) : null;
    return decision ? opFor(decision) : { kind: "step" };
  }
  if (phase === "raising-cash") {
    // The active buyer staging a cash-raise to afford a landed-on property. Only
    // a bot buyer is driven (a human uses their own raise-cash UI); the buyer is
    // always the active player, so gate on proxy. A stalled policy cancels back
    // to the buy-decision (where it then declines) rather than wedging the phase.
    if (driverRole(state, myPlayerId) !== "proxy") return null;
    const bot = botFor(state, playerId);
    const decision = bot ? bot(state, playerId) : null;
    return decision
      ? opFor(decision)
      : { kind: "intent", intent: { kind: "cancel-manage", playerId } };
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
      const decision = bot(state, p.id);
      if (decision) return opFor(decision);
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
    const decision = bot(state, actor);
    return decision
      ? opFor(decision)
      : { kind: "intent", intent: { kind: "cancel-manage", playerId: actor } };
  }
  if (phase === "trade-building") {
    const actor = state.turn.tradeDraft?.proposerId;
    if (actor === undefined) return null;
    const bot = botFor(state, actor);
    if (!bot) return null;
    const decision = bot(state, actor);
    return decision
      ? opFor(decision)
      : { kind: "intent", intent: { kind: "cancel-trade", playerId: actor } };
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

/** Which animation a snapshot-to-snapshot transition reads as on screen. A
 *  `redirect` is a roll that relocated the mover (card / Go-to-Jail tile): it
 *  plays the rolled landing, a pause, then the redirect — see `classifyRedirect`
 *  and the legs in `components/squares.tsx`. */
export type Phase = "glide" | "slide" | "settle" | "redirect";

/** How the mover reaches their resolved square from the square the dice rolled
 *  them onto:
 *  - `forward` / `back`: a second slide that way ("advance to" wraps forward the
 *    long way; "back 3" steps backward).
 *  - `jail`: a snap, not a slide — "go directly to Jail, do not pass GO". The
 *    token never travels the board to the Jail cell. */
export type RedirectFinish = "forward" | "back" | "jail";

/** A roll that moved the mover somewhere other than where the dice landed —
 *  the second, redirecting leg of the turn. Classified from the destination
 *  snapshot's event log + the mover's pre-roll square. */
export interface RedirectMove {
  /** The square the dice rolled the mover onto (the first leg's landing). */
  rolledTo: number;
  /** The square they ended the beat on (the second leg's landing). */
  resolved: number;
  /** How the second leg reaches `resolved`. */
  finish: RedirectFinish;
  /** True when the beat also ended the mover's turn (a Go-to-Jail), so the
   *  camera glides on to the next active player once the legs finish. */
  handoff: boolean;
}

/** The mover's current-turn event group in a destination snapshot — the last
 *  group that is theirs (a Go-to-Jail ends the turn and opens the next player's
 *  empty group after it, so it isn't always the trailing one). */
function currentTurnEvents(
  to: GameState,
  moverId: string,
): readonly GameEvent[] | null {
  for (let i = to.turns.length - 1; i >= 0; i--) {
    if (to.turns[i].playerId === moverId) return to.turns[i].events;
  }
  return null;
}

function lastRollTo(events: readonly GameEvent[]): number | null {
  let toPos: number | null = null;
  for (const e of events) if (e.kind === "roll") toPos = e.toPosition;
  return toPos;
}

function cardEffectKind(source: CardSource, cardId: string): string | null {
  return deckFor(source).find((c) => c.id === cardId)?.effect.kind ?? null;
}

/** Classify the mover's move in a transition as a redirect, or null when it's a
 *  plain move (or no move at all). The mover is the player who held the dice —
 *  `from.turn.playerId` for the caller — and `startPos` is their pre-roll
 *  square. A redirect is exactly: the mover moved this beat (`startPos` differs
 *  from where they ended), and the dice landed them somewhere other than that
 *  end square. Three-doubles is deliberately excluded: the engine jails without
 *  ever moving the token, so its plain snap-to-jail + hand-off glide already
 *  reads correctly and needs no two-leg playback. Pure — reads only the
 *  destination snapshot + the supplied pre-roll square. */
export function classifyRedirect(
  to: GameState,
  moverId: string,
  startPos: number,
): RedirectMove | null {
  const resolved = to.players.find((p) => p.id === moverId)?.position;
  if (resolved === undefined || resolved === startPos) return null;

  const events = currentTurnEvents(to, moverId);
  if (!events) return null;
  const rolledTo = lastRollTo(events);
  if (rolledTo === null || rolledTo === resolved) return null;

  const jail = events.find(
    (e): e is Extract<GameEvent, { kind: "go-to-jail" }> =>
      e.kind === "go-to-jail",
  );
  if (jail) {
    // The would-be-moved-then-jailed cases. Three-doubles never moved the
    // token, so it's not a redirect — leave it to the plain glide path.
    if (jail.reason === "three-doubles") return null;
    return { rolledTo, resolved, finish: "jail", handoff: true };
  }

  // A relocating card (advance-to / advance-nearest / back-three). Back-three is
  // the lone backward move; everything else advances forward (wrapping past GO
  // the long way when needed). The drawn card's effect is the reliable signal —
  // a forward "advance to" can span the same row distance as "back 3".
  const card = events.find(
    (e): e is Extract<GameEvent, { kind: "card-drawn" }> =>
      e.kind === "card-drawn",
  );
  const kind = card ? cardEffectKind(card.source, card.cardId) : null;
  return {
    rolledTo,
    resolved,
    finish: kind === "back-three" ? "back" : "forward",
    handoff: false,
  };
}

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
  // A redirect (card / Go-to-Jail relocation) is budgeted first: it can present
  // either as a same-player two-slide or, for a Go-to-Jail, as a hand-off — so
  // it has to be recognised before the plain glide / slide split below.
  const mover = from.turn.playerId;
  const startPos = activePosition(from, mover);
  if (startPos !== undefined) {
    const redirect = classifyRedirect(to, mover, startPos);
    if (redirect) {
      return { phase: "redirect", durationMs: redirectDwell(turnMs, redirect) };
    }
  }

  const activeTo = to.turn.playerId;
  if (activeTo !== from.turn.playerId) {
    return { phase: "glide", durationMs: Math.round(turnMs * GLIDE_FRACTION) };
  }
  if (activePosition(to, activeTo) !== activePosition(from, activeTo)) {
    return { phase: "slide", durationMs: Math.round(turnMs * SLIDE_FRACTION) };
  }
  return { phase: "settle", durationMs: 0 };
}

/** The playback dwell a redirect turn earns. A non-jail relocation is two slides
 *  plus the inter-leg pause. A Go-to-Jail is one slide onto the square, the
 *  pause, the camera glide that reveals the snapped token in the Jail cell with
 *  its own hold, then the hand-off glide to the next player (the snap itself
 *  claims no slide). Both scale with the viewer's `turnMs`, the same as every
 *  other transition's budget.
 *
 *  The board's `advanceFrom` (components/squares.tsx) independently sequences
 *  the motion from the same per-phase anim helpers (`slideAnimMs`, `glideAnimMs`,
 *  `redirectPauseMs`), so this budget MUST cover that sequence or the next
 *  snapshot would arrive mid-animation and snap. The two live far apart; the
 *  "budgets enough dwell to cover the animation sequence" test in
 *  `pacing.test.ts` asserts the played sequence never outruns this dwell. */
function redirectDwell(turnMs: number, redirect: RedirectMove): number {
  const fraction = redirect.handoff
    ? SLIDE_FRACTION + GLIDE_FRACTION * 2 + REDIRECT_PAUSE_FRACTION * 2
    : SLIDE_FRACTION * 2 + REDIRECT_PAUSE_FRACTION;
  return Math.round(turnMs * fraction);
}

/** How long the board holds the token on the rolled square between a redirect's
 *  two legs (the "do not pass GO" beat before a Go-to-Jail, or before the second
 *  slide of a card move). Scales with `turnMs` so the pause stays proportional
 *  to the viewer's pace. The board reads it so its pause matches the dwell
 *  `redirectDwell` budgeted. */
export function redirectPauseMs(turnMs: number): number {
  return Math.round(turnMs * REDIRECT_PAUSE_FRACTION);
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
