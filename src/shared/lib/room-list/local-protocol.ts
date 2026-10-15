/**
 * The wire protocol of the room list's local stand-in (`relay/room-list.ts`),
 * which e2e runs use in place of Supabase presence, shared by both sides.
 * Every frame is one JSON object with a `type`. Each socket watches one
 * channel and advertises at most one room on it, which goes when the socket
 * closes, as a tab's presence does.
 */

import type { ListedRoom } from "./room-list";

/** The path the stand-in is served on, beside the relay's own sockets. */
export const LOCAL_ROOM_LIST_PATH = "/room-list";

/** Browser to stand-in. */
export type RoomListClientFrame =
  /** Watch a channel: the first frame, and only once. */
  | { type: "watch"; channel: string }
  /** Advertise this room, replacing any this socket advertised before. */
  | { type: "track"; room: ListedRoom }
  /** Take this socket's room down. */
  | { type: "untrack" };

/** Stand-in to browser: every room on the channel, oldest first, sent on watching and on every change. */
export interface RoomListSync {
  type: "sync";
  rooms: ListedRoom[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseListedRoom(value: unknown): ListedRoom | null {
  if (!isRecord(value)) return null;
  const { code, hostName, players, capacity, listedAt } = value;
  return typeof code === "string" &&
    typeof hostName === "string" &&
    typeof players === "number" &&
    typeof capacity === "number" &&
    typeof listedAt === "number"
    ? { code, hostName, players, capacity, listedAt }
    : null;
}

/** A frame from a browser, or null when it isn't a well-formed one. */
export function parseRoomListClientFrame(value: unknown): RoomListClientFrame | null {
  if (!isRecord(value)) return null;
  switch (value.type) {
    case "watch":
      return typeof value.channel === "string" && value.channel !== "" ? { type: "watch", channel: value.channel } : null;
    case "track": {
      const room = parseListedRoom(value.room);
      return room === null ? null : { type: "track", room };
    }
    case "untrack":
      return { type: "untrack" };
    default:
      return null;
  }
}

/** A frame from the stand-in, or null when it isn't a well-formed one. */
export function parseRoomListSync(value: unknown): RoomListSync | null {
  if (!isRecord(value) || value.type !== "sync" || !Array.isArray(value.rooms)) return null;
  const rooms: ListedRoom[] = [];
  for (const entry of value.rooms) {
    const room = parseListedRoom(entry);
    if (room === null) return null;
    rooms.push(room);
  }
  return { type: "sync", rooms };
}
