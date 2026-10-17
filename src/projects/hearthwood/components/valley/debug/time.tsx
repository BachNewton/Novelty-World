"use client";

import { useEffect, useState } from "react";
import { holdHour, setHour } from "../clock";
import type { DebugContext, DebugSection } from "./section";

function clockFace(hours: number): string {
  const minutes = Math.floor(hours * 60) % (24 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** The hour of the day on a slider, and whether the day holds there or turns on. */
function TimeOfDay({ context: { clock } }: { context: DebugContext }) {
  const [hours, setHours] = useState(clock.hours);
  const [held, setHeld] = useState(clock.heldHour !== null);

  // The slider follows the turning day, read once a frame.
  useEffect(() => {
    let raf = requestAnimationFrame(function follow() {
      setHours(clock.hours);
      raf = requestAnimationFrame(follow);
    });
    return () => cancelAnimationFrame(raf);
  }, [clock]);

  const pickHour = (value: number): void => {
    if (clock.heldHour === null) setHour(clock, value);
    else holdHour(clock, value);
    setHours(value);
  };

  const toggleHeld = (hold: boolean): void => {
    holdHour(clock, hold ? clock.hours : null);
    setHeld(hold);
  };

  return (
    <>
      <label className="flex items-center justify-between gap-2">
        <span>Time</span>
        <span>{clockFace(hours)}</span>
      </label>
      <input
        type="range"
        aria-label="Hour of the day"
        min={0}
        max={24}
        step={0.05}
        value={hours}
        onChange={(e) => {
          pickHour(Number(e.target.value));
        }}
      />
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={held}
          onChange={(e) => {
            toggleHeld(e.target.checked);
          }}
        />
        <span>Hold the time</span>
      </label>
    </>
  );
}

export const TIME_SECTION: DebugSection = { id: "time", title: "Time of day", Section: TimeOfDay };
