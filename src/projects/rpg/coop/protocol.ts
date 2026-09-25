/**
 * Co-op wire protocol. The topology is a star with an authoritative host:
 * guests send intents up, the host applies them and fans the results down.
 * Every payload arriving off the wire is untrusted and parsed here.
 */

import { isCharacterId, type AvatarDir, type CharacterId } from "../characters";
import {
  parseCellEdits,
  parseGrid,
  type CellEdit,
  type MapGrid,
} from "../world-map";

export const DEFAULT_ROOM_ID = "novelty-rpg-world";
/** Test/dev isolation only; production always uses the default room. */
export const ROOM_PARAM = "coop-room";
const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export interface Avatar {
  x: number;
  y: number;
  dir: AvatarDir;
  flip: boolean;
  moving: boolean;
  characterId: CharacterId;
}

/** Guest → host. */
export type GuestMessage =
  | { kind: "avatar"; avatar: Avatar }
  | { kind: "paint"; edits: CellEdit[] }
  | { kind: "clear" };

/** Host → guest. */
export type HostMessage =
  | { kind: "welcome"; grid: MapGrid; avatars: Record<string, Avatar> }
  | { kind: "avatar"; id: string; avatar: Avatar }
  | { kind: "left"; id: string }
  | { kind: "paint"; edits: CellEdit[] }
  | { kind: "clear" };

export function roomIdFromSearch(search: string): string {
  const raw = new URLSearchParams(search).get(ROOM_PARAM);
  return raw !== null && ROOM_ID_PATTERN.test(raw) ? raw : DEFAULT_ROOM_ID;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseAvatar(value: unknown): Avatar | null {
  if (!isRecord(value)) return null;
  const { x, y, dir, flip, moving, characterId } = value;
  if (
    typeof x !== "number" ||
    !Number.isFinite(x) ||
    typeof y !== "number" ||
    !Number.isFinite(y) ||
    (dir !== "front" && dir !== "side" && dir !== "back") ||
    typeof flip !== "boolean" ||
    typeof moving !== "boolean" ||
    !isCharacterId(characterId)
  ) {
    return null;
  }
  return { x, y, dir, flip, moving, characterId };
}

function parseEditsMessage(value: Record<string, unknown>): { kind: "paint"; edits: CellEdit[] } | null {
  const edits = parseCellEdits(value.edits);
  return edits.length === 0 ? null : { kind: "paint", edits };
}

export function parseGuestMessage(value: unknown): GuestMessage | null {
  if (!isRecord(value)) return null;
  switch (value.kind) {
    case "avatar": {
      const avatar = parseAvatar(value.avatar);
      return avatar === null ? null : { kind: "avatar", avatar };
    }
    case "paint":
      return parseEditsMessage(value);
    case "clear":
      return { kind: "clear" };
    default:
      return null;
  }
}

export function parseHostMessage(value: unknown): HostMessage | null {
  if (!isRecord(value)) return null;
  switch (value.kind) {
    case "welcome": {
      const grid = parseGrid(value.grid);
      if (grid === null || !isRecord(value.avatars)) return null;
      const avatars: Record<string, Avatar> = {};
      for (const [id, raw] of Object.entries(value.avatars)) {
        const avatar = parseAvatar(raw);
        if (avatar !== null) avatars[id] = avatar;
      }
      return { kind: "welcome", grid, avatars };
    }
    case "avatar": {
      const avatar = parseAvatar(value.avatar);
      if (avatar === null || typeof value.id !== "string") return null;
      return { kind: "avatar", id: value.id, avatar };
    }
    case "left":
      return typeof value.id === "string" ? { kind: "left", id: value.id } : null;
    case "paint":
      return parseEditsMessage(value);
    case "clear":
      return { kind: "clear" };
    default:
      return null;
  }
}
