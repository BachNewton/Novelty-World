"use client";

import { useEffect, useRef } from "react";
import { listenForAudioUnlock } from "@/shared/lib/sound";
import type { GameView } from "../contract";
import type { LoggedEvent } from "../online/game";
import { heardSince, soundsFor } from "../ui/sound-cues";
import { riskSounds } from "./sound-board";

/** Plays the game's sounds as the screen presents it (`ui/sound-cues.ts`): loads them as the game
 *  opens, unlocks audio on the player's input, sounds each event once as it is shown, and a move
 *  the server refused. */
export function useRiskSounds(shown: readonly LoggedEvent[], view: GameView, problem: string | null): void {
  useEffect(() => {
    void riskSounds.load();
    return listenForAudioUnlock();
  }, []);

  // What the page loaded with was never presented, so it is never heard.
  const heard = useRef({ last: shown.at(-1)?.id ?? null, view });
  useEffect(() => {
    const fresh = heardSince(shown, heard.current.last);
    const before = heard.current.view;
    heard.current = { last: shown.at(-1)?.id ?? heard.current.last, view };
    const sounds = soundsFor(
      fresh.map((logged) => logged.event),
      view.viewer,
      before,
      view,
      document.visibilityState === "hidden",
    );
    for (const sound of sounds) riskSounds.play(sound);
  }, [shown, view]);

  useEffect(() => {
    if (problem !== null) riskSounds.play("invalid");
  }, [problem]);
}
