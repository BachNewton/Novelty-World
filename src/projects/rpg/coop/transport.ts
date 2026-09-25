/**
 * PeerJS star transport. Every tab tries to claim the room's fixed peer id:
 * the PeerJS server grants it to exactly one claimant, who becomes the host;
 * everyone refused (`unavailable-id`) joins that host as a guest. When the
 * host goes away its guests race to claim the id again, so re-election is
 * the same code path as the first join.
 *
 * Purely event-driven. Each handler is bound to the Peer / DataConnection it
 * was registered on and ignores events once that object has been replaced,
 * which is what makes teardown and re-election race-free.
 */

import { Peer, type DataConnection, type PeerError, type PeerOptions } from "peerjs";

export type CoopRole = "host" | "guest";
export type CoopStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline";

export interface TransportState {
  status: CoopStatus;
  role: CoopRole | null;
  /** Our peer id while connected; the host's id is the room id. */
  selfId: string | null;
  /** Host: connected guests. Guest: 1 (the host). */
  peerCount: number;
}

export interface TransportEvents {
  onState(state: TransportState): void;
  /** Host only: a guest's channel opened. */
  onGuestJoined(id: string): void;
  /** Host only: a guest's channel closed. */
  onGuestLeft(id: string): void;
  /** Host: data from a guest. Guest: data from the host. */
  onData(from: string, data: unknown): void;
}

export interface Transport {
  start(): void;
  stop(): void;
  /** Guest only. */
  sendToHost(data: unknown): void;
  /** Host only. */
  sendTo(guestId: string, data: unknown): void;
  /** Host only. */
  broadcast(data: unknown, exceptId?: string): void;
}

type PeerErrorType = PeerError<string>["type"];

/** Test/dev only: `?coop-signal=local` uses the e2e suite's local PeerServer. */
export const SIGNAL_PARAM = "coop-signal";
const LOCAL_SIGNALING: PeerOptions = {
  host: "localhost",
  port: 3003,
  path: "/",
  secure: false,
  // Same-machine peers connect over host candidates; no STUN/TURN needed.
  config: { iceServers: [] },
};

export function peerOptionsFromSearch(search: string): PeerOptions {
  return new URLSearchParams(search).get(SIGNAL_PARAM) === "local" ? LOCAL_SIGNALING : {};
}

/**
 * Consecutive failed attempts (never reaching `connected`) before giving up
 * until the browser reports it is back online. The PeerJS cloud drops the
 * odd signalling socket, so one failure is not worth stranding the player;
 * a persistent one is not worth hammering the server over.
 */
const MAX_ATTEMPTS = 3;

