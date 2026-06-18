"use client";

import { create } from "zustand";
import type { PlayerProfile } from "@/shared/lib/profile";
import {
  colorAt,
  developmentLevel,
  groupPositions,
} from "./development";
import { apply } from "./engine";
import { type LobbyOp, lobbyReduce } from "./lobby";
import { hasMonopoly } from "./logic";
import { isRaiseOnly, manageActorId } from "./manage";
import { freshGame } from "./mocks";
import {
  DEFAULT_TURN_MS,
  driveOp,
  ingestSnapshot,
  paceTransition,
  type Snapshot,
} from "./pacing";
import type { DevCommand, MonopolyAction, MonopolyResult } from "./protocol";
import { rebuildLobbyOverlay, rebuildOverlay } from "./reconcile";
import { loadGame, submitAction, subscribeGame, type LoadedGame } from "./sync";
import type {
  ApplyResult,
  CardSource,
  GameState,
  Intent,
  PlayerColor,
  PlayerIcon,
} from "./types";

// Per-client playback pacing (buffer + playback head) lives at the bottom of
// this file; the turn budget it spends is `turnMs`, defaulting to
// `DEFAULT_TURN_MS` from `pacing.ts`.

interface MonopolyActions {
  /** Set this client's player id (assigned during lobby join). */
  setMyPlayer: (playerId: string) => void;

  /** Lobby: seat the local profile in the connected lobby, auto-assigning
   *  the first free color + icon. No-op offline or without a connected game.
   *  Server-validated (lobby still open, not full); the authoritative seat
   *  arrives via the route response / subscription. */
  joinGame: () => void;

  /** Lobby: add a bot seat to the connected lobby. */
  addBot: () => void;

  /** Lobby: remove a seat — a leaving human or a kicked bot. */
  removePlayer: (playerId: string) => void;

  /** Lobby: change a seat's token color (rejected server-side if taken). */
  setColor: (playerId: string, color: PlayerColor) => void;

  /** Lobby: change a seat's token icon (rejected server-side if taken). */
  setIcon: (playerId: string, icon: PlayerIcon) => void;

  /** Lobby: rename a seat. */
  setName: (playerId: string, name: string) => void;

  /** Lobby: flip the connected lobby into play (≥2 players, ≥1 human). */
  startGame: () => void;

  /** Manage staging: advance a property's staged build level through the cycle
   *  0 → 1 → 2 → 3 → 4 → hotel(5) → 0, submitting the updated staging snapshot.
   *  Only acts when the local player is the manage actor (the queued manager, or
   *  the debtor in must-raise-cash) and the property is buildable — a full,
   *  unmortgaged monopoly they own. In the forced must-raise-cash branch only
   *  DECREASES are allowed (sell down to raise cash), wrapping back to the live
   *  level rather than building up. Prunes the entry when it lands back on the
   *  live level. Staging lives in synced `turn.manageStaged`, so every player
   *  watches it change. */
  cycleBuild: (position: number) => void;

  /** Manage staging: toggle a property's staged mortgaged flag (submitting the
   *  updated staging snapshot), for a property the manage actor owns. Skips a
   *  property that still has buildings staged or live (mortgaging requires it
   *  building-free — the engine validates finally, but the toggle is offered only
   *  on a bare lot). Prunes the entry when it lands back on the live mortgaged
   *  flag. */
  toggleMortgage: (position: number) => void;

  /** Commit the staged manage intermission as one atomic `manage` intent,
   *  carrying only the build levels and mortgage flags that DIFFER from the live
   *  state. The engine applies it raise-first / spend-second, all-or-nothing, and
   *  the phase transition it triggers drops the synced staging. */
  commitManage: () => void;

  /** Buy the landed-on property — from `buy-decision` (paying outright) or from
   *  `raising-cash` (committing the staged cash-raise). The buy intent carries no
   *  raise of its own: the engine reads any staging straight from synced
   *  `turn.manageStaged` and applies it raise-first, atomically with the
   *  purchase. */
  buyProperty: () => void;

  /** Step from a `buy-decision` into `raising-cash` — the buyer is short and
   *  wants to sell buildings / mortgage their OTHER lots to afford the property.
   *  Opens an empty staging they then drive on the board (raise-only). */
  raiseCash: () => void;

  /** Toggle a boundary intermission for the local player — arms/disarms a spot
   *  in the FIFO boundary queue for the given kind ("trade" or "manage"). Fires
   *  at the next unpaused pre-roll. */
  toggleQueue: (queue: "trade" | "manage") => void;

  /** Abandon the local player's open manage intermission, returning to the
   *  pre-roll boundary. */
  cancelManage: () => void;

  /** Trade-building (proposer only): cycle a property's staged owner through
   *  the players and back to no-change, submitting the updated draft. The
   *  board row IS the control, mirroring mortgage staging. */
  cycleTradeProperty: (position: number) => void;

  /** Trade-building (proposer only): cycle a held Get-Out-of-Jail card's
   *  staged holder, submitting the updated draft. */
  cycleTradeGojf: (source: CardSource) => void;

  /** Trade-building (proposer only): add `step` (may be negative) to a
   *  player's staged net cash delta, submitting the updated draft. */
  bumpTradeCash: (playerId: string, step: number) => void;

  /** Trade-building (proposer only): finalize the current draft into a
   *  proposal awaiting approval. */
  proposeTrade: () => void;

