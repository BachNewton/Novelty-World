/**
 * The wire protocol between a browser and the relay (`relay/`), shared by
 * both sides. Every frame is one JSON object with a `type`.
 *
 * The relay knows rooms, their host and their guests, and nothing of any
 * game: it forwards each `data` payload untouched, guest to host or host to
 * guests. A room lives exactly as long as its host's socket.
 */

import type { PlayerProfile } from "@/shared/lib/profile";

/** No 0/O or 1/I, so a code read aloud or off a phone can't be mistyped. */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 4;
const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

export function generateRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

/** A typed-in code, normalised; null when it can't be a room code. */
export function parseRoomCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

/** Browser to relay. */
export type ClientFrame =
  /** Open a room under a fresh code. */
  | { type: "host"; game: string; profile: PlayerProfile }
  /** Enter the room holding `code`; `not-found` if nobody does. */
  | { type: "join"; game: string; code: string; profile: PlayerProfile }
  /** Host the room under `code` if nobody holds it, else join it. */
  | { type: "claim"; game: string; code: string; profile: PlayerProfile }
  /** Host only: to one guest. */
  | { type: "to"; id: string; data: unknown }
  /** Host only: to every guest but `except`. */
  | { type: "broadcast"; data: unknown; except?: string }
  /** Guest only: to the host. */
  | { type: "up"; data: unknown };

/** Relay to browser. */
export type RelayFrame =
  | { type: "hosting"; code: string; id: string }
  | { type: "joined"; code: string; id: string }
  | { type: "not-found" }
  /** To the host. */
  | { type: "guest-joined"; id: string; profile: PlayerProfile }
  /** To the host. */
  | { type: "guest-left"; id: string }
  /** To each guest: the room is gone. The socket stays open for another room. */
  | { type: "host-left" }
  /** To the host, `from` a guest; to a guest, from the host. */
  | { type: "data"; from?: string; data: unknown };

/** Longest game or player name the relay accepts. */
const MAX_NAME = 64;

/** A room's name on the wire: a drawn code, or a name a game picks for a fixed room (the RPG's world). */
const ROOM_NAME = /^[A-Za-z0-9_-]{1,64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isName(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_NAME;
}

export function parseProfile(value: unknown): PlayerProfile | null {
  if (!isRecord(value) || !isName(value.id) || !isName(value.name)) return null;
  return { id: value.id, name: value.name };
}

/** A frame from a browser, or null when it isn't a well-formed one. */
export function parseClientFrame(value: unknown): ClientFrame | null {
  if (!isRecord(value)) return null;
  switch (value.type) {
    case "host": {
      const profile = parseProfile(value.profile);
      return isName(value.game) && profile !== null ? { type: "host", game: value.game, profile } : null;
    }
    case "join":
    case "claim": {
      const profile = parseProfile(value.profile);
      return isName(value.game) && typeof value.code === "string" && ROOM_NAME.test(value.code) && profile !== null
        ? { type: value.type, game: value.game, code: value.code, profile }
        : null;
    }
    case "to":
      return typeof value.id === "string" && "data" in value ? { type: "to", id: value.id, data: value.data } : null;
    case "broadcast":
      if (!("data" in value)) return null;
      if (value.except === undefined) return { type: "broadcast", data: value.data };
      return typeof value.except === "string" ? { type: "broadcast", data: value.data, except: value.except } : null;
    case "up":
      return "data" in value ? { type: "up", data: value.data } : null;
    default:
      return null;
  }
}

/** A frame from the relay, or null when it isn't a well-formed one. */
export function parseRelayFrame(value: unknown): RelayFrame | null {
  if (!isRecord(value)) return null;
  switch (value.type) {
    case "hosting":
    case "joined":
      return typeof value.code === "string" && typeof value.id === "string"
        ? { type: value.type, code: value.code, id: value.id }
        : null;
    case "not-found":
    case "host-left":
      return { type: value.type };
    case "guest-joined": {
      const profile = parseProfile(value.profile);
      return typeof value.id === "string" && profile !== null ? { type: "guest-joined", id: value.id, profile } : null;
    }
    case "guest-left":
      return typeof value.id === "string" ? { type: "guest-left", id: value.id } : null;
    case "data":
      if (!("data" in value)) return null;
      if (value.from === undefined) return { type: "data", data: value.data };
      return typeof value.from === "string" ? { type: "data", from: value.from, data: value.data } : null;
    default:
      return null;
  }
}
