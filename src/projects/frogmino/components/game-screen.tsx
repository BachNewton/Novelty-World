"use client";

import { useMemo, type ReactNode } from "react";
import { useStore } from "zustand";
import { FROG_LOOKS } from "../frog/look";
import { seatedSink, type Seating } from "../input/devices";
import { COOP_LEGEND, SOLO_LEGEND, type KeyboardLayout } from "../input/keyboard";
import { useGamepadSource } from "../input/use-gamepad-source";
import { useKeyboardSource } from "../input/use-keyboard-source";
import { isDone } from "../run";
import type { Session } from "../session";
import { GameView } from "./game-view";
import { TouchControls } from "./touch-controls";

// A game being played, whichever way: a session's run on screen, driven by
// this device's input sources through a seating, with the touch controls,
// the key legend and the done screen. What else the way of playing shows
// goes in as children.

const LEGEND_BOX =
  "pointer-events-none absolute bottom-4 left-4 pointer-coarse:hidden rounded-lg bg-surface-secondary/80 px-3 py-2 text-xs";
const PAD_LEGEND = "Controller: stick or D-pad to move and jump, A hop, X B or LB RB rotate, Menu restart";

function SoloLegend() {
  return (
    <div className={LEGEND_BOX}>
      <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5">
        {SOLO_LEGEND.map(([keys, action]) => (
          <div key={action} className="contents">
            <dt className="font-mono text-text-primary">{keys}</dt>
            <dd className="text-text-secondary">{action}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-1 max-w-64 text-text-secondary">{PAD_LEGEND}</p>
    </div>
  );
}

// Each action with each player's half of the keyboard.
function CoopLegend() {
  return (
    <div className={`${LEGEND_BOX} grid grid-cols-[auto_auto_auto] gap-x-3 gap-y-0.5`}>
      <span />
      <span className="font-bold text-brand-green">{FROG_LOOKS.p1.name}</span>
      <span className="font-bold text-brand-blue">{FROG_LOOKS.p2.name}</span>
      {COOP_LEGEND.map(([action, p1, p2]) => (
        <div key={action} className="contents">
          <span className="text-text-secondary">{action}</span>
          <span className="font-mono text-text-primary">{p1}</span>
          <span className="font-mono text-text-primary">{p2}</span>
        </div>
      ))}
      <span className="text-text-secondary">restart, mute</span>
      <span className="col-span-2 font-mono text-text-primary">R, M</span>
      <p className="col-span-3 mt-1 max-w-64 text-text-secondary">{PAD_LEGEND}</p>
    </div>
  );
}

// Touch screens have no R key, so they get a Restart button instead.
function DoneOverlay({ onRestart }: { onRestart: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 p-4">
      <p className="rounded-xl border-2 border-brand-green bg-surface-secondary/90 px-6 py-4 text-center text-lg font-bold text-text-primary">
        Done<span className="pointer-coarse:hidden"> — press <span className="text-brand-green">R</span> to restart</span>
      </p>
      <button
        type="button"
        onClick={onRestart}
        className="pointer-events-auto hidden touch-manipulation rounded-full bg-brand-green px-8 py-3 text-lg font-bold text-surface-primary pointer-coarse:block"
      >
        Restart
      </button>
    </div>
  );
}

export function GameScreen({
  session,
  seating,
  keyboard,
  touch,
  children,
}: {
  session: Session;
  seating: Seating;
  keyboard: KeyboardLayout;
  touch: boolean;
  children?: ReactNode;
}) {
  const done = useStore(session.store, (s) => isDone(s.run));
  const sink = useMemo(() => seatedSink(seating, session), [seating, session]);
  useKeyboardSource(keyboard, sink);
  useGamepadSource(sink);

  return (
    <GameView session={session}>
      {touch && <TouchControls sink={sink} done={done} />}
      {keyboard === "solo" ? <SoloLegend /> : <CoopLegend />}
      {done && <DoneOverlay onRestart={session.restart} />}
      {children}
    </GameView>
  );
}
