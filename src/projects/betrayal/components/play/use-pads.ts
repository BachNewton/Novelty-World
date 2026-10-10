"use client";

import { useCallback, useEffect, useState } from "react";
import { rumble, subscribeGamepads } from "@/shared/lib/gamepad";
import { keepConnected, NO_PADS, type FreedPad, type PadAssignment } from "../../play/pads";

/*
 * This device's pad assignment (`play/pads.ts`) as page state: which pads
 * are connected, which seats each plays, and which pads went away with seats
 * since it was last changed by hand. It lives above setup and the game, so
 * what is claimed at setup carries into the game. It is never saved with
 * the game: a pad must press a button before the browser shows it again,
 * and claims its seats again then.
 */

export interface PadSeats {
  assignment: PadAssignment;
  /** The connected pads' slots. */
  connected: readonly number[];
  /** Pads that disconnected with seats, opening them, since the assignment was last set. */
  freed: readonly FreedPad[];
  set: (assignment: PadAssignment) => void;
}

export function usePads(): PadSeats {
  const [state, setState] = useState<Omit<PadSeats, "set">>({ assignment: NO_PADS, connected: [], freed: [] });

  useEffect(
    () =>
      subscribeGamepads({
        onConnectionChange: (pads) => {
          const connected = pads.map((pad) => pad.index);
          setState((was) => {
            const { assignment, freed } = keepConnected(was.assignment, connected);
            return { assignment, connected, freed: freed.length > 0 ? [...was.freed, ...freed] : was.freed };
          });
        },
      }),
    [],
  );

  const set = useCallback((assignment: PadAssignment) => {
    setState((was) => ({ ...was, assignment, freed: [] }));
  }, []);

  return { ...state, set };
}

/** A short buzz on the pad that just claimed a seat, so the player knows which pad is theirs. */
export function buzz(pad: number): void {
  void rumble(pad, { duration: 120, strong: 0.3, weak: 0.6 });
}
