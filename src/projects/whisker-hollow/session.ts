import type { Player, Room, RoomEvents, RoomState } from "@/shared/lib/peer";
import { SPAWN } from "./level";
import { parseGuestMessage, parseHostMessage, type GuestMessage, type HostMessage, type Moment } from "./protocol";
import { createSaver, type SaveStore } from "./save";
import type { Avatar, Point, World } from "./types";
import { carriedBy, namePair, newWorld, pickUp, putDown, release, releaseAbsent } from "./world";

/**
 * One visit to the shared garden. Whoever arrives first hosts it: they load
 * the saved world (or plant a new one), run every change through the rules,
 * save it, and send it to everyone. A guest who takes over from a host that
 * left keeps the world it already has. Players are keyed by profile id.
 */

/** Remote players draw at a position eased toward the last one received. */
export interface RemoteAvatar extends Avatar {
  drawX: number;
  drawZ: number;
}

export const REMOTE_EASE_RATE = 12;

export function easeRemote(avatar: RemoteAvatar, dtSeconds: number): void {
  const k = Math.min(1, Math.max(0, dtSeconds) * REMOTE_EASE_RATE);
  avatar.drawX += (avatar.x - avatar.drawX) * k;
  avatar.drawZ += (avatar.z - avatar.drawZ) * k;
}

/** Positions travel to the centimetre and headings to the hundredth, so standing still sends nothing. */
function quantize(avatar: Avatar): Avatar {
  return {
    ...avatar,
    x: Math.round(avatar.x * 100) / 100,
    z: Math.round(avatar.z * 100) / 100,
    heading: Math.round(avatar.heading * 100) / 100,
  };
}

function sameAvatar(a: Avatar, b: Avatar): boolean {
  return (
    a.x === b.x && a.z === b.z && a.heading === b.heading && a.moving === b.moving &&
    a.look.shirt === b.look.shirt && a.look.hair === b.look.hair && a.look.skin === b.look.skin
  );
}

/** How often a moving player's position goes out: often enough to look smooth once eased. */
export const AVATAR_SEND_INTERVAL_MS = 50;

export interface SessionSnapshot {
  room: RoomState;
  /** Null until the host has loaded the garden (or, as a guest, sent it). */
  world: World | null;
  saveError: string | null;
}

export type SessionRoom = Pick<Room<HostMessage, GuestMessage>, "start" | "stop" | "sendToHost" | "sendTo" | "broadcast">;

export interface Session {
  readonly selfId: string;
  readonly selfName: string;
  /** Everyone else here, updated in place; read by the render loop. */
  readonly remotes: ReadonlyMap<string, RemoteAvatar>;
  /** The local player's state, as the game moves them; `now` paces the sends. */
  setLocalAvatar(avatar: Avatar, now: number): void;
  pickUp(animalId: string, at: Point): void;
  putDown(at: Point): void;
  name(species: string, name: string): void;
  snapshot(): SessionSnapshot;
  subscribe(listener: () => void): () => void;
  onMoment(listener: (moment: Moment) => void): () => void;
  start(): void;
  stop(): void;
}

