"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Theme } from "../audio/music/song";
import { useStore } from "zustand";
import { PadHints } from "@/shared/components/pad-hints";
import { subscribeGamepads, usePadNavigation } from "@/shared/lib/gamepad";
import { FROG_LOOKS } from "../frog/look";
import { seatedSink, type Seating } from "../input/devices";
import { COOP_LEGEND, SOLO_LEGEND, type KeyboardLayout } from "../input/keyboard";
import { MENU_BUTTON } from "../input/gamepad";
import { useGamepadSource } from "../input/use-gamepad-source";
import { useKeyboardSource } from "../input/use-keyboard-source";
import { isDone } from "../run";
import type { Session } from "../session";
import { GameView } from "./game-view";
import { SessionResult } from "./run-clock";
import { TouchControls } from "./touch-controls";

// A game being played, whichever way: a session's run on screen, driven by
// this device's input sources through a seating, with the touch controls,
// the key legend and the done screen. What else the way of playing shows
// goes in as children.

const LEGEND_BOX =
  "pointer-events-none absolute bottom-4 left-4 pointer-coarse:hidden rounded-lg bg-surface-secondary/80 px-3 py-2 text-xs";
const PAD_LEGEND = "Controller: stick or D-pad to move and jump, A hop, X B or LB RB rotate, Menu restart, View menu";

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

// How a player leaves the game: back to the lobby, or out of an online room.
export interface GameExit {
  label: string;
  onExit: () => void;
}

const OVERLAY_BUTTON = "pointer-events-auto touch-manipulation rounded-full px-6 py-2.5 font-bold";
const MAIN_BUTTON = `${OVERLAY_BUTTON} bg-brand-green text-surface-primary`;
const OTHER_BUTTON = `${OVERLAY_BUTTON} border-2 border-border-hover bg-surface-secondary/90 text-text-primary`;

// The run's result, and how to go again or leave. A controller moves between
// the two, and Menu restarts as in play; the focus waits for the first press,
// so a hop pressed as the team crossed the line doesn't restart the run.
function DoneOverlay({ session, exit }: { session: Session; exit: GameExit }) {
  const root = useRef<HTMLDivElement>(null);
  usePadNavigation(root);
  return (
    <div ref={root} className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 p-4">
      <SessionResult session={session} />
      <p className="rounded-lg bg-surface-secondary/90 px-4 py-2 text-center font-bold text-text-primary pointer-coarse:hidden">
        Done: press <span className="text-brand-green">R</span> to restart
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={session.restart} data-pad-start data-pad-menu className={MAIN_BUTTON}>
          Restart
        </button>
        <button type="button" onClick={exit.onExit} className={OTHER_BUTTON}>
          {exit.label}
        </button>
      </div>
      <PadHints hints={DONE_HINTS} className="rounded-lg bg-surface-secondary/90 px-3 py-1.5" />
    </div>
  );
}

const DONE_HINTS = [
  ["A", "Select"],
  ["Menu", "Restart"],
] as const;
const MENU_HINTS = [
  ["A", "Select"],
  ["B", "Back"],
] as const;

// A controller's menu over the game, opened with View, since the pads are
// busy playing: keep playing, restart, or leave. The game runs on under it,
// online can't pause, and while it is open the pads drive no frog.
function GameMenu({ session, exit, onClose }: { session: Session; exit: GameExit; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  usePadNavigation(root, { reveal: true });
  return (
    <div ref={root} role="dialog" aria-label="Game menu" className="absolute inset-0 z-20 flex items-center justify-center bg-surface-primary/60 p-4">
      <div className="flex w-full max-w-64 flex-col gap-3 rounded-2xl border-2 border-brand-green bg-surface-secondary p-5">
        <h2 className="text-center text-lg font-bold text-brand-green">Menu</h2>
        <button type="button" onClick={onClose} data-pad-start data-pad-back className={MAIN_BUTTON}>
          Keep playing
        </button>
        <button
          type="button"
          onClick={() => {
            onClose();
            session.restart();
          }}
          className={OTHER_BUTTON}
        >
          Restart
        </button>
        <button type="button" onClick={exit.onExit} className={OTHER_BUTTON}>
          {exit.label}
        </button>
        <PadHints hints={MENU_HINTS} />
      </div>
    </div>
  );
}

export function GameScreen({
  session,
  music,
  seating,
  keyboard,
  touch,
  exit,
  children,
}: {
  session: Session;
  music: Theme;
  seating: Seating;
  keyboard: KeyboardLayout;
  touch: boolean;
  exit: GameExit;
  children?: ReactNode;
}) {
  const done = useStore(session.store, (s) => isDone(s.run));
  const runId = useStore(session.store, (s) => s.runId);
  // The run the controller's menu was opened over: a restart, from anywhere, closes it.
  const [menuRun, setMenuRun] = useState<number | null>(null);
  const menuOpen = menuRun === runId && !done;
  const sink = useMemo(() => seatedSink(seating, session), [seating, session]);
  useKeyboardSource(keyboard, sink);
  useGamepadSource(sink, !done && !menuOpen);

  const latest = useRef({ runId, done });
  useEffect(() => {
    latest.current = { runId, done };
  }, [runId, done]);
  useEffect(
    () =>
      subscribeGamepads({
        onButton: ({ name, pressed }) => {
          if (!pressed || name !== MENU_BUTTON || latest.current.done) return;
          const { runId: run } = latest.current;
          setMenuRun((open) => (open === run ? null : run));
        },
      }),
    [],
  );

  return (
    <GameView session={session} music={music}>
      {touch && <TouchControls sink={sink} done={done} />}
      {keyboard === "solo" ? <SoloLegend /> : <CoopLegend />}
      {done && <DoneOverlay session={session} exit={exit} />}
      {menuOpen && (
        <GameMenu
          session={session}
          exit={exit}
          onClose={() => {
            setMenuRun(null);
          }}
        />
      )}
      {children}
    </GameView>
  );
}
