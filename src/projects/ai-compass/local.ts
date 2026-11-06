"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Point } from "./compass";
import type { Background } from "./background";
import type { Answers, Stakes } from "./quiz";

/** A result the person kept to themselves: it lives only in this browser's
 *  storage, and is sent nowhere unless they later choose to share it. */
export interface LocalResult extends Point {
  id: string;
  byStakes: Record<Stakes, Point>;
  background: Background;
  /** Kept so the result can still be shared later: the server scores the
   *  answers, never a point it is handed. */
  answers: Answers;
}

interface LocalResultStore {
  result: LocalResult | null;
  set: (result: LocalResult) => void;
  clear: () => void;
}

/** Kept under the `nw:<project>:` namespace every project's storage uses.
 *  The server has no copy, so it is read only once the page has hydrated.
 *  Like a shared point, there is one per person: a new result replaces it. */
export const useLocalResult = create<LocalResultStore>()(
  persist(
    (set) => ({
      result: null,
      set: (result) => set({ result }),
      clear: () => set({ result: null }),
    }),
    { name: "nw:ai-compass:local-result", storage: createJSONStorage(() => localStorage) },
  ),
);