export function createSession(options: {
  profile: { id: string; name: string };
  avatar: Avatar;
  store: SaveStore;
  createRoom: (events: RoomEvents<HostMessage, GuestMessage>) => SessionRoom;
}): Session {
  const { profile, store } = options;
  const remotes = new Map<string, RemoteAvatar>();
  const listeners = new Set<() => void>();
  const momentListeners = new Set<(moment: Moment) => void>();
  let local = quantize(options.avatar);
  let lastSent: Avatar | null = null;
  let lastSentAt = -Infinity;
  let room: RoomState = { status: "idle", role: null, code: "", selfId: null, players: [] };
  let world: World | null = null;
  let saveError: string | null = null;
  /** As host: loading the save, and the guests who arrived meanwhile. */
  let loading = false;
  const awaitingWelcome = new Set<string>();
  let snapshot: SessionSnapshot = { room, world, saveError };

  function notify(): void {
    snapshot = { room, world, saveError };
    for (const listener of listeners) listener();
  }

  const save = createSaver(store, (error) => {
    console.error("whisker hollow: saving failed", error);
    saveError = error instanceof Error ? error.message : String(error);
    notify();
  });

  function upsertRemote(id: string, avatar: Avatar): void {
    if (id === profile.id) return;
    const existing = remotes.get(id);
    if (existing !== undefined) {
      Object.assign(existing, avatar);
      return;
    }
    remotes.set(id, { ...avatar, drawX: avatar.x, drawZ: avatar.z });
    notify();
  }

  function lastSeen(id: string): Point | undefined {
    if (id === profile.id) return local;
    return remotes.get(id);
  }

  function presentIds(): Set<string> {
    return new Set(room.players.map((p) => p.id));
  }

  function allAvatars(): Record<string, Avatar> {
    const avatars: Record<string, Avatar> = { [profile.id]: local };
    for (const [id, avatar] of remotes) avatars[id] = avatar;
    return avatars;
  }

  /** As host: take a new world, save it and send it to everyone. */
  function commit(next: World, moment: Moment | null): void {
    if (next !== world) {
      world = next;
      save(next);
      notify();
    }
    if (room.role === "host") broadcastSafe({ kind: "world", world: next, moment });
    if (moment !== null) for (const listener of momentListeners) listener(moment);
  }

  function broadcastSafe(message: HostMessage): void {
    if (room.status === "connected") sessionRoom.broadcast(message);
  }

  function welcome(peerId: string): void {
    if (world === null) throw new Error("whisker hollow: welcoming before the world is loaded");
    sessionRoom.sendTo(peerId, { kind: "world", world, moment: null });
    sessionRoom.sendTo(peerId, { kind: "avatars", avatars: allAvatars() });
  }

  function becomeHost(): void {
    if (world !== null) {
      commit(releaseAbsent(world, presentIds(), lastSeen, SPAWN), null);
      return;
    }
    if (loading) return;
    loading = true;
    store.load().then(
      (saved) => {
        loading = false;
        if (room.role !== "host") return;
        const loaded = releaseAbsent(saved ?? newWorld(), presentIds(), lastSeen, SPAWN);
        commit(loaded, null);
        for (const peerId of awaitingWelcome) welcome(peerId);
        awaitingWelcome.clear();
      },
      (error: unknown) => {
        loading = false;
        console.error("whisker hollow: loading the garden failed", error);
        saveError = error instanceof Error ? error.message : String(error);
        notify();
      },
    );
  }

  /** As host: one player's intent, run through the rules. */
  function apply(playerId: string, playerName: string, message: Exclude<GuestMessage, { kind: "avatar" }>): void {
    if (world === null) return;
    switch (message.kind) {
      case "pick-up":
        commit(pickUp(world, playerId, message.animal, message.at), null);
        return;
      case "put-down": {
        const { world: next, outcome } = putDown(world, playerId, message.at);
        const carried = carriedBy(world, playerId);
        const moment: Moment | null =
          carried !== undefined && outcome === "reunited" ? { kind: "reunited", species: carried.species, by: playerId } : null;
        commit(next, moment);
        return;
      }
      case "name":
        commit(namePair(world, message.species, message.name, playerName), null);
        return;
    }
  }

  function act(message: Exclude<GuestMessage, { kind: "avatar" }>): void {
    if (room.status !== "connected") return;
    if (room.role === "host") apply(profile.id, profile.name, message);
    else sessionRoom.sendToHost(message);
  }

  function handleGuest(from: Player, data: unknown): void {
    const message = parseGuestMessage(data);
    if (message === null) {
      console.warn("whisker hollow: dropping a malformed guest message", from, data);
      return;
    }
    if (message.kind === "avatar") {
      upsertRemote(from.id, message.avatar);
      sessionRoom.broadcast({ kind: "avatar", id: from.id, avatar: message.avatar }, from.peerId);
      return;
    }
    apply(from.id, from.name, message);
  }

  function handleHost(data: unknown): void {
    const message = parseHostMessage(data);
    if (message === null) {
      console.warn("whisker hollow: dropping a malformed host message", data);
      return;
    }
    switch (message.kind) {
      case "world":
        world = message.world;
        notify();
        if (message.moment !== null) for (const listener of momentListeners) listener(message.moment);
        return;
      case "avatars":
        for (const [id, avatar] of Object.entries(message.avatars)) upsertRemote(id, avatar);
        return;
      case "avatar":
        upsertRemote(message.id, message.avatar);
        return;
      case "left":
        if (remotes.delete(message.id)) notify();
        return;
    }
  }

  const sessionRoom = options.createRoom({
    onState(next) {
      const wasConnected = room.status === "connected";
      room = next;
      if (next.status === "connected") {
        // Drop anyone the room no longer lists: ids from before a re-election.
        const present = presentIds();
        for (const id of remotes.keys()) if (!present.has(id)) remotes.delete(id);
        if (!wasConnected && next.role === "guest") {
          lastSent = local;
          sessionRoom.sendToHost({ kind: "avatar", avatar: local });
        }
        if (next.role === "host") becomeHost();
      }
      notify();
    },
    onGuestJoined(player) {
      if (world === null) awaitingWelcome.add(player.peerId);
      else welcome(player.peerId);
    },
    onGuestLeft(player) {
      awaitingWelcome.delete(player.peerId);
      const seen = lastSeen(player.id);
      remotes.delete(player.id);
      sessionRoom.broadcast({ kind: "left", id: player.id });
      if (world !== null) commit(release(world, player.id, seen ?? SPAWN), null);
      notify();
    },
    onGuestMessage: handleGuest,
    onHostMessage: handleHost,
  });

  return {
    selfId: profile.id,
    selfName: profile.name,
    remotes,
    setLocalAvatar(avatar, now) {
      local = quantize(avatar);
      if (room.status !== "connected") return;
      if (lastSent !== null && sameAvatar(lastSent, local)) return;
      if (now - lastSentAt < AVATAR_SEND_INTERVAL_MS) return;
      lastSent = local;
      lastSentAt = now;
      if (room.role === "host") sessionRoom.broadcast({ kind: "avatar", id: profile.id, avatar: local });
      else sessionRoom.sendToHost({ kind: "avatar", avatar: local });
    },
    pickUp: (animal, at) => act({ kind: "pick-up", animal, at }),
    putDown: (at) => act({ kind: "put-down", at }),
    name: (species, name) => act({ kind: "name", species, name }),
    snapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onMoment(listener) {
      momentListeners.add(listener);
      return () => momentListeners.delete(listener);
    },
    start: () => sessionRoom.start(),
    stop: () => sessionRoom.stop(),
  };
}
