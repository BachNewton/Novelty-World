"use client";

import { useEffect } from "react";
import { listenForAudioUnlock } from "@/shared/lib/sound";
import type { Session } from "../session";
import { soundCues } from "./cues";
import { loadSounds, playSound } from "./sound-board";

// Plays the game's sounds: loads them as the game opens, unlocks audio on the
// player's input, and turns each change in the session's state into its sound
// cues.
export function useGameSounds(session: Session): void {
  useEffect(() => {
    loadSounds();
    const stopUnlocking = listenForAudioUnlock();
    let streak = 0;
    const unsubscribe = session.store.subscribe((after, before) => {
      const heard = soundCues(before, after, streak);
      streak = heard.streak;
      for (const { sound, semitones, voice } of heard.cues) playSound(sound, { semitones, voice });
    });
    return () => {
      unsubscribe();
      stopUnlocking();
    };
  }, [session]);
}
