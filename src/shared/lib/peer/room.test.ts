import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Player, RoomEvents, RoomState, RoomTarget } from "./room";

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
    constructor(
      public peer: string,
      public metadata?: unknown,
    ) {
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
    connect(id: string, options?: { metadata?: unknown }): FakeConn {
      const conn = new FakeConn(id, options?.metadata);
      this.conns.push(conn);
      return conn;
    }
    /** A guest dials in. */
    incoming(id: string, metadata: unknown = { id: `profile-${id}`, name: id }): FakeConn {
      const conn = new FakeConn(id, metadata);
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

import { createRoom, generateRoomCode, hostPeerId, parseRoomCode } from "./room";

const GAME = "test";
const CODE = "ROOM";
const HOST_ID = hostPeerId(GAME, CODE);
const PROFILE = { id: "me", name: "Me" };

function lastPeer(): InstanceType<typeof FakePeer> {
  const peer = FakePeer.all.at(-1);
  if (peer === undefined) throw new Error("no peer created");
  return peer;
}

function harness(target: RoomTarget = { mode: "claim", code: CODE }) {
  const states: RoomState[] = [];
  const log: string[] = [];
  const events: RoomEvents<unknown, unknown> = {
    onState: (s) => states.push(s),
    onGuestJoined: (p) => log.push(`joined ${p.peerId}`),
    onGuestLeft: (p) => log.push(`left ${p.peerId}`),
    onHostMessage: (message) => log.push(`host ${JSON.stringify(message)}`),
    onGuestMessage: (from, message) => log.push(`guest ${from.peerId} ${JSON.stringify(message)}`),
  };
  const room = createRoom({ game: GAME, target, profile: PROFILE, events });
  return {
    room,
    log,
    state: () => states.at(-1),
    states,
  };
}

function players(...list: Player[]) {
  return { kind: "players", players: list };
}

function msg(message: unknown) {
  return { kind: "message", message };
}

const HOST_PLAYER: Player = { id: "host", name: "Host", peerId: HOST_ID };
const SELF_AS_GUEST: Player = { ...PROFILE, peerId: "g1" };

function startAsHost(target?: RoomTarget) {
  const h = harness(target);
  h.room.start();
  lastPeer().emit("open", lastPeer().requestedId);
  return h;
}

/** Joins as guest `g1`, linked and handed the host's list. */
function startAsGuest(target: RoomTarget = { mode: "claim", code: CODE }) {
  const h = harness(target);
  h.room.start();
  if (target.mode === "claim") lastPeer().emit("error", { type: "unavailable-id" });
  const guestPeer = lastPeer();
  guestPeer.emit("open", "g1");
  const hostConn = guestPeer.conns[0];
  hostConn.accept();
  hostConn.emit("data", players(HOST_PLAYER, SELF_AS_GUEST));
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

describe("room codes", () => {
  it("draws codes a person can read back unambiguously", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode();
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
      expect(parseRoomCode(code)).toBe(code);
    }
  });

  it("normalises typed codes and rejects what can't be one", () => {
    expect(parseRoomCode(" abcd ")).toBe("ABCD");
    expect(parseRoomCode("AB")).toBeNull();
    expect(parseRoomCode("AB0D")).toBeNull();
    expect(parseRoomCode("AB!D")).toBeNull();
  });

  it("namespaces the host's peer id by game", () => {
    expect(hostPeerId("euchre", "ABCD")).not.toBe(hostPeerId("tic-tac-toe", "ABCD"));
  });
});

describe("claiming the room", () => {
  it("claims the room id and hosts when granted", () => {
    const h = harness();
    h.room.start();
    expect(lastPeer().requestedId).toBe(HOST_ID);
    expect(h.state()?.status).toBe("connecting");
    lastPeer().emit("open", HOST_ID);
    expect(h.state()).toEqual({
      status: "connected",
      role: "host",
      code: CODE,
      selfId: HOST_ID,
      players: [{ ...PROFILE, peerId: HOST_ID }],
    });
  });

  it("joins the holder as a guest when the id is taken, connected once it has the list", () => {
    const h = harness();
    h.room.start();
    const claimant = lastPeer();
    claimant.emit("error", { type: "unavailable-id" });
    expect(claimant.destroyed).toBe(true);
    const guestPeer = lastPeer();
    expect(guestPeer.requestedId).toBeUndefined();
    guestPeer.emit("open", "g1");
    expect(guestPeer.conns.map((c) => c.peer)).toEqual([HOST_ID]);
    expect(guestPeer.conns[0].metadata).toEqual(PROFILE);
    guestPeer.conns[0].accept();
    expect(h.state()?.status).toBe("connecting");
    guestPeer.conns[0].emit("data", players(HOST_PLAYER, SELF_AS_GUEST));
    expect(h.state()).toEqual({
      status: "connected",
      role: "guest",
      code: CODE,
      selfId: "g1",
      players: [HOST_PLAYER, SELF_AS_GUEST],
    });
  });

  it("retries a failed attempt at once, then waits for the browser to come back online", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const h = harness();
    h.room.start();
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
    expect(lastPeer().requestedId).toBe(HOST_ID);
    expect(h.state()?.status).toBe("reconnecting");
  });

  it("a successful connection resets the retry budget", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const h = harness();
    h.room.start();
    lastPeer().emit("error", { type: "network" });
    lastPeer().emit("error", { type: "network" });
    lastPeer().emit("open", HOST_ID);
    lastPeer().emit("disconnected");
    lastPeer().emit("disconnected"); // fails, but with a fresh budget
    expect(h.state()?.status).toBe("reconnecting");
  });
});

