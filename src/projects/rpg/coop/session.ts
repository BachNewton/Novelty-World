/**
 * One co-op session per page, shared by play and edit mode so toggling
 * never drops the connection, the map, or where your avatar stands.
 *
 * The host is authoritative. A guest's paint is applied locally at once
 * for responsiveness, then the host applies it in arrival order and echoes
 * it to every guest, including the sender. Every peer therefore replays the
 * same op sequence and converges on the host's map. A joiner is handed the
 * host's full map and avatar table in one `welcome`, which replaces its own
 * — the room shares a single world.
 */

import type { CellEdit, MapStore } from "../world-map";
import {
  parseGuestMessage,
  parseHostMessage,
  type Avatar,
  type GuestMessage,
  type HostMessage,
} from "./protocol";
import {
  createTransport,
  type Transport,
  type TransportEvents,
  type TransportState,
} from "./transport";

/** Remote avatars draw at a position eased toward the last one received. */
export interface RemoteAvatar extends Avatar {
  renderX: number;
  renderY: number;
}

export const REMOTE_LERP_RATE = 10;

/** Ease a remote avatar's drawn position toward its networked position. */
export function advanceRemoteRender(avatar: RemoteAvatar, dtSeconds: number): void {
  const k = Math.min(1, Math.max(0, dtSeconds) * REMOTE_LERP_RATE);
  avatar.renderX += (avatar.x - avatar.renderX) * k;
  avatar.renderY += (avatar.y - avatar.renderY) * k;
}

/** Wire form of an avatar: whole pixels, so sub-pixel drift sends nothing. */
function quantize(avatar: Avatar): Avatar {
  return { ...avatar, x: Math.round(avatar.x), y: Math.round(avatar.y) };
}

function sameAvatar(a: Avatar, b: Avatar): boolean {
  return (
    a.x === b.x &&
    a.y === b.y &&
    a.dir === b.dir &&
    a.flip === b.flip &&
    a.moving === b.moving &&
    a.characterId === b.characterId
  );
}

/** Map ops travel the same shape in both directions. */
type MapOp = Extract<GuestMessage, { kind: "paint" | "clear" }>;

/** What the UI shows about the session; replaced, never mutated. */
export interface CoopSnapshot extends TransportState {
  remoteCount: number;
}

export interface CoopSession {
  readonly map: MapStore;
  /** Live remote avatars, updated in place; read by the render loops. */
  readonly remotes: ReadonlyMap<string, RemoteAvatar>;
  /** Where the local player stands; survives play/edit toggles. */
  localAvatar(): Avatar;
  /** Report the local player's state; sent whenever it visibly changes. */
  setLocalAvatar(avatar: Avatar): void;
  paint(edits: CellEdit[]): void;
  clear(): void;
  snapshot(): CoopSnapshot;
  subscribe(listener: () => void): () => void;
  start(): void;
  stop(): void;
}

export type TransportFactory = (roomId: string, events: TransportEvents) => Transport;

export function createCoopSession(options: {
  roomId: string;
  map: MapStore;
  spawn: Avatar;
  createTransport?: TransportFactory;
}): CoopSession {
  const { roomId, map, createTransport: makeTransport = createTransport } = options;
  const remotes = new Map<string, RemoteAvatar>();
  const listeners = new Set<() => void>();
  let local = quantize(options.spawn);
  let state: TransportState = { status: "idle", role: null, selfId: null, peerCount: 0 };
  let snapshot: CoopSnapshot = { ...state, remoteCount: 0 };

  function notify(): void {
    snapshot = { ...state, remoteCount: remotes.size };
    for (const listener of listeners) listener();
  }

  function upsertRemote(id: string, avatar: Avatar): void {
    const existing = remotes.get(id);
    if (existing !== undefined) {
      Object.assign(existing, avatar);
      return;
    }
    remotes.set(id, { ...avatar, renderX: avatar.x, renderY: avatar.y });
    notify();
  }

  function removeRemote(id: string): void {
    if (remotes.delete(id)) notify();
  }

  const transport = makeTransport(roomId, {
    onState(next) {
      const wasConnected = state.status === "connected";
      state = next;
      // Peer ids don't survive a reconnect; the next welcome (as guest) or
      // the guests' first avatar messages (as host) rebuild the table.
      if (next.status !== "connected") remotes.clear();
      if (!wasConnected && next.role === "guest") sendToHost({ kind: "avatar", avatar: local });
      notify();
    },
    onGuestJoined(id) {
      const avatars: Record<string, Avatar> = { [roomId]: local };
      for (const [otherId, avatar] of remotes) avatars[otherId] = avatar;
      sendTo(id, { kind: "welcome", grid: map.grid(), avatars });
    },
    onGuestLeft(id) {
      removeRemote(id);
      broadcast({ kind: "left", id });
    },
    onData(from, data) {
      if (state.role === "host") handleGuest(from, data);
      else handleHost(data);
    },
  });

  function sendToHost(msg: GuestMessage): void {
    transport.sendToHost(msg);
  }
  function sendTo(guestId: string, msg: HostMessage): void {
    transport.sendTo(guestId, msg);
  }
  function broadcast(msg: HostMessage, exceptId?: string): void {
    transport.broadcast(msg, exceptId);
  }

  function handleGuest(from: string, data: unknown): void {
    const msg = parseGuestMessage(data);
    if (msg === null) {
      console.warn("rpg coop: dropping malformed guest message", from, data);
      return;
    }
    switch (msg.kind) {
      case "avatar":
        upsertRemote(from, msg.avatar);
        broadcast({ kind: "avatar", id: from, avatar: msg.avatar }, from);
        break;
      case "paint":
        map.apply(msg.edits);
        broadcast(msg);
        break;
      case "clear":
        map.clear();
        broadcast(msg);
        break;
    }
  }

  function handleHost(data: unknown): void {
    const msg = parseHostMessage(data);
    if (msg === null) {
      console.warn("rpg coop: dropping malformed host message", data);
      return;
    }
    switch (msg.kind) {
      case "welcome":
        map.replace(msg.grid);
        remotes.clear();
        for (const [id, avatar] of Object.entries(msg.avatars)) {
          if (id !== state.selfId) remotes.set(id, { ...avatar, renderX: avatar.x, renderY: avatar.y });
        }
        notify();
        break;
      case "avatar":
        if (msg.id !== state.selfId) upsertRemote(msg.id, msg.avatar);
        break;
      case "left":
        removeRemote(msg.id);
        break;
      case "paint":
        map.apply(msg.edits);
        break;
      case "clear":
        map.clear();
        break;
    }
  }

  /** Local map ops: the host applies and fans out; a guest applies and asks
   * the host, whose echo settles the final order. Solo, they stay local. */
  function submit(op: MapOp): void {
    if (state.role === "host") broadcast(op);
    else if (state.role === "guest") sendToHost(op);
  }

  return {
    map,
    remotes,
    localAvatar: () => local,
    setLocalAvatar(avatar) {
      const next = quantize(avatar);
      if (sameAvatar(next, local)) return;
      local = next;
      if (state.role === "host") broadcast({ kind: "avatar", id: roomId, avatar: local });
      else if (state.role === "guest") sendToHost({ kind: "avatar", avatar: local });
    },
    paint(edits) {
      const changed = map.apply(edits);
      if (changed.length > 0) submit({ kind: "paint", edits: changed });
    },
    clear() {
      map.clear();
      submit({ kind: "clear" });
    },
    snapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start: () => transport.start(),
    stop: () => transport.stop(),
  };
}