export function createTransport(
  roomId: string,
  events: TransportEvents,
  peerOptions: PeerOptions = {},
): Transport {
  let status: CoopStatus = "idle";
  let role: CoopRole | null = null;
  let selfId: string | null = null;
  let peer: Peer | null = null;
  let hostConn: DataConnection | null = null;
  const guests = new Map<string, DataConnection>();
  let failures = 0;

  function publish(nextStatus: CoopStatus, nextRole: CoopRole | null): void {
    status = nextStatus;
    role = nextRole;
    if (status === "connected") failures = 0;
    events.onState({
      status,
      role,
      selfId: status === "connected" ? selfId : null,
      peerCount: role === "host" ? guests.size : role === "guest" ? 1 : 0,
    });
  }

  /** Forget the current peer first, so the close events its teardown emits
   * fail every `peer === p` / `hostConn === conn` / `guests` check. */
  function dropPeer(): void {
    const old = peer;
    peer = null;
    hostConn = null;
    selfId = null;
    guests.clear();
    old?.destroy();
  }

  function fail(reason: unknown): void {
    failures += 1;
    if (failures < MAX_ATTEMPTS) {
      console.warn(`rpg coop: connection attempt ${failures} failed; retrying`, reason);
      claim();
      return;
    }
    console.error("rpg coop: connection failed; retrying when the browser reports it is online", reason);
    dropPeer();
    publish("offline", null);
  }

  function claim(): void {
    dropPeer();
    publish(status === "idle" ? "connecting" : "reconnecting", null);
    const p = new Peer(roomId, peerOptions);
    peer = p;
    let signalingLost = false;
    p.on("open", () => {
      if (peer !== p) return;
      if (role === "host") {
        signalingLost = false;
        return;
      }
      becomeHost(p);
    });
    p.on("error", (err) => {
      if (peer !== p) return;
      const type: PeerErrorType = err.type;
      if (type === "unavailable-id") {
        // Pre-open: someone else hosts the room, join them. As host (after
        // a signalling reconnect): someone claimed the room while we were
        // away, so the room has two hosts — yield and join theirs.
        join();
      } else if (role !== "host") {
        fail(err);
      }
      // Other host errors end in `disconnected`, handled below.
    });
    // The host's data channels outlive a signalling drop, but without the
    // server nobody new can find the room. Re-register once; a second drop
    // before that succeeds means the network is gone.
    p.on("disconnected", () => {
      if (peer !== p || role !== "host") return;
      if (signalingLost) {
        fail("lost the signalling server");
        return;
      }
      signalingLost = true;
      p.reconnect();
    });
  }

  function becomeHost(p: Peer): void {
    selfId = roomId;
    p.on("connection", (conn) => {
      conn.on("open", () => {
        if (peer !== p) return;
        guests.set(conn.peer, conn);
        publish("connected", "host");
        events.onGuestJoined(conn.peer);
      });
      conn.on("data", (data) => {
        if (guests.get(conn.peer) === conn) events.onData(conn.peer, data);
      });
      conn.on("close", () => {
        if (guests.get(conn.peer) !== conn) return;
        guests.delete(conn.peer);
        publish("connected", "host");
        events.onGuestLeft(conn.peer);
      });
    });
    publish("connected", "host");
  }

  function join(): void {
    dropPeer();
    // A host yielding to a rival has just lost its guests.
    if (role !== null) publish("reconnecting", null);
    const p = new Peer(peerOptions);
    peer = p;
    p.on("open", (id) => {
      if (peer !== p) return;
      selfId = id;
      const conn = p.connect(roomId, { reliable: true });
      hostConn = conn;
      conn.on("open", () => {
        if (hostConn === conn) publish("connected", "guest");
      });
      conn.on("data", (data) => {
        if (hostConn === conn) events.onData(roomId, data);
      });
      // The host left: race the other guests to take over the room.
      conn.on("close", () => {
        if (hostConn === conn) claim();
      });
      // PeerJS emits no `close` for a channel that never opened. The usual
      // cause is a host that died but still holds the id on the server, so
      // race for the room again rather than give up.
      conn.on("error", (err) => {
        if (hostConn !== conn || conn.open) return;
        console.warn("rpg coop: could not reach the host; re-claiming the room", err);
        claim();
      });
    });
    p.on("error", (err) => {
      if (peer !== p) return;
      const type: PeerErrorType = err.type;
      if (type === "peer-unavailable") {
        // The host vanished between our refused claim and our dial.
        claim();
      } else if (hostConn?.open !== true) {
        fail(err);
      }
      // Once linked, signalling errors are irrelevant: the channel is P2P.
    });
  }

  function onOnline(): void {
    if (status !== "offline") return;
    failures = 0;
    claim();
  }

  function openConn(conn: DataConnection | null | undefined, what: string): DataConnection {
    if (conn?.open !== true) throw new Error(`rpg coop: ${what} is not connected`);
    return conn;
  }

  return {
    start() {
      if (status !== "idle") return;
      failures = 0;
      window.addEventListener("online", onOnline);
      claim();
    },
    stop() {
      window.removeEventListener("online", onOnline);
      dropPeer();
      publish("idle", null);
    },
    sendToHost(data) {
      openConn(hostConn, "host").send(data);
    },
    sendTo(guestId, data) {
      openConn(guests.get(guestId), `guest ${guestId}`).send(data);
    },
    broadcast(data, exceptId) {
      for (const [id, conn] of guests) {
        if (id !== exceptId) conn.send(data);
      }
    },
  };
}
