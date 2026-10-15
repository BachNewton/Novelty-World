"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Minus, Music, Plus } from "lucide-react";
import { useHydrated } from "@/shared/lib/use-hydrated";
import { cn } from "@/shared/lib/utils";
import { useSoundSettings } from "./settings";
import { MusicSlider } from "./volume-slider";

// The music's volume in the game: a button beside the mute button that opens
// the music slider beneath it. A press anywhere else, or Escape, closes it.
// The saved setting is only known in the browser, so the button appears once
// the page has hydrated.
export function MusicButton() {
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent): void => {
      if (!(e.target instanceof Node && root.current?.contains(e.target))) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!hydrated) return null;
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={(e) => {
          setOpen((was) => !was);
          // Space is the hop key, and it also presses a focused button.
          e.currentTarget.blur();
        }}
        aria-label="Music volume"
        aria-expanded={open}
        title="Music volume"
        className={cn(
          "rounded-lg bg-surface-secondary/80 p-2 text-text-secondary transition-colors hover:text-text-primary",
          open && "text-text-primary",
        )}
      >
        <Music className="h-4 w-4" aria-hidden />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 touch-manipulation rounded-lg bg-surface-secondary/90 px-3 py-2">
          <MusicSlider />
        </div>
      )}
    </div>
  );
}

const STEP = 0.1;
const PIPS = 10;
const STEPPER =
  "pointer-events-auto touch-manipulation rounded-full border-2 border-border-hover bg-surface-secondary/90 p-2 text-text-primary";

// The music's volume for a controller, which moves round buttons, not
// sliders: quieter and louder, a tenth at a time, either side of its level.
// A pointer's click lets go of the focus, as the mute button does, since Space
// is the hop key; a controller's press keeps it, to press again.
export function MusicSteppers() {
  const music = useSoundSettings((s) => s.settings.music);
  const setMusic = useSoundSettings((s) => s.setMusic);
  const step = (by: number) => (e: MouseEvent<HTMLButtonElement>) => {
    setMusic(Math.round((music + by) * PIPS) / PIPS);
    if (e.detail > 0) e.currentTarget.blur();
  };
  const lit = Math.round(music * PIPS);
  return (
    <div className="flex items-center justify-center gap-2 text-text-secondary">
      <Music className="h-4 w-4 shrink-0" aria-hidden />
      <button type="button" onClick={step(-STEP)} aria-label="Music quieter" className={STEPPER}>
        <Minus className="h-4 w-4" aria-hidden />
      </button>
      <div role="img" aria-label={`Music volume ${String(lit * 10)}%`} className="flex h-4 items-end gap-0.5">
        {Array.from({ length: PIPS }, (_, i) => (
          <span
            key={i}
            style={{ height: `${String(30 + i * 7)}%` }}
            className={cn("w-1 rounded-sm", i < lit ? "bg-brand-green" : "bg-border-hover")}
          />
        ))}
      </div>
      <button type="button" onClick={step(STEP)} aria-label="Music louder" className={STEPPER}>
        <Plus className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
