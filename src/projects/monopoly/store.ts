"use client";

import { create } from "zustand";
import type { PlayerProfile } from "@/shared/lib/profile";
import { getProjectStorage } from "@/shared/lib/storage/project-storage";
import { freshGame } from "./mocks";
import {
  DEFAULT_TURN_MS,
  driveOp,
  ingestSnapshot,
  paceTransition,
  type Snapshot,
} from "./pacing";
import type { DevCommand, MonopolyAction, MonopolyResult } from "./protocol";
import { loadGame, submitAction, subscribeGame, type LoadedGame } from "./sync";
import type {
  ApplyResult,
  CardSource,
  GameState,
  Intent,
  PlayerColor,
  PlayerIcon,
} from "./types";

/** Staged mortgage toggles the user has clicked but not yet committed.
 *  Maps position -> target mortgaged-flag. Entries that match the current
 *  authoritative `state.mortgaged[pos]` are removed (no-op) by
 *  `toggleMortgageStage`, so a stale "no change" key never leaks through to
 *  the commit step. Per-client UI state — never synced. */
export type MortgageStaged = Readonly<Record<number, boolean>>;

// Per-client playback pacing (buffer + playback head) lives at the bottom of
// this file; the turn budget it spends, and the persistence of that local
// preference, are in `pacing.ts` and `turnMsStorage` below.
const turnMsStorage = getProjectStorage("monopoly");
const TURN_MS_KEY = "turnMs";

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

  /** Open the mortgage staging panel (voluntary entry from a paused turn).
   *  No-op if the panel is already open. Forced entries (must-raise-cash
   *  phase) show the panel implicitly — toggleMortgageStage initializes
   *  staged from null on the first click, so no explicit open is required. */
  openMortgagePanel: () => void;

  /** Toggle the staged mortgage flag for a position. Cycles between "no
   *  change" and "stage flip" — clicking once stages the opposite of the
   *  current mortgaged state, clicking again reverts to no change. Rejects
   *  positions the local player doesn't own. */
  toggleMortgageStage: (position: number) => void;

  /** Close the voluntary mortgage panel, discarding any staged changes.
   *  No-op while in the must-raise-cash phase — the player can't back out
   *  of paying a debt. */
  closeMortgagePanel: () => void;

  /** Commit staged mortgage / unmortgage changes by submitting one intent
   *  per staged flip. Mortgages run first so any cash needed for a same-
   *  batch unmortgage is in hand by the time the unmortgage submits.
   *  Engine auto-settles a must-raise-cash debt mid-batch if a mortgage
   *  brings cash up to the threshold; remaining staged ops still try to
   *  apply against the post-settle state. Clears the staged map at the end
   *  regardless of per-intent outcomes — UI re-derives from authoritative
   *  state on the next render. */
  commitMortgageStaging: () => void;

  /** Toggle "I want to trade" for the local player — arms/disarms a spot in
   *  the FIFO trade queue. Fires at the next unpaused pre-roll. */
  requestTrade: () => void;

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

  /** Submit an intent to the authoritative route; the real state arrives via
   *  the route response / subscription, so the synchronous return is an
   *  optimistic stub (callers don't read it). Needs a connected game id; the
   *  route-side engine enforces turn ownership, so the store doesn't gate on
   *  seat — a misdirected intent is simply rejected by `apply`. */
  submit: (intent: Intent) => ApplyResult;

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
  /** The **playback-head** state — what this client is currently rendering,
   *  which trails the authoritative head by the snapshots still queued in
   *  `buffer`. The parked default (no game selected) is a throwaway
   *  `freshGame()` that is never shown; `connect()` snaps the head to the live
   *  row and the playback loop advances it through `buffer` at the local pace. */
  state: GameState;
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
  /** Optimistic-concurrency version of the **playback head** (the snapshot in
   *  `state`). The authoritative head — what a route write must CAS against —
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
  /** Staged mortgage toggles awaiting commit. `null` when the panel is
   *  closed (voluntary mode). Always treated as `{}` for rendering when
   *  the turn is in `must-raise-cash` so the panel is implicitly open.
   *  Cleared on disconnect. */
  mortgageStaged: MortgageStaged | null;
} & MonopolyActions;

