import { describe, expect, it, vi } from "vitest";
import type { GameIo } from "./client";
import type { Request } from "./protocol";
import { drive, handle } from "./server";
import { createOnlineStore } from "./store";
import { ENGINE } from "../play-engine";
import type { GameRow } from "./table";
import { memoryStore, testDeps } from "./testing";

const ALICE = { id: "alice", name: "Alice" };

/** The real server logic over a memory database, as the phone's IO, with each call recorded. */
function harness() {
  const db = memoryStore();
  const server = testDeps(ENGINE, db.store);
  const sent: Request[] = [];
  const subscription = { onRow: null as ((row: GameRow) => void) | null, onConnected: null as (() => void) | null };
  let wake: (() => void) | null = null;
  let offline = false;
  let open = 0;
  const track = <T>(promise: Promise<T>) => {
    open++;
    return promise.finally(() => open--);
  };
  const io: GameIo = {
    load: (id) => track(db.store.read(id)),
    subscribe: (_id, onRow, onConnected) => {
      subscription.onRow = onRow;
      subscription.onConnected = onConnected;
      return () => undefined;
    },
    post: (request) => {
      sent.push(request);
      return track(offline ? Promise.reject(new Error("offline")) : handle(server, request));
    },
  };
  const store = createOnlineStore({ id: "GAME", profile: () => ALICE, engine: ENGINE, io, onWake: (w) => ((wake = w), () => undefined) });
  /** Runs every call in flight, and what their answers set off, to the end. */
  const settle = async () => {
    do await new Promise((resolve) => setImmediate(resolve));
    while (open > 0);
  };
  return {
    db,
    server,
    store,
    sent,
    subscription,
    settle,
    wake: () => wake?.(),
    setOffline: (value: boolean) => (offline = value),
  };
}

async function started(bots: number) {
  const h = harness();
  await handle(h.server, { op: "create", profile: ALICE });
  for (let i = 0; i < bots; i++) await handle(h.server, { op: "add-bot", game: "GAME", profile: ALICE });
  await handle(h.server, { op: "start", game: "GAME", profile: ALICE });
  return h;
}

/** Hands the decision to Alice (seat 0): the bots before her play as the server would. */
async function alicesTurn(h: Awaited<ReturnType<typeof started>>) {
  await drive(h.server, "GAME");
}

describe("the online store", () => {
  it("loads the table and the game, and shows this player's seat and options", async () => {
    const h = await started(2);
    await alicesTurn(h);
    h.store.connect();
    await h.settle();
    const snap = h.store.snapshot();
    expect(snap.loaded).toBe(true);
    expect(snap.table?.status).toBe("playing");
    expect(snap.seat).toBe(0);
    expect(snap.waitingOn).toBe(0);
    expect(snap.options?.kind).toBe("setup-place");
    expect(snap.events.length).toBeGreaterThan(0);
  });

  it("nudges the server when a load finds a bot's decision waiting, and on a wake or a resubscribe loads again", async () => {
    const h = await started(2);
    // Whose turn it is first is drawn; hand it to a bot so a nudge is due.
    const row = h.db.rows.get("GAME");
    if (!row?.game) throw new Error("No game");
    const active = ENGINE.view(row.game.engine, null).active;
    h.db.rows.set("GAME", { ...row, seats: row.seats.map((c, seat) => (seat === active ? { kind: "bot", bot: "random" } : c)) });
    h.store.connect();
    await h.settle();
    expect(h.sent.filter((r) => r.op === "nudge")).toHaveLength(1);
    h.wake();
    h.subscription.onConnected?.();
    await h.settle();
    expect(h.sent.filter((r) => r.op === "nudge")).toHaveLength(3);
  });

  it("shows a move at once, sends it naming its decision, and settles on the server's answer", async () => {
    const h = await started(2);
    await alicesTurn(h);
    h.store.connect();
    await h.settle();
    const before = h.store.snapshot();
    const options = before.options;
    if (options?.kind !== "setup-place") throw new Error("Expected setup");
    h.store.act({ kind: "place", territory: options.ownTerritories[0], armies: 1 });
    const territory = options.ownTerritories[0];
    expect(h.store.snapshot().view?.territories[territory].armies).toBe((before.view?.territories[territory].armies ?? 0) + 1);
    const move = h.sent.find((r) => r.op === "move");
    expect(move).toMatchObject({ answer: { decision: h.db.rows.get("GAME")?.game?.decision, seat: 0 } });
    await h.settle();
    expect(h.store.snapshot().table?.version).toBe(h.db.rows.get("GAME")?.version);
    expect(h.store.snapshot().problem).toBeNull();
  });

  it("drops a move the server can't be reached for, says so, and reloads", async () => {
    const h = await started(2);
    await alicesTurn(h);
    h.store.connect();
    await h.settle();
    const options = h.store.snapshot().options;
    if (options?.kind !== "setup-place") throw new Error("Expected setup");
    h.setOffline(true);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    h.store.act({ kind: "place", territory: options.ownTerritories[0], armies: 1 });
    await h.settle();
    error.mockRestore();
    expect(h.store.snapshot().problem).toBe("Couldn't reach the server");
    expect(h.store.snapshot().waitingOn).toBe(0);
  });

  it("joins, adds a bot and starts from the lobby", async () => {
    const h = harness();
    await handle(h.server, { op: "create", profile: { id: "bob", name: "Bob" } });
    h.store.connect();
    await h.settle();
    expect(h.store.snapshot().seat).toBeNull();
    h.store.join();
    await h.settle();
    expect(h.store.snapshot().seat).toBe(1);
    h.store.start();
    await h.settle();
    expect(h.store.snapshot().notice).toMatch(/at least 3/);
    h.store.addBot();
    await h.settle();
    h.store.start();
    await h.settle();
    expect(h.store.snapshot().table?.status).toBe("playing");
    expect(h.store.snapshot().view).not.toBeNull();
  });
});
