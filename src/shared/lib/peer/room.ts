/**
 * A star room on the relay (`relay/`): one host, guests that talk to the host
 * only. The host is the hub every message passes through; what the messages
 * mean, and who is authoritative over what, is each game's business.
 *
 * Every player holds one WebSocket to the relay, which keeps the rooms and
 * forwards each room's messages. A room is named by a short code, namespaced
 * by game. Three ways in:
 * - `host`: open a room under a fresh code.
 * - `join`: enter the room holding a code. A code nobody holds ends in
 *   `not-found`; losing the host ends in `disconnected`.
 * - `claim`: everyone asks for the same code. The relay gives it to the first
 *   to ask, who hosts; everyone after joins them. When the host goes away its
 *   guests claim it again, so re-election is the same code path as the first
 *   join.
 *
 * Purely event-driven. Each handler is bound to the socket it was registered
 * on and ignores events once that socket has been replaced, which is what
 * makes teardown and re-election race-free.
 */

import type { PlayerProfile } from "@/shared/lib/profile";
import { parseRelayFrame, type ClientFrame, type RelayFrame } from "./protocol";

export { generateRoomCode, parseRoomCode } from "./protocol";

export type RoomRole = "host" | "guest";
export type RoomStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  /** The relay kept failing; retries when the browser reports it is online. */
  | "offline"
  /** `join` only: nobody holds the code. */
  | "not-found"
  /** `join` only: the host left. */
  | "disconnected";

/** Someone in the room. `peerId` is the relay's id for this connection;
 * `id` is the player's persistent profile id, so it survives a rejoin. */
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
  /** Host only: a guest arrived, after every guest got the new list. */
  onGuestJoined?(player: Player): void;
  /** Host only: a guest left. */
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
  /** The relay's WebSocket URL; `relayUrlFromSearch` picks it. */
  relayUrl: string;
}

export interface Room<HostMessage, GuestMessage> {
  start(): void;
  /** Leaves at the end of the current task; a `start` before then cancels it. */
  stop(): void;
  /** Guest only. */
  sendToHost(message: GuestMessage): void;
  /** Host only. */
  sendTo(peerId: string, message: HostMessage): void;
  /** Host only. */
  broadcast(message: HostMessage, exceptPeerId?: string): void;
}

/** What travels inside the relay's `data`: the room's own player list beside game messages. */
type Envelope = { kind: "players"; players: Player[] } | { kind: "message"; message: unknown };

/** Novelty World's relay, on its Oracle Cloud server (infra/oracle/README.md). */
export const RELAY_URL = "wss://novelty-world.mooo.com";

/** Test/dev only: `?relay=local:<port>` uses a relay on this computer (each e2e run starts its own). */
export const RELAY_PARAM = "relay";

export function relayUrlFromSearch(search: string): string {
  const relay = new URLSearchParams(search).get(RELAY_PARAM);
  if (relay === null) return RELAY_URL;
  const local = /^local:(\d+)$/.exec(relay);
  if (local === null) throw new Error(`?${RELAY_PARAM}=${relay} is not local:<port>`);
  return `ws://localhost:${local[1]}`;
}

/**
 * Consecutive failed attempts (never reaching `connected`) before giving up
 * until the browser reports it is back online. One dropped socket is not
 * worth stranding the player over; a persistent failure is not worth
 * hammering the relay over.
 */
