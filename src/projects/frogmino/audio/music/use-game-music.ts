"use client";

import { useEffect } from "react";
import { crossedFinish, inPlay } from "../../run";
import type { Session } from "../../session";
import { playMusic, prepareTheme, stopMusic } from "./music-board";
import type { Theme } from "./song";

// How long the theme takes to fade out once the team crosses the finish
// line, under the finish fanfare.
const FINISH_FADE_SECONDS = 1.5;

// Renders a theme ahead, in a menu, so it is ready when the game plays it.
export function usePreparedMusic(theme: Theme): void {
  useEffect(() => {
    void prepareTheme(theme);
  }, [theme]);
}

// Plays a course's theme while the team is in play: from the jump out of the
// helicopter, looping, until the finish line, where it fades out under the
// finish fanfare. A restart stops it, and the next jump starts it again from
// the top. Lining up aboard and the done screen are quiet.
export function useGameMusic(session: Session, theme: Theme): void {
  useEffect(() => {
    void prepareTheme(theme);
    // Moves on whenever the music stops, so a render finishing later doesn't
    // start a theme that is no longer wanted.
    let wanted = 0;
    let playing = false;
    const start = (): void => {
      playing = true;
      const mine = ++wanted;
      void prepareTheme(theme).then((buffer) => {
        if (mine === wanted) playMusic(buffer, true, () => undefined);
      });
    };
    const stop = (fadeSeconds: number): void => {
      playing = false;
      wanted++;
      stopMusic(fadeSeconds);
    };
    if (inPlay(session.store.getState().run)) start();
    const unsubscribe = session.store.subscribe((after, before) => {
      const now = inPlay(after.run);
      if (now && !playing) start();
      else if (!now && playing) stop(after.runId === before.runId && crossedFinish(after.run) ? FINISH_FADE_SECONDS : 0);
    });
    return () => {
      unsubscribe();
      wanted++;
      stopMusic();
    };
  }, [session, theme]);
}
