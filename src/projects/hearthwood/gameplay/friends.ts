import type { Companion } from "./companions";

/*
 * What befriending remembers: the companions (who each is, by its stray's id
 * and seed, its species, the name Elliott gave it, and whether it follows or
 * waits at camp), and how warm each stray Elliott has met is to them, so a
 * cat half won over stays half won over. Where they stand is never kept:
 * the companions who follow come back beside Elliott, the rest by the fire.
 * Until the game has its own saving it is kept on the device under a key of
 * its own, which names the shape it is kept in, so a later shape is kept
 * under a new key and never misread. A stray's id holds only as long as the
 * strays' placement does, so a change to that starts a new key too.
 */

export interface Friends {
  companions: Companion[];
  /** Each stray met but not yet won, by its id, with its warmth. */
  warmth: Record<string, number>;
}

export const FRIENDS_KEY = "hearthwood/companions/v1";

export function noFriends(): Friends {
  return { companions: [], warmth: {} };
}

export function serializeFriends(friends: Friends): string {
  return JSON.stringify(friends);
}

const isText = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/** A kept record read back. Anything but the shape this key holds is a bug in what wrote it, and says so. */
export function parseFriends(text: string): Friends {
  const data = JSON.parse(text) as { companions?: unknown; warmth?: unknown };
  if (!Array.isArray(data.companions) || typeof data.warmth !== "object" || data.warmth === null) throw new Error(`The kept companions under ${FRIENDS_KEY} aren't a list and their warmth: ${text}`);
  const companions = data.companions.map((c: unknown): Companion => {
    const { id, species, seed, name, following, joined } = (c ?? {}) as Record<string, unknown>;
    if (!isText(id) || (species !== "cat" && species !== "dog") || !isText(seed) || !isText(name) || typeof following !== "boolean" || typeof joined !== "number") {
      throw new Error(`A kept companion isn't one: ${JSON.stringify(c)}`);
    }
    return { id, species, seed, name, following, joined };
  });
  const warmth: Record<string, number> = {};
  for (const [id, w] of Object.entries(data.warmth)) {
    if (typeof w !== "number" || !(w >= 0 && w <= 1)) throw new Error(`The kept warmth of stray ${id} is ${String(w)}`);
    warmth[id] = w;
  }
  return { companions, warmth };
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** What was kept on this device, or no friends yet where nothing was (or the device keeps nothing). */
export function loadFriends(): Friends {
  let text: string | null = null;
  try {
    text = storage()?.getItem(FRIENDS_KEY) ?? null;
  } catch {
    // Storage that throws on reading keeps nothing: the walk goes on unsaved.
    return noFriends();
  }
  return text === null ? noFriends() : parseFriends(text);
}

export function saveFriends(friends: Friends): void {
  try {
    storage()?.setItem(FRIENDS_KEY, serializeFriends(friends));
  } catch {
    // A full or refused storage keeps nothing; the companions still follow for this visit.
  }
}
