import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TransportEvents, TransportState } from "./transport";

const { FakePeer } = vi.hoisted(() => {
  type Handler = (...args: never[]) => void;

  class Emitter {
    private handlers = new Map<string, Handler[]>();
    on(event: string, handler: Handler): this {
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
      return this;
    }
    emit(event: string, ...args: unknown[]): void {
      for (const handler of this.handlers.get(event) ?? []) (handler as (...a: unknown[]) => void)(...args);
    }
  }

  /** Mirrors PeerJS: `close` fires only for a channel that was open. */
  class FakeConn extends Emitter {
    open = false;
    sent: unknown[] = [];
    constructor(public peer: string) {
      super();
    }
    send(data: unknown): void {
      this.sent.push(data);
    }
    accept(): void {
      this.open = true;
      this.emit("open");
    }
    close(): void {
      if (!this.open) return;
      this.open = false;
      this.emit("close");
    }
  }

  /** Mirrors PeerJS: `destroy` closes every connection it owns. */
  class FakePeer extends Emitter {
    static all: FakePeer[] = [];
    conns: FakeConn[] = [];
    destroyed = false;
    reconnects = 0;
    requestedId?: string;
    constructor(idOrOptions?: unknown) {
      super();
      if (typeof idOrOptions === "string") this.requestedId = idOrOptions;
      FakePeer.all.push(this);
    }
    connect(id: string): FakeConn {
      const conn = new FakeConn(id);
      this.conns.push(conn);
      return conn;
    }
    /** A guest dials in. */
    incoming(id: string): FakeConn {
      const conn = new FakeConn(id);
      this.conns.push(conn);
      this.emit("connection", conn);
      return conn;
    }
    reconnect(): void {
      this.reconnects += 1;
    }
    destroy(): void {
      this.destroyed = true;
      for (const conn of this.conns) conn.close();
      this.emit("close");
    }
  }

  return { FakePeer };
});

vi.mock("peerjs", () => ({ Peer: FakePeer }));

import { createTransport } from "./transport";

const ROOM = "room";

function lastPeer(): InstanceType<typeof FakePeer> {
  const peer = FakePeer.all.at(-1);
  if (peer === undefined) throw new Error("no peer created");
  return peer;
}

function harness() {
  const states: TransportState[] = [];
  const log: string[] = [];
  const events: TransportEvents = {
    onState: (s) => states.push(s),
    onGuestJoined: (id) => log.push(`joined ${id}`),
    onGuestLeft: (id) => log.push(`left ${id}`),
    onData: (from, data) => log.push(`data ${from} ${JSON.stringify(data)}`),
  };
  const transport = createTransport(ROOM, events);
  return {
    transport,
    log,
    state: () => states.at(-1),
    states,
  };
}

function startAsHost() {
  const h = harness();
  h.transport.start();
  lastPeer().emit("open", ROOM);
  return h;
}

function startAsGuest(guestId = "g1") {
  const h = harness();
  h.transport.start();
  lastPeer().emit("error", { type: "unavailable-id" });
  const guestPeer = lastPeer();
  guestPeer.emit("open", guestId);
  const hostConn = guestPeer.conns[0];
  hostConn.accept();
  return { ...h, guestPeer, hostConn };
}

beforeEach(() => {
  FakePeer.all = [];
  vi.stubGlobal("window", new EventTarget());
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("claiming the room", () => {
  it("claims the room id and hosts when granted", () => {
    const h = harness();
    h.transport.start();
    expect(lastPeer().requestedId).toBe(ROOM);
    expect(h.state()?.status).toBe("connecting");
    lastPeer().emit("open", ROOM);
    expect(h.state()).toEqual({ status: "connected", role: "host", selfId: ROOM, peerCount: 0 });
  });

  it("joins the holder as a guest when the id is taken", () => {
    const h = harness();
    h.transport.start();
    const claimant = lastPeer();
    claimant.emit("error", { type: "unavailable-id" });
    expect(claimant.destroyed).toBe(true);
    const guestPeer = lastPeer();
    expect(guestPeer.requestedId).toBeUndefined();
    guestPeer.emit("open", "g1");
    expect(guestPeer.conns.map((c) => c.peer)).toEqual([ROOM]);
    expect(h.state()?.status).toBe("connecting");
    guestPeer.conns[0].accept();
    expect(h.state()).toEqual({ status: "connected", role: "guest", selfId: "g1", peerCount: 1 });
  });

  it("retries a failed attempt at once, then waits for the browser to come back online", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const h = harness();
    h.transport.start();
    lastPeer().emit("error", { type: "network" });
    expect(h.state()?.status).toBe("reconnecting");
    lastPeer().emit("error", { type: "server-error" });
    expect(h.state()?.status).toBe("reconnecting");
    expect(warn).toHaveBeenCalledTimes(2);
    const last = lastPeer();
    last.emit("error", { type: "network" });
    expect(last.destroyed).toBe(true);
    expect(h.state()?.status).toBe("offline");
    expect(console.error).toHaveBeenCalledOnce();

    const peersBefore = FakePeer.all.length;
    window.dispatchEvent(new Event("online"));
    expect(FakePeer.all.length).toBe(peersBefore + 1);
    expect(lastPeer().requestedId).toBe(ROOM);
    expect(h.state()?.status).toBe("reconnecting");
  });

  it("a successful connection resets the retry budget", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const h = harness();
    h.transport.start();
    lastPeer().emit("error", { type: "network" });
    lastPeer().emit("error", { type: "network" });
    lastPeer().emit("open", ROOM);
    lastPeer().emit("disconnected");
    lastPeer().emit("disconnected"); // fails, but with a fresh budget
    expect(h.state()?.status).toBe("reconnecting");
  });
});

