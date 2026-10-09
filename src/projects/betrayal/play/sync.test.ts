import { describe, expect, it } from "vitest";
import { createRng, type Rng } from "@/shared/lib/seeded-random";
import { ENGINE } from "../game";
import { apply, choices } from "../engine/step-loop";
import { testGame } from "../testing";
import type { Action, GameState } from "../types";
import { EMPTY_CLIENT, localTransport, reduce, shown, type ClientState, type SyncEvent } from "./sync";

const below = (rng: Rng, n: number) => Math.floor(rng.next() * n);

/** A random legal action for whoever the game waits on. */
function someAction(rng: Rng, state: GameState): Action {
  const pending = state.pending;
  if (!pending) throw new Error("Nothing is pending");
  if (pending.type === "ready") return { kind: "ready", wait: pending.id, seat: pending.seats[0] };
  const seat = pending.seats.find((s) => !(s in pending.answers));
  if (seat === undefined) throw new Error("Every addressee has answered");
  const listed = choices(ENGINE, state, seat);
  return { kind: "choose", decision: pending.id, seat, choice: listed[below(rng, listed.length)].choice };
}

/** A game played from its start: the states after each of its actions, `states[i]` being version i. */
function history(seed: string, length: number): { states: GameState[]; actions: Action[] } {
  const rng = createRng(`history/${seed}`);
  const states = [testGame({ seed })];
  const actions: Action[] = [];
  for (let i = 0; i < length; i++) {
    const action = someAction(rng, states[i]);
    const result = apply(ENGINE, states[i], action);
    if (!result.ok) throw new Error(result.reason);
    actions.push(action);
    states.push(result.state);
  }
  return { states, actions };
}

const run = (client: ClientState, events: SyncEvent[]) => events.reduce((c, e) => reduce(ENGINE, c, e), client);
const same = (a: GameState | null, b: GameState) => expect(JSON.stringify(a)).toBe(JSON.stringify(b));
const started = (state: GameState) => reduce(ENGINE, EMPTY_CLIENT, { type: "server-state", version: 0, state });

describe("client sync", () => {
  it("shows a local action at once, and keeps showing it once the server confirms it", () => {
    const { states, actions } = history("at-once", 1);
    let client = reduce(ENGINE, started(states[0]), { type: "local-action", action: actions[0] });
    same(shown(ENGINE, client), states[1]);
    expect(client.inFlight).toEqual(actions[0]);
    client = reduce(ENGINE, client, { type: "accepted", action: actions[0], version: 1, state: states[1] });
    expect(client.queue).toEqual([]);
    expect(client.inFlight).toBeNull();
    same(shown(ENGINE, client), states[1]);
  });

  it("sends one action at a time, in order", () => {
    const { states, actions } = history("in-order", 2);
    let client = run(started(states[0]), actions.map((action) => ({ type: "local-action", action })));
    expect(client.inFlight).toEqual(actions[0]);
    client = reduce(ENGINE, client, { type: "accepted", action: actions[0], version: 1, state: states[1] });
    expect(client.inFlight).toEqual(actions[1]);
  });

  it("drops a rejected action and everything queued after it, and says why", () => {
    const { states, actions } = history("rejected", 3);
    // Another device answered the first decision differently.
    const rng = createRng("rejected/other");
    let other = someAction(rng, states[0]);
    while (JSON.stringify(other) === JSON.stringify(actions[0])) other = someAction(rng, states[0]);
    const elsewhere = apply(ENGINE, states[0], other);
    if (!elsewhere.ok) throw new Error(elsewhere.reason);
    let client = run(started(states[0]), actions.map((action) => ({ type: "local-action", action })));
    client = reduce(ENGINE, client, { type: "rejected", action: actions[0], reason: "That decision is no longer pending", version: 1, state: elsewhere.state });
    expect(client.queue).toEqual([]);
    expect(client.problem).toBe("That decision is no longer pending");
    same(shown(ENGINE, client), elsewhere.state);
  });

  it("refuses a local action that doesn't apply to what it shows", () => {
    const { states, actions } = history("refuse", 2);
    const client = reduce(ENGINE, started(states[0]), { type: "local-action", action: actions[1] });
    expect(client.queue).toEqual([]);
    expect(client.problem).not.toBeNull();
  });

  it("ignores a server state no newer than the one it has", () => {
    const { states } = history("stale", 2);
    const client = reduce(ENGINE, started(states[0]), { type: "server-state", version: 2, state: states[2] });
    expect(reduce(ENGINE, client, { type: "server-state", version: 1, state: states[1] })).toBe(client);
    expect(reduce(ENGINE, client, { type: "server-state", version: 2, state: states[2] })).toBe(client);
  });

  // The property: however the server's answers and echoes arrive (twice,
  // out of order, or not at all), the client shows exactly the game its own
  // actions make, never a state the server has moved past, and plays each event once.
  it.each(Array.from({ length: 24 }, (_, i) => `property-${i}`))("shows its own game through duplicated, reordered and dropped updates (%s)", (seed) => {
    const rng = createRng(seed);
    const length = 6 + below(rng, 10);
    const { states, actions } = history(seed, length);
    let client = started(states[0]);
    const pool: SyncEvent[] = [];
    let taken = 0;
    let newest = 0;
    const deliver = () => {
      const event = pool[below(rng, pool.length)];
      const roll = rng.next();
      // Drop it, deliver it and keep it for a duplicate, or deliver it once.
      if (roll < 0.2 || roll >= 0.5) pool.splice(pool.indexOf(event), 1);
      if (roll < 0.2) return;
      client = reduce(ENGINE, client, event);
      if (event.type !== "local-action") newest = Math.max(newest, event.version);
    };
    while (taken < length || pool.length > 0) {
      if (taken < length && (pool.length === 0 || rng.next() < 0.5)) {
        const action = actions[taken];
        client = reduce(ENGINE, client, { type: "local-action", action });
        taken++;
        pool.push({ type: "accepted", action, version: taken, state: states[taken] }, { type: "server-state", version: taken, state: states[taken] });
      } else deliver();
      same(shown(ENGINE, client), states[taken]);
      expect(client.confirmed?.version).toBe(newest);
      const ids = client.feed.map((event) => event.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    expect(client.queue.length).toBe(taken - newest);
  });
});

describe("localTransport", () => {
  it("accepts a legal action with the next version, and rejects one that doesn't apply with the state as it is", async () => {
    const { states, actions } = history("transport", 2);
    const local = localTransport(ENGINE, states[0]);
    const rejected = await local.transport.send(actions[1]);
    expect(rejected).toMatchObject({ type: "rejected", version: 0 });
    const accepted = await local.transport.send(actions[0]);
    expect(accepted).toMatchObject({ type: "accepted", version: 1 });
    expect(local.actions()).toEqual([actions[0]]);
    expect((await local.transport.load()).version).toBe(1);
  });
});
