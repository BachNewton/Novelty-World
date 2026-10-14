import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { allowOrigin } from "./origins";
import { startRelay } from "./relay";
import { startTestRelay } from "./testing";

let relay: Awaited<ReturnType<typeof startTestRelay>>;
beforeAll(async () => {
  relay = await startTestRelay();
});
afterAll(() => relay.close());

const PROFILE = { id: "p1", name: "Ann" };

function connect(url = relay.url, origin?: string): Promise<WebSocket> {
  const socket = new WebSocket(url, origin === undefined ? {} : { origin });
  return new Promise((resolve, reject) => {
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

function nextFrame(socket: WebSocket): Promise<unknown> {
  return new Promise((resolve) => socket.once("message", (raw) => resolve(JSON.parse(String(raw)))));
}

function closed(socket: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => socket.once("close", (code, reason) => resolve({ code, reason: String(reason) })));
}

async function hosting(): Promise<{ socket: WebSocket; code: string }> {
  const socket = await connect();
  socket.send(JSON.stringify({ type: "host", game: "test", profile: PROFILE }));
  const frame = (await nextFrame(socket)) as { code: string };
  return { socket, code: frame.code };
}

describe("refusing what breaks the protocol", () => {
  // Each refusal is logged loudly on purpose; silence it here.
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    return () => vi.restoreAllMocks();
  });

  it.each([
    ["a frame that isn't JSON", "not json"],
    ["a frame of an unknown type", JSON.stringify({ type: "nope" })],
    ["a join with a room name that can't be one", JSON.stringify({ type: "join", game: "t", code: "a b", profile: PROFILE })],
    ["a join without a profile", JSON.stringify({ type: "join", game: "t", code: "ABCD" })],
  ])("closes the socket on %s", async (_, frame) => {
    const socket = await connect();
    const close = closed(socket);
    socket.send(frame);
    expect((await close).code).toBe(1008);
  });

  it("closes a host that sends up, as only guests do", async () => {
    const { socket } = await hosting();
    const close = closed(socket);
    socket.send(JSON.stringify({ type: "up", data: 1 }));
    expect((await close).code).toBe(1008);
  });

  it("closes a guest that broadcasts, as only hosts do", async () => {
    const { code } = await hosting();
    const guest = await connect();
    guest.send(JSON.stringify({ type: "join", game: "test", code, profile: PROFILE }));
    await nextFrame(guest);
    const close = closed(guest);
    guest.send(JSON.stringify({ type: "broadcast", data: 1 }));
    expect((await close).code).toBe(1008);
  });

  it("closes a socket that asks for a second room", async () => {
    const { socket } = await hosting();
    const close = closed(socket);
    socket.send(JSON.stringify({ type: "host", game: "test", profile: PROFILE }));
    expect((await close).code).toBe(1008);
  });
});

describe("rooms", () => {
  it("drops a guest's message sent as its host left, and keeps the guest's socket for another room", async () => {
    const { socket: host, code } = await hosting();
    const guest = await connect();
    guest.send(JSON.stringify({ type: "join", game: "test", code, profile: PROFILE }));
    await nextFrame(guest);
    host.close();
    expect(await nextFrame(guest)).toEqual({ type: "host-left" });
    guest.send(JSON.stringify({ type: "up", data: "too late" }));
    guest.send(JSON.stringify({ type: "claim", game: "test", code, profile: PROFILE }));
    expect(await nextFrame(guest)).toMatchObject({ type: "hosting", code });
  });

  it("namespaces codes by game", async () => {
    const { code } = await hosting();
    const other = await connect();
    other.send(JSON.stringify({ type: "join", game: "another-game", code, profile: PROFILE }));
    expect(await nextFrame(other)).toEqual({ type: "not-found" });
  });

  it("frees a room when its host goes, so a claim takes the code", async () => {
    const { socket, code } = await hosting();
    socket.close();
    await closed(socket);
    const claimer = await connect();
    claimer.send(JSON.stringify({ type: "claim", game: "test", code, profile: PROFILE }));
    expect(await nextFrame(claimer)).toMatchObject({ type: "hosting", code });
  });
});

describe("origins", () => {
  it("lets in the site, its Vercel previews and local dev servers", () => {
    for (const origin of [
      "https://novelty-world.vercel.app",
      "https://novelty-world-git-main-bachnewton.vercel.app",
      "http://localhost:3001",
      "http://192.168.50.77:3001",
    ]) {
      expect(allowOrigin(origin), origin).toBe(true);
    }
  });

  it("keeps out other sites and clients that name no origin", () => {
    for (const origin of ["https://example.com", "https://novelty-world.vercel.app.evil.com", "http://novelty-world.vercel.app", undefined]) {
      expect(allowOrigin(origin), origin).toBe(false);
    }
  });

  it("refuses the handshake from an origin it doesn't allow", async () => {
    const server = createServer();
    const wss = startRelay(server, { allowOrigin });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("not on a TCP port");
    const url = `ws://localhost:${address.port}`;
    await expect(connect(url, "https://example.com")).rejects.toThrow(/401/);
    const allowed = await connect(url, "http://localhost:3001");
    allowed.close();
    await closed(allowed);
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
