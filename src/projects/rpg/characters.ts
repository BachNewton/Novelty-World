/**
 * Playable character roster — one id per sprite directory under
 * `public/rpg/sprites/`. Every directory shares the same strip
 * layout/naming (front/side/back x idle/walk, 6 frames of 64px), so all
 * roster entries are playable with zero per-character code.
 */

import type { AvatarDir } from "./coop/types";

export const PLAYABLE_CHARACTER_IDS = [
  "bartender-bruno",
  "bartender-katy",
  "chef-chloe",
  "farmer-bob",
  "farmer-buba",
  "fisherman-fin",
  "lumberjack-jack",
  "miner-mike",
] as const;

export type CharacterId = (typeof PLAYABLE_CHARACTER_IDS)[number];

export const DEFAULT_CHARACTER_ID: CharacterId = "farmer-bob";

export function isCharacterId(value: unknown): value is CharacterId {
  return (
    typeof value === "string" &&
    (PLAYABLE_CHARACTER_IDS as readonly string[]).includes(value)
  );
}

/** Unknown/missing values (e.g. older peers without the field) fall back. */
export function sanitizeCharacterId(value: unknown): CharacterId {
  return isCharacterId(value) ? value : DEFAULT_CHARACTER_ID;
}

/** Next roster entry, wrapping around. Unknown input restarts at default. */
export function nextCharacterId(current: unknown): CharacterId {
  const ids = PLAYABLE_CHARACTER_IDS;
  const index = (ids as readonly string[]).indexOf(
    typeof current === "string" ? current : "",
  );
  const next = ids.at(index < 0 ? 0 : (index + 1) % ids.length);
  // Reachable only if the roster above is emptied.
  if (next === undefined) throw new Error("character roster is empty");
  return next;
}

export type CharacterStrips = Record<AvatarDir, string>;

export function idleStripsFor(characterId: CharacterId): CharacterStrips {
  return {
    front: `/rpg/sprites/${characterId}/front-idle.png`,
    side: `/rpg/sprites/${characterId}/side-idle.png`,
    back: `/rpg/sprites/${characterId}/back-idle.png`,
  };
}

export function walkStripsFor(characterId: CharacterId): CharacterStrips {
  return {
    front: `/rpg/sprites/${characterId}/front-walk.png`,
    side: `/rpg/sprites/${characterId}/side-walk.png`,
    back: `/rpg/sprites/${characterId}/back-walk.png`,
  };
}
