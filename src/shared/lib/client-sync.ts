/*
 * Client sync for a server-authoritative game, as one pure function over four
 * events: a state from the server, an action this client takes, and the server
 * accepting or rejecting the action it was sent. The client keeps the last
 * state the server confirmed and a queue of its own unconfirmed actions; what
 * it shows is the confirmed state with the queue applied, worked out by
 * `shown`, never stored. It never handles versions beyond keeping the highest
 * it has seen: an action names the decision it answers, and the server does
 * the rest.
 *
 * A game binds it with its `SyncRules`: how an action applies (the same pure
 * engine the server runs, so a local apply computes the real result), which
 * actions are the same answer, and whether a state already holds an action.
 */

export type SyncApply<S> = { ok: true; state: S } | { ok: false; reason: string };

export interface SyncRules<S, A, E> {
  apply: (state: S, action: A) => SyncApply<S>;
  /** Two actions are the same answer when they answer the same decision for the same seat. */
  sameAnswer: (a: A, b: A) => boolean;
  /** Whether a state already holds an action: the server took it, so it leaves the queue. */
  included: (state: S, action: A) => boolean;
  /** The events the state's latest write made, for the feed. */
  lastEvents: (state: S) => readonly E[];
  /** An event's id, stable across the server and local applies, so an echo isn't played twice. */
  eventId: (event: E) => string;
}

/** A state the server wrote, with its version: each write raises it. */
export interface Confirmed<S> {
  version: number;
  state: S;
}

export interface ClientState<S, A, E> {
  confirmed: Confirmed<S> | null;
  /** This client's actions the server hasn't confirmed, oldest first. */
  queue: A[];
  /** The queued action sent and awaiting its answer: the queue's first, or
   *  null while nothing is out. The store sends whenever this changes. */
  inFlight: A | null;
  /** The events that have become shown, oldest first, each once, for the
   *  presentation to play: local applies add theirs at once, and a server
   *  state adds the ones not seen yet. */
  feed: E[];
  /** Why the latest action came to nothing, until the next one is taken. */
  problem: string | null;
}

export type SyncEvent<S, A> =
  | { type: "server-state"; version: number; state: S }
  | { type: "local-action"; action: A }
  | { type: "accepted"; action: A; version: number; state: S }
  | { type: "rejected"; action: A; reason: string; version: number; state: S };

/** Events kept in the feed: enough for the presentation to catch up on. */
export const FEED_KEPT = 200;

export const EMPTY_CLIENT: ClientState<never, never, never> = { confirmed: null, queue: [], inFlight: null, feed: [], problem: null };

/** The queue replayed over a state: actions it already holds drop away, and
 *  the first that no longer applies drops with everything after it. */
function prune<S, A, E>(rules: SyncRules<S, A, E>, state: S, queue: readonly A[]): A[] {
  const kept: A[] = [];
  let at = state;
  for (const action of queue) {
    if (rules.included(at, action)) continue;
    const result = rules.apply(at, action);
    if (!result.ok) break;
    kept.push(action);
    at = result.state;
  }
  return kept;
}

function withFeed<S, A, E>(rules: SyncRules<S, A, E>, feed: readonly E[], events: readonly E[]): E[] {
  const seen = new Set(feed.map(rules.eventId));
  const added = events.filter((event) => !seen.has(rules.eventId(event)));
  return added.length === 0 ? [...feed] : [...feed, ...added].slice(-FEED_KEPT);
}

/** The action in flight after the queue changed: it stays while still queued, else the queue's first goes out. */
function nextInFlight<S, A, E>(rules: SyncRules<S, A, E>, queue: readonly A[], inFlight: A | null): A | null {
  if (inFlight && queue.some((action) => rules.sameAnswer(action, inFlight))) return inFlight;
  return queue.at(0) ?? null;
}

/** A server state: kept only when newer than the confirmed one, and the queue pruned against it. */
function serverState<S, A, E>(rules: SyncRules<S, A, E>, client: ClientState<S, A, E>, version: number, state: S): ClientState<S, A, E> {
  if (client.confirmed && version <= client.confirmed.version) return client;
  const queue = prune(rules, state, client.queue);
  return {
    ...client,
    confirmed: { version, state },
    queue,
    inFlight: nextInFlight(rules, queue, client.inFlight),
    feed: withFeed(rules, client.feed, rules.lastEvents(state)),
  };
}

/** What the client shows: the confirmed state with the queue applied in order. */
export function shown<S, A, E>(rules: SyncRules<S, A, E>, client: ClientState<S, A, E>): S | null {
  if (!client.confirmed) return null;
  let state = client.confirmed.state;
  for (const action of client.queue) {
    const result = rules.apply(state, action);
    if (!result.ok) throw new Error(`A queued action no longer applies: ${result.reason}`);
    state = result.state;
  }
  return state;
}

export function reduce<S, A, E>(rules: SyncRules<S, A, E>, client: ClientState<S, A, E>, event: SyncEvent<S, A>): ClientState<S, A, E> {
  switch (event.type) {
    case "server-state":
      return serverState(rules, client, event.version, event.state);
    case "local-action": {
      const state = shown(rules, client);
      if (!state) return { ...client, problem: "The game hasn't loaded yet" };
      const result = rules.apply(state, event.action);
      if (!result.ok) return { ...client, problem: result.reason };
      const queue = [...client.queue, event.action];
      return {
        ...client,
        queue,
        inFlight: nextInFlight(rules, queue, client.inFlight),
        feed: withFeed(rules, client.feed, rules.lastEvents(result.state)),
        problem: null,
      };
    }
    case "accepted": {
      const queue = client.queue.filter((action) => !rules.sameAnswer(action, event.action));
      return serverState(rules, { ...client, queue, inFlight: nextInFlight(rules, queue, client.inFlight) }, event.version, event.state);
    }
    case "rejected": {
      const at = client.queue.findIndex((action) => rules.sameAnswer(action, event.action));
      const queue = at === -1 ? client.queue : client.queue.slice(0, at);
      return serverState(
        rules,
        { ...client, queue, inFlight: nextInFlight(rules, queue, client.inFlight), problem: event.reason },
        event.version,
        event.state,
      );
    }
  }
}

export type Answered<S, A> = Extract<SyncEvent<S, A>, { type: "accepted" | "rejected" }>;

/** Where the client sends its actions. The answer comes back as a sync event. */
export interface Transport<S, A> {
  send: (action: A) => Promise<Answered<S, A>>;
  /** The latest state, as a load or a resubscribe fetches it. */
  load: () => Promise<Extract<SyncEvent<S, A>, { type: "server-state" }>>;
}

/** A stand-in for the server in this browser: the single writer, applying
 *  each action to its own state through the rules, as a route would. It
 *  keeps every accepted action, so a game can be saved and replayed. */
export function localTransport<S, A, E>(rules: SyncRules<S, A, E>, start: S, actions: readonly A[] = []) {
  let state = start;
  let written = [...actions];
  const version = () => written.length;
  const transport: Transport<S, A> = {
    send: (action) => {
      const result = rules.apply(state, action);
      if (!result.ok) return Promise.resolve({ type: "rejected", action, reason: result.reason, version: version(), state });
      state = result.state;
      written = [...written, action];
      return Promise.resolve({ type: "accepted", action, version: version(), state });
    },
    load: () => Promise.resolve({ type: "server-state", version: version(), state }),
  };
  return { transport, actions: () => written, current: () => ({ version: version(), state }) };
}
