import { createServer } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { startRelay } from "../../../../relay/relay";
import { startTestRelay } from "../../../../relay/testing";
import {
  createRoom,
  generateRoomCode,
  parseRoomCode,
  relayUrlFromSearch,
  RELAY_URL,
  type Room,
  type RoomState,
  type RoomTarget,
} from "./room";

// The rooms run against a real relay; Node's own WebSocket stands in for the browser's.
let relay: Awaited<ReturnType<typeof startTestRelay>>;
beforeAll(async () => {
  vi.stubGlobal("window", new EventTarget());
  relay = await startTestRelay();
});
afterAll(async () => {
  await relay.close();
  vi.unstubAllGlobals();
});

const GAME = "test";
let rooms: Room<unknown, unknown>[] = [];
afterEach(async () => {
  for (const room of rooms) room.stop();
  rooms = [];
  await Promise.resolve();
});

function player(name: string, target: RoomTarget, url = relay.url) {
  const states: RoomState[] = [];
  const log: string[] = [];
  let changed = () => {};
  const notify = () => changed();
  const room = createRoom<unknown, unknown>({
    game: GAME,
    target,
    profile: { id: `profile-${name}`, name },
    relayUrl: url,
    events: {
      onState: (s) => {
        states.push(s);
        notify();
      },
      onGuestJoined: (p) => {
        log.push(`joined ${p.name}`);
        notify();
      },
      onGuestLeft: (p) => {
        log.push(`left ${p.name}`);
        notify();
      },
      onHostMessage: (m) => {
        log.push(`host ${JSON.stringify(m)}`);
        notify();
      },
      onGuestMessage: (from, m) => {
        log.push(`${from.name} ${JSON.stringify(m)}`);
        notify();
      },
    },
  });
  rooms.push(room);
  const state = () => states.at(-1);
  /** Resolves on the first event after which `check` holds. */
  function until(check: () => boolean): Promise<void> {
    if (check()) return Promise.resolve();
    return new Promise((resolve) => {
      const previous = changed;
      changed = () => {
        previous();
        if (check()) resolve();
      };
    });
  }
  return {
    room,
    log,
    states,
    state,
    until,
    status: (status: RoomState["status"]) => until(() => state()?.status === status),
    logged: (entry: string) => until(() => log.includes(entry)),
  };
}

async function hostRoom(name = "Host") {
  const host = player(name, { mode: "host" });
  host.room.start();
  await host.status("connected");
  return host;
}

async function joinRoom(code: string, name: string, mode: "join" | "claim" = "join") {
  const guest = player(name, { mode, code });
  guest.room.start();
  await guest.status("connected");
  return guest;
}

describe("room codes", () => {
  it("draws codes a person can read back unambiguously", () => {
    for (let i = 0; i < 50; i++) expect(generateRoomCode()).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
  });

  it("normalises typed codes and rejects what can't be one", () => {
    expect(parseRoomCode(" abcd ")).toBe("ABCD");
    expect(parseRoomCode("AB0D")).toBeNull();
    expect(parseRoomCode("ABCDE")).toBeNull();
  });
});

describe("the relay's address", () => {
  it("is Novelty World's relay unless the page asks for a local one", () => {
    expect(relayUrlFromSearch("")).toBe(RELAY_URL);
    expect(relayUrlFromSearch("?relay=local:9000")).toBe("ws://localhost:9000");
  });

  it("rejects a local relay with no port", () => {
    expect(() => relayUrlFromSearch("?relay=local")).toThrow();
  });
});

describe("hosting and joining", () => {
  it("hosts a fresh code, connected, with only the host in the room", async () => {
    const host = await hostRoom();
    expect(host.state()).toMatchObject({ role: "host", players: [{ name: "Host" }] });
    expect(parseRoomCode(host.state()?.code ?? "")).not.toBeNull();
  });

  it("joins by code: both see the same list, host first", async () => {
    const host = await hostRoom();
    const code = host.state()?.code ?? "";
    const guest = await joinRoom(code, "Guest");
    await host.logged("joined Guest");
    const names = (s: RoomState | undefined) => s?.players.map((p) => p.name);
    expect(names(guest.state())).toEqual(["Host", "Guest"]);
    await host.until(() => names(host.state())?.length === 2);
    expect(names(host.state())).toEqual(["Host", "Guest"]);
    expect(guest.state()).toMatchObject({ role: "guest", code });
  });

  it("ends in not-found when nobody holds the code", async () => {
    const guest = player("Guest", { mode: "join", code: generateRoomCode() });
    guest.room.start();
    await guest.status("not-found");
  });
});

