import { describe, expect, it, vi } from "vitest";
import { createEmptyGrid, createMapStore, type PlacedTile } from "../world-map";
import type { Avatar } from "./protocol";
import { advanceRemoteRender, createCoopSession, type CoopSession } from "./session";
import type { TransportEvents, TransportState } from "./transport";

const ROOM = "room";
const GRASS: PlacedTile = { src: "/rpg/tiles/Grass/Grass_Tiles_1.png", sx: 1, sy: 1 };
const WATER: PlacedTile = { src: "/rpg/tiles/Water/Water_Middle.png", sx: 0, sy: 0 };
const SPAWN: Avatar = { x: 320, y: 224, dir: "front", flip: false, moving: false, characterId: "farmer-bob" };

/**
 * In-memory star network. Sends queue up and are delivered only by
 * `flush()`, in FIFO order (a reliable ordered channel),
 * so tests control exactly how messages interleave.
 */
function createNetwork() {
  const nodes = new Map<string, TransportEvents>();
  const guests = new Set<string>();
  const queue: { to: string; run: () => void }[] = [];
  let sent = 0;

  function enqueue(to: string, from: string, data: unknown): void {
    sent += 1;
    // Serialize like the real channel, so no object is shared across peers.
    const copy: unknown = structuredClone(data);
    queue.push({ to, run: () => nodes.get(to)?.onData(from, copy) });
  }

  function state(role: TransportState["role"], selfId: string): TransportState {
    return { status: "connected", role, selfId, peerCount: role === "host" ? guests.size : 1 };
  }

  function add(id: string, map = createMapStore(createEmptyGrid())): CoopSession {
    return createCoopSession({
      roomId: ROOM,
      map,
      spawn: SPAWN,
      createTransport: (_roomId, events) => {
        nodes.set(id, events);
        return {
          start() {},
          stop() {},
          sendToHost: (data) => enqueue(ROOM, id, data),
          sendTo: (guestId, data) => enqueue(guestId, ROOM, data),
          broadcast(data, exceptId) {
            for (const guest of guests) if (guest !== exceptId) enqueue(guest, ROOM, data);
          },
        };
      },
    });
  }

  return {
    /** A host session; its peer id is the room id. */
    host(map?: ReturnType<typeof createMapStore>): CoopSession {
      const session = add(ROOM, map);
      nodes.get(ROOM)?.onState(state("host", ROOM));
      return session;
    },
    guest(id: string, map?: ReturnType<typeof createMapStore>): CoopSession {
      const session = add(id, map);
      guests.add(id);
      nodes.get(id)?.onState(state("guest", id));
      nodes.get(ROOM)?.onState(state("host", ROOM));
      nodes.get(ROOM)?.onGuestJoined(id);
      return session;
    },
    leave(id: string): void {
      guests.delete(id);
      nodes.get(ROOM)?.onGuestLeft(id);
    },
    /** The host vanished: every guest drops to `reconnecting`. */
    loseHost(): void {
      nodes.delete(ROOM);
      for (const id of guests) {
        nodes.get(id)?.onState({ status: "reconnecting", role: null, selfId: null, peerCount: 0 });
      }
      guests.clear();
      queue.length = 0;
    },
    /** Re-home a surviving node as the new host (it now answers to the room id). */
    promote(id: string): void {
      const events = nodes.get(id);
      if (events === undefined) throw new Error(`no node ${id}`);
      nodes.delete(id);
      nodes.set(ROOM, events);
      events.onState(state("host", ROOM));
    },
    flush(): void {
      while (queue.length > 0) queue.shift()?.run();
    },
    sentCount: () => sent,
  };
}

function cellOf(session: CoopSession, c: number, r: number): PlacedTile | null {
  return session.map.grid()[r][c];
}

describe("joining", () => {
  it("a joiner adopts the host's map and sees every avatar; everyone sees the joiner", () => {
    const net = createNetwork();
    const host = net.host();
    host.paint([{ c: 3, r: 4, tile: GRASS }]);
    const a = net.guest("a");
    net.flush();

    const joinerMap = createMapStore(createEmptyGrid());
    joinerMap.apply([{ c: 9, r: 9, tile: WATER }]);
    const b = net.guest("b", joinerMap);
    net.flush();

    for (const session of [host, a, b]) {
      expect(cellOf(session, 3, 4)).toEqual(GRASS);
      expect(cellOf(session, 9, 9)).toBeNull();
      expect(session.snapshot().remoteCount).toBe(2);
    }
    expect([...b.remotes.keys()].sort()).toEqual(["a", ROOM]);
  });
});