// Module-scoped because Realtime channels aren't serializable into zustand
// state. `activeUnsub` tears down the current postgres-changes subscription;
// `activeGameId` is the in-flight connect target and lets async load handlers
// detect a newer connect that took over mid-await.
let activeUnsub: (() => void) | null = null;
let activeGameId: string | null = null;

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

  return {
    myPlayerId: null,
    state: freshGame(),
    buffer: [],
    turnMs: DEFAULT_TURN_MS,
    gameId: null,
    version: 0,
    profile: null,
    syncError: null,
    connecting: false,
    mortgageStaged: null,

    setMyPlayer: (playerId) => { set({ myPlayerId: playerId }); },

    joinGame: () => {
      const { profile } = get();
      if (!profile) return;
      versionedOp((fromVersion) => ({ type: "join", profile, fromVersion }));
    },

    addBot: () => {
      versionedOp((fromVersion) => ({ type: "addBot", fromVersion }));
    },

    removePlayer: (playerId) => {
      versionedOp((fromVersion) => ({ type: "removePlayer", playerId, fromVersion }));
    },

    setColor: (playerId, color) => {
      versionedOp((fromVersion) => ({ type: "setColor", playerId, color, fromVersion }));
    },

    setIcon: (playerId, icon) => {
      versionedOp((fromVersion) => ({ type: "setIcon", playerId, icon, fromVersion }));
    },

    setName: (playerId, name) => {
      versionedOp((fromVersion) => ({ type: "setName", playerId, name, fromVersion }));
    },

    startGame: () => {
      versionedOp((fromVersion) => ({ type: "start", fromVersion }));
    },

    devCommand: (command) => {
      versionedOp((fromVersion) => ({ type: "dev", command, fromVersion }));
    },

    setTurnMs: (turnMs) => {
      // Keep the pace watchable: floor so a turn never blinks past, cap so a
      // slow setting can't strand a viewer indefinitely behind the buffer.
      const clamped = Math.max(400, Math.min(8000, Math.round(turnMs)));
      set({ turnMs: clamped });
      turnMsStorage.set(TURN_MS_KEY, clamped);
    },

    openMortgagePanel: () => {
      if (get().mortgageStaged !== null) return;
      set({ mortgageStaged: {} });
    },

    toggleMortgageStage: (position) => {
      const { state, myPlayerId, mortgageStaged } = get();
      if (!myPlayerId) return;
      if (state.ownership[position] !== myPlayerId) return;
      const current = mortgageStaged ?? {};
      const currentlyMortgaged = state.mortgaged[position] === true;
      const next: Record<number, boolean> = { ...current };
      if (position in next) {
        delete next[position];
      } else {
        next[position] = !currentlyMortgaged;
      }
      set({ mortgageStaged: next });
    },

    closeMortgagePanel: () => {
      // Forced (must-raise-cash) entry: no Cancel — the player must pay.
      if (get().state.turn.phase === "must-raise-cash") return;
      set({ mortgageStaged: null });
    },

    commitMortgageStaging: () => {
      const { mortgageStaged, myPlayerId } = get();
      const staged = mortgageStaged ?? {};
      if (!myPlayerId) {
        set({ mortgageStaged: null });
        return;
      }
      // Mortgages first, then un-mortgages, so any cash raised is in hand
      // before an un-mortgage in the same batch tries to spend it. Batched
      // into one runIntents call so online it lands as a single atomic write.
      const intents: Intent[] = [];
      for (const [posStr, target] of Object.entries(staged)) {
        if (target !== true) continue;
        intents.push({ kind: "mortgage", playerId: myPlayerId, position: Number(posStr) });
      }
      for (const [posStr, target] of Object.entries(staged)) {
        if (target !== false) continue;
        intents.push({ kind: "unmortgage", playerId: myPlayerId, position: Number(posStr) });
      }
      if (intents.length > 0) runIntents(intents);
      set({ mortgageStaged: null });
    },

    requestTrade: () => {
      const { myPlayerId } = get();
      if (!myPlayerId) return;
      runIntents([{ kind: "request-trade", playerId: myPlayerId }]);
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
      runIntents([
        {
          kind: "update-trade-draft",
          playerId: myPlayerId,
          terms: { propertyTo, gojfTo: draft.gojfTo, cashDelta: draft.cashDelta },
        },
      ]);
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
      runIntents([
        {
          kind: "update-trade-draft",
          playerId: myPlayerId,
          terms: { propertyTo: draft.propertyTo, gojfTo, cashDelta: draft.cashDelta },
        },
      ]);
    },

    bumpTradeCash: (playerId, step) => {
      const { state, myPlayerId } = get();
      const draft = state.turn.tradeDraft;
      if (!myPlayerId || !draft || draft.proposerId !== myPlayerId) return;
      const nextAmount = (draft.cashDelta[playerId] ?? 0) + step;
      const cashDelta = { ...draft.cashDelta };
      if (nextAmount === 0) delete cashDelta[playerId];
      else cashDelta[playerId] = nextAmount;
      runIntents([
        {
          kind: "update-trade-draft",
          playerId: myPlayerId,
          terms: { propertyTo: draft.propertyTo, gojfTo: draft.gojfTo, cashDelta },
        },
      ]);
    },

    proposeTrade: () => {
      const { myPlayerId } = get();
      if (!myPlayerId) return;
      runIntents([{ kind: "propose-trade", playerId: myPlayerId }]);
    },

    cancelTrade: () => {
      const { myPlayerId } = get();
      if (!myPlayerId) return;
      runIntents([{ kind: "cancel-trade", playerId: myPlayerId }]);
    },

    acceptTrade: () => {
      const { state, myPlayerId } = get();
      const pending = state.turn.pendingTrade;
      if (!myPlayerId || !pending) return;
      runIntents([{ kind: "accept-trade", playerId: myPlayerId, tradeId: pending.id }]);
    },

    declineTrade: () => {
      const { state, myPlayerId } = get();
      const pending = state.turn.pendingTrade;
      if (!myPlayerId || !pending) return;
      runIntents([{ kind: "decline-trade", playerId: myPlayerId, tradeId: pending.id }]);
    },

    submit: (intent) => runIntents([intent]),

    step: () => {
      versionedOp((fromVersion) => ({ type: "step", fromVersion }));
    },

    applyStateUpdate: (next, version) => {
      const { profile, connecting, version: headVersion, buffer } = get();

      // First authoritative state after connect: snap the playback head
      // straight to it with an empty buffer — no animating across the connect
      // gap. This is also the rejoin path: jump to the live authoritative head
      // and start fresh, exactly as the design intends. Re-derives the seat.
      if (connecting) {
        const seated = profile ? isMember(next, profile) : false;
        set({
          state: next,
          version,
          buffer: [],
          myPlayerId: seated && profile ? profile.id : null,
          connecting: false,
        });
        return;
      }

      // In play: queue the snapshot behind whatever is still animating. The
      // playback loop (below) drains the buffer at this client's pace and
      // re-derives the seat as the head advances. Stale / duplicate versions
      // (a write's own route response plus its Realtime echo) are dropped.
      const nextBuffer = ingestSnapshot(buffer, headVersion, { version, state: next });
      if (nextBuffer !== buffer) set({ buffer: nextBuffer });
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
        buffer: [],
        myPlayerId: null,
        syncError: null,
        connecting: false,
        mortgageStaged: null,
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
  // Hydrate the local pace preference before the first frame so the very first
  // turn already plays at the chosen speed.
  const storedTurnMs = turnMsStorage.get<number>(TURN_MS_KEY);
  if (storedTurnMs !== null) useMonopolyStore.getState().setTurnMs(storedTurnMs);

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
        const dwell = paceTransition(store.state, next.state, store.turnMs).durationMs;
        const { profile } = store;
        const seated = profile ? isMember(next.state, profile) : false;
        drivenFrom = null;
        useMonopolyStore.setState({
          state: next.state,
          version: next.version,
          buffer: rest,
          myPlayerId: seated && profile ? profile.id : null,
        });
        dwellTimer = setTimeout(onDwellEnd, dwell);
        return;
      }

      // Caught up: drive one more unit, at most once per head.
      if (drivenFrom === store.version) return;
      const op = driveOp(store.state, true, store.myPlayerId);
      if (!op) return;
      drivenFrom = store.version;
      if (op.kind === "step") store.step();
      else store.submit(op.intent);
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
