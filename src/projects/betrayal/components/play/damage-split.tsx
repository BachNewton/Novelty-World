"use client";

import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { traitName } from "../../engine/describe";
import type { InputKind } from "@/shared/lib/input";
import { nearestStop, stepStop, type SplitStop } from "../../play/damage";
import type { Trait } from "../../types";
import { Prompt } from "../prompts";
import { TraitIcon } from "../icons";
import { PAD_STEP, padFocus } from "./pad-focus";

/*
 * Damage the player splits, on one control between its two tracks: the
 * points in a row, the first trait's share left of a divider and the
 * second's right of it. The divider moves a legal split at a time: the
 * d-pad's left and right, the arrow keys or Tab, dragging it, or the arrows
 * at its ends. It is the same size for 2 points or 18. Pressing it with A,
 * Enter or Space takes the split; a pointer takes it with the button under it.
 */

const STEP_KEYS: Partial<Record<string, 1 | -1>> = { ArrowLeft: -1, ArrowRight: 1 };
const ARROW = "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded border border-(--bt-line) bg-(--bt-room) hover:border-(--bt-accent) disabled:opacity-40 disabled:hover:border-(--bt-line)";

export interface SplitControlProps {
  /** The two traits the damage lands on, first on the left. */
  traits: readonly [Trait, Trait];
  points: number;
  stops: readonly SplitStop[];
  /** The stop the divider is on. */
  at: number;
  move: (at: number) => void;
  take: () => void;
  /** The split's own words, as the engine words its choice. */
  label: string;
  input: InputKind;
}

export function SplitControl({ traits, points, stops, at, move, take, label, input }: SplitControlProps) {
  const control = useRef<HTMLButtonElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const stop = stops[at];
  const [first, second] = traits;

  // The live step and stops, for the pad's step event, which is listened for once.
  const latest = useRef({ at, stops, move });
  useEffect(() => {
    latest.current = { at, stops, move };
  });
  useEffect(() => {
    const element = control.current;
    if (!element) return;
    padFocus(element);
    const onStep = (event: Event) => {
      const { at: now, stops: all, move: to } = latest.current;
      to(stepStop(all, now, (event as CustomEvent<1 | -1>).detail));
    };
    element.addEventListener(PAD_STEP, onStep);
    return () => {
      element.removeEventListener(PAD_STEP, onStep);
    };
  }, []);

  const step = (by: 1 | -1) => {
    move(stepStop(stops, at, by));
  };
  const onKeyDown = (event: KeyboardEvent) => {
    const by = event.code === "Tab" ? (event.shiftKey ? -1 : 1) : STEP_KEYS[event.code];
    if (by === undefined) return;
    // The house's own keys (the arrows pan it, Tab steps through its choices) wait while the split has them.
    event.preventDefault();
    event.stopPropagation();
    step(by);
  };
  const point = (event: PointerEvent) => {
    const box = bar.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    move(nearestStop(stops, ((event.clientX - box.left) / box.width) * points));
  };

  return (
    <div className="flex items-center gap-1.5">
      <button type="button" aria-label={`One more on ${traitName(second)}`} disabled={at === 0} onClick={() => { step(-1); }} className={ARROW}>
        <ChevronLeft aria-hidden className="size-5" />
      </button>
      <button
        ref={control}
        type="button"
        role="slider"
        aria-label="Split the damage"
        aria-valuemin={0}
        aria-valuemax={points}
        aria-valuenow={stop.first}
        aria-valuetext={label}
        data-pad-start
        data-pad-steps
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          point(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) point(event);
        }}
        onClick={(event) => {
          // A click a pointer made only moved the divider; A, Enter and Space (detail 0) take the split.
          if (event.detail === 0) take();
        }}
        className="flex min-h-11 min-w-0 flex-1 touch-none items-center gap-1.5 rounded border border-(--bt-line) bg-(--bt-room) px-2 text-sm focus-visible:border-(--bt-accent)"
      >
        <Prompt meaning="choices" input={input} />
        <Share trait={first} points={stop.first} />
        <div ref={bar} className="relative flex h-6 min-w-0 flex-1 items-stretch">
          {Array.from({ length: points }, (_, index) => (
            <span key={index} aria-hidden className="flex min-w-0 flex-1 px-px py-1">
              <span className={`flex-1 rounded-sm ${index < stop.first ? "bg-(--bt-danger)" : "bg-(--bt-danger) opacity-50"}`} />
            </span>
          ))}
          {stops.map((legal) => (
            <span key={legal.choice} aria-hidden className="absolute -bottom-1 h-1 w-1 -translate-x-1/2 rounded-full bg-(--bt-muted)" style={{ left: `${(legal.first / points) * 100}%` }} />
          ))}
          <span aria-hidden data-divider className="absolute -inset-y-0.5 w-1.5 -translate-x-1/2 rounded-full border border-(--bt-bg) bg-(--bt-ink)" style={{ left: `${(stop.first / points) * 100}%` }} />
        </div>
        <Share trait={second} points={stop.second} />
      </button>
      <button type="button" aria-label={`One more on ${traitName(first)}`} disabled={at === stops.length - 1} onClick={() => { step(1); }} className={ARROW}>
        <ChevronRight aria-hidden className="size-5" />
      </button>
    </div>
  );
}

/** A trait's share of the damage: its icon and the points it would lose. */
function Share({ trait, points }: { trait: Trait; points: number }) {
  return (
    <span aria-label={`${points} on ${traitName(trait)}`} className="inline-flex shrink-0 items-center gap-0.5 font-semibold tabular-nums">
      <TraitIcon trait={trait} className="size-4" />−{points}
    </span>
  );
}