  /** Abandon the trade being built or proposed (proposer only), returning to
   *  the pre-roll boundary. */
  cancelTrade: () => void;

  /** Approve / reject the pending proposal as the local player (must be a
   *  named party). All approvals execute it; any decline cancels it. */
  acceptTrade: () => void;
  declineTrade: () => void;

  /** Submit a local UI intent **optimistically**: apply it to the display head
   *  at once for instant feedback, then POST it to the route. The authoritative
   *  result reconciles through the playback pipeline; a conflict or rejection
   *  silently rolls the prediction back to the confirmed head (the DB is the
   *  source of truth). Needs a connected game id; the route-side engine still
   *  enforces turn ownership, so a misdirected intent is simply rejected. */
  submit: (intent: Intent) => ApplyResult;

  /** Submit a pacer-driven intent (an `end-turn` beat, a proxied bot decision)
   *  WITHOUT prediction. These advance authoritative mechanics off the
   *  confirmed head and must never be speculatively applied to the display. */
  driveIntent: (intent: Intent) => void;

  /** Advance mechanics by one unit without an intent — the paced loop's
   *  heartbeat. POSTs a `step` to the route. No-op without a connected game
   *  id. Driver eligibility is decided by the pacer, not here. */
  step: () => void;

  /** Submit a debug command (the `dev` hotkeys). The route applies it only
   *  for the reserved `dev` game; any other game ignores it. */
  devCommand: (command: DevCommand) => void;

  /** Set this client's per-turn playback budget (ms) and persist it locally.
   *  Drives how long each turn's glide + slide + holds take to play out — a
   *  purely local preference, never synced. Clamped to a sane range. */
  setTurnMs: (turnMs: number) => void;

  /** Replace local state with authoritative state (from the subscription or
   *  a route response) at the given version. Re-derives membership from the
   *  incoming roster — a reseated game may change who the local user is. */
  applyStateUpdate: (state: GameState, version: number) => void;

  /** Connect to a game. If the row is absent the caller seeds it — a fresh
   *  **lobby** seating themselves, or (for the reserved `dev` id) an
   *  immediate-play game. If the row exists, it loads as is — membership
   *  (whether the profile id matches a seated player) decides `myPlayerId`;
   *  non-members subscribe as read-only spectators and can `joinGame` while
   *  it's still a lobby. */
  connect: (opts: { gameId: string; profile: PlayerProfile }) => Promise<void>;

  /** Tear down any subscription and park the store with no game selected
   *  (the lobby browser's resting state). Safe to call when already parked. */
  disconnect: () => void;
}

export type MonopolyStore = {
  myPlayerId: string | null;
  /** The **display** state — exactly what this client renders, and the only
   *  state components read. It's the optimistic `optimistic` overlay while a
   *  local prediction is outstanding, otherwise the confirmed playback head
   *  (`headState`). The parked default is a throwaway `freshGame()`. */
  state: GameState;
  /** The confirmed **playback head** — the authoritative state this client has
   *  animated up to, which trails the authoritative head by the snapshots still
   *  queued in `buffer`. The pacer drives off THIS, never the optimistic
   *  overlay, so a wrong prediction can never feed the engine forward. */
  headState: GameState;
  /** FIFO of authoritative snapshots received but not yet animated — the
   *  stretch between the playback head (`state`/`version`) and the
   *  authoritative head (the last entry, or the head itself when empty). The
   *  playback loop drains it one snapshot per derived dwell; an empty buffer
   *  means this client has caught up and may drive the backend. Ephemeral
   *  local UI state: never persisted, never synced, cleared on disconnect. */
  buffer: readonly Snapshot[];
  /** This client's per-turn playback budget (ms). Local preference, hydrated
   *  from storage in the browser; the playback loop and the board animation
   *  both derive their sub-timings from it. */
  turnMs: number;
  /** Which game this client is in:
   *  - `null` — no game selected (the lobby browser); the pacer is idle.
   *  - `"dev"` — the backend dev sandbox (also accepts the debug hotkeys).
   *  - any other string — an online row in `monopoly_games`.
   *  Every game runs through `/api/monopoly`; there is no local-only mode. */
  gameId: string | null;
  /** Optimistic-concurrency version of the **playback head** (`headState`).
   *  The authoritative head — what a route write must CAS against —
   *  is the last `buffer` entry's version, or this when the buffer is empty;
   *  see `authVersion`. 0 when parked. */
  version: number;
  /** The local user's profile. Determines which seat (if any) this client
   *  owns — see `myPlayerId`. */
  profile: PlayerProfile | null;
  /** Last persistence/subscription error, if any. Surfaces sync failures
   *  for debugging without breaking the play loop. */
  syncError: string | null;
  /** True from the moment `connect()` is called until the first
   *  authoritative state lands (load, create, or subscription). Lets the UI
   *  show a "Connecting…" placeholder instead of briefly flashing the stale
   *  default game while the row loads. False while parked. */
  connecting: boolean;
  /** The optimistic overlay: the confirmed head with the still-unconfirmed
   *  local intents (`outbox`) folded on top. Non-null only while a prediction
   *  is outstanding, and `state` mirrors it. Cleared once the confirmed head
   *  catches up, or rolled back to the head on a conflict / rejection. */
  optimistic: GameState | null;
  /** Local intents predicted but not yet confirmed by the route, oldest first.
   *  Flushed as one version-guarded batch and drained as confirmations land;
   *  emptied on a rollback. */
  outbox: readonly Intent[];
  /** Local lobby ops predicted but not yet confirmed, oldest first. The lobby's
   *  lighter counterpart to `outbox`: flushed one at a time (distinct action
   *  types can't batch), drained as confirmations land, and rebased onto each
   *  fresh head — a pick that lost a color/icon race is pruned, reverting the
   *  loser's seat. Empty while a game is `active`. */
  lobbyOutbox: readonly LobbyOp[];
} & MonopolyActions;

