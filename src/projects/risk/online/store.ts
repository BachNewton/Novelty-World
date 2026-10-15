import { EMPTY_CLIENT, reduce, shown, type ClientState, type SyncEvent } from "@/shared/lib/client-sync";
import type { PlayerProfile } from "@/shared/lib/profile";
import type { Answer, GameView, Move, Options, RiskEngine, Seat } from "../contract";
import { riskDiag, type GameIo } from "./client";
import { pendingSeat, syncRules, type LoggedEvent, type OnlineGame } from "./game";
import type { Request, Response } from "./protocol";
import { botToMove, seatOf, type GameRow } from "./table";

/*
 * One online game on this phone, as a store for `useSyncExternalStore`. The
 * game itself goes through the shared client sync: the row's game as the
 * server confirmed it, and this player's answers not yet confirmed, applied
 * on top at once. The rest of the row (status, seats) is kept as the newest
 * version seen. The row is reloaded whenever the subscription (re)connects
 * and whenever the tab wakes, and a reload that finds a bot's decision
 * waiting nudges the server to drive it.
 */

export type Client = ClientState<OnlineGame, Answer, LoggedEvent>;

export interface OnlineSnapshot {
  id: string;
  /** False until the first load answers. */
  loaded: boolean;
  /** The row as last seen, its game aside; null when the table is gone. */
  table: Omit<GameRow, "game"> | null;
  /** This player's seat, or null for a spectator. */
  seat: Seat | null;
  /** What this player may see of the game shown; null until it starts. */
  view: GameView | null;
  /** This player's legal moves, when the decision is theirs. */
  options: Options | null;
  /** The seat the game waits on, or null when it waits on no one. */
  waitingOn: Seat | null;
  /** The events shown so far, oldest first, each once, redacted for this player. */
  events: readonly LoggedEvent[];
  /** Why the latest move came to nothing. */
  problem: string | null;
  /** Why the latest lobby request came to nothing. */
  notice: string | null;
}

export interface OnlineStore {
  subscribe: (listener: () => void) => () => void;
  snapshot: () => OnlineSnapshot;
  /** Takes this player's move: shown at once, sent in order, confirmed or dropped by the server. */
  act: (move: Move) => void;
  join: () => void;
  addBot: () => void;
  removeSeat: (seat: Seat) => void;
  start: () => void;
  /** Starts loading and listening; the returned function stops. */
  connect: () => () => void;
}

export interface StoreDeps {
  id: string;
  profile: () => PlayerProfile;
  engine: RiskEngine;
  io: GameIo;
  /** Calls back whenever the page wakes or comes back online; returns its own removal. */
  onWake: (wake: () => void) => () => void;
}

export function browserWake(wake: () => void): () => void {
  const onVisible = () => {
    if (document.visibilityState === "visible") wake();
  };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", wake);
  window.addEventListener("pageshow", wake);
  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("online", wake);
    window.removeEventListener("pageshow", wake);
  };
}

const NO_SERVER = "Couldn't reach the server";

export function createOnlineStore(deps: StoreDeps): OnlineStore {
  const { id, engine, io } = deps;
  const rules = syncRules(engine);
  const listeners = new Set<() => void>();
  let loaded = false;
  let row: GameRow | null = null;
  let client: Client = EMPTY_CLIENT;
  let notice: string | null = null;
  let snapshot = compute();

  function compute(): OnlineSnapshot {
    const table = row && { id: row.id, version: row.version, status: row.status, seats: row.seats };
    const seat = row && seatOf(row, deps.profile().id);
    const game = shown(rules, client);
    const view = game && engine.view(game.engine, seat);
    const waitingOn = game && pendingSeat(engine, game);
    return {
      id,
      loaded,
      table,
      seat,
      view,
      options: game && seat !== null && waitingOn === seat ? engine.options(game.engine, seat) : null,
      waitingOn,
      events: client.feed.flatMap((logged) => engine.redact([logged.event], seat).map((event) => ({ id: logged.id, event }))),
      problem: client.problem,
      notice,
    };
  }

  function publish() {
    snapshot = compute();
    riskDiag("snapshot of row", row?.version, "confirmed", client.confirmed?.version, "waiting on", snapshot.waitingOn, "seat", snapshot.seat);
    for (const listener of listeners) listener();
  }

  function takeRow(next: GameRow) {
    if (!row || next.version > row.version) row = next;
  }

  function dispatch(event: SyncEvent<OnlineGame, Answer>) {
    const before = client;
    client = reduce(rules, before, event);
    const sending = client.inFlight;
    if (sending && sending !== before.inFlight) send(sending);
  }

  function send(answer: Answer) {
    io.post({ op: "move", game: id, profile: deps.profile(), answer })
      .then((response) => answered(answer, response))
      .catch((error: unknown) => {
        console.error(error);
        const confirmed = client.confirmed;
        if (!confirmed) throw new Error("A move was sent before the game loaded");
        dispatch({ type: "rejected", action: answer, reason: NO_SERVER, version: confirmed.version, state: confirmed.state });
        publish();
        reload();
      });
  }

  function answered(answer: Answer, response: Response) {
    if (response.row) takeRow(response.row);
    const game = response.row?.game;
    const version = response.row?.version;
    if (game && version !== undefined) {
      dispatch(
        response.ok
          ? { type: "accepted", action: answer, version, state: game }
          : { type: "rejected", action: answer, reason: response.reason, version, state: game },
      );
    } else {
      const confirmed = client.confirmed;
      if (!confirmed) throw new Error("A move was answered before the game loaded");
      dispatch({ type: "rejected", action: answer, reason: response.ok ? "The game is gone" : response.reason, version: confirmed.version, state: confirmed.state });
    }
    publish();
  }

  function received(next: GameRow) {
    riskDiag("received row", next.version, next.status, "decision", next.game?.decision, "held row", row?.version);
    takeRow(next);
    if (next.game) dispatch({ type: "server-state", version: next.version, state: next.game });
    publish();
  }

  function reload() {
    riskDiag("reload");
    io.load(id)
      .then((next) => {
        loaded = true;
        if (!next) {
          publish();
          return;
        }
        received(next);
        if (botToMove(engine, next)) void io.post({ op: "nudge", game: id });
      })
      .catch((error: unknown) => {
        console.error(error);
        notice = NO_SERVER;
        publish();
      });
  }

  function request(make: (profile: PlayerProfile) => Request) {
    io.post(make(deps.profile()))
      .then((response) => {
        notice = response.ok ? null : response.reason;
        if (response.row) received(response.row);
        else publish();
      })
      .catch((error: unknown) => {
        console.error(error);
        notice = NO_SERVER;
        publish();
      });
  }

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => snapshot,
    act: (move) => {
      const game = shown(rules, client);
      const seat = snapshot.seat;
      if (!game || seat === null) throw new Error("Only a seated player can move, once the game has loaded");
      dispatch({ type: "local-action", action: { decision: game.decision, seat, move } });
      publish();
    },
    join: () => request((profile) => ({ op: "join", game: id, profile })),
    addBot: () => request((profile) => ({ op: "add-bot", game: id, profile })),
    removeSeat: (seat) => request((profile) => ({ op: "remove-seat", game: id, profile, seat })),
    start: () => request((profile) => ({ op: "start", game: id, profile })),
    connect: () => {
      const unsubscribe = io.subscribe(id, received, reload);
      const unwake = deps.onWake(reload);
      reload();
      return () => {
        unsubscribe();
        unwake();
      };
    },
  };
}
