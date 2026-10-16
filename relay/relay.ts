/**
 * The relay: Novelty World's multiplayer server. Browsers hold one WebSocket
 * to it; it keeps star rooms (one host, any number of guests) and forwards
 * each room's messages between host and guests without reading them. What a
 * message means is each game's business, on the browser side
 * (`src/shared/lib/peer/`). The protocol lives in that module's `protocol.ts`.
 */

import { randomBytes } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import {
  generateRoomCode,
  parseClientFrame,
  type ClientFrame,
  type RelayFrame,
} from "../src/shared/lib/peer/protocol";
import type { PlayerProfile } from "../src/shared/lib/profile";
import { serveWebSockets } from "./serve";

/** Big enough for any game's state snapshot (the RPG's map), small enough to refuse abuse. */
const MAX_FRAME_BYTES = 1024 * 1024;

/**
 * How often the relay pings every socket. A socket that hasn't answered the
 * previous ping is dead (a closed laptop lid, a phone that lost signal) and is
 * dropped, so its room or seat is freed. Browsers answer pings on their own.
 */
const HEARTBEAT_MS = 15_000;

interface Client {
  socket: WebSocket;
  id: string;
  alive: boolean;
  room: Room | null;
}

interface Room {
  key: string;
  code: string;
  host: Client;
  guests: Map<string, Client>;
}

export interface RelayOptions {
  /** Origins whose pages may connect; any other is refused. */
  allowOrigin(origin: string | undefined): boolean;
}

/** The relay on its own HTTP server, taking every WebSocket upgrade. */
export function startRelay(server: Server, options: RelayOptions): WebSocketServer {
  const wss = createRelay(options);
  serveWebSockets(server, () => wss);
  return wss;
}

/** The relay, unattached: `serveWebSockets` hands it its connections. */
export function createRelay(options: RelayOptions): WebSocketServer {
  const rooms = new Map<string, Room>();
  const clients = new Set<Client>();
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_FRAME_BYTES,
    verifyClient: ({ req }: { req: IncomingMessage }) => options.allowOrigin(req.headers.origin),
  });

  const roomKey = (game: string, code: string) => `${game}:${code}`;

  function send(client: Client, frame: RelayFrame): void {
    client.socket.send(JSON.stringify(frame));
  }

  function refuse(client: Client, reason: string): void {
    console.warn(`relay: closing ${client.id}: ${reason}`);
    client.socket.close(1008, reason);
  }

  function openRoom(client: Client, game: string, code: string): void {
    const room: Room = { key: roomKey(game, code), code, host: client, guests: new Map() };
    rooms.set(room.key, room);
    client.room = room;
    send(client, { type: "hosting", code, id: client.id });
  }

  function enterRoom(client: Client, room: Room, profile: PlayerProfile): void {
    room.guests.set(client.id, client);
    client.room = room;
    send(client, { type: "joined", code: room.code, id: client.id });
    send(room.host, { type: "guest-joined", id: client.id, profile });
  }

  function leaveRoom(client: Client): void {
    const room = client.room;
    if (room === null) return;
    client.room = null;
    if (room.host === client) {
      rooms.delete(room.key);
      for (const guest of room.guests.values()) {
        guest.room = null;
        send(guest, { type: "host-left" });
      }
    } else {
      room.guests.delete(client.id);
      send(room.host, { type: "guest-left", id: client.id });
    }
  }

  function handle(client: Client, frame: ClientFrame): void {
    const room = client.room;
    const isHost = room?.host === client;
    switch (frame.type) {
      case "host":
      case "join":
      case "claim": {
        if (room !== null) return refuse(client, `${frame.type} while already in a room`);
        if (frame.type === "host") {
          let code = generateRoomCode();
          while (rooms.has(roomKey(frame.game, code))) code = generateRoomCode();
          return openRoom(client, frame.game, code);
        }
        const existing = rooms.get(roomKey(frame.game, frame.code));
        if (existing !== undefined) return enterRoom(client, existing, frame.profile);
        if (frame.type === "claim") return openRoom(client, frame.game, frame.code);
        return send(client, { type: "not-found" });
      }
      case "to": {
        if (room === null || !isHost) return refuse(client, "to from a non-host");
        // A guest that left a moment ago may still be addressed: not an error.
        const guest = room.guests.get(frame.id);
        if (guest !== undefined) send(guest, { type: "data", data: frame.data });
        return;
      }
      case "broadcast": {
        if (room === null || !isHost) return refuse(client, "broadcast from a non-host");
        for (const [id, guest] of room.guests) {
          if (id !== frame.except) send(guest, { type: "data", data: frame.data });
        }
        return;
      }
      case "up": {
        if (isHost) return refuse(client, "up from the host");
        // Sent before this guest heard that its host left: the room is gone, so it goes nowhere.
        if (room === null) return;
        return send(room.host, { type: "data", from: client.id, data: frame.data });
      }
    }
  }

  wss.on("connection", (socket) => {
    const client: Client = { socket, id: randomBytes(6).toString("base64url"), alive: true, room: null };
    socket.on("pong", () => {
      client.alive = true;
    });
    socket.on("message", (raw, isBinary) => {
      if (isBinary) return refuse(client, "binary frame");
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        return refuse(client, "frame is not JSON");
      }
      const frame = parseClientFrame(parsed);
      if (frame === null) return refuse(client, "malformed frame");
      handle(client, frame);
    });
    socket.on("close", () => {
      clients.delete(client);
      leaveRoom(client);
    });
    socket.on("error", (err) => console.warn(`relay: socket ${client.id} error`, err));
    clients.add(client);
  });

  const heartbeat = setInterval(() => {
    for (const client of clients) {
      if (!client.alive) {
        client.socket.terminate();
        continue;
      }
      client.alive = false;
      client.socket.ping();
    }
  }, HEARTBEAT_MS);
  wss.on("close", () => clearInterval(heartbeat));

  return wss;
}