// Module-scoped because Realtime channels aren't serializable into zustand
// state. `activeUnsub` tears down the current postgres-changes subscription;
// `activeGameId` is the in-flight connect target and lets async load handlers
// detect a newer connect that took over mid-await.
let activeUnsub: (() => void) | null = null;
let activeGameId: string | null = null;

// True while a predicted-intent batch is in flight to the route. Serializes the
// optimistic outbox: only one batch is on the wire at a time, so each flush
// CASes against a known version (the prior batch's confirmation).
let predictionInFlight = false;

// The lobby's counterpart to `predictionInFlight`: true while a predicted lobby
// op is on the wire. Lobby ops are distinct action types (not a batchable
// `submit`), so they flush one at a time, oldest first — this serializes them so
// each CASes against the prior op's confirmation.
let lobbyFlushInFlight = false;

function teardownSubscription(): void {
  if (activeUnsub) {
    activeUnsub();
    activeUnsub = null;
  }
  activeGameId = null;
}

function isMember(state: GameState, profile: PlayerProfile): boolean {
  return state.players.some((p) => p.id === profile.id);
}

// The authoritative-head version: the latest row version this client knows of,
// which a route write must CAS against. That's the last buffered snapshot when
// the playback head is lagging, else the head's own version. Driving off the
// playback-head version instead would CAS against a stale version and conflict.
function authVersion(buffer: readonly Snapshot[], headVersion: number): number {
  return buffer.length > 0 ? buffer[buffer.length - 1].version : headVersion;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Stamp a lobby op with the version guard it flushes under. A LobbyOp is
// structurally a lobby `MonopolyAction` minus its `fromVersion`.
function toLobbyAction(op: LobbyOp, fromVersion: number): MonopolyAction {
  return { ...op, fromVersion };
}

export const useMonopolyStore = create<MonopolyStore>((set, get) => {
  // Fold an authoritative route response back into the store. A success
  // applies the new state + version (and re-derives membership); a conflict
  // is a no-op — the subscription will deliver the winning state — and a
  // genuine rejection surfaces as a sync error.
  function handleResult(res: MonopolyResult): void {
    if (res.ok) {
      // A `delete` result carries no state — but the store never submits one
      // (deletes come from the lobby browser), so there's nothing to fold in.
      if ("state" in res) get().applyStateUpdate(res.state, res.version);
    } else if (!res.conflict && res.reason !== undefined) {
      set({ syncError: res.reason });
    }
  }

  // POST a version-guarded op and fold the authoritative result back in.
  // `make` receives the version this client last saw so the route can reject a
  // stale write as a conflict. No-op when parked (no connected game id).
  function versionedOp(make: (fromVersion: number) => MonopolyAction): void {
    const { gameId, buffer, version } = get();
    if (!gameId) return;
    void submitAction(gameId, make(authVersion(buffer, version))).then(handleResult);
  }

  // Run a batch of intents: POST to the authoritative route as one atomic,
  // single-version write and let the result arrive async. The synchronous
  // return is an unread optimistic stub.
  function runIntents(intents: readonly Intent[]): ApplyResult {
    const { state, gameId, buffer, version } = get();
    if (!gameId) return { ok: false, reason: "not connected" };
    void submitAction(gameId, {
      type: "submit",
      intents,
      fromVersion: authVersion(buffer, version),
    }).then(handleResult);
    return { ok: true, state, newEvents: [] };
  }

  // Optimistically apply a local UI intent: fold it onto the display head right
  // away, queue it for a version-guarded flush, and let the authoritative result
  // reconcile through the playback pipeline. Falls back to a plain POST while
  // this client is mid-animation (buffer non-empty), so the overlay never builds
  // on a stale playback head. A locally-illegal intent is sent un-predicted —
  // the route stays the source of truth and rejects it the same as before.
  function predict(intent: Intent): ApplyResult {
    const { gameId, headState, optimistic, outbox, buffer } = get();
    if (!gameId) return { ok: false, reason: "not connected" };
    if (buffer.length > 0) return runIntents([intent]);
    const base = optimistic ?? headState;
    const res = apply(base, intent);
    if (!res.ok) return runIntents([intent]);
    set({ optimistic: res.state, state: res.state, outbox: [...outbox, intent] });
    flushOutbox();
    return { ok: true, state: res.state, newEvents: res.newEvents };
  }

  // POST the outstanding outbox as one atomic batch, oldest first. Serialized by
  // `predictionInFlight` so the CAS base is always the previous confirmation.
  function flushOutbox(): void {
    if (predictionInFlight) return;
    const { gameId, outbox, buffer, version } = get();
    if (!gameId || outbox.length === 0) return;
    const sent = outbox.length;
    predictionInFlight = true;
    void submitAction(gameId, {
      type: "submit",
      intents: outbox,
      fromVersion: authVersion(buffer, version),
    }).then((res) => {
      predictionInFlight = false;
      handlePrediction(res, sent);
    });
  }

  // The latest authoritative state this client knows of: the last buffered
  // snapshot when the playback head is still catching up, else the head itself.
  // A conflict's optimistic intents rebase onto THIS so the overlay reflects the
  // freshest truth (the route hands the winner straight into the buffer).
  function latestAuth(): GameState {
    const { buffer, headState } = get();
    return buffer.length > 0 ? buffer[buffer.length - 1].state : headState;
  }

  // Replay the outstanding outbox onto the latest authoritative head, pruning any
  // intent that no longer applies, and update the display overlay. Optionally
  // re-flush the survivors — only when the head has actually advanced (a conflict
  // that handed back a newer version), so we never re-flush against the same
  // stale version in a tight loop. When the outbox empties, the overlay clears
  // and the display falls back to the head (the pump finishes the handoff).
  function rebaseOverlay(reflush: boolean): void {
    const rebuilt = rebuildOverlay(latestAuth(), get().outbox);
    const hasPending = rebuilt.outbox.length > 0;
    set({
      outbox: rebuilt.outbox,
      optimistic: hasPending ? rebuilt.state : null,
      state: hasPending ? rebuilt.state : get().headState,
    });
    if (reflush && hasPending) flushOutbox();
  }

  // Reconcile a flushed batch. Success folds the authoritative state into the
  // playback pipeline (the pump animates the head up to it and drops the overlay
  // once caught up) and flushes anything queued meanwhile.
  function handlePrediction(res: MonopolyResult, sent: number): void {
    if (res.ok) {
      // Drop the confirmed batch from the front BEFORE folding the new head —
      // applyStateUpdate's head-advance re-flush must not re-send an intent we
      // just confirmed (which, even idempotent, would be a wasted write).
      const remaining = get().outbox.slice(sent);
      set({ outbox: remaining });
      if ("state" in res) get().applyStateUpdate(res.state, res.version);
      if (remaining.length > 0) flushOutbox();
      return;
    }
    if (res.conflict) {
      // The optimistic batch lost the version race. Rather than DROP it — which
      // erased the user's action (a vanished Manage arm, an auction bar snapping
      // to zero) — REBASE: replay the outbox onto the fresh truth so the arm
      // re-arms onto the next boundary, an absolute bid re-records on the bidder's
      // bar, and a now-moot intent is pruned.
      if (res.state !== undefined && res.version !== undefined) {
        // Stale-version conflict: the route handed back the winner. Fold it and
        // re-flush against the new version (guaranteed progress).
        get().applyStateUpdate(res.state, res.version);
        rebaseOverlay(true);
      } else {
        // Bare read/write-race conflict — no winner returned. Keep the outbox and
        // rebuild the overlay on what we have; the realtime echo will advance the
        // head and the pump re-flushes the batch against the new version then.
        // Re-flushing now would just re-conflict on the same stale version.
        rebaseOverlay(false);
      }
      return;
    }
    // Genuine rejection (illegal intent, write failure): drop the overlay and
    // surface the error.
    set({ optimistic: null, outbox: [], state: get().headState });
    if (res.reason !== undefined) set({ syncError: res.reason });
  }

  // Optimistically apply a lobby op: fold it onto the display head right away for
  // instant feedback, queue it for a serialized version-guarded flush, and let
  // the authoritative result reconcile. A locally-illegal op (e.g. a hue another
  // seat just took) is sent un-predicted — the route stays the arbiter.
  function predictLobby(op: LobbyOp): void {
    const { gameId, state, lobbyOutbox } = get();
    if (!gameId) return;
    const res = lobbyReduce(state, op);
    if (!res.ok) {
      versionedOp((fromVersion) => toLobbyAction(op, fromVersion));
      return;
    }
    set({ state: res.state, lobbyOutbox: [...lobbyOutbox, op] });
    flushLobby();
  }

  // POST the oldest pending lobby op, version-guarded. Serialized by
  // `lobbyFlushInFlight` so the CAS base is always the previous confirmation.
  function flushLobby(): void {
    if (lobbyFlushInFlight) return;
    const { gameId, lobbyOutbox, buffer, version } = get();
    if (!gameId || lobbyOutbox.length === 0) return;
    const op = lobbyOutbox[0];
    lobbyFlushInFlight = true;
    void submitAction(gameId, toLobbyAction(op, authVersion(buffer, version))).then(
      (res) => {
        lobbyFlushInFlight = false;
        handleLobbyFlush(res);
      },
    );
  }

  // Rebuild the lobby overlay on the latest confirmed head (the buffer is empty
  // in a lobby, so that's `headState`), pruning any pending op that no longer
  // applies. Display falls back to the head once the outbox empties.
  function rebaseLobby(): void {
    const rebuilt = rebuildLobbyOverlay(get().headState, get().lobbyOutbox);
    set({
      lobbyOutbox: rebuilt.outbox,
      state: rebuilt.outbox.length > 0 ? rebuilt.state : get().headState,
    });
  }

  // Reconcile a flushed lobby op. Success drops the confirmed op (idempotent ops
  // wouldn't be pruned by a rebase) and folds the winner, which rebases and
  // re-flushes the rest. A conflict folds the winner (a pick it claimed is
  // silently pruned — the loser reverts) or, lacking one, rebuilds and waits for
  // the echo. A genuine rejection drops just the offending op, silently.
  function handleLobbyFlush(res: MonopolyResult): void {
    if (res.ok) {
      if ("state" in res) {
        set({ lobbyOutbox: get().lobbyOutbox.slice(1) });
        get().applyStateUpdate(res.state, res.version);
      }
      return;
    }
    if (res.conflict) {
      if (res.state !== undefined && res.version !== undefined) {
        get().applyStateUpdate(res.state, res.version);
      } else {
        rebaseLobby();
      }
      return;
    }
    set({ lobbyOutbox: get().lobbyOutbox.slice(1) });
    rebaseLobby();
    flushLobby();
  }

  return {
    myPlayerId: null,
    state: freshGame(),
    headState: freshGame(),
    buffer: [],
    turnMs: DEFAULT_TURN_MS,
    gameId: null,
    version: 0,
    profile: null,
    syncError: null,
    connecting: false,
    optimistic: null,
    outbox: [],
    lobbyOutbox: [],

    setMyPlayer: (playerId) => { set({ myPlayerId: playerId }); },

    joinGame: () => {
      const { profile } = get();
      if (!profile) return;
      predictLobby({ type: "join", profile });
      // Claim our seat id optimistically so the color/token pickers (gated on
      // myPlayerId) appear with the seat instead of after the round-trip. Only
      // when the seat actually took — a locally-illegal join isn't predicted, and
      // applyStateUpdate re-derives (or clears) myPlayerId once the row confirms.
      if (get().state.players.some((p) => p.id === profile.id)) {
        set({ myPlayerId: profile.id });
      }
    },

    addBot: () => {
      predictLobby({ type: "addBot" });
    },

    removePlayer: (playerId) => {
      predictLobby({ type: "removePlayer", playerId });
    },

    setColor: (playerId, color) => {
      predictLobby({ type: "setColor", playerId, color });
    },

    setIcon: (playerId, icon) => {
      predictLobby({ type: "setIcon", playerId, icon });
    },

    setName: (playerId, name) => {
      predictLobby({ type: "setName", playerId, name });
    },

    // Starting is NOT predicted: flipping `status` to `active` optimistically
    // would hand the just-built board to the playback pump before the row
    // confirms. A one-time round-trip here is fine.
    startGame: () => {
      versionedOp((fromVersion) => ({ type: "start", fromVersion }));
    },

    devCommand: (command) => {
      versionedOp((fromVersion) => ({ type: "dev", command, fromVersion }));
    },

    // TODO: nothing in the UI calls this yet, so every client stays at
    // `DEFAULT_TURN_MS`. The per-client machinery is kept on purpose — the
    // pacer already spends each viewer's own `turnMs`, so distinct speeds will
    // work the moment a speed control calls this. Persistence was deliberately
    // dropped: a stored value would silently override `DEFAULT_TURN_MS` on load
    // with no way to clear it. Re-add it alongside that future UI.
    setTurnMs: (turnMs) => {
      // Keep the pace watchable: floor so a turn never blinks past, cap so a
      // slow setting can't strand a viewer indefinitely behind the buffer.
      const clamped = Math.max(400, Math.min(8000, Math.round(turnMs)));
      set({ turnMs: clamped });
    },

    cycleBuild: (position) => {
      const { state, myPlayerId } = get();
      if (!myPlayerId) return;
      // Only the manage actor (manager or forced debtor) and only when that's
      // the local player.
      if (manageActorId(state) !== myPlayerId) return;

      const color = colorAt(position);
      if (color === null) return;
      if (state.ownership[position] !== myPlayerId) return;
      if (!hasMonopoly(state, color, myPlayerId)) return;

      const staged = state.turn.manageStaged ?? { build: {}, mortgage: {} };
      // The set must be unmortgaged to build on it — counting staged mortgage
      // flips, so unmortgaging in the same commit unlocks the build.
      const mortgagedInSet = groupPositions(color).some((pos) =>
        pos in staged.mortgage ? staged.mortgage[pos] : state.mortgaged[pos] === true,
      );
      const forced = isRaiseOnly(state);
      // Building up requires the set fully unmortgaged; selling down never does.
      const live = developmentLevel(state, position);
      const current = staged.build[position] ?? live;

      let nextLevel: number;
      if (forced) {
        // Forced raise-cash: only sell down. Decrement, wrapping 0 → live so the
        // player can cycle past and re-select. Never builds up.
        nextLevel = current <= 0 ? live : current - 1;
      } else {
        if (mortgagedInSet && current >= live) {
          // Can't build up on a mortgaged set; allow only the wrap back down.
          return;
        }
        nextLevel = current >= 5 ? 0 : current + 1;
      }

      const build: Record<number, number> = { ...staged.build };
      if (nextLevel === live) delete build[position];
      else build[position] = nextLevel;
      predict({
        kind: "update-manage-staging",
        playerId: myPlayerId,
        staged: { build, mortgage: staged.mortgage },
      });
    },

    toggleMortgage: (position) => {
      const { state, myPlayerId } = get();
      if (!myPlayerId) return;
      if (manageActorId(state) !== myPlayerId) return;
      if (state.ownership[position] !== myPlayerId) return;

      const staged = state.turn.manageStaged ?? { build: {}, mortgage: {} };
      const stagedLevel = staged.build[position] ?? developmentLevel(state, position);
      const currentlyMortgaged = state.mortgaged[position] === true;

      const mortgage: Record<number, boolean> = { ...staged.mortgage };
      // Cycle between "no change" and "flip": a first tap stages the opposite of
      // the live flag; a second reverts.
      const resultMortgaged = position in mortgage ? currentlyMortgaged : !currentlyMortgaged;
      // Mortgaging requires the lot building-free. Selling buildings to 0 in the
      // same commit clears that (staged level 0), so only block staging a
      // mortgage while the lot still has buildings staged.
      if (resultMortgaged && stagedLevel > 0) return;

      if (position in mortgage) delete mortgage[position];
      else mortgage[position] = !currentlyMortgaged;
      predict({
        kind: "update-manage-staging",
        playerId: myPlayerId,
        staged: { build: staged.build, mortgage },
      });
    },

    commitManage: () => {
      const { state, myPlayerId } = get();
      if (!myPlayerId) return;
      const staged = state.turn.manageStaged ?? { build: {}, mortgage: {} };
      // Carry only the entries that DIFFER from the live state — the engine
      // applies the whole map raise-first / spend-second, all-or-nothing.
      const build: Record<number, number> = {};
      for (const [posStr, level] of Object.entries(staged.build)) {
        const pos = Number(posStr);
        if (level !== developmentLevel(state, pos)) build[pos] = level;
      }
      const mortgage: Record<number, boolean> = {};
      for (const [posStr, flag] of Object.entries(staged.mortgage)) {
        const pos = Number(posStr);
        if (flag !== (state.mortgaged[pos] === true)) mortgage[pos] = flag;
      }
      predict({ kind: "manage", playerId: myPlayerId, build, mortgage });
    },

    buyProperty: () => {
      const { myPlayerId } = get();
      if (!myPlayerId) return;
      // No raise payload: the engine reads any `raising-cash` staging straight
      // from synced `turn.manageStaged` and applies it raise-first.
      predict({ kind: "buy", playerId: myPlayerId });
    },

    raiseCash: () => {
      const { myPlayerId } = get();
      if (!myPlayerId) return;
      predict({ kind: "raise-cash", playerId: myPlayerId });
    },

    toggleQueue: (queue) => {
      const { state, myPlayerId } = get();
      if (!myPlayerId) return;
      // The checkbox toggles, but the INTENT carries the resulting absolute state
      // so it replays idempotently through the optimistic reconcile (a relative
      // toggle would flip itself back off when replayed on an already-armed head).
      const armed = !state.boundaryQueue.some(
        (e) => e.playerId === myPlayerId && e.kind === queue,
      );
      predict({ kind: "set-queue", playerId: myPlayerId, queue, armed });
    },

    cancelManage: () => {
      const { myPlayerId } = get();
      if (!myPlayerId) return;
      // Abandoning the intermission drops the synced staging — no separate local
      // clear to do. From `managing` it returns to pre-roll; from `raising-cash`
      // it returns to the pending buy-decision (the engine decides which).
      predict({ kind: "cancel-manage", playerId: myPlayerId });
    },

    cycleTradeProperty: (position) => {
      const { state, myPlayerId } = get();
      const draft = state.turn.tradeDraft;
      if (!myPlayerId || !draft || draft.proposerId !== myPlayerId) return;
      const base = state.ownership[position];
      if (!base) return; // only owned properties can move
      const owners = state.players.filter((p) => !p.bankrupt).map((p) => p.id);
      const current = draft.propertyTo[position] ?? base;
      const next = owners[(owners.indexOf(current) + 1) % owners.length];
      const propertyTo = { ...draft.propertyTo };
      if (next === base) delete propertyTo[position];
      else propertyTo[position] = next;
      predict({
        kind: "update-trade-draft",
        playerId: myPlayerId,
        terms: { propertyTo, gojfTo: draft.gojfTo, cashDelta: draft.cashDelta },
      });
    },

    cycleTradeGojf: (source) => {
      const { state, myPlayerId } = get();
      const draft = state.turn.tradeDraft;
      if (!myPlayerId || !draft || draft.proposerId !== myPlayerId) return;
      const base = state.jailFreeCards[source];
      if (!base) return; // only held cards can move
      const owners = state.players.filter((p) => !p.bankrupt).map((p) => p.id);
      const current = draft.gojfTo[source] ?? base;
      const next = owners[(owners.indexOf(current) + 1) % owners.length];
      const gojfTo = { ...draft.gojfTo };
      if (next === base) delete gojfTo[source];
      else gojfTo[source] = next;
      predict({
        kind: "update-trade-draft",
        playerId: myPlayerId,
        terms: { propertyTo: draft.propertyTo, gojfTo, cashDelta: draft.cashDelta },
      });
    },

    bumpTradeCash: (playerId, step) => {
      const { state, myPlayerId } = get();
      const draft = state.turn.tradeDraft;
      if (!myPlayerId || !draft || draft.proposerId !== myPlayerId) return;
      const nextAmount = (draft.cashDelta[playerId] ?? 0) + step;
      const cashDelta = { ...draft.cashDelta };
      if (nextAmount === 0) delete cashDelta[playerId];
      else cashDelta[playerId] = nextAmount;
      predict({
        kind: "update-trade-draft",
        playerId: myPlayerId,
        terms: { propertyTo: draft.propertyTo, gojfTo: draft.gojfTo, cashDelta },
      });
    },

    proposeTrade: () => {
      const { myPlayerId } = get();
      if (!myPlayerId) return;
      predict({ kind: "propose-trade", playerId: myPlayerId });
    },

    cancelTrade: () => {
      const { myPlayerId } = get();
      if (!myPlayerId) return;
      predict({ kind: "cancel-trade", playerId: myPlayerId });
    },

    acceptTrade: () => {
      const { state, myPlayerId } = get();
      const pending = state.turn.pendingTrade;
      if (!myPlayerId || !pending) return;
      predict({ kind: "accept-trade", playerId: myPlayerId, tradeId: pending.id });
    },

    declineTrade: () => {
      const { state, myPlayerId } = get();
      const pending = state.turn.pendingTrade;
      if (!myPlayerId || !pending) return;
      predict({ kind: "decline-trade", playerId: myPlayerId, tradeId: pending.id });
    },

    submit: (intent) => predict(intent),

    driveIntent: (intent) => {
      runIntents([intent]);
    },

    step: () => {
      versionedOp((fromVersion) => ({ type: "step", fromVersion }));
    },

    applyStateUpdate: (next, version) => {
      const { profile, connecting, version: headVersion, buffer } = get();

      // Snap straight to a non-buffered head — nothing to animate — in two
      // cases: the first state after connect / a rejoin (any status), and any
      // lobby update (a lobby has no token motion to play out). Both re-derive
      // the seat and rebase pending lobby ops onto the fresh head, so a seat
      // edit stays painted while another player's change folds in; a pick a
      // racing seat claimed fails to re-apply and is pruned (the loser reverts).
      // A finished game still buffers below so its final move animates.
      if (connecting || next.status === "lobby") {
        // Drop a stale / duplicate snapshot — an older version, or a write's own
        // route response plus its Realtime echo of the same version. Without this
        // an out-of-order delivery snaps the display backwards to a pre-edit head
        // (the brief revert flash) once the predicted op has drained from the
        // outbox. The connect snap always applies: it's the first state and may
        // carry any version (even one below a previous game's leftover). Mirrors
        // `ingestSnapshot`'s guard on the in-play path.
        if (!connecting && version <= headVersion) return;
        const seated = profile ? isMember(next, profile) : false;
        const pending = get().lobbyOutbox;
        const rebuilt =
          pending.length > 0
            ? rebuildLobbyOverlay(next, pending)
            : { state: next, outbox: pending };
        set({
          state: rebuilt.state,
          headState: next,
          version,
          buffer: [],
          optimistic: null,
          outbox: [],
          lobbyOutbox: rebuilt.outbox,
          myPlayerId: seated && profile ? profile.id : null,
          connecting: false,
        });
        // A surviving lobby op (or one left unsent by a bare write-race) re-
        // flushes once this fresh version lands. No-op if in flight or empty.
        if (rebuilt.outbox.length > 0) flushLobby();
        return;
      }

      // In play: queue the snapshot behind whatever is still animating. The
      // playback loop (below) drains the buffer at this client's pace and
      // re-derives the seat as the head advances. Stale / duplicate versions
      // (a write's own route response plus its Realtime echo) are dropped.
      const nextBuffer = ingestSnapshot(buffer, headVersion, { version, state: next });
      if (nextBuffer !== buffer) {
        set({ buffer: nextBuffer });
        // A pending optimistic batch left unsent by a bare write-race conflict
        // gets re-flushed once a fresh authoritative version actually lands —
        // CAS'd against the new head, so it makes progress instead of looping on
        // the stale version. No-op if already in flight or empty.
        if (get().outbox.length > 0) flushOutbox();
      }
    },

    connect: async ({ gameId, profile }) => {
      teardownSubscription();
      activeGameId = gameId;
      set({
        gameId,
        profile,
        // Seat unknown until the row loads. Null myPlayerId means the pacer
        // can't claim "self" against the stale default state during the load
        // gap, so it stays idle until applyStateUpdate fills the seat.
        myPlayerId: null,
        // Drop any leftover playback buffer from a previous game; the first
        // authoritative state snaps the head clean (connecting branch above).
        buffer: [],
        // Abandon any prediction from a previous game.
        optimistic: null,
        outbox: [],
        lobbyOutbox: [],
        syncError: null,
        // Gate the UI on a "Connecting…" placeholder until the first
        // authoritative state lands, so the stale default game never flashes.
        connecting: true,
      });

      // Subscribe before loading so an update landing in the gap isn't
      // missed. Everyone subscribes — the route is the sole writer, so a
      // member receives its own writes back here just like anyone else.
      activeUnsub = subscribeGame(gameId, (next, version) => {
        if (activeGameId !== gameId) return;
        useMonopolyStore.getState().applyStateUpdate(next, version);
      });

      let loaded: LoadedGame | null;
      try {
        loaded = await loadGame(gameId);
      } catch (err: unknown) {
        set({ syncError: errorMessage(err), connecting: false });
        return;
      }
      // A newer connect() may have superseded us mid-await.
      if (activeGameId !== gameId) return;

      // applyStateUpdate re-derives the seat and clears `connecting`, so each
      // success branch funnels through it rather than repeating that logic.
      if (loaded) {
        get().applyStateUpdate(loaded.state, loaded.version);
        return;
      }

      // First open of this game: ask the route to seed and insert it (a lobby,
      // or an immediate-play game for the `dev` id). On a create conflict
      // (someone created it first) fall back to loading the existing row.
      const res = await submitAction(gameId, { type: "create", profile });
      if (activeGameId !== gameId) return;
      if (res.ok) {
        // `create` always returns state on success (never the `delete` variant).
        if ("state" in res) get().applyStateUpdate(res.state, res.version);
        return;
      }
      if (res.conflict) {
        const row = await loadGame(gameId);
        if (activeGameId !== gameId || !row) return;
        get().applyStateUpdate(row.state, row.version);
        return;
      }
      set({ syncError: res.reason ?? "failed to create game", connecting: false });
    },

    disconnect: () => {
      teardownSubscription();
      set({
        gameId: null,
        version: 0,
        profile: null,
        state: freshGame(),
        headState: freshGame(),
        buffer: [],
        optimistic: null,
        outbox: [],
        lobbyOutbox: [],
        myPlayerId: null,
        syncError: null,
        connecting: false,
      });
    },
  };
});

// Playback loop + pacing live in the store, not the component (the board just
// renders the playback head and animates each transition). The model is a
// playback head over the FIFO `buffer`:
//
//   1. While snapshots are queued, advance the head one per derived dwell —
//      the time `paceTransition` budgets for that turn's glide / slide / hold.
//   2. When the buffer is empty (head caught up to the authoritative head),
//      drive the backend for one more unit — but only if `driveOp` says this
//      client may (its own / a bot's turn). Another connected human's turn
//      returns nothing, so the row can't advance past them until their client
//      drives it: every human turn is a hard sync barrier.
//
// Guarded on `window` so importing this module under SSR or test runners (no
// DOM, no timers wanted) is a no-op.
if (typeof window !== "undefined") {
  let dwellTimer: ReturnType<typeof setTimeout> | null = null;
  // The head version this client last drove from, so a redundant pump (the
  // store fires subscribers synchronously on its own writes) can't double-fire
  // the same step. Reset whenever the head advances or the game changes.
  let drivenFrom: number | null = null;
  // Re-entrancy guard: committing a snapshot calls setState, which runs this
  // subscriber synchronously — `pumping` makes that re-entry a no-op.
  let pumping = false;
  let lastGameId: string | null = null;

  const onDwellEnd = (): void => {
    dwellTimer = null;
    pump();
  };

  const pump = (): void => {
    if (pumping || dwellTimer !== null) return; // busy or mid-dwell
    pumping = true;
    try {
      const store = useMonopolyStore.getState();
      if (!store.gameId) return;

      if (store.buffer.length > 0) {
        // Advance the playback head one snapshot, animating the transition over
        // its budgeted dwell. Re-derive the seat from the new roster (a reseat
        // can change who this client is) just like a snap does.
        const [next, ...rest] = store.buffer;
        const dwell = paceTransition(store.headState, next.state, store.turnMs).durationMs;
        const { profile } = store;
        const seated = profile ? isMember(next.state, profile) : false;
        const myId = seated && profile ? profile.id : null;
        drivenFrom = null;
        // Rebase any pending optimistic intents onto the just-advanced head so the
        // overlay tracks the freshest truth + the user's own edits (a bid bar
        // re-records against the latest high, an arm stays armed as others' turns
        // animate past) instead of freezing on a stale prediction.
        const overlay =
          store.outbox.length > 0
            ? rebuildOverlay(next.state, store.outbox).state
            : next.state;
        useMonopolyStore.setState({
          headState: next.state,
          version: next.version,
          buffer: rest,
          myPlayerId: myId,
          optimistic: store.outbox.length > 0 ? overlay : null,
          state: overlay,
        });
        dwellTimer = setTimeout(onDwellEnd, dwell);
        return;
      }

      // Caught up to the authoritative head. If an overlay is still up but every
      // local intent has been confirmed (outbox empty, nothing in flight), drop
      // it — the confirmed head is now the truth and the two are equal, so this
      // is invisible. A wrong prediction's head simply differs, and the display
      // snaps to it.
      if (
        store.optimistic !== null &&
        store.outbox.length === 0 &&
        !predictionInFlight
      ) {
        useMonopolyStore.setState({ optimistic: null, state: store.headState });
      }

      // A local prediction is outstanding — the user's own action takes priority
      // and must settle first, so the pacer's auto-roll / auto-end can't race it
      // (and force it to re-conflict and rebase). Releases the moment the outbox
      // drains; the action confirms in a round trip, so this never stalls play.
      if (store.outbox.length > 0 || predictionInFlight) return;

      // Drive one more unit off the CONFIRMED head (never the overlay), at most
      // once per head.
      if (drivenFrom === store.version) return;
      const op = driveOp(store.headState, true, store.myPlayerId);
      if (!op) return;
      drivenFrom = store.version;
      if (op.kind === "step") store.step();
      else store.driveIntent(op.intent);
    } finally {
      pumping = false;
    }
  };

  useMonopolyStore.subscribe((next, prev) => {
    if (next.gameId !== lastGameId) {
      // Game context changed (connect / disconnect): abandon any in-flight
      // dwell and reset the drive guard so the new game starts clean.
      if (dwellTimer !== null) {
        clearTimeout(dwellTimer);
        dwellTimer = null;
      }
      drivenFrom = null;
      lastGameId = next.gameId;
    }
    if (
      next.state === prev.state &&
      next.buffer === prev.buffer &&
      next.gameId === prev.gameId &&
      next.myPlayerId === prev.myPlayerId &&
      next.turnMs === prev.turnMs
    ) {
      return;
    }
    pump();
  });

  pump();
}