const MAX_ATTEMPTS = 3;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parsePlayer(value: unknown): Player | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.peerId !== "string"
  ) {
    return null;
  }
  return { id: value.id, name: value.name, peerId: value.peerId };
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
  const { game, target, events, relayUrl } = options;
  // Only these travel: a caller's profile object may carry more (a store's setters).
  const profile: PlayerProfile = { id: options.profile.id, name: options.profile.name };
  const mode = target.mode;
  let code = target.mode === "host" ? "" : target.code;
  let status: RoomStatus = "idle";
  let role: RoomRole | null = null;
  let selfId: string | null = null;
  let socket: WebSocket | null = null;
  /** A guest's copy of the host's player list. */
  let listFromHost: Player[] = [];
  const guests = new Map<string, Player>();
  let failures = 0;

  function players(): Player[] {
    if (role === "guest") return listFromHost;
    if (role === "host" && selfId !== null) return [{ ...profile, peerId: selfId }, ...guests.values()];
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

  function send(frame: ClientFrame): void {
    if (socket?.readyState !== WebSocket.OPEN) throw new Error("peer room: not connected to the relay");
    socket.send(JSON.stringify(frame));
  }

  /** Forget the room and the socket first, so the close event the socket's
   * teardown emits fails the `socket === s` check. */
  function dropSocket(): void {
    const old = socket;
    socket = null;
    forgetRoom();
    old?.close();
  }

  function forgetRoom(): void {
    selfId = null;
    listFromHost = [];
    guests.clear();
  }

  /** The frame that puts this socket in a room. */
  function enterFrame(): ClientFrame {
    if (mode === "host") return { type: "host", game, profile };
    return { type: mode, game, code, profile };
  }

  function attempt(): void {
    dropSocket();
    publish(status === "idle" || status === "connecting" ? "connecting" : "reconnecting", null);
    const s = new WebSocket(relayUrl);
    socket = s;
    let reachedRoom = false;
    s.addEventListener("open", () => {
      if (socket !== s) return;
      send(enterFrame());
    });
    s.addEventListener("message", (event) => {
      if (socket !== s) return;
      const frame = typeof event.data === "string" ? parseRelayFrame(JSON.parse(event.data)) : null;
      if (frame === null) {
        console.error("peer room: dropping a malformed relay frame", event.data);
        return;
      }
      if (frame.type === "hosting" || frame.type === "joined") reachedRoom = true;
      receive(frame);
    });
    s.addEventListener("close", (event) => {
      if (socket !== s) return;
      socket = null;
      forgetRoom();
      if (reachedRoom && mode === "join") end("disconnected");
      else fail(`relay socket closed (${event.code}${event.reason === "" ? "" : `: ${event.reason}`})`);
    });
  }

  function fail(reason: string): void {
    failures += 1;
    if (failures < MAX_ATTEMPTS) {
      console.warn(`peer room: connection attempt ${failures} failed; retrying`, reason);
      attempt();
      return;
    }
    console.error("peer room: connection failed; retrying when the browser reports it is online", reason);
    dropSocket();
    publish("offline", null);
  }

  function end(finalStatus: "not-found" | "disconnected"): void {
    dropSocket();
    publish(finalStatus, null);
  }

  function sendPlayers(): void {
    const data: Envelope = { kind: "players", players: players() };
    send({ type: "broadcast", data });
  }

  function receive(frame: RelayFrame): void {
    switch (frame.type) {
      case "hosting":
        code = frame.code;
        selfId = frame.id;
        publish("connected", "host");
        return;
      case "joined":
        // Connected once the host's first list arrives.
        code = frame.code;
        selfId = frame.id;
        role = "guest";
        return;
      case "not-found":
        end("not-found");
        return;
      case "guest-joined": {
        const player: Player = { ...frame.profile, peerId: frame.id };
        guests.set(frame.id, player);
        publish("connected", "host");
        sendPlayers();
        events.onGuestJoined?.(player);
        return;
      }
      case "guest-left": {
        const player = guests.get(frame.id);
        if (player === undefined) return;
        guests.delete(frame.id);
        publish("connected", "host");
        sendPlayers();
        events.onGuestLeft?.(player);
        return;
      }
      case "host-left":
        forgetRoom();
        if (mode === "claim") {
          // Race the other guests to take over the room, on the same socket.
          publish("reconnecting", null);
          send(enterFrame());
        } else {
          end("disconnected");
        }
        return;
      case "data":
        receiveData(frame.from, frame.data);
    }
  }

  function receiveData(from: string | undefined, data: unknown): void {
    const envelope = parseEnvelope(data);
    if (role === "host") {
      const player = from === undefined ? undefined : guests.get(from);
      if (player === undefined || envelope?.kind !== "message") {
        console.warn("peer room: dropping a malformed guest message", from, data);
        return;
      }
      events.onGuestMessage?.(player, envelope.message as GuestMessage);
    } else if (envelope === null) {
      console.warn("peer room: dropping a malformed host message", data);
    } else if (envelope.kind === "players") {
      listFromHost = envelope.players;
      publish("connected", "guest");
    } else {
      events.onHostMessage?.(envelope.message as HostMessage);
    }
  }

  function onOnline(): void {
    if (status !== "offline") return;
    failures = 0;
    attempt();
  }

  function wrap(message: unknown): Envelope {
    return { kind: "message", message };
  }

  /**
   * React StrictMode remounts an effect within one task: stop, then start at
   * once. Tearing down at the end of the task lets that start keep the live
   * connection, instead of leaving the room and entering it again.
   */
  let stopPending = false;

  return {
    start() {
      if (stopPending) {
        stopPending = false;
        return;
      }
      if (status !== "idle") return;
      failures = 0;
      window.addEventListener("online", onOnline);
      attempt();
    },
    stop() {
      if (stopPending || status === "idle") return;
      stopPending = true;
      queueMicrotask(() => {
        if (!stopPending) return;
        stopPending = false;
        window.removeEventListener("online", onOnline);
        dropSocket();
        publish("idle", null);
      });
    },
    sendToHost(message) {
      if (role !== "guest" || status !== "connected") throw new Error("peer room: host is not connected");
      send({ type: "up", data: wrap(message) });
    },
    sendTo(peerId, message) {
      if (role !== "host" || !guests.has(peerId)) throw new Error(`peer room: guest ${peerId} is not connected`);
      send({ type: "to", id: peerId, data: wrap(message) });
    },
    broadcast(message, exceptPeerId) {
      // Like sending to an empty room: nobody to reach.
      if (role !== "host" || guests.size === 0) return;
      send({ type: "broadcast", data: wrap(message), ...(exceptPeerId === undefined ? {} : { except: exceptPeerId }) });
    },
  };
}

/**
 * Leave the room when the tab goes away, and come back if the browser
 * restores it from the back/forward cache. The relay sees the socket close at
 * once and frees the room or the seat.
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
