"use client";

import type { CSSProperties } from "react";

/** The debug free camera's badge, top middle: that it flies, and how fast the wheel or the bumpers have set it. */

const BADGE_COLOURS = {
  background: "var(--color-hearthwood-valley-ui-shade)",
  color: "var(--color-hearthwood-valley-ui-ink)",
} as CSSProperties;

function speedText(metresPerSecond: number): string {
  return metresPerSecond >= 1000 ? `${(metresPerSecond / 1000).toFixed(1)} km/s` : `${Math.round(metresPerSecond)} m/s`;
}

export function FlyOverlay({ speed }: { speed: number }) {
  return (
    <div
      data-testid="hearthwood-fly"
      className="pointer-events-none absolute top-2 left-1/2 z-30 -translate-x-1/2 rounded-md px-3 py-1 font-mono text-sm opacity-90"
      style={BADGE_COLOURS}
    >
      Free camera · {speedText(speed)}
    </div>
  );
}
