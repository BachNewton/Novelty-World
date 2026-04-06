"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface PlayerProfile {
  id: string;
  name: string;
}

interface ProfileStore extends PlayerProfile {
  setName: (name: string) => void;
}

export const useProfile = create<ProfileStore>()(
  persist(
    (set) => ({
      id: crypto.randomUUID(),
      name: "Player",
      setName: (name: string) => set({ name }),
    }),
    {
      name: "novelty-world-profile",
    },
  ),
);
