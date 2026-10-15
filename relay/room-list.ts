/**
 * The room list's local stand-in: what Supabase Realtime presence does for
 * the shared room list (`src/shared/lib/room-list/`), on this computer, so an
 * e2e run never reaches the live project. Only an e2e run's relay serves it
 * (`ROOM_LIST=local`, set by playwright.config.ts), beside its rooms; the
 * production relay has no room discovery.
 */

import type { IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { ListedRoom } from "../src/shared/lib/room-list/room-list";
import {
  parseRoomListClientFrame,
  type RoomListClientFrame,
  type RoomListSync,
} from "../src/shared/lib/room-list/local-protocol";

interface Watcher {
  socket: WebSocket;
  channel: string | null;
  room: ListedRoom | null;
}

export function createLocalRoomList(options: { allowOrigin(origin: string | undefined): boolean }): WebSocketServer {
  const watchers = new Set<Watcher>();
  const wss = new WebSocketServer({
    noServer: true,
    verifyClient: ({ req }: { req: IncomingMessage }) => options.allowOrigin(req.headers.origin),
  });

  /** The channel's rooms, to `to` (by default everyone watching it). */
  function sync(channel: string, to?: Watcher): void {
    const onChannel = [...watchers].filter((w) => w.channel === channel);
    const rooms = onChannel.flatMap((w) => (w.room === null ? [] : [w.room])).sort((a, b) => a.listedAt - b.listedAt);
    const frame = JSON.stringify({ type: "sync", rooms } satisfies RoomListSync);
    for (const w of to === undefined ? onChannel : [to]) w.socket.send(frame);
  }

  function refuse(watcher: Watcher, reason: string): void {
    console.warn(`room list: closing a socket: ${reason}`);
    watcher.socket.close(1008, reason);
  }

  function handle(watcher: Watcher, frame: RoomListClientFrame): void {
    if (frame.type === "watch") {
      if (watcher.channel !== null) return refuse(watcher, "watch twice");
      watcher.channel = frame.channel;
      return sync(frame.channel, watcher);
    }
    if (watcher.channel === null) return refuse(watcher, `${frame.type} before watch`);
    watcher.room = frame.type === "track" ? frame.room : null;
    sync(watcher.channel);
  }

  wss.on("connection", (socket) => {
    const watcher: Watcher = { socket, channel: null, room: null };
    watchers.add(watcher);
    socket.on("message", (raw, isBinary) => {
      if (isBinary) return refuse(watcher, "binary frame");
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        return refuse(watcher, "frame is not JSON");
      }
      const frame = parseRoomListClientFrame(parsed);
      if (frame === null) return refuse(watcher, "malformed frame");
      handle(watcher, frame);
    });
    socket.on("close", () => {
      watchers.delete(watcher);
      if (watcher.channel !== null && watcher.room !== null) sync(watcher.channel);
    });
    socket.on("error", (err) => console.warn("room list: socket error", err));
  });

  return wss;
}
