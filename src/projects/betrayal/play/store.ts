import { encodeGame, replay, type SharedGame } from "../share";
import type { Engine } from "../engine/step-loop";
import { viewFor, type GameView } from "../engine/view";
import type { Action, GameState } from "../types";
import { nextHolder } from "./seat";
import { EMPTY_CLIENT, localTransport, reduce, shown, type ClientState, type SyncEvent } from "./sync";

/*
 * A hot-seat game in this browser, as a store for `useSyncExternalStore`:
 * the client-sync state over a transport (the local stand-in for the
 * server), the seat holding the device, and that seat's view, which is all
 * the screen renders. Every accepted write saves the game as its share code.
 */

export interface PlaySnapshot {
  client: ClientState;
  /** What the client shows: never rendered as it is, only through `view`. */
  state: GameState;
  /** The seat holding the device. */
  holder: number;
  /** What the holder may see of the shown state. */
  view: GameView;
  /** The game as a share code, as last saved. */
  code: string;
}

export interface PlayStore {
  subscribe: (listener: () => void) => () => void;
  snapshot: () => PlaySnapshot;
  act: (action: Action) => void;
}

export function createPlayStore(engine: Engine, shared: SharedGame, save: (code: string) => void): PlayStore {
  const states = replay(engine, shared, crypto.randomUUID());
  const local = localTransport(engine, states[states.length - 1], shared.actions);
  const codeNow = () => encodeGame({ game: shared.game, actions: local.actions() });
  const listeners = new Set<() => void>();

  const snapshotOf = (client: ClientState, holder: number, code: string): PlaySnapshot => {
    const state = shown(engine, client);
    if (!state) throw new Error("The game has no confirmed state");
    const next = nextHolder(holder, viewFor(engine, state, null));
    return { client, state, holder: next, view: viewFor(engine, state, next), code };
  };

  const { version, state: start } = local.current();
  let snapshot = snapshotOf(reduce(engine, EMPTY_CLIENT, { type: "server-state", version, state: start }), 0, codeNow());
  save(snapshot.code);

  function dispatch(event: SyncEvent) {
    const before = snapshot.client;
    const client = reduce(engine, before, event);
    if (client === before) return;
    let code = snapshot.code;
    if (event.type === "accepted") {
      code = codeNow();
      save(code);
    }
    snapshot = snapshotOf(client, snapshot.holder, code);
    const sending = client.inFlight;
    if (sending && sending !== before.inFlight) void local.transport.send(sending).then(dispatch);
    for (const listener of listeners) listener();
  }

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => snapshot,
    act: (action) => {
      dispatch({ type: "local-action", action });
    },
  };
}
