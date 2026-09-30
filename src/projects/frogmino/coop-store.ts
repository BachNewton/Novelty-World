"use client";

import { create } from "zustand";
import { WAITING, type HostSeat } from "./coop";

// The co-op waiting room's state. A store rather than component state
// because the room's handlers must see each other's changes at once: two
// guests arriving back to back both read the seat before React re-renders.
interface CoopStore {
  /** The host's seat; a guest keeps only the phase the host sends it. */
  seat: HostSeat;
  /** Why the player is back in the lobby, or what just changed in the room. */
  notice: string | null;
  setSeat(seat: HostSeat): void;
  setNotice(notice: string | null): void;
  reset(notice?: string | null): void;
}

const EMPTY_SEAT: HostSeat = { phase: WAITING, partnerPeerId: null };

export const useCoopStore = create<CoopStore>()((set) => ({
  seat: EMPTY_SEAT,
  notice: null,
  setSeat: (seat) => set({ seat }),
  setNotice: (notice) => set({ notice }),
  reset: (notice = null) => set({ seat: EMPTY_SEAT, notice }),
}));