describe("avatars", () => {
  it("relays guest movement to everyone except the sender", () => {
    const net = createNetwork();
    const host = net.host();
    const a = net.guest("a");
    const b = net.guest("b");
    net.flush();

    a.setLocalAvatar({ ...SPAWN, x: 400, moving: true });
    net.flush();
    expect(host.remotes.get("a")).toMatchObject({ x: 400, moving: true });
    expect(b.remotes.get("a")).toMatchObject({ x: 400, moving: true });
    expect(a.remotes.has("a")).toBe(false);
  });

  it("sends only visible changes: sub-pixel drift is quantized away", () => {
    const net = createNetwork();
    const host = net.host();
    net.guest("a");
    net.flush();
    const before = net.sentCount();
    host.setLocalAvatar({ ...SPAWN, x: SPAWN.x + 0.3 });
    host.setLocalAvatar({ ...SPAWN });
    expect(net.sentCount()).toBe(before);
    host.setLocalAvatar({ ...SPAWN, dir: "back" });
    expect(net.sentCount()).toBe(before + 1);
  });

  it("drops a departed guest's avatar everywhere", () => {
    const net = createNetwork();
    const host = net.host();
    net.guest("a");
    const b = net.guest("b");
    net.flush();
    net.leave("a");
    net.flush();
    expect(host.remotes.has("a")).toBe(false);
    expect(b.remotes.has("a")).toBe(false);
    expect(b.snapshot().remoteCount).toBe(1);
  });

  it("eases the drawn position toward the networked one", () => {
    const avatar = { ...SPAWN, x: 100, y: 0, renderX: 0, renderY: 0 };
    advanceRemoteRender(avatar, 0.05);
    expect(avatar.renderX).toBeCloseTo(50);
    advanceRemoteRender(avatar, 10);
    expect(avatar.renderX).toBe(100);
  });
});

describe("map edits", () => {
  it("a guest's paint shows locally at once and reaches every peer", () => {
    const net = createNetwork();
    const host = net.host();
    const a = net.guest("a");
    const b = net.guest("b");
    net.flush();

    a.paint([{ c: 1, r: 1, tile: GRASS }]);
    expect(cellOf(a, 1, 1)).toEqual(GRASS);
    net.flush();
    expect(cellOf(host, 1, 1)).toEqual(GRASS);
    expect(cellOf(b, 1, 1)).toEqual(GRASS);
  });

  it("concurrent same-cell paints converge on the host's arrival order", () => {
    const net = createNetwork();
    const host = net.host();
    const a = net.guest("a");
    const b = net.guest("b");
    net.flush();

    a.paint([{ c: 5, r: 5, tile: GRASS }]);
    b.paint([{ c: 5, r: 5, tile: WATER }]);
    host.paint([{ c: 6, r: 6, tile: GRASS }]);
    net.flush();

    // The host received a's paint, then b's: b wins everywhere.
    for (const session of [host, a, b]) {
      expect(cellOf(session, 5, 5)).toEqual(WATER);
      expect(cellOf(session, 6, 6)).toEqual(GRASS);
    }
  });

  it("a clear racing an in-flight paint converges with no resurrection", () => {
    const net = createNetwork();
    const host = net.host();
    const a = net.guest("a");
    net.flush();
    host.paint([{ c: 2, r: 2, tile: GRASS }]);
    net.flush();

    a.paint([{ c: 3, r: 3, tile: WATER }]); // queued up to the host...
    host.clear(); // ...while the host clears
    net.flush();

    // Host order: clear, then a's paint. Both peers agree on it.
    for (const session of [host, a]) {
      expect(cellOf(session, 2, 2)).toBeNull();
      expect(cellOf(session, 3, 3)).toEqual(WATER);
    }
  });

  it("solo edits stay local and send nothing", () => {
    const solo = createCoopSession({
      roomId: ROOM,
      map: createMapStore(createEmptyGrid()),
      spawn: SPAWN,
      createTransport: () => ({
        start() {},
        stop() {},
        sendToHost: () => expect.unreachable(),
        sendTo: () => expect.unreachable(),
        broadcast: () => expect.unreachable(),
      }),
    });
    solo.paint([{ c: 0, r: 0, tile: GRASS }]);
    expect(cellOf(solo, 0, 0)).toEqual(GRASS);
    solo.clear();
    solo.setLocalAvatar({ ...SPAWN, x: 1 });
    expect(cellOf(solo, 0, 0)).toBeNull();
  });

  it("ignores malformed messages loudly", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let events: TransportEvents | undefined;
    const host = createCoopSession({
      roomId: ROOM,
      map: createMapStore(createEmptyGrid()),
      spawn: SPAWN,
      createTransport: (_room, e) => {
        events = e;
        return { start() {}, stop() {}, sendToHost() {}, sendTo() {}, broadcast() {} };
      },
    });
    events?.onState({ status: "connected", role: "host", selfId: ROOM, peerCount: 1 });
    events?.onData("a", { kind: "paint", edits: [{ c: 1, r: 1, tile: { src: "/evil.png", sx: 0, sy: 0 } }] });
    expect(cellOf(host, 1, 1)).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

describe("host loss", () => {
  it("clears stale avatars, and the promoted survivor serves its map to newcomers", () => {
    const net = createNetwork();
    const host = net.host();
    const a = net.guest("a");
    net.guest("b");
    net.flush();
    host.paint([{ c: 7, r: 7, tile: GRASS }]);
    net.flush();

    net.loseHost();
    expect(a.snapshot()).toMatchObject({ status: "reconnecting", remoteCount: 0 });
    expect(cellOf(a, 7, 7)).toEqual(GRASS);

    net.promote("a");
    const c = net.guest("c");
    net.flush();
    expect(cellOf(c, 7, 7)).toEqual(GRASS);
    expect(c.remotes.has(ROOM)).toBe(true);
  });
});
