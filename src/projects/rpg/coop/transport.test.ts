import { beforeEach, describe, expect, it, vi } from "vitest";
import { isCoopMessage, isTileCell } from "./types";
import type { CoopMessage } from "./types";

const { FakeConn, FakePeer, peers } = vi.hoisted(() => {
  class FakeConn {
    open = true;
    sent: unknown[] = [];
    handlers = new Map<string, Array<(arg?: never) => void>>();
    constructor(public peer: string) {}
    on(event: string, cb: (arg?: never) => void): this {
      const list = this.handlers.get(event) ?? [];
      list.push(cb);
      this.handlers.set(event, list);
      return this;
    }
    emit(event: string, arg?: never): void {
      for (const cb of this.handlers.get(event) ?? []) cb(arg);
    }
    send(data: unknown): void {
      this.sent.push(data);
    }
    close(): void {
      this.open = false;
      this.emit("close");
    }
  }

  class FakePeer {
    static instances: FakePeer[] = [];
    id?: string;
    destroyed = false;
    handlers = new Map<string, Array<(arg?: never) => void>>();
    lastConnect: FakeConn | null = null;
    constructor(id?: string) {
      this.id = id;
      FakePeer.instances.push(this);
    }
    on(event: string, cb: (arg?: never) => void): this {
      const list = this.handlers.get(event) ?? [];
      list.push(cb);
      this.handlers.set(event, list);
      return this;
    }
    emit(event: string, arg?: never): void {
      for (const cb of this.handlers.get(event) ?? []) cb(arg);
    }
    connect(_hostId: string): FakeConn {
      const conn = new FakeConn("guest-conn");
      this.lastConnect = conn;
      return conn;
    }
    reconnect(): void {}
    destroy(): void {
      this.destroyed = true;
    }
  }

  return { FakeConn, FakePeer, peers: FakePeer.instances };
});

vi.mock("peerjs", () => ({ Peer: FakePeer }));

import { createCoopTransport } from "./transport";

beforeEach(() => {
  peers.length = 0;
});

function lastPeer(): InstanceType<typeof FakePeer> {
  const peer = peers.at(-1);
  if (!peer) throw new Error("expected a Peer instance");
  return peer;
}

/** Flush pending promise continuations without any clock. The fake peers
 * emit synchronously, so a few microtask turns settle every `claimOrJoin`
 * continuation — no timer mocks involved. */
