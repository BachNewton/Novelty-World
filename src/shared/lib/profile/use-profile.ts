"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

const NW_PREFIX = "nw:";
const STORAGE_NAME = "profile";

export interface PlayerProfile {
  id: string;
  name: string;
}

interface ProfileStore extends PlayerProfile {
  setName: (name: string) => void;
}

/**
 * Zustand storage that writes to localStorage under the `nw:` app-wide
 * namespace, matching the convention in shared/lib/storage.
 */
const appPersistStorage = createJSONStorage<ProfileStore>(() => ({
  getItem: (key: string) => localStorage.getItem(NW_PREFIX + key),
  setItem: (key: string, value: string) =>
    localStorage.setItem(NW_PREFIX + key, value),
  removeItem: (key: string) => localStorage.removeItem(NW_PREFIX + key),
}));

export const useProfile = create<ProfileStore>()(
  persist(
    (set) => ({
      id: crypto.randomUUID(),
      name: "Player",
      setName: (name: string) => set({ name }),
    }),
    {
      name: STORAGE_NAME,
      storage: appPersistStorage,
    },
  ),
);

// zustand's persist writes only when the state changes, so a profile nobody
// has edited would get a new id on every page load and could never be
// recognised on a rejoin. Write the first one down.
if (typeof window !== "undefined" && localStorage.getItem(NW_PREFIX + STORAGE_NAME) === null) {
  useProfile.setState({});
}
