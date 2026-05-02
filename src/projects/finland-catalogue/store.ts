"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

const NW_PREFIX = "nw:";

interface FavoritesStore {
  /** Slugs of ideas the user has favorited. Stored as an array (rather than
   *  a Set) so it persists cleanly through JSON serialization. */
  slugs: string[];
  toggle: (slug: string) => void;
  isFavorite: (slug: string) => boolean;
}

const favoritesStorage = createJSONStorage<FavoritesStore>(() => ({
  getItem: (key: string) => localStorage.getItem(NW_PREFIX + key),
  setItem: (key: string, value: string) =>
    localStorage.setItem(NW_PREFIX + key, value),
  removeItem: (key: string) => localStorage.removeItem(NW_PREFIX + key),
}));

export const useFavorites = create<FavoritesStore>()(
  persist(
    (set, get) => ({
      slugs: [],
      toggle: (slug: string) =>
        set((state) =>
          state.slugs.includes(slug)
            ? { slugs: state.slugs.filter((s) => s !== slug) }
            : { slugs: [...state.slugs, slug] },
        ),
      isFavorite: (slug: string) => get().slugs.includes(slug),
    }),
    {
      name: "finland-catalogue-favorites",
      storage: favoritesStorage,
    },
  ),
);
