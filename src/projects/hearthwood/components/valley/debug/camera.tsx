"use client";

import type { DebugContext, DebugSection } from "./section";

/** The debug free camera turned on and off, as \ does, with its controls. */
function FreeCamera({ context: { flight } }: { context: DebugContext }) {
  if (!flight) return <span className="text-xs opacity-70">Nothing to fly here</span>;
  return (
    <>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={flight.flying}
          onChange={(e) => {
            flight.setFlying(e.target.checked);
          }}
        />
        <span>Free camera (\)</span>
      </label>
      <p className="text-xs opacity-80">WASD and the mouse fly, E or Space rises, Q or C sinks, Shift is faster, the wheel sets the speed. Pad: sticks, A rises, LT sinks, RT is faster, the bumpers set the speed.</p>
    </>
  );
}

export const CAMERA_SECTION: DebugSection = { id: "camera", title: "Camera", Section: FreeCamera };
