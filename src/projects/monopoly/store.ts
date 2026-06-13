"use client";

import { create } from "zustand";
import type { PlayerProfile } from "@/shared/lib/profile";
import { botIntent } from "./bots/policy";
import { driverRole } from "./driver";
import { apply, autoStep } from "./engine";
import { freshGame } from "./mocks";
import type { MonopolyResult } from "./protocol";
import { loadGame, submitAction, subscribeGame, type LoadedGame } from "./sync";
import type {
  ApplyResult,
  GameEvent,
  GameState,
  Intent,
  TurnPhase,
} from "./types";

/** Staged mortgage toggles the user has clicked but not yet committed.
 *  Maps position -> target mortgaged-flag. Entries that match the current
 *  authoritative `state.mortgaged[pos]` are removed (no-op) by
 *  `toggleMortgageStage`, so a stale "no change" key never leaks through to
 *  the commit step. Per-client UI state — never synced. */
export type MortgageStaged = Readonly<Record<number, boolean>>;

// Visible pause between mechanical steps so the user can read each roll land
// in the log and watch the camera glide + token slide settle before the next
// one. Slow enough to follow; fast enough that a no-op loop isn't sluggish.
const STEP_DELAY_MS = 2000;

// Phases the auto-pacer is allowed to drive. Anything else (auction,
// trade, game-over) is a fixed point; the pacer leaves it alone and waits
// for an intent to break out. `buy-decision` and `must-raise-cash` are
// paced only when the active player is not the local user — bots auto-buy
// or auto-mortgage; the human gets the Buy/Pass UI or mortgage panel.
const PACED_PHASES: ReadonlySet<TurnPhase> = new Set([
  "pre-roll",
  "post-roll",
  "buy-decision",
  "must-raise-cash",
]);

/** "live": auto-pacing drives the game forward; this is the actual play
 *  loop. "demo": the state is a hand-picked snapshot for UI inspection;
 *  auto-pacing is suspended so nothing mutates the loaded snapshot. The
 *  field is a client-side concern, not part of `GameState` — the DB row
 *  only stores the game itself. */
export type MonopolyMode = "live" | "demo";

/** "local": in-memory game, no DB — the bare /monopoly route's default.
 *  "online": connected to a Supabase row via `connect()`; the host is the
 *  only writer and guests render the host's writes via postgres-changes. */
export type MonopolyConnection = "local" | "online";

interface MonopolyActions {
  /** Set this client's player id (assigned during lobby join). */
  setMyPlayer: (playerId: string) => void;

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

  /** Submit an intent. In local mode the engine runs in-process and the
   *  return carries the combined event stream. In online mode the intent is
   *  POSTed to the authoritative route and the real state arrives via the
   *  route response / subscription; the synchronous return is an optimistic
   *  stub (callers don't read it). Online needs a connected game id; the
   *  engine (route-side) enforces turn ownership, so the store doesn't gate
   *  on seat — a misdirected intent is simply rejected by `apply`. */
  submit: (intent: Intent) => ApplyResult;

  /** Advance mechanics by one unit without an intent — the paced loop's
   *  heartbeat. Local mode steps in-process; online mode POSTs a `step` to
   *  the route. No-op when already at a decision point, or online without a
   *  connected game id. Driver eligibility is decided by the pacer, not here. */
  step: () => void;

  /** Replace local state with authoritative state (from the subscription or
   *  a route response) at the given version. Re-derives membership from the
   *  incoming roster — a reseated game may change who the local user is. */
  applyStateUpdate: (state: GameState, version: number) => void;

  /** Reset back to a fresh local live game and drop any online connection.
   *  Bound to the `n` dev key. */
  reset: () => void;

  /** Load a hand-picked GameState for UI inspection and switch to "demo"
   *  mode. The auto-pacing layer is gated on `mode === "live"`, so the
   *  loaded snapshot stays frozen until `reset()` returns to a live game. */
  loadDemo: (state: GameState) => void;

  /** Connect to an online game. If the row is absent the caller seeds a
   *  fresh game (with their profile in slot 0) and becomes host. If the
   *  row exists, membership is determined by whether the profile id
   *  matches a seated player — members are host (authoritative writer),
   *  non-members subscribe as read-only guests. */
  connect: (opts: { gameId: string; profile: PlayerProfile }) => Promise<void>;

  /** Tear down any online subscription and return to a fresh local game.
   *  Safe to call when already local. */
  disconnect: () => void;

  /** Online host: overwrite the row with a fresh game seating the local
   *  profile. No-op for guests or in local mode. */
  restart: () => Promise<void>;

  /** Online: re-fetch the row and apply it locally. Useful after a host
   *  elsewhere has restarted; lets you force-resync without reloading. */
  resume: () => Promise<void>;
}

