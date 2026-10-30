"use client";

import { useEffect, useMemo, useRef } from "react";
import { toneVar } from "../analysis";
import { cursor } from "../player";
import { timingOf } from "../tempo";
import type { Score } from "../types";
import { cn } from "@/shared/lib/utils";

// Each track's colour, name and instrument, the parts sounding now lit. Tap one
// to pick it out: the roll dims the rest. Lit on animation frames, straight to
// the elements.

export function trackLabel(name: string): string {
  return name.replaceAll("_", " ");
}

function soundingTests(score: Score): ((beats: number) => boolean)[] {
  return score.tracks.map((track) => {
    const notes = [...track.notes].sort((a, b) => a.start - b.start);
    let furthest = -Infinity;
    const reach = notes.map((note) => (furthest = Math.max(furthest, note.start + note.duration)));
    return (beats) => {
      let [low, high] = [0, notes.length];
      while (low < high) {
        const middle = (low + high) >> 1;
        if (reach[middle] > beats) high = middle;
        else low = middle + 1;
      }
      return low < notes.length && notes[low].start <= beats;
    };
  });
}

interface LegendProps {
  score: Score;
  instruments: Record<string, string>;
  focus: string | null;
  onFocus: (track: string | null) => void;
}

export function TrackLegend({ score, instruments, focus, onFocus }: LegendProps) {
  const holder = useRef<HTMLDivElement>(null);
  const tests = useMemo(() => soundingTests(score), [score]);

  useEffect(() => {
    const element = holder.current;
    if (element === null) return;
    const shown = tests.map(() => false);
    let request = requestAnimationFrame(function follow() {
      const beats = timingOf(score).beats(cursor());
      tests.forEach((test, index) => {
        const on = test(beats);
        if (on !== shown[index]) {
          shown[index] = on;
          element.children[index].toggleAttribute("data-sounding", on);
        }
      });
      request = requestAnimationFrame(follow);
    });
    return () => cancelAnimationFrame(request);
  }, [score, tests]);

  return (
    <div ref={holder} aria-label="Tracks and instruments" className="flex shrink-0 gap-1 overflow-x-auto bg-surface-primary px-1 py-0.5 [scrollbar-width:none] max-md:hidden">
      {score.tracks.map((track, index) => {
        const instrument = instruments[track.name];
        return (
          <button
            key={track.name}
            type="button"
            aria-pressed={focus === track.name}
            title={`${trackLabel(track.name)}: ${instrument}`}
            onClick={() => onFocus(focus === track.name ? null : track.name)}
            className={cn(
              "group flex shrink-0 items-center gap-1 rounded-sm border px-1 text-left transition-colors",
              focus === track.name ? "border-text-primary bg-surface-elevated" : "border-transparent",
              focus !== null && focus !== track.name && "opacity-50",
            )}
          >
            <span className="size-2.5 shrink-0 rounded-[2px] opacity-40 group-data-[sounding]:opacity-100" style={{ background: `var(${toneVar(index + 1)})` }} />
            <span className="flex flex-col whitespace-nowrap">
              <span className="text-[11px] leading-3 text-text-muted group-data-[sounding]:text-text-primary">{trackLabel(track.name)}</span>
              {instrument !== trackLabel(track.name) && <span className="text-[9px] leading-[10px] text-text-muted">{instrument}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