describe("messages", () => {
  it("carries guest messages up, and the host's to one guest or all but one", async () => {
    const host = await hostRoom();
    const code = host.state()?.code ?? "";
    const ann = await joinRoom(code, "Ann");
    const bob = await joinRoom(code, "Bob");
    await host.logged("joined Bob");
    const bobId = bob.state()?.selfId ?? "";
    const annId = ann.state()?.selfId ?? "";

    ann.room.sendToHost({ move: 1 });
    await host.logged('Ann {"move":1}');

    host.room.sendTo(bobId, "just bob");
    await bob.logged('host "just bob"');
    host.room.broadcast("not ann", annId);
    await bob.logged('host "not ann"');
    host.room.broadcast("everyone");
    await ann.logged('host "everyone"');
    expect(ann.log).not.toContain('host "just bob"');
    expect(ann.log).not.toContain('host "not ann"');
  });

  it("refuses to send to a host it isn't linked to", () => {
    const guest = player("Guest", { mode: "join", code: generateRoomCode() });
    expect(() => guest.room.sendToHost("hi")).toThrow();
  });
});

describe("leaving", () => {
  it("tells the host and the others when a guest leaves", async () => {
    const host = await hostRoom();
    const code = host.state()?.code ?? "";
    const ann = await joinRoom(code, "Ann");
    const bob = await joinRoom(code, "Bob");
    bob.room.stop();
    await host.logged("left Bob");
    await ann.until(() => ann.state()?.players.length === 2);
    expect(ann.state()?.players.map((p) => p.name)).toEqual(["Host", "Ann"]);
  });

  it("join mode ends in disconnected when the host leaves", async () => {
    const host = await hostRoom();
    const guest = await joinRoom(host.state()?.code ?? "", "Guest");
    host.room.stop();
    await guest.status("disconnected");
  });
});

describe("claiming a room", () => {
  it("the first claimant hosts and the next joins them", async () => {
    const code = generateRoomCode();
    const first = player("First", { mode: "claim", code });
    first.room.start();
    await first.status("connected");
    const second = await joinRoom(code, "Second", "claim");
    expect(first.state()?.role).toBe("host");
    expect(second.state()?.role).toBe("guest");
  });

  it("when the host leaves, one guest takes the room over and the other joins it", async () => {
    const code = generateRoomCode();
    const host = await joinRoom(code, "Host", "claim");
    const ann = await joinRoom(code, "Ann", "claim");
    const bob = await joinRoom(code, "Bob", "claim");
    await host.logged("joined Bob");
    host.room.stop();
    const reElected = () => {
      const roles = [ann.state()?.role, bob.state()?.role];
      return (
        ann.state()?.status === "connected" &&
        bob.state()?.status === "connected" &&
        roles.includes("host") &&
        roles.includes("guest")
      );
    };
    await Promise.race([ann.until(reElected), bob.until(reElected)]);
    const newHost = ann.state()?.role === "host" ? ann : bob;
    await newHost.until(() => newHost.state()?.players.length === 2);
    expect(newHost.state()?.code).toBe(code);
  });
});

describe("reaching the relay", () => {
  it("retries a failed attempt at once, then waits for the browser to come back online", async () => {
    let open = false;
    const server = createServer();
    const wss = startRelay(server, { allowOrigin: () => open });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("not on a TCP port");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const host = player("Host", { mode: "host" }, `ws://localhost:${address.port}`);
      host.room.start();
      await host.status("offline");
      expect(warn).toHaveBeenCalledTimes(2);
      expect(error).toHaveBeenCalledTimes(1);

      open = true;
      window.dispatchEvent(new Event("online"));
      await host.status("connected");
    } finally {
      warn.mockRestore();
      error.mockRestore();
      for (const room of rooms) room.stop();
      rooms = [];
      await Promise.resolve();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe("teardown", () => {
  it("a start in the same task as a stop keeps the live connection (React StrictMode remount)", async () => {
    const host = await hostRoom();
    const code = host.state()?.code ?? "";
    host.room.stop();
    host.room.start();
    await Promise.resolve();
    expect(host.state()?.status).toBe("connected");
    await joinRoom(code, "Guest");
    await host.logged("joined Guest");
  });

  it("stop leaves the room, and the room can start again", async () => {
    const host = await hostRoom();
    const code = host.state()?.code ?? "";
    host.room.stop();
    await host.status("idle");
    const late = player("Late", { mode: "join", code });
    late.room.start();
    await late.status("not-found");

    host.room.start();
    await host.until(() => host.states.filter((s) => s.status === "connected").length === 2);
  });
});