export type MonopolyStore = {
  myPlayerId: string | null;
  /** Authoritative game state. Local-mode default is `freshGame()`; online
   *  mode replaces this from Supabase via `connect()` / postgres-changes. */
  state: GameState;
  mode: MonopolyMode;
  connection: MonopolyConnection;
  /** Id of the connected game row in `monopoly_games`. Null in local mode. */
  gameId: string | null;
  /** Optimistic-concurrency version of the connected row — the value the
   *  next route write must match. Tracked from every authoritative update so
   *  `submit` / `step` can advance from the version this client last saw. 0
   *  in local mode. */
  version: number;
  /** The local user's profile. In online mode it determines which seat (if
   *  any) this client owns — see `myPlayerId`. */
  profile: PlayerProfile | null;
  /** Last persistence/subscription error, if any. Surfaces sync failures
   *  for debugging without breaking the play loop. */
  syncError: string | null;
  /** Staged mortgage toggles awaiting commit. `null` when the panel is
   *  closed (voluntary mode). Always treated as `{}` for rendering when
   *  the turn is in `must-raise-cash` so the panel is implicitly open.
   *  Cleared on reset / disconnect / restart. */
  mortgageStaged: MortgageStaged | null;
} & MonopolyActions;

// First pass skips the lobby for local mode: the local client is always
// seated as p1.
const DEFAULT_PLAYER_ID = "p1";

// Module-scoped because Realtime channels aren't serializable into zustand
// state. `activeUnsub` tears down the current postgres-changes subscription
// (guests only); `activeGameId` is the in-flight connect target and lets
// async load handlers detect a newer connect that took over mid-await.
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
      get().applyStateUpdate(res.state, res.version);
    } else if (!res.conflict && res.reason !== undefined) {
      set({ syncError: res.reason });
    }
  }

  // Run a batch of intents. Online: POST to the authoritative route (one
  // atomic, single-version write) and let the result arrive async — the
  // synchronous return is an unread optimistic stub. Local: apply in order
  // and drain mechanics once, in-process.
  function runIntents(intents: readonly Intent[]): ApplyResult {
    const { state, connection, gameId, version } = get();
    if (connection === "online") {
      if (!gameId) return { ok: false, reason: "not connected" };
      void submitAction(gameId, {
        type: "submit",
        intents,
        fromVersion: version,
      }).then(handleResult);
      return { ok: true, state, newEvents: [] };
    }
    let working = state;
    const events: GameEvent[] = [];
    for (const intent of intents) {
      const result = apply(working, intent);
      if (!result.ok) return result;
      working = result.state;
      events.push(...result.newEvents);
    }
    const stepped = autoStep(working);
    set({ state: stepped.state });
    return {
      ok: true,
      state: stepped.state,
      newEvents: [...events, ...stepped.newEvents],
    };
  }

  return {
    myPlayerId: DEFAULT_PLAYER_ID,
    state: freshGame(),
    mode: "live",
    connection: "local",
    gameId: null,
    version: 0,
    profile: null,
    syncError: null,
    mortgageStaged: null,

    setMyPlayer: (playerId) => { set({ myPlayerId: playerId }); },

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

    submit: (intent) => runIntents([intent]),

    step: () => {
      const { state, connection, gameId, version } = get();
      if (connection === "online") {
        if (!gameId) return;
        void submitAction(gameId, { type: "step", fromVersion: version }).then(
          handleResult,
        );
        return;
      }
      const stepped = autoStep(state);
      if (stepped.state !== state) set({ state: stepped.state });
    },

    applyStateUpdate: (next, version) => {
      const { profile } = get();
      const seated = profile ? isMember(next, profile) : false;
      set({
        state: next,
        version,
        myPlayerId: seated && profile ? profile.id : null,
      });
    },

    reset: () => {
      teardownSubscription();
      set({
        state: freshGame(),
        myPlayerId: DEFAULT_PLAYER_ID,
        mode: "live",
        connection: "local",
        gameId: null,
        version: 0,
        profile: null,
        syncError: null,
        mortgageStaged: null,
      });
    },

    loadDemo: (next) => { set({ state: next, mode: "demo" }); },

    connect: async ({ gameId, profile }) => {
      teardownSubscription();
      activeGameId = gameId;
      set({
        connection: "online",
        gameId,
        profile,
        mode: "live",
        // Seat unknown until the row loads. Null myPlayerId means the pacer
        // can't claim "self" against the still-local default state during the
        // load gap, so it stays idle until applyStateUpdate fills the seat.
        myPlayerId: null,
        syncError: null,
      });

      // Subscribe before loading so an update landing in the gap isn't
      // missed. Everyone subscribes now — the route is the sole writer, so a
      // member receives its own writes back here just like anyone else.
      activeUnsub = subscribeGame(gameId, (next, version) => {
        if (activeGameId !== gameId) return;
        useMonopolyStore.getState().applyStateUpdate(next, version);
      });

      let loaded: LoadedGame | null;
      try {
        loaded = await loadGame(gameId);
      } catch (err: unknown) {
        set({ syncError: errorMessage(err) });
        return;
      }
      // A newer connect() may have superseded us mid-await.
      if (activeGameId !== gameId) return;

      if (loaded) {
        const seated = isMember(loaded.state, profile);
        set({
          state: loaded.state,
          version: loaded.version,
          myPlayerId: seated ? profile.id : null,
        });
        return;
      }

      // First open of this game: ask the route to seed and insert it. On a
      // create conflict (someone created it first) fall back to loading the
      // existing row.
      const res = await submitAction(gameId, { type: "create", profile });
      if (activeGameId !== gameId) return;
      if (res.ok) {
        const seated = isMember(res.state, profile);
        set({
          state: res.state,
          version: res.version,
          myPlayerId: seated ? profile.id : null,
        });
        return;
      }
      if (res.conflict) {
        const row = await loadGame(gameId);
        if (activeGameId !== gameId || !row) return;
        const seated = isMember(row.state, profile);
        set({
          state: row.state,
          version: row.version,
          myPlayerId: seated ? profile.id : null,
        });
        return;
      }
      set({ syncError: res.reason ?? "failed to create game" });
    },

    disconnect: () => {
      teardownSubscription();
      set({
        connection: "local",
        gameId: null,
        version: 0,
        profile: null,
        state: freshGame(),
        myPlayerId: DEFAULT_PLAYER_ID,
        mode: "live",
        syncError: null,
        mortgageStaged: null,
      });
    },

    restart: async () => {
      const { connection, gameId, profile } = get();
      if (connection !== "online" || !gameId || !profile) return;
      const res = await submitAction(gameId, { type: "reset", profile });
      if (res.ok) {
        set({
          state: res.state,
          version: res.version,
          myPlayerId: isMember(res.state, profile) ? profile.id : null,
          syncError: null,
        });
      } else {
        set({ syncError: res.reason ?? "failed to restart" });
      }
    },

    resume: async () => {
      const { connection, gameId, profile } = get();
      if (connection !== "online" || !gameId) return;
      try {
        const row = await loadGame(gameId);
        if (!row) {
          set({ syncError: "no game row to resume" });
          return;
        }
        const seated = profile ? isMember(row.state, profile) : false;
        set({
          state: row.state,
          version: row.version,
          myPlayerId: seated && profile ? profile.id : null,
          syncError: null,
        });
      } catch (err: unknown) {
        set({ syncError: errorMessage(err) });
      }
    },
  };
});

