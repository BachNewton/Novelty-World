"use client";

import { create } from "zustand";
import type { PlayerProfile } from "@/shared/lib/profile";
import { apply, autoStep } from "./engine";
import { ownablePrice } from "./logic";
import { freshGame } from "./mocks";
import { loadGame, saveGame, subscribeGame } from "./sync";
import type { ApplyResult, GameState, Intent, TurnPhase } from "./types";

// Visible pause between mechanical steps so the user can read each roll land
// in the log and watch the camera glide + token slide settle before the next
// one. Slow enough to follow; fast enough that a no-op loop isn't sluggish.
const STEP_DELAY_MS = 2000;

// Phases the auto-pacer is allowed to drive. Anything else (auction,
// trade, game-over) is a fixed point; the pacer leaves it alone and waits
// for an intent to break out. `buy-decision` is paced only when the active
// player is not the local user — bots auto-buy / auto-pass, the human gets
// the Buy/Pass UI and decides at their own speed.
const PACED_PHASES: ReadonlySet<TurnPhase> = new Set([
  "pre-roll",
  "post-roll",
  "buy-decision",
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

  /** Host: validate and apply an intent, then drain mechanics via autoStep
   *  until the next decision point. Returns the full result including the
   *  combined event stream so callers can drive animations or replay.
   *  Rejected for online guests — they can't drive the engine until the
   *  intent-relay transport lands. */
  submit: (intent: Intent) => ApplyResult;

  /** Host: advance mechanics without an intent. Used to kick off the very
   *  first roll on game start and to step between phases the pacing layer
   *  drives in the UI. No-op when the state is already at a decision point
   *  or for online guests. */
  step: () => void;

  /** Guest: replace local state with authoritative state from Supabase.
   *  Also re-derives membership from the incoming roster — a fresh game
   *  pushed by a host elsewhere may have reseated players. */
  applyStateUpdate: (state: GameState) => void;

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
  /** The local user's profile (used to determine host/guest in online mode). */
  profile: PlayerProfile | null;
  /** True iff the local user is the authoritative writer for the current
   *  game: always true in local mode, and in online mode iff the profile
   *  is seated in `state.players`. */
  isHost: boolean;
  /** Last persistence/subscription error, if any. Surfaces sync failures
   *  for debugging without breaking the play loop. */
  syncError: string | null;
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
  // Commit a host-originated state change: set local state and, if online
  // host, persist to Supabase. Guest applies (from postgres-changes) go
  // through applyStateUpdate instead, which deliberately does NOT persist
  // — that would echo a host's own write back at it.
  function commit(next: GameState): void {
    set({ state: next });
    const { connection, isHost, gameId } = get();
    if (connection === "online" && isHost && gameId) {
      void saveGame(gameId, next).catch((err: unknown) => {
        set({ syncError: errorMessage(err) });
      });
    }
  }

  return {
    myPlayerId: DEFAULT_PLAYER_ID,
    state: freshGame(),
    mode: "live",
    connection: "local",
    gameId: null,
    profile: null,
    // Local mode treats the client as host so the pacer drives the game;
    // online mode recomputes this in `connect()`.
    isHost: true,
    syncError: null,

    setMyPlayer: (playerId) => { set({ myPlayerId: playerId }); },

    submit: (intent) => {
      const { state, connection, isHost } = get();
      if (connection === "online" && !isHost) {
        return { ok: false, reason: "not the host" };
      }
      const result = apply(state, intent);
      if (!result.ok) return result;
      const stepped = autoStep(result.state);
      commit(stepped.state);
      return {
        ok: true,
        state: stepped.state,
        newEvents: [...result.newEvents, ...stepped.newEvents],
      };
    },

    step: () => {
      const { state, connection, isHost } = get();
      if (connection === "online" && !isHost) return;
      const stepped = autoStep(state);
      if (stepped.state !== state) commit(stepped.state);
    },

    applyStateUpdate: (next) => {
      const { profile } = get();
      const host = profile ? isMember(next, profile) : false;
      set({
        state: next,
        isHost: host,
        myPlayerId: host && profile ? profile.id : null,
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
        profile: null,
        isHost: true,
        syncError: null,
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
        // isHost stays whatever it was until we know membership; the
        // pacer's gate treats online + !isHost as paused, so a brief
        // stale value during load won't drive the engine.
        isHost: false,
        syncError: null,
      });

      let row: GameState | null;
      try {
        row = await loadGame(gameId);
      } catch (err: unknown) {
        set({ syncError: errorMessage(err) });
        return;
      }
      // A newer connect() may have superseded us mid-await.
      if (activeGameId !== gameId) return;

      if (!row) {
        // First open of this game: seed fresh and become host.
        const seeded = freshGame(`${gameId}-${Date.now().toString()}`, profile);
        set({ state: seeded, isHost: true, myPlayerId: profile.id });
        try {
          await saveGame(gameId, seeded);
        } catch (err: unknown) {
          set({ syncError: errorMessage(err) });
        }
        return;
      }

      const host = isMember(row, profile);
      set({
        state: row,
        isHost: host,
        myPlayerId: host ? profile.id : null,
      });

      // Hosts are the sole writer; subscribing to their own echoes would
      // bounce them through applyStateUpdate and restart the pacer
      // needlessly. Only guests subscribe.
      if (!host) {
        activeUnsub = subscribeGame(gameId, (next) => {
          if (activeGameId !== gameId) return;
          useMonopolyStore.getState().applyStateUpdate(next);
        });
      }
    },

    disconnect: () => {
      teardownSubscription();
      set({
        connection: "local",
        gameId: null,
        profile: null,
        isHost: true,
        state: freshGame(),
        myPlayerId: DEFAULT_PLAYER_ID,
        mode: "live",
        syncError: null,
      });
    },

    restart: async () => {
      const { connection, isHost, gameId, profile } = get();
      if (connection !== "online" || !gameId || !profile) return;
      if (!isHost) {
        set({ syncError: "only the host can restart" });
        return;
      }
      const seeded = freshGame(`${gameId}-${Date.now().toString()}`, profile);
      set({ state: seeded, syncError: null });
      try {
        await saveGame(gameId, seeded);
      } catch (err: unknown) {
        set({ syncError: errorMessage(err) });
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
        const host = profile ? isMember(row, profile) : false;
        set({
          state: row,
          isHost: host,
          myPlayerId: host && profile ? profile.id : null,
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
    if (store.state.turn.paused) return false;
    if (!store.isHost) return false;
    const { phase, playerId } = store.state.turn;
    if (!PACED_PHASES.has(phase)) return false;
    // Buy decisions belong to the player landing on the square. The pacer
    // bot-plays everyone else (no input channel for non-local seats yet),
    // but the local human gets the Buy/Pass UI and chooses themselves.
    if (phase === "buy-decision" && playerId === store.myPlayerId) return false;
    return true;
  };

  const tick = (): void => {
    pacingTimer = null;
    const store = useMonopolyStore.getState();
    if (!pacerEnabled(store)) return;
    const { phase, playerId, pendingBuy } = store.state.turn;
    if (phase === "pre-roll") {
      store.step();
    } else if (phase === "post-roll") {
      store.submit({ kind: "end-turn", playerId });
    } else if (phase === "buy-decision" && pendingBuy !== undefined) {
      // Bot policy: buy whenever affordable, otherwise decline. This is the
      // baseline behavior CLAUDE.md sketches; smarter policies will plug in
      // later via `preferences` and a real bot module.
      const player = store.state.players.find((p) => p.id === playerId);
      const price = ownablePrice(pendingBuy);
      if (!player || price === null) return;
      const intent: Intent =
        player.cash >= price
          ? { kind: "buy", playerId }
          : { kind: "decline-buy", playerId };
      store.submit(intent);
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
      next.isHost === prev.isHost &&
      next.myPlayerId === prev.myPlayerId
    ) {
      return;
    }
    // State, mode, role, or local-seat changed — drop any pending tick that
    // was scheduled against the old context, then re-evaluate from scratch.
    // `myPlayerId` matters because the buy-decision pacer skips the local
    // seat; assigning or clearing it must wake/sleep the pacer accordingly.
    cancel();
    schedule();
  });

  schedule();
}
