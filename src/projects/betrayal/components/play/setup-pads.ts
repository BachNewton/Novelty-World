"use client";

import { useEffect, useRef, useState } from "react";
import { subscribeGamepads } from "@/shared/lib/gamepad";
import { padOf, release, seatListPress } from "../../play/pads";
import { buzz, type PadSeats } from "./use-pads";

/*
 * Claiming seats at setup with the pads: any pad's d-pad moves the
 * highlight up and down the seats, A takes the highlighted seat for the pad
 * pressed (or gives it back), and B opens it again. A seat's row being
 * focused by touch or mouse moves the highlight there too.
 */
export function useSetupPads(pads: PadSeats, count: number): { highlighted: number; highlight: (seat: number) => void } {
  const [focus, setFocus] = useState(0);
  const highlighted = Math.min(focus, count - 1);
  const latest = useRef({ pads, count, highlighted });
  useEffect(() => {
    latest.current = { pads, count, highlighted };
  });

  useEffect(
    () =>
      subscribeGamepads({
        onButton: ({ name, pad, pressed }) => {
          if (!pressed || name === null) return;
          const { pads: now, count: seats, highlighted: at } = latest.current;
          if (name === "B") {
            now.set(release(now.assignment, at));
            return;
          }
          const next = seatListPress(name, pad, { focus: at, count: seats, assignment: now.assignment });
          if (!next) return;
          setFocus(next.focus);
          if (next.assignment === now.assignment) return;
          now.set(next.assignment);
          if (padOf(next.assignment, at) === pad) buzz(pad);
        },
      }),
    [],
  );

  return { highlighted, highlight: setFocus };
}