// Auto-pacing lives in the store, not the component. Each state change is
// observed once: if pacing is currently enabled, schedule the next
// mechanical step on a delay; otherwise leave the game at rest until an
// intent, mode change, or role change wakes it back up. Guarded on
// `window` so importing this module under SSR or test runners (no DOM, no
// timers wanted) is a no-op.
if (typeof window !== "undefined") {
  let pacingTimer: ReturnType<typeof setTimeout> | null = null;

  const pacerEnabled = (store: MonopolyStore): boolean => {
    if (store.mode !== "live") return false;
    // Only an in-play game auto-advances; a lobby (or a finished game) is at
    // rest until `startGame` flips it to `active`.
    if (store.state.status !== "active") return false;
    if (store.state.turn.paused) return false;
    const role = driverRole(store.connection, store.state, store.myPlayerId);
    if (role === "none") return false;
    const { phase } = store.state.turn;
    if (!PACED_PHASES.has(phase)) return false;
    // Buy and must-raise-cash are real decisions. A "proxy" driver resolves
    // them for a bot / absent seat via bot policy below; a "self" driver
    // leaves them to the local human's Buy/Pass UI and mortgage panel.
    if (role === "self" && (phase === "buy-decision" || phase === "must-raise-cash")) {
      return false;
    }
    return true;
  };

  const tick = (): void => {
    pacingTimer = null;
    const store = useMonopolyStore.getState();
    if (!pacerEnabled(store)) return;
    const { phase, playerId } = store.state.turn;
    if (phase === "pre-roll") {
      // Mechanical beat — applies to "self" and "proxy" drivers alike.
      store.step();
    } else if (phase === "post-roll") {
      // No "end turn" button by design: auto-end once the turn settles.
      store.submit({ kind: "end-turn", playerId });
    } else {
      // buy-decision / must-raise-cash — reached here only as a "proxy" driver
      // (pacerEnabled gates the human out). Resolve via bot policy.
      const intent = botIntent(store.state, playerId);
      if (intent) store.submit(intent);
    }
  };

  const schedule = (): void => {
    if (pacingTimer !== null) return;
    const store = useMonopolyStore.getState();
    if (!pacerEnabled(store)) return;
    pacingTimer = setTimeout(tick, STEP_DELAY_MS);
  };

  const cancel = (): void => {
    if (pacingTimer === null) return;
    clearTimeout(pacingTimer);
    pacingTimer = null;
  };

  useMonopolyStore.subscribe((next, prev) => {
    if (
      next.state === prev.state &&
      next.mode === prev.mode &&
      next.connection === prev.connection &&
      next.myPlayerId === prev.myPlayerId
    ) {
      return;
    }
    // State, mode, connection, or local seat changed — drop any pending tick
    // scheduled against the old context, then re-evaluate from scratch. All
    // four feed `driverRole`/`pacerEnabled`, so any of them changing can
    // wake or sleep the pacer.
    cancel();
    schedule();
  });

  schedule();
}
