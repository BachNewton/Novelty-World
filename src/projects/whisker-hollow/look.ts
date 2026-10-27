"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Look } from "./types";

interface LookStore {
  /** What this player's caretaker looks like, kept in this browser. Null until they first pick. */
  look: Look | null;
  setLook(look: Look): void;
}

export const useLook = create<LookStore>()(
  persist(
    (set) => ({
      look: null,
      setLook: (look) => set({ look }),
    }),
    {
      name: "whisker-hollow:look",
      partialize: ({ look }) => ({ look }),
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
