/**
 * A PeerJS star room: one host, guests connected to the host only. The host
 * is the hub every message passes through; what the messages mean, and who
 * is authoritative over what, is each game's business.
 *
 * A room is named by a short code, mapped to the host's PeerJS id. Three ways
 * in:
 * - `host`: draw a fresh code and claim it; a clash draws another.
 * - `join`: dial the host holding a code. A code nobody holds ends in
 *   `not-found`; losing the host ends in `disconnected`.
 * - `claim`: everyone tries to hold the same code. The PeerJS server grants
 *   it to exactly one claimant, who hosts; everyone refused joins them. When
 *   the host goes away its guests race to claim it again, so re-election is
 *   the same code path as the first join.
 *
 * Purely event-driven. Each handler is bound to the Peer / DataConnection it
 * was registered on and ignores events once that object has been replaced,
 * which is what makes teardown and re-election race-free.
 */

import { Peer, type DataConnection, type PeerError, type PeerOptions } from "peerjs";
import type { PlayerProfile } from "@/shared/lib/profile";

export type RoomRole = "host" | "guest";
export type RoomStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  /** Signalling kept failing; retries when the browser reports it is online. */
  | "offline"
  /** `join` only: nobody holds the code. */
  | "not-found"
  /** `join` only: the channel to the host closed. */
  | "disconnected";

/** Someone in the room. `peerId` changes on every connection; `id` is the
 * player's persistent profile id, so it survives a rejoin. */
export interface Player extends PlayerProfile {
  peerId: string;
}

export interface RoomState {
  status: RoomStatus;
  role: RoomRole | null;
  code: string;
  /** Our peer id while connected. */
  selfId: string | null;
  /** Everyone in the room, host first, then guests in join order. Empty
   * unless connected: a guest turns `connected` on the host's first list. */
  players: readonly Player[];
}

export type RoomTarget = { mode: "host" } | { mode: "join" | "claim"; code: string };

export interface RoomEvents<HostMessage, GuestMessage> {
  onState?(state: RoomState): void;
  /** Host only: a guest's channel opened, after every guest got the new list. */
  onGuestJoined?(player: Player): void;
  /** Host only: a guest's channel closed. */
  onGuestLeft?(player: Player): void;
  /** Guest only. */
  onHostMessage?(message: HostMessage): void;
  /** Host only. */
  onGuestMessage?(from: Player, message: GuestMessage): void;
}

export interface RoomOptions<HostMessage, GuestMessage> {
  /** Namespaces codes, so two games' rooms never collide. */
  game: string;
  target: RoomTarget;
  profile: PlayerProfile;
  events: RoomEvents<HostMessage, GuestMessage>;
  peerOptions?: PeerOptions;
}

export interface Room<HostMessage, GuestMessage> {
  start(): void;
  stop(): void;
  /** Guest only. */
  sendToHost(message: GuestMessage): void;
  /** Host only. */
  sendTo(peerId: string, message: HostMessage): void;
  /** Host only. */
  broadcast(message: HostMessage, exceptPeerId?: string): void;
}

/** Wire envelope: the room's own player list travels beside game messages. */
type Envelope = { kind: "players"; players: Player[] } | { kind: "message"; message: unknown };

type PeerErrorType = PeerError<string>["type"];

/** No 0/O or 1/I, so a code read aloud or off a phone can't be mistyped. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 4;
const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

export function generateRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

/** A typed-in code, normalised; null when it can't be a room code. */
export function parseRoomCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

export function hostPeerId(game: string, code: string): string {
  return `novelty-world-${game}-${code}`;
}

/** Test/dev only: `?peer-signal=local` uses the e2e suite's local PeerServer. */
export const SIGNAL_PARAM = "peer-signal";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseProfile(value: unknown): PlayerProfile | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") return null;
  return { id: value.id, name: value.name };
}

function parsePlayer(value: unknown): Player | null {
  const profile = parseProfile(value);
  if (profile === null || !isRecord(value) || typeof value.peerId !== "string") return null;
  return { ...profile, peerId: value.peerId };
}

