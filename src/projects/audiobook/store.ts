"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { PlaybackRate } from "./logic";
import type { BookProgress, Place } from "./types";

interface ListeningState {
  books: Partial<Record<string, BookProgress>>;
  rate: PlaybackRate;
  setPlace: (slug: string, place: Place) => void;
  addBookmark: (slug: string, place: Place) => void;
  removeBookmark: (slug: string, id: string) => void;
  setRate: (rate: PlaybackRate) => void;
}

const EMPTY: BookProgress = { chapter: 0, position: 0, bookmarks: [], updatedAt: 0 };

/** This browser's place and bookmarks in every book, and its playback speed. */
export const useListening = create<ListeningState>()(
  persist(
    (set) => {
      const update = (slug: string, change: (progress: BookProgress) => Partial<BookProgress>) => {
        set((state) => {
          const progress = state.books[slug] ?? EMPTY;
          return { books: { ...state.books, [slug]: { ...progress, ...change(progress), updatedAt: Date.now() } } };
        });
      };
      return {
        books: {},
        rate: 1,
        setPlace: (slug, { chapter, position }) => {
          update(slug, () => ({ chapter, position }));
        },
        addBookmark: (slug, { chapter, position }) => {
          update(slug, (p) => ({
            bookmarks: [...p.bookmarks, { id: crypto.randomUUID(), chapter, position, createdAt: Date.now() }],
          }));
        },
        removeBookmark: (slug, id) => {
          update(slug, (p) => ({ bookmarks: p.bookmarks.filter((b) => b.id !== id) }));
        },
        setRate: (rate) => {
          set({ rate });
        },
      };
    },
    { name: "nw:audiobook:listening", storage: createJSONStorage(() => localStorage) },
  ),
);
