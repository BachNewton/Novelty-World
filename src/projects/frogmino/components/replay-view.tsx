"use client";

import { useEffect, useState } from "react";
import { useStore } from "zustand";
import { isTextEntryTarget } from "@/shared/lib/utils";
import { courseOf } from "../courses";
import { RESTART_KEY } from "../input/keyboard";
import { findReplay } from "../proof/replays";
import { replaySession } from "../session";
import { toSeconds } from "../ticks";
import { GameView } from "./game-view";

const SPEEDS = [0.25, 0.5, 1] as const;
const PAUSE_KEY = "KeyP";

const BUTTON = "touch-manipulation rounded-full px-3 py-1 text-sm font-bold";
const IDLE = `${BUTTON} bg-surface-primary text-text-primary`;
const CHOSEN = `${BUTTON} bg-brand-green text-surface-primary`;

// `?replay=<name>`: a named replay played in the real game scene, as if its
// players pressed those keys at those ticks. It plays at real speed, slower,
// or paused, and restarts; the game sees only a session.
export function ReplayView({ name }: { name: string }) {
  const [replay] = useState(() => findReplay(name));
  const [session] = useState(() => replaySession(courseOf(replay.course), replay.log, replay.until));
  const [speed, setSpeed] = useState<number>(1);
  const [paused, setPaused] = useState(false);
  // A tenth of a second at a time is enough for the clock on the panel.
  const tenths = useStore(session.store, (s) => Math.floor(s.run.tick / 10));
  const over = useStore(session.store, (s) => s.run.tick >= session.until);

  useEffect(() => {
    session.setSpeed(paused ? 0 : speed);
  }, [session, speed, paused]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || isTextEntryTarget(e.target)) return;
      if (e.code === RESTART_KEY) session.restart();
      else if (e.code === PAUSE_KEY) setPaused((p) => !p);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [session]);

  return (
    <GameView session={session}>
      <div
        data-testid="frogmino-replay"
        data-replay-over={over}
        className="absolute bottom-4 left-4 right-4 flex max-w-md flex-col gap-2 rounded-lg bg-surface-secondary/85 px-3 py-2 text-xs sm:right-auto"
      >
        <p className="text-text-primary">
          <span className="font-bold text-brand-green">Replay: {name}</span>{" "}
          <span className="font-mono text-text-secondary">
            {toSeconds(tenths * 10).toFixed(1)} / {toSeconds(session.until).toFixed(1)} s
          </span>
        </p>
        <p className="text-text-secondary">{replay.description}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={IDLE} onClick={session.restart}>
            Restart (R)
          </button>
          <button
            type="button"
            className={paused ? CHOSEN : IDLE}
            onClick={() => {
              setPaused((p) => !p);
            }}
          >
            {paused ? "Play (P)" : "Pause (P)"}
          </button>
          {SPEEDS.map((option) => (
            <button
              key={option}
              type="button"
              className={option === speed ? CHOSEN : IDLE}
              onClick={() => {
                setSpeed(option);
              }}
            >
              {option === 1 ? "1×" : `${String(option)}×`}
            </button>
          ))}
        </div>
        {over && <p className="font-bold text-brand-green">Replay over: Restart to watch again.</p>}
      </div>
    </GameView>
  );
}
