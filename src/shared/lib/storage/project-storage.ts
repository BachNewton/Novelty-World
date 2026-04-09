const PREFIX = "nw";

interface NamespacedStorage {
  get<T = string>(key: string): T | null;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
}

function createStorage(ns: string): NamespacedStorage {

  return {
    get<T = string>(key: string): T | null {
      try {
        const raw = localStorage.getItem(ns + key);
        if (raw === null) return null;
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },

    set<T>(key: string, value: T): void {
      localStorage.setItem(ns + key, JSON.stringify(value));
    },

    remove(key: string): void {
      localStorage.removeItem(ns + key);
    },
  };
}

/**
 * Create a namespaced localStorage accessor for a project.
 *
 * Keys are stored as `nw:<projectId>:<key>` to prevent collisions
 * across the growing number of projects in Novelty World.
 */
export function getProjectStorage(projectId: string): NamespacedStorage {
  return createStorage(`${PREFIX}:${projectId}:`);
}

/**
 * App-wide storage for shared concerns (e.g., player profile).
 *
 * Keys are stored as `nw:<key>` — no project namespace.
 */
export const appStorage = createStorage(`${PREFIX}:`);
