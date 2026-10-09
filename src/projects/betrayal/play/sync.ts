import { apply, type Engine } from "../engine/step-loop";
import type { Action, GameEvent, GameState } from "../types";

/*
 * Client sync as one pure function over four events: a state from the
 * server, an action this client takes, and the server accepting or rejecting
 * the action it was sent. The client keeps the last state the server
 * confirmed and a queue of its own unconfirmed actions; what it shows is the
 * confirmed state with the queue applied, worked out by `shown`, never
 * stored. It never handles versions beyond keeping the highest it has seen:
 * an action names the decision it answers, and the server does the rest.
 */

/** A state the server wrote, with its version: each write raises it. */
export interface Confirmed {
  version: number;
  state: GameState;
}

export interface ClientState {
  confirmed: Confirmed | null;
  /** This client's actions the server hasn't confirmed, oldest first. */
  queue: Action[];
  /** The queued action sent and awaiting its answer: the queue's first, or
   *  null while nothing is out. The store sends whenever this changes. */
  inFlight: Action | null;
  /** The events that have become shown, oldest first, each once, for the
   *  presentation to play: local applies add theirs at once, and a server
   *  state adds the ones not seen yet. */
  feed: GameEvent[];
  /** Why the latest action came to nothing, until the next one is taken. */
  problem: string | null;
}

export type SyncEvent =
  | { type: "server-state"; version: number; state: GameState }
  | { type: "local-action"; action: Action }
  | { type: "accepted"; action: Action; version: number; state: GameState }
  | { type: "rejected"; action: Action; reason: string; version: number; state: GameState };

/** Events kept in the feed: enough for the presentation to catch up on. */
export const FEED_KEPT = 200;

export const EMPTY_CLIENT: ClientState = { confirmed: null, queue: [], inFlight: null, feed: [], problem: null };

/** Two actions are the same answer when they answer the same pause for the same seat. */
export function sameAnswer(a: Action, b: Action): boolean {
  if (a.kind === "ready" && b.kind === "ready") return a.wait === b.wait && a.seat === b.seat;
  if (a.kind === "choose" && b.kind === "choose") return a.decision === b.decision && a.seat === b.seat;
  return false;
}

/** Whether a state already holds an action: the decision's ledger names its
 *  answer, or the seat is no longer waited on for that ready wait. */
function included(state: GameState, action: Action): boolean {
  if (action.kind === "choose") return state.answered.some((answer) => answer.decision === action.decision && answer.seat === action.seat);
  const pending = state.pending;
  return !(pending?.type === "ready" && pending.id === action.wait && pending.seats.includes(action.seat));
}

/** The queue replayed over a state: actions it already holds drop away, and
 *  the first that no longer applies drops with everything after it. */
function prune(engine: Engine, state: GameState, queue: readonly Action[]): Action[] {
  const kept: Action[] = [];
  let at = state;
  for (const action of queue) {
    if (included(at, action)) continue;
    const result = apply(engine, at, action);
    if (!result.ok) break;
    kept.push(action);
    at = result.state;
  }
  return kept;
}

function withFeed(feed: readonly GameEvent[], events: readonly GameEvent[]): GameEvent[] {
  const seen = new Set(feed.map((event) => event.id));
  const added = events.filter((event) => !seen.has(event.id));
  return added.length === 0 ? [...feed] : [...feed, ...added].slice(-FEED_KEPT);
}

/** The action in flight after the queue changed: it stays while still queued, else the queue's first goes out. */
function nextInFlight(queue: readonly Action[], inFlight: Action | null): Action | null {
  if (inFlight && queue.some((action) => sameAnswer(action, inFlight))) return inFlight;
  return queue.at(0) ?? null;
}

/** A server state: kept only when newer than the confirmed one, and the queue pruned against it. */
function serverState(engine: Engine, client: ClientState, version: number, state: GameState): ClientState {
  if (client.confirmed && version <= client.confirmed.version) return client;
  const queue = prune(engine, state, client.queue);
  return {
    ...client,
    confirmed: { version, state },
    queue,
    inFlight: nextInFlight(queue, client.inFlight),
    feed: withFeed(client.feed, state.lastEvents),
  };
}

/** What the client shows: the confirmed state with the queue applied in order. */
export function shown(engine: Engine, client: ClientState): GameState | null {
  if (!client.confirmed) return null;
  let state = client.confirmed.state;
  for (const action of client.queue) {
    const result = apply(engine, state, action);
    if (!result.ok) throw new Error(`A queued action no longer applies: ${result.reason}`);
    state = result.state;
  }
  return state;
}

export function reduce(engine: Engine, client: ClientState, event: SyncEvent): ClientState {
  switch (event.type) {
    case "server-state":
      return serverState(engine, client, event.version, event.state);
    case "local-action": {
      const state = shown(engine, client);
      if (!state) return { ...client, problem: "The game hasn't loaded yet" };
      const result = apply(engine, state, event.action);
      if (!result.ok) return { ...client, problem: result.reason };
      const queue = [...client.queue, event.action];
      return {
        ...client,
        queue,
        inFlight: nextInFlight(queue, client.inFlight),
        feed: withFeed(client.feed, result.state.lastEvents),
        problem: null,
      };
    }
    case "accepted": {
      const queue = client.queue.filter((action) => !sameAnswer(action, event.action));
      return serverState(engine, { ...client, queue, inFlight: nextInFlight(queue, client.inFlight) }, event.version, event.state);
    }
    case "rejected": {
      const at = client.queue.findIndex((action) => sameAnswer(action, event.action));
      const queue = at === -1 ? client.queue : client.queue.slice(0, at);
      return serverState(engine, { ...client, queue, inFlight: nextInFlight(queue, client.inFlight), problem: event.reason }, event.version, event.state);
    }
  }
}

/** Where the client sends its actions. The answer comes back as a sync event. */
export interface Transport {
  send: (action: Action) => Promise<Extract<SyncEvent, { type: "accepted" | "rejected" }>>;
  /** The latest state, as a load or a resubscribe fetches it. */
  load: () => Promise<Extract<SyncEvent, { type: "server-state" }>>;
}

/** A stand-in for the server in this browser: the single writer, applying
 *  each action to its own state through the engine, as the route will. It
 *  keeps every accepted action, so the game can be saved as a share code. */
export function localTransport(engine: Engine, start: GameState, actions: readonly Action[] = []) {
  let state = start;
  let written = [...actions];
  const version = () => written.length;
  const transport: Transport = {
    send: (action) => {
      const result = apply(engine, state, action);
      if (!result.ok) return Promise.resolve({ type: "rejected", action, reason: result.reason, version: version(), state });
      state = result.state;
      written = [...written, action];
      return Promise.resolve({ type: "accepted", action, version: version(), state });
    },
    load: () => Promise.resolve({ type: "server-state", version: version(), state }),
  };
  return { transport, actions: () => written, current: () => ({ version: version(), state }) };
}
