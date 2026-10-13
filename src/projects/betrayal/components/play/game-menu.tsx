"use client";

import { useEffect, useRef } from "react";
import type { GameView } from "../../engine/view";
import type { InputKind } from "../../input/controls";
import { Prompt } from "../prompts";
import { enterLayer } from "./pad-focus";
import type { Speed } from "./presenting";
import { SeatsSection } from "./seats-panel";
import type { PadSeats } from "./use-pads";

/*
 * The game menu, over everything: the seats and their pads, the speed of
 * what plays by itself, and leaving the game. Menu on any pad (even one
 * that may not act now), M on the keyboard, or its button opens and closes
 * it, and any pad may work it: it is the device's setup, not a move.
 */

const SPEED_NAMES: Record<Speed, string> = { slow: "Slow", normal: "Normal", fast: "Fast" };
const SPEED_ORDER: Speed[] = ["slow", "normal", "fast"];

export function GameMenu({ view, pads, speed, setSpeed, onLeave, close, input }: {
  view: GameView;
  pads: PadSeats;
  speed: Speed;
  setSpeed: (speed: Speed) => void;
  onLeave: () => void;
  close: () => void;
  input: InputKind;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (ref.current) enterLayer(ref.current);
  }, []);
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-(--bt-bg)/70 p-3">
      <section ref={ref} role="dialog" aria-label="Game menu" data-pad-layer="3" className="flex max-h-full w-full max-w-md flex-col gap-4 overflow-y-auto rounded border border-(--bt-line) bg-(--bt-panel) p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Menu</h2>
          <button type="button" data-pad-back data-pad-start onClick={close} className="inline-flex min-h-11 items-center gap-1.5 rounded border border-(--bt-line) px-3 hover:border-(--bt-accent)">
            Close
          </button>
        </div>
        <SeatsSection view={view} pads={pads} />
        <section aria-label="Speed" className="flex flex-col gap-2">
          <h3 className="font-semibold">Speed of what plays by itself</h3>
          <div className="flex flex-wrap gap-2">
            {SPEED_ORDER.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={speed === option}
                onClick={() => {
                  setSpeed(option);
                }}
                className="min-h-11 rounded border border-(--bt-line) bg-(--bt-bg) px-3 py-1 text-sm aria-pressed:border-(--bt-accent) aria-pressed:bg-(--bt-room) aria-pressed:font-semibold"
              >
                {SPEED_NAMES[option]}
              </button>
            ))}
          </div>
        </section>
        <button type="button" onClick={onLeave} className="min-h-11 self-start rounded border border-(--bt-line) px-3 hover:border-(--bt-accent)">
          Leave game
        </button>
      </section>
    </div>
  );
}