describe("hosting", () => {
  it("tracks guests and routes their data", () => {
    const h = startAsHost();
    const conn = lastPeer().incoming("g1");
    expect(h.log).toEqual([]);
    conn.accept();
    expect(h.log).toEqual(["joined g1"]);
    expect(h.state()?.peerCount).toBe(1);
    conn.emit("data", { hi: 1 });
    expect(h.log.at(-1)).toBe('data g1 {"hi":1}');
    conn.close();
    expect(h.log.at(-1)).toBe("left g1");
    expect(h.state()?.peerCount).toBe(0);
  });

  it("broadcasts to every guest but the excluded one, and sends to one", () => {
    const h = startAsHost();
    const a = lastPeer().incoming("a");
    const b = lastPeer().incoming("b");
    a.accept();
    b.accept();
    h.transport.broadcast("all");
    h.transport.broadcast("not-a", "a");
    h.transport.sendTo("b", "just-b");
    expect(a.sent).toEqual(["all"]);
    expect(b.sent).toEqual(["all", "not-a", "just-b"]);
  });

  it("re-registers with the signalling server once, then re-claims the room", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const h = startAsHost();
    const peer = lastPeer();
    peer.emit("disconnected");
    expect(peer.reconnects).toBe(1);
    expect(h.state()?.status).toBe("connected");
    peer.emit("open", ROOM); // re-registered
    peer.emit("disconnected");
    expect(peer.reconnects).toBe(2);
    peer.emit("disconnected"); // lost again before re-registering
    expect(peer.destroyed).toBe(true);
    expect(lastPeer().requestedId).toBe(ROOM);
    expect(h.state()?.status).toBe("reconnecting");
  });

  it("yields to a rival host that took the room while signalling was down", () => {
    const h = startAsHost();
    const peer = lastPeer();
    peer.emit("disconnected");
    peer.emit("error", { type: "unavailable-id" });
    expect(peer.destroyed).toBe(true);
    expect(lastPeer().requestedId).toBeUndefined();
    expect(h.state()?.role).toBeNull();
  });
});

describe("guest", () => {
  it("routes host data and sends upstream", () => {
    const h = startAsGuest();
    h.hostConn.emit("data", "hello");
    expect(h.log).toEqual([`data ${ROOM} "hello"`]);
    h.transport.sendToHost("up");
    expect(h.hostConn.sent).toEqual(["up"]);
  });

  it("re-claims the room when the host leaves", () => {
    const h = startAsGuest();
    h.hostConn.close();
    expect(h.guestPeer.destroyed).toBe(true);
    expect(lastPeer().requestedId).toBe(ROOM);
    expect(h.state()).toEqual({ status: "reconnecting", role: null, selfId: null, peerCount: 0 });
    lastPeer().emit("open", ROOM);
    expect(h.state()?.role).toBe("host");
  });

  it("re-claims when the host vanished before our dial landed", () => {
    const h = harness();
    h.transport.start();
    lastPeer().emit("error", { type: "unavailable-id" });
    lastPeer().emit("open", "g1");
    lastPeer().emit("error", { type: "peer-unavailable" });
    expect(lastPeer().requestedId).toBe(ROOM);
    expect(h.state()?.status).toBe("reconnecting");
  });

  it("re-claims when the channel to the host can't be negotiated", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const h = harness();
    h.transport.start();
    lastPeer().emit("error", { type: "unavailable-id" });
    const guestPeer = lastPeer();
    guestPeer.emit("open", "g1");
    guestPeer.conns[0].emit("error", { type: "negotiation-failed" });
    expect(guestPeer.destroyed).toBe(true);
    expect(lastPeer().requestedId).toBe(ROOM);
    expect(h.state()?.status).toBe("reconnecting");
    expect(warn).toHaveBeenCalledOnce();
  });

  it("ignores signalling errors once the channel is up", () => {
    const h = startAsGuest();
    h.guestPeer.emit("error", { type: "network" });
    expect(h.state()?.status).toBe("connected");
    expect(h.guestPeer.destroyed).toBe(false);
  });

  it("refuses to send when not linked to a host", () => {
    const h = harness();
    h.transport.start();
    expect(() => h.transport.sendToHost("x")).toThrow(/not connected/);
  });
});

describe("teardown", () => {
  it("stop destroys the peer without firing stale re-election", () => {
    const h = startAsGuest();
    const peers = FakePeer.all.length;
    h.transport.stop();
    expect(h.guestPeer.destroyed).toBe(true);
    expect(FakePeer.all.length).toBe(peers);
    expect(h.state()?.status).toBe("idle");
    // Late events from the dead peer are ignored.
    h.guestPeer.emit("error", { type: "peer-unavailable" });
    expect(FakePeer.all.length).toBe(peers);
  });

  it("events from a replaced peer are ignored", () => {
    const h = startAsGuest();
    const oldConn = h.hostConn;
    oldConn.close(); // re-election starts a new claim
    const statesBefore = h.states.length;
    oldConn.emit("data", "late");
    h.guestPeer.emit("open", "late-id");
    expect(h.states.length).toBe(statesBefore);
    expect(h.log).toEqual([]);
  });

  it("can start again after stop (React StrictMode remount)", () => {
    const h = startAsHost();
    h.transport.stop();
    h.transport.start();
    lastPeer().emit("open", ROOM);
    expect(h.state()).toMatchObject({ status: "connected", role: "host" });
  });
});
