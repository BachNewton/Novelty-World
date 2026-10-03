"use client";

import { useEffect } from "react";
import { useFrogminoStore } from "../store";
import { soundCues } from "./cues";
import { loadSounds, playSound, unlockAudio } from "./sound-board";

// These are the input events a browser counts as the player interacting, so
// audio may start inside them. A touch counts on lifting the finger, not on
// touching down, hence pointerup alongside pointerdown.
const UNLOCKING_EVENTS = ["keydown", "pointerdown", "pointerup"] as const;

// Plays the game's sounds: loads them as the game opens, unlocks audio on the
// player's input, and turns each change in the store's state into its sound
// cues.
export function useGameSounds(): void {
  useEffect(() => {
    void loadSounds();
    for (const type of UNLOCKING_EVENTS) window.addEventListener(type, unlockAudio, { capture: true });
    let streak = 0;
    const unsubscribe = useFrogminoStore.subscribe((after, before) => {
      const heard = soundCues(before, after, streak);
      streak = heard.streak;
      for (const { sound, semitones } of heard.cues) playSound(sound, { semitones });
    });
    return () => {
      unsubscribe();
      for (const type of UNLOCKING_EVENTS) window.removeEventListener(type, unlockAudio, { capture: true });
    };
  }, []);
}
