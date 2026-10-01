"use client";

import { useCallback, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUp, MoveHorizontal, RotateCcw, RotateCw } from "lucide-react";
import { isDone } from "../run";
import { useFrogminoStore } from "../store";
import { useFrogTouch } from "./use-frog-touch";

// The hint gets out of the way once the player has made this many gestures.
const HINT_GESTURES = 3;

function Zone({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-1 text-center">
      {icon}
      {children}
    </div>
  );
}

function Gesture({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1 whitespace-nowrap">
      {icon}
      {label}
    </span>
  );
}

const ICON = "h-5 w-5 text-brand-green";
const SMALL_ICON = "h-4 w-4 text-brand-green";

// The three tap zones and the swipes, drawn over the play area until the
// player has got going. Touch screens only; the keyboard legend serves the rest.
function TouchHint() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-16 bottom-4 hidden grid-rows-[1fr_auto] gap-3 px-2 text-xs text-text-primary pointer-coarse:grid"
    >
      <div className="grid grid-cols-3 divide-x-2 divide-dashed divide-text-primary/30 rounded-xl bg-surface-secondary/30">
        <Zone icon={<RotateCcw className={ICON} />}>
          <b>Tap</b>
          <span className="text-text-secondary">rotate</span>
        </Zone>
        <Zone icon={<ChevronsUp className={ICON} />}>
          <b>Tap</b>
          <span className="text-text-secondary">jump</span>
          <b className="mt-2">Hold</b>
          <span className="text-text-secondary">keep jumping</span>
        </Zone>
        <Zone icon={<RotateCw className={ICON} />}>
          <b>Tap</b>
          <span className="text-text-secondary">rotate</span>
        </Zone>
      </div>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 rounded-xl bg-surface-secondary/80 px-3 py-2">
        <Gesture icon={<MoveHorizontal className={SMALL_ICON} />} label="drag: move" />
        <Gesture icon={<ArrowUp className={SMALL_ICON} />} label="swipe: hop" />
        <Gesture icon={<ArrowDown className={SMALL_ICON} />} label="swipe: back" />
      </div>
    </div>
  );
}

// The touch layer over the play area: it takes every finger that lands on
// the game, stops the browser scrolling, zooming or selecting, and shows the
// hint. It sits under the other overlays, so the mute button and the done
// screen keep their own taps.
export function TouchControls() {
  const [gestures, setGestures] = useState(0);
  const countGesture = useCallback(() => {
    setGestures((n) => n + 1);
  }, []);
  const handlers = useFrogTouch(countGesture);
  const done = useFrogminoStore((s) => isDone(s.run));
  const depth = useFrogminoStore((s) => s.run.frog.depth);
  const hoppedAt = useFrogminoStore((s) => s.run.frog.latestHop?.startedAt ?? null);

  return (
    <>
      <div
        {...handlers}
        onContextMenu={(e) => {
          e.preventDefault();
        }}
        data-testid="frogmino-touch"
        data-frog-depth={depth}
        data-hopped-at={hoppedAt ?? ""}
        className="absolute inset-0 touch-none select-none [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none]"
      />
      {!done && gestures < HINT_GESTURES && <TouchHint />}
    </>
  );
}
