"use client";

import type { ReactNode } from "react";

/**
 * The on-screen button that raises every wall while it is held, for touch
 * (and a mouse): the same as holding V, or the left stick's click on a pad.
 * It keeps the pointer it was pressed with, so a finger sliding off it still
 * lets the walls down when it lifts.
 */
export function RaiseWallsButton({ raised, raise, className, children }: { raised: boolean; raise: (raised: boolean) => void; className: string; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label="Raise the walls"
      aria-pressed={raised}
      title="Hold to raise the walls (V, or L3 on a controller)"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        raise(true);
      }}
      onPointerUp={() => {
        raise(false);
      }}
      onPointerCancel={() => {
        raise(false);
      }}
      // A long press would otherwise open the page's menu over the house.
      onContextMenu={(event) => {
        event.preventDefault();
      }}
      className={`touch-none select-none ${className}`}
    >
      {children}
    </button>
  );
}
