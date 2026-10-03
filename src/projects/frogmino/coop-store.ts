"use client";

import { create } from "zustand";
import { WAITING, type HostSeat } from "./coop";
import type { GuestSession, HostSession } from "./online";

export type OnlineRound = { role: "host"; session: HostSession } | { role: "guest"; session: GuestSession };

// The co-op waiting room's state, and the round's session once it starts. A store rather than component state
// because the room's handlers must see each other's changes at once: two
// guests arriving back to back both read the seat before React re-renders.
interface CoopStore {
  /** The host's seat; a guest keeps only the phase the host sends it. */
  seat: HostSeat;
  /** Why the player is back in the lobby, or what just changed in the room. */
  notice: string | null;
  /** This device's side of the round being played, if one is. */
  game: OnlineRound | null;
  setSeat(seat: HostSeat): void;
  setGame(game: OnlineRound | null): void;
  setNotice(notice: string | null): void;
  reset(notice?: string | null): void;
}

const EMPTY_SEAT: HostSeat = { phase: WAITING, partnerPeerId: null };

export const useCoopStore = create<CoopStore>()((set) => ({
  seat: EMPTY_SEAT,
  notice: null,
  game: null,
  setSeat: (seat) => set({ seat }),
  setGame: (game) => set({ game }),
  setNotice: (notice) => set({ notice }),
  reset: (notice = null) => set({ seat: EMPTY_SEAT, notice, game: null }),
}));
