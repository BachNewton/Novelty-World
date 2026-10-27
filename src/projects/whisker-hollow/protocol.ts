import { isRecord, parseAvatar, parsePoint, parseWorld } from "./parse";
import type { Avatar, Point, World } from "./types";

/**
 * The co-op wire protocol. A star with an authoritative host: guests send
 * intents up, the host applies them with the rules and sends the world down.
 * Players are known by their profile id, which survives a reconnect.
 */

export const GAME = "whisker-hollow";
export const WORLD_ID = "world";
/** Test/dev isolation only: production always plays the one shared garden. */
export const WORLD_PARAM = "world";
const WORLD_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function worldIdFromSearch(search: string): string {
  const id = new URLSearchParams(search).get(WORLD_PARAM);
  if (id === null) return WORLD_ID;
  if (!WORLD_ID_PATTERN.test(id)) throw new Error(`?${WORLD_PARAM}=${id} is not a world id`);
  return id;
}

/** A pair just back together, for everyone to celebrate. */
export interface Moment {
  kind: "reunited";
  species: string;
  by: string;
}

export type GuestMessage =
  | { kind: "avatar"; avatar: Avatar }
  | { kind: "pick-up"; animal: string; at: Point }
  | { kind: "put-down"; at: Point }
  | { kind: "name"; species: string; name: string };

export type HostMessage =
  | { kind: "world"; world: World; moment: Moment | null }
  | { kind: "avatars"; avatars: Record<string, Avatar> }
  | { kind: "avatar"; id: string; avatar: Avatar }
  | { kind: "left"; id: string };

export function parseGuestMessage(value: unknown): GuestMessage | null {
  if (!isRecord(value)) return null;
  switch (value.kind) {
    case "avatar": {
      const avatar = parseAvatar(value.avatar);
      return avatar === null ? null : { kind: "avatar", avatar };
    }
    case "pick-up": {
      const at = parsePoint(value.at);
      return at === null || typeof value.animal !== "string" ? null : { kind: "pick-up", animal: value.animal, at };
    }
    case "put-down": {
      const at = parsePoint(value.at);
      return at === null ? null : { kind: "put-down", at };
    }
    case "name":
      return typeof value.species === "string" && typeof value.name === "string"
        ? { kind: "name", species: value.species, name: value.name }
        : null;
    default:
      return null;
  }
}

function parseMoment(value: unknown): Moment | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || value.kind !== "reunited") return undefined;
  if (typeof value.species !== "string" || typeof value.by !== "string") return undefined;
  return { kind: "reunited", species: value.species, by: value.by };
}

export function parseHostMessage(value: unknown): HostMessage | null {
  if (!isRecord(value)) return null;
  switch (value.kind) {
    case "world": {
      const world = parseWorld(value.world);
      const moment = parseMoment(value.moment);
      return world === null || moment === undefined ? null : { kind: "world", world, moment };
    }
    case "avatars": {
      if (!isRecord(value.avatars)) return null;
      const avatars: Record<string, Avatar> = {};
      for (const [id, raw] of Object.entries(value.avatars)) {
        const avatar = parseAvatar(raw);
        if (avatar === null) return null;
        avatars[id] = avatar;
      }
      return { kind: "avatars", avatars };
    }
    case "avatar": {
      const avatar = parseAvatar(value.avatar);
      return avatar === null || typeof value.id !== "string" ? null : { kind: "avatar", id: value.id, avatar };
    }
    case "left":
      return typeof value.id === "string" ? { kind: "left", id: value.id } : null;
    default:
      return null;
  }
}
