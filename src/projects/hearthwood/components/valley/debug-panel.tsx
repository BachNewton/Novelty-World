"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { isTextEntryTarget } from "@/shared/lib/utils";
import { holdHour, setHour, type ValleyClock } from "./clock";

// The developer's panel, opened and closed with ~ (the physical key left of
// 1, whatever the layout): the hour of the day on a slider, and whether the
// day holds there or turns on.

const PANEL_COLOURS = {
  background: "var(--color-hearthwood-valley-ui-shade)",
  color: "var(--color-hearthwood-valley-ui-ink)",
  accentColor: "var(--color-hearthwood-valley-witch-scarf)",
} as CSSProperties;

function clockFace(hours: number): string {
  const minutes = Math.floor(hours * 60) % (24 * 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function DebugPanel({ clock }: { clock: ValleyClock }) {
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState(clock.hours);
  const [held, setHeld] = useState(clock.heldHour !== null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.code !== "Backquote" || e.repeat) return;
      if (e.metaKey || e.ctrlKey || e.altKey || isTextEntryTarget(e.target)) return;
      e.preventDefault();
      setOpen((was) => !was);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // While open, the slider follows the turning day, read once a frame.
  useEffect(() => {
    if (!open) return;
    let raf = requestAnimationFrame(function follow() {
      setHours(clock.hours);
      raf = requestAnimationFrame(follow);
    });
    return () => cancelAnimationFrame(raf);
  }, [open, clock]);

  if (!open) return null;

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
    <div
      data-testid="hearthwood-debug-panel"
      className="absolute top-2 left-2 z-40 flex w-64 flex-col gap-2 rounded-md p-3 font-mono text-sm shadow-lg"
      style={PANEL_COLOURS}
    >
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
    </div>
  );
}