async function flush(times = 10): Promise<void> {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

async function becomeHost(hostId = "test-host") {
  const transport = createCoopTransport({ hostId, reelectRetryMs: 10 });
  transport.start();
  lastPeer().emit("open", hostId as never);
  await flush();
  expect(transport.getState().role).toBe("host");
  return transport;
}

async function becomeGuest(hostId = "test-host", guestId = "guest-a") {
  const transport = createCoopTransport({ hostId });
  transport.start();
  lastPeer().emit("error", { type: "unavailable-id" } as never);
  await flush();
  lastPeer().emit("open", guestId as never);
  await flush();
  expect(transport.getState().role).toBe("guest");
  return transport;
}

describe("coop wire message validation", () => {
  it("accepts a pos message", () => {
    expect(
      isCoopMessage({
        kind: "pos",
        from: "peer-a",
        pos: { x: 10, y: 20, dir: "side", flip: true, moving: false, timestamp: 1000 },
      }),
    ).toBe(true);
  });

  it("rejects pos with bad facing or non-finite coords", () => {
    expect(
      isCoopMessage({
        kind: "pos",
        from: "peer-a",
        pos: { x: Number.NaN, y: 0, dir: "side", flip: false, moving: true },
      }),
    ).toBe(false);
    expect(
      isCoopMessage({
        kind: "pos",
        from: "peer-a",
        pos: { x: 0, y: 0, dir: "up", flip: false, moving: true },
      }),
    ).toBe(false);
  });

  it("accepts tile batches and snapshots, rejects empty batches", () => {
    const cell = { c: 3, r: 5, tile: { src: "/s.png", sx: 1, sy: 2 }, seq: 7, author: "a" };
    expect(isCoopMessage({ kind: "tiles", from: "a", cells: [cell] })).toBe(true);
    expect(isCoopMessage({ kind: "snapshot", from: "a", cells: [] })).toBe(true);
    expect(isCoopMessage({ kind: "tiles", from: "a", cells: [] })).toBe(false);
  });

  it("accepts clear / snapshot-request / peer-left, rejects unknown kinds", () => {
    expect(isCoopMessage({ kind: "clear", from: "a", seq: 4 })).toBe(true);
    expect(isCoopMessage({ kind: "snapshot-request", from: "a" })).toBe(true);
    expect(
      isCoopMessage({ kind: "peer-left", from: "test-host", peerId: "guest-a" }),
    ).toBe(true);
    expect(isCoopMessage({ kind: "peer-left", from: "a" })).toBe(false);
    expect(isCoopMessage({ kind: "hello", from: "a" })).toBe(false);
    expect(isCoopMessage({ kind: "bye", from: "a" })).toBe(false);
    expect(isCoopMessage({ kind: "heartbeat", from: "a" })).toBe(false);
    expect(isCoopMessage({ kind: "teleport", from: "a" })).toBe(false);
    expect(isCoopMessage({ kind: "pos", from: "" })).toBe(false);
  });
});

describe("coop tile cell bounds", () => {
  const base = { tile: null, seq: 1, author: "a" };

  it("accepts in-bounds cells including erases", () => {
    expect(isTileCell({ ...base, c: 0, r: 0 })).toBe(true);
    expect(isTileCell({ ...base, c: 39, r: 27 })).toBe(true);
  });

  it("rejects out-of-bounds cells and bad seq/author", () => {
    expect(isTileCell({ ...base, c: 40, r: 0 })).toBe(false);
    expect(isTileCell({ ...base, c: 0, r: 28 })).toBe(false);
    expect(isTileCell({ ...base, c: -1, r: 0 })).toBe(false);
    expect(isTileCell({ ...base, c: 0, r: 0, seq: -1 })).toBe(false);
    expect(isTileCell({ ...base, c: 0, r: 0, author: "" })).toBe(false);
    expect(isTileCell({ ...base, c: 0, r: 0, tile: { src: "", sx: 0, sy: 0 } })).toBe(false);
  });
});

describe("coop host rebroadcast fan-out", () => {
  it("delivers a guest message locally and to every other guest only", async () => {
    const transport = await becomeHost();
    const received: CoopMessage[] = [];
    transport.onMessage((msg) => received.push(msg));

    const connA = new FakeConn("guest-a");
    const connB = new FakeConn("guest-b");
    lastPeer().emit("connection", connA as never);
    lastPeer().emit("connection", connB as never);
    expect(transport.getState().peers).toEqual(["guest-a", "guest-b"]);

    const pos = {
      kind: "pos",
      from: "guest-a",
      pos: { x: 1, y: 2, dir: "side", flip: false, moving: true, timestamp: 1000 },
    };
    connA.emit("data", pos as never);

    expect(received).toEqual([pos]);
    expect(connA.sent).toEqual([]);
    expect(connB.sent).toEqual([pos]);
    transport.destroy();
  });

  it("synthesizes peer-left on guest disconnect and fans it out", async () => {
    const transport = await becomeHost();
    const received: CoopMessage[] = [];
    transport.onMessage((msg) => received.push(msg));

    const connA = new FakeConn("guest-a");
    const connB = new FakeConn("guest-b");
    lastPeer().emit("connection", connA as never);
    lastPeer().emit("connection", connB as never);
    connA.close();

    expect(transport.getState().peers).toEqual(["guest-b"]);
    expect(received).toEqual([
      { kind: "peer-left", from: "test-host", peerId: "guest-a" },
    ]);
    expect(connB.sent).toEqual([
      { kind: "peer-left", from: "test-host", peerId: "guest-a" },
    ]);
    transport.destroy();
  });

  it("drops spoofed peer-left messages arriving off the wire", async () => {
    const transport = await becomeHost();
    const received: CoopMessage[] = [];
    transport.onMessage((msg) => received.push(msg));

    const connA = new FakeConn("guest-a");
    const connB = new FakeConn("guest-b");
    lastPeer().emit("connection", connA as never);
    lastPeer().emit("connection", connB as never);
    connA.emit("data", {
      kind: "peer-left",
      from: "guest-a",
      peerId: "guest-b",
    } as never);

    expect(received).toEqual([]);
    expect(connB.sent).toEqual([]);
    transport.destroy();
  });

  it("host send broadcasts to all guests", async () => {
    const transport = await becomeHost();
    const connA = new FakeConn("guest-a");
    lastPeer().emit("connection", connA as never);
    transport.send({ kind: "snapshot-request" });
    expect(connA.sent).toEqual([
      { kind: "snapshot-request", from: "test-host" },
    ]);
    transport.destroy();
  });
});

describe("event-chained re-election (no timers)", () => {
  it("host peer close chains a fresh claim synchronously", async () => {
    const transport = await becomeHost();
    const claims = peers.length;
    lastPeer().emit("close");
    // No awaiting: the re-claim is chained synchronously off the event, and
    // `reconnecting` is published before the chain starts.
    expect(peers.length).toBe(claims + 1);
    expect(transport.getState().status).toBe("reconnecting");
    expect(transport.getState().role).toBeNull();
    // The new claimant wins the fixed id → host again.
    lastPeer().emit("open", "test-host" as never);
    await flush();
    expect(transport.getState()).toMatchObject({
      role: "host",
      status: "connected",
    });
    transport.destroy();
  });

  it("disconnected and peer-unavailable chain a claim; other errors do not", async () => {
    const transport = await becomeHost();
    const claims = peers.length;
    lastPeer().emit("error", { type: "network" } as never);
    expect(peers.length).toBe(claims);
    expect(transport.getState().status).toBe("connected");
    lastPeer().emit("disconnected");
    expect(peers.length).toBe(claims + 1);
    expect(transport.getState().status).toBe("reconnecting");
    transport.destroy();
  });

  it("concurrent close/error/disconnected events stack only one claim", async () => {
    const transport = await becomeHost();
    const claims = peers.length;
    const peer = lastPeer();
    peer.emit("close");
    peer.emit("error", { type: "unavailable-id" } as never);
    peer.emit("disconnected");
    expect(peers.length).toBe(claims + 1);
    transport.destroy();
  });

  it("guest host-conn close re-elects synchronously and can rejoin", async () => {
    const transport = await becomeGuest();
    const guestPeer = lastPeer();
    const conn = guestPeer.lastConnect;
    if (!conn) throw new Error("expected a host connection");
    const claims = peers.length;
    conn.emit("close");
    expect(peers.length).toBe(claims + 1);
    expect(transport.getState().status).toBe("reconnecting");
    // Loses the claim race → guest again under a fresh id.
    lastPeer().emit("error", { type: "unavailable-id" } as never);
    await flush();
    lastPeer().emit("open", "guest-b" as never);
    await flush();
    expect(transport.getState().role).toBe("guest");
    expect(transport.getState().status).toBe("connected");
    transport.destroy();
  });

  it("destroyed transports ignore peer events", async () => {
    const transport = await becomeHost();
    const claims = peers.length;
    transport.destroy();
    lastPeer().emit("close");
    lastPeer().emit("error", { type: "unavailable-id" } as never);
    expect(peers.length).toBe(claims);
  });

  it("failed claims publish reconnecting for the next event to chain", async () => {
    const transport = createCoopTransport({ hostId: "test-host" });
    transport.start();
    lastPeer().emit("error", { type: "boom" } as never);
    await flush();
    expect(transport.getState().status).toBe("reconnecting");
    transport.destroy();
  });
});