describe("hosting", () => {
  it("tracks guests, hands everyone the player list, and routes their messages", () => {
    const h = startAsHost();
    const conn = lastPeer().incoming("g1", { id: "p1", name: "Ann" });
    expect(h.log).toEqual([]);
    conn.accept();
    expect(h.log).toEqual(["joined g1"]);
    const list = [
      { ...PROFILE, peerId: HOST_ID },
      { id: "p1", name: "Ann", peerId: "g1" },
    ];
    expect(h.state()?.players).toEqual(list);
    expect(conn.sent).toEqual([players(...list)]);
    conn.emit("data", msg({ hi: 1 }));
    expect(h.log.at(-1)).toBe('guest g1 {"hi":1}');
    conn.close();
    expect(h.log.at(-1)).toBe("left g1");
    expect(h.state()?.players).toEqual([list[0]]);
  });

  it("tells the others when someone leaves", () => {
    startAsHost();
    const a = lastPeer().incoming("a");
    const b = lastPeer().incoming("b");
    a.accept();
    b.accept();
    b.close();
    expect(a.sent.at(-1)).toEqual(players({ ...PROFILE, peerId: HOST_ID }, { id: "profile-a", name: "a", peerId: "a" }));
  });

  it("refuses a guest without a profile", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const h = startAsHost();
    const conn = lastPeer().incoming("g1", null);
    conn.accept();
    expect(h.log).toEqual([]);
    expect(h.state()?.players).toHaveLength(1);
  });

  it("drops malformed guest data loudly", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const h = startAsHost();
    const conn = lastPeer().incoming("g1");
    conn.accept();
    conn.emit("data", { hi: 1 });
    expect(h.log).toEqual(["joined g1"]);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("broadcasts to every guest but the excluded one, and sends to one", () => {
    const h = startAsHost();
    const a = lastPeer().incoming("a");
    const b = lastPeer().incoming("b");
    a.accept();
    b.accept();
    a.sent = [];
    b.sent = [];
    h.room.broadcast("all");
    h.room.broadcast("not-a", "a");
    h.room.sendTo("b", "just-b");
    expect(a.sent).toEqual([msg("all")]);
    expect(b.sent).toEqual([msg("all"), msg("not-a"), msg("just-b")]);
  });

  it("re-registers with the signalling server once, then re-claims the room", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const h = startAsHost();
    const peer = lastPeer();
    peer.emit("disconnected");
    expect(peer.reconnects).toBe(1);
    expect(h.state()?.status).toBe("connected");
    peer.emit("open", HOST_ID); // re-registered
    peer.emit("disconnected");
    expect(peer.reconnects).toBe(2);
    peer.emit("disconnected"); // lost again before re-registering
    expect(peer.destroyed).toBe(true);
    expect(lastPeer().requestedId).toBe(HOST_ID);
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

describe("host mode", () => {
  it("hosts a freshly drawn code", () => {
    const h = startAsHost({ mode: "host" });
    const code = h.state()?.code ?? "";
    expect(parseRoomCode(code)).toBe(code);
    expect(lastPeer().requestedId).toBe(hostPeerId(GAME, code));
    expect(h.state()?.role).toBe("host");
  });

  it("draws another code when the first is already held", () => {
    const h = harness({ mode: "host" });
    h.room.start();
    const first = lastPeer();
    first.emit("error", { type: "unavailable-id" });
    expect(first.destroyed).toBe(true);
    const second = lastPeer();
    expect(second.requestedId).not.toBe(first.requestedId);
    expect(second.requestedId).toBe(hostPeerId(GAME, h.state()?.code ?? ""));
  });
});

describe("join mode", () => {
  it("dials the code's host without trying to claim it", () => {
    const h = startAsGuest({ mode: "join", code: CODE });
    expect(FakePeer.all.map((p) => p.requestedId)).toEqual([undefined]);
    expect(h.state()?.role).toBe("guest");
  });

  it("ends in not-found when nobody holds the code", () => {
    const h = harness({ mode: "join", code: CODE });
    h.room.start();
    const peer = lastPeer();
    peer.emit("open", "g1");
    peer.emit("error", { type: "peer-unavailable" });
    expect(peer.destroyed).toBe(true);
    expect(FakePeer.all).toHaveLength(1);
    expect(h.state()?.status).toBe("not-found");
  });

  it("ends in disconnected when the host goes, rather than taking over", () => {
    const h = startAsGuest({ mode: "join", code: CODE });
    h.hostConn.close();
    expect(FakePeer.all).toHaveLength(1);
    expect(h.state()).toMatchObject({ status: "disconnected", role: null, players: [] });
  });
});

describe("guest", () => {
  it("routes host messages and sends upstream", () => {
    const h = startAsGuest();
    h.hostConn.emit("data", msg("hello"));
    expect(h.log).toEqual([`host "hello"`]);
    h.room.sendToHost("up");
    expect(h.hostConn.sent).toEqual([msg("up")]);
  });

  it("follows the host's list as it changes", () => {
    const h = startAsGuest();
    const other: Player = { id: "p2", name: "Bo", peerId: "g2" };
    h.hostConn.emit("data", players(HOST_PLAYER, SELF_AS_GUEST, other));
    expect(h.state()?.players).toEqual([HOST_PLAYER, SELF_AS_GUEST, other]);
  });

  it("re-claims the room when the host leaves", () => {
    const h = startAsGuest();
    h.hostConn.close();
    expect(h.guestPeer.destroyed).toBe(true);
    expect(lastPeer().requestedId).toBe(HOST_ID);
    expect(h.state()).toEqual({ status: "reconnecting", role: null, code: CODE, selfId: null, players: [] });
    lastPeer().emit("open", HOST_ID);
    expect(h.state()?.role).toBe("host");
  });

  it("re-claims when the host vanished before our dial landed", () => {
    const h = harness();
    h.room.start();
    lastPeer().emit("error", { type: "unavailable-id" });
    lastPeer().emit("open", "g1");
    lastPeer().emit("error", { type: "peer-unavailable" });
    expect(lastPeer().requestedId).toBe(HOST_ID);
    expect(h.state()?.status).toBe("reconnecting");
  });

  it("re-claims when the channel to the host can't be negotiated", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const h = harness();
    h.room.start();
    lastPeer().emit("error", { type: "unavailable-id" });
    const guestPeer = lastPeer();
    guestPeer.emit("open", "g1");
    guestPeer.conns[0].emit("error", { type: "negotiation-failed" });
    expect(guestPeer.destroyed).toBe(true);
    expect(lastPeer().requestedId).toBe(HOST_ID);
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
    h.room.start();
    expect(() => h.room.sendToHost("x")).toThrow(/not connected/);
  });
});

describe("teardown", () => {
  /** `stop` tears down at the end of the current task. */
  const endOfTask = () => Promise.resolve();

  it("stop destroys the peer without firing stale re-election", async () => {
    const h = startAsGuest();
    const peers = FakePeer.all.length;
    h.room.stop();
    await endOfTask();
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
    oldConn.emit("data", msg("late"));
    h.guestPeer.emit("open", "late-id");
    expect(h.states.length).toBe(statesBefore);
    expect(h.log).toEqual([]);
  });

  it("a start in the same task as a stop keeps the live connection (React StrictMode remount)", async () => {
    const h = startAsHost();
    const peer = lastPeer();
    h.room.stop();
    h.room.start();
    await endOfTask();
    expect(peer.destroyed).toBe(false);
    expect(FakePeer.all).toHaveLength(1);
    expect(h.state()).toMatchObject({ status: "connected", role: "host" });
  });

  it("can start again after a completed stop", async () => {
    const h = startAsHost();
    h.room.stop();
    await endOfTask();
    h.room.start();
    lastPeer().emit("open", HOST_ID);
    expect(FakePeer.all).toHaveLength(2);
    expect(h.state()).toMatchObject({ status: "connected", role: "host" });
  });
});
