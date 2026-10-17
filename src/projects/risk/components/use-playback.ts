"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getProjectStorage } from "@/shared/lib/storage";
import type { GameView, Seat } from "../contract";
import type { LoggedEvent } from "../online/game";
import { caughtUp, DEFAULT_SPEED, receive, SPEEDS, startPlayback, tick, type Pace, type Playback } from "../ui/playback";

/*
 * The game as the screen presents it (`ui/playback.ts`): another seat's moves a beat at a time,
 * at the viewer's speed. Each beat's timer is the pacing itself, the feature, never a wait for
 * something else to finish. A page nobody is looking at catches up at once and plays what it
 * hears instantly, so a player coming back to the tab finds the game as it is.
 */

const storage = getProjectStorage("risk");
const SPEED_KEY = "playback-speed";

function storedSpeed(): number {
  const stored = storage.get<number>(SPEED_KEY);
  return typeof stored === "number" && Number.isInteger(stored) && stored >= 0 && stored < SPEEDS.length ? stored : DEFAULT_SPEED;
}

/** The viewer's playback speed, an index into `SPEEDS`, kept in this browser. */
export function useSpeed(): [number, (speed: number) => void] {
  const [speed, setSpeed] = useState(storedSpeed);
  const choose = (next: number) => {
    setSpeed(next);
    try {
      storage.set(SPEED_KEY, next);
    } catch {
      // Storage may be full or blocked (a private window): the choice holds for this page.
    }
  };
  return [speed, choose];
}

function subscribeVisibility(changed: () => void) {
  document.addEventListener("visibilitychange", changed);
  return () => document.removeEventListener("visibilitychange", changed);
}
const isVisible = () => document.visibilityState === "visible";

export interface Presented {
  playback: Playback;
  /** Whether the screen shows the game as it is now. */
  caughtUp: boolean;
}

export function usePlayback(view: GameView, events: readonly LoggedEvent[], viewer: Seat | null, speed: number): Presented {
  const watching = useSyncExternalStore(subscribeVisibility, isVisible, () => true);
  const pace: Pace = { scale: watching ? SPEEDS[speed].scale : 0, viewer };
  const [playback, setPlayback] = useState(() => startPlayback(view, events));
  const [heard, setHeard] = useState({ view, events, pace: pace.scale });

  // The feed moved on, or the pace changed: what it brought joins the queue. Changing to a pace
  // with no beats plays everything waiting at once.
  if (heard.view !== view || heard.events !== events || heard.pace !== pace.scale) {
    setHeard({ view, events, pace: pace.scale });
    setPlayback((p) => {
      const next = heard.view !== view || heard.events !== events ? receive(p, view, events, pace) : p;
      return pace.scale === 0 && !caughtUp(next) ? tick(next, pace) : next;
    });
  }

  const { holding, beat } = playback;
  const { scale } = pace;
  useEffect(() => {
    if (!holding || !beat) return;
    const timer = setTimeout(() => setPlayback((p) => tick(p, { scale, viewer })), beat.ms);
    return () => clearTimeout(timer);
  }, [holding, beat, scale, viewer]);

  return { playback, caughtUp: caughtUp(playback) };
}
