"use client";

import { useEffect, useRef } from "react";
import { SPACES } from "../data";
import type { GameState } from "../types";
import { SquareRow } from "./square-row";

// Each row is 44px (h-11). The 1px divider is painted as an inset bottom
// shadow on the row itself, so it doesn't add to the row's box.
const CYCLE_PX = SPACES.length * 44;

interface Props {
  state: GameState;
}

export function Squares({ state }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Land in the middle copy on mount so the user can scroll either direction
  // without immediately hitting an edge.
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = CYCLE_PX;
  }, []);

  // When the user crosses into the prev/next copy, silently snap back into
  // the middle copy. The jump is invisible because all three copies render
  // identical content at identical offsets (mod CYCLE_PX).
  const handleScroll = () => {
    const el = ref.current;
    if (!el) return;
    if (el.scrollTop < CYCLE_PX * 0.5) {
      el.scrollTop += CYCLE_PX;
    } else if (el.scrollTop >= CYCLE_PX * 1.5) {
      el.scrollTop -= CYCLE_PX;
    }
  };

  return (
    <div
      ref={ref}
      onScroll={handleScroll}
      className="flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {[0, 1, 2].flatMap((copy) =>
        SPACES.map((_, position) => (
          <SquareRow
            key={`${copy}-${position}`}
            state={state}
            position={position}
          />
        )),
      )}
    </div>
  );
}
