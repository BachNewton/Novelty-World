import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import type { ListedRoom } from "../src/shared/lib/room-list/room-list";
import { createLocalRoomList } from "./room-list";
import { serveWebSockets } from "./serve";

const server = createServer();
const list = createLocalRoomList({ allowOrigin: () => true });
let url = "";
beforeAll(async () => {
  serveWebSockets(server, () => list);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("not on a TCP port");
  url = `ws://localhost:${String(address.port)}/room-list`;
});
afterAll(async () => {
  for (const client of list.clients) client.terminate();
  await new Promise<void>((resolve) => list.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function room(code: string, listedAt: number): ListedRoom {
  return { code, hostName: `Host ${code}`, players: 1, capacity: 2, listedAt };
}

/** A socket watching `channel`, with every list it has been sent, in order. */
async function watch(channel: string): Promise<{ socket: WebSocket; next(): Promise<string[]> }> {
  const socket = new WebSocket(url);
  const lists: string[][] = [];
  const waiting: ((codes: string[]) => void)[] = [];
  socket.on("message", (raw) => {
    const codes = (JSON.parse(String(raw)) as { rooms: ListedRoom[] }).rooms.map((r) => r.code);
    const resolve = waiting.shift();
    if (resolve === undefined) lists.push(codes);
    else resolve(codes);
  });
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  socket.send(JSON.stringify({ type: "watch", channel }));
  return {
    socket,
    next: () => {
      const codes = lists.shift();
      return codes === undefined ? new Promise((resolve) => waiting.push(resolve)) : Promise.resolve(codes);
    },
  };
}

describe("the room list's local stand-in", () => {
  it("sends every watcher the channel's rooms, oldest first, as they are listed and taken down", async () => {
    const a = await watch("game:one");
    const b = await watch("game:one");
    expect(await a.next()).toEqual([]);
    expect(await b.next()).toEqual([]);

    b.socket.send(JSON.stringify({ type: "track", room: room("BBBB", 20) }));
    expect(await a.next()).toEqual(["BBBB"]);
    expect(await b.next()).toEqual(["BBBB"]);
    a.socket.send(JSON.stringify({ type: "track", room: room("AAAA", 10) }));
    expect(await a.next()).toEqual(["AAAA", "BBBB"]);
    expect(await b.next()).toEqual(["AAAA", "BBBB"]);

    a.socket.send(JSON.stringify({ type: "untrack" }));
    expect(await b.next()).toEqual(["BBBB"]);
    expect(await a.next()).toEqual(["BBBB"]);

    // A closed socket's room goes, as a closed tab's presence does.
    b.socket.close();
    expect(await a.next()).toEqual([]);
    a.socket.close();
  });

  it("keeps each channel's rooms to itself", async () => {
    const one = await watch("game:a");
    const two = await watch("game:b");
    expect(await one.next()).toEqual([]);
    expect(await two.next()).toEqual([]);
    one.socket.send(JSON.stringify({ type: "track", room: room("AAAA", 1) }));
    expect(await one.next()).toEqual(["AAAA"]);
    two.socket.send(JSON.stringify({ type: "track", room: room("BBBB", 2) }));
    expect(await two.next()).toEqual(["BBBB"]);
    one.socket.close();
    two.socket.close();
  });

  it("closes a socket that advertises before watching", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const socket = new WebSocket(url);
      await new Promise((resolve) => socket.once("open", resolve));
      const closed = new Promise<number>((resolve) => socket.once("close", resolve));
      socket.send(JSON.stringify({ type: "track", room: room("AAAA", 1) }));
      expect(await closed).toBe(1008);
    } finally {
      warn.mockRestore();
    }
  });
});