function parseEnvelope(value: unknown): Envelope | null {
  if (!isRecord(value)) return null;
  if (value.kind === "message" && "message" in value) return { kind: "message", message: value.message };
  if (value.kind !== "players" || !Array.isArray(value.players)) return null;
  const players: Player[] = [];
  for (const raw of value.players) {
    const player = parsePlayer(raw);
    if (player === null) return null;
    players.push(player);
  }
  return { kind: "players", players };
}

export function createRoom<HostMessage, GuestMessage>(
  options: RoomOptions<HostMessage, GuestMessage>,
): Room<HostMessage, GuestMessage> {
  const { game, target, events, peerOptions = {} } = options;
  // Only these travel: a caller's profile object may carry more (a store's setters).
  const profile: PlayerProfile = { id: options.profile.id, name: options.profile.name };
  const mode = target.mode;
  let code = target.mode === "host" ? generateRoomCode() : target.code;
  let status: RoomStatus = "idle";
  let role: RoomRole | null = null;
  let selfId: string | null = null;
  let peer: Peer | null = null;
  let hostConn: DataConnection | null = null;
  /** A guest's copy of the host's player list. */
  let listFromHost: Player[] = [];
  const guests = new Map<string, { conn: DataConnection; player: Player }>();
  let failures = 0;

  function players(): Player[] {
    if (role === "guest") return listFromHost;
    if (role === "host" && selfId !== null) {
      return [{ ...profile, peerId: selfId }, ...Array.from(guests.values(), (g) => g.player)];
    }
    return [];
  }

  function publish(nextStatus: RoomStatus, nextRole: RoomRole | null): void {
    status = nextStatus;
    role = nextRole;
    if (status === "connected") failures = 0;
    const connected = status === "connected";
    events.onState?.({
      status,
      role,
      code,
      selfId: connected ? selfId : null,
      players: connected ? players() : [],
    });
  }

  /** Forget the current peer first, so the close events its teardown emits
   * fail every `peer === p` / `hostConn === conn` / `guests` check. */
  function dropPeer(): void {
    const old = peer;
    peer = null;
    hostConn = null;
    selfId = null;
    listFromHost = [];
    guests.clear();
    old?.destroy();
  }

  function attempt(): void {
    if (mode === "join") join();
    else claim();
  }

  function fail(reason: unknown): void {
    failures += 1;
    if (failures < MAX_ATTEMPTS) {
      console.warn(`peer room: connection attempt ${failures} failed; retrying`, reason);
      attempt();
      return;
    }
    console.error("peer room: connection failed; retrying when the browser reports it is online", reason);
    dropPeer();
    publish("offline", null);
  }

  function end(finalStatus: "not-found" | "disconnected"): void {
    dropPeer();
    publish(finalStatus, null);
  }

  function claim(): void {
    dropPeer();
    publish(status === "idle" ? "connecting" : "reconnecting", null);
    const p = new Peer(hostPeerId(game, code), peerOptions);
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
        if (mode === "claim") {
          // Pre-open: someone else hosts the room, join them. As host (after
          // a signalling reconnect): someone claimed the room while we were
          // away, so the room has two hosts — yield and join theirs.
          join();
        } else {
          // A fresh code that someone already holds: draw another.
          code = generateRoomCode();
          claim();
        }
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

  function sendPlayers(): void {
    const envelope: Envelope = { kind: "players", players: players() };
    for (const { conn } of guests.values()) conn.send(envelope);
  }

  function becomeHost(p: Peer): void {
    selfId = hostPeerId(game, code);
    p.on("connection", (conn) => {
      const guestProfile = parseProfile(conn.metadata);
      if (guestProfile === null) {
        console.warn("peer room: refusing a guest without a profile", conn.peer, conn.metadata);
        conn.close();
        return;
      }
      const player: Player = { ...guestProfile, peerId: conn.peer };
      conn.on("open", () => {
        if (peer !== p) return;
        guests.set(conn.peer, { conn, player });
        publish("connected", "host");
        sendPlayers();
        events.onGuestJoined?.(player);
      });
      conn.on("data", (data) => {
        if (guests.get(conn.peer)?.conn !== conn) return;
        const envelope = parseEnvelope(data);
        if (envelope?.kind !== "message") {
          console.warn("peer room: dropping a malformed guest message", conn.peer, data);
          return;
        }
        events.onGuestMessage?.(player, envelope.message as GuestMessage);
      });
      conn.on("close", () => {
        if (guests.get(conn.peer)?.conn !== conn) return;
        guests.delete(conn.peer);
        publish("connected", "host");
        sendPlayers();
        events.onGuestLeft?.(player);
      });
    });
    publish("connected", "host");
  }

  function hostLost(): void {
    // Claim mode: race the other guests to take over the room.
    if (mode === "claim") claim();
    else end("disconnected");
  }

  function join(): void {
    dropPeer();
    // A host yielding to a rival has just lost its guests.
    if (role !== null) publish("reconnecting", null);
    else if (status === "idle") publish("connecting", null);
    const p = new Peer(peerOptions);
    peer = p;
    p.on("open", (id) => {
      if (peer !== p) return;
      selfId = id;
      const conn = p.connect(hostPeerId(game, code), { reliable: true, metadata: profile });
      hostConn = conn;
      conn.on("data", (data) => {
        if (hostConn !== conn) return;
        const envelope = parseEnvelope(data);
        if (envelope === null) {
          console.warn("peer room: dropping a malformed host message", data);
        } else if (envelope.kind === "players") {
          listFromHost = envelope.players;
          publish("connected", "guest");
        } else {
          events.onHostMessage?.(envelope.message as HostMessage);
        }
      });
      conn.on("close", () => {
        if (hostConn === conn) hostLost();
      });
      // PeerJS emits no `close` for a channel that never opened. In claim
      // mode the usual cause is a host that died but still holds the id on
      // the server, so race for the room again rather than give up.
      conn.on("error", (err) => {
        if (hostConn !== conn || conn.open) return;
        if (mode === "claim") {
          console.warn("peer room: could not reach the host; re-claiming the room", err);
          claim();
        } else {
          fail(err);
        }
      });
    });
    p.on("error", (err) => {
      if (peer !== p) return;
      const type: PeerErrorType = err.type;
      if (type === "peer-unavailable") {
        // Nobody holds the code. In claim mode the host vanished between our
        // refused claim and our dial, so the room is free to take.
        if (mode === "claim") claim();
        else end("not-found");
      } else if (hostConn?.open !== true) {
        fail(err);
      }
      // Once linked, signalling errors are irrelevant: the channel is P2P.
    });
  }

  function onOnline(): void {
    if (status !== "offline") return;
    failures = 0;
    attempt();
  }

  function openConn(conn: DataConnection | null | undefined, what: string): DataConnection {
    if (conn?.open !== true) throw new Error(`peer room: ${what} is not connected`);
    return conn;
  }

  function wrap(message: unknown): Envelope {
    return { kind: "message", message };
  }

  return {
    start() {
      if (status !== "idle") return;
      failures = 0;
      window.addEventListener("online", onOnline);
      attempt();
    },
    stop() {
      window.removeEventListener("online", onOnline);
      dropPeer();
      publish("idle", null);
    },
    sendToHost(message) {
      openConn(hostConn, "host").send(wrap(message));
    },
    sendTo(peerId, message) {
      openConn(guests.get(peerId)?.conn, `guest ${peerId}`).send(wrap(message));
    },
    broadcast(message, exceptPeerId) {
      const envelope = wrap(message);
      for (const [id, { conn }] of guests) {
        if (id !== exceptPeerId) conn.send(envelope);
      }
    },
  };
}

/**
 * Leave the room when the tab goes away, and come back if the browser
 * restores it from the back/forward cache. Peers see our channels close at
 * once, and the server frees a host's code, instead of both waiting out
 * WebRTC / signalling timeouts. Returns the unbind.
 */
export function stopOnPageHide(room: Pick<Room<unknown, unknown>, "start" | "stop">): () => void {
  const onPageHide = () => room.stop();
  const onPageShow = (e: PageTransitionEvent) => {
    if (e.persisted) room.start();
  };
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);
  return () => {
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("pageshow", onPageShow);
  };
}
