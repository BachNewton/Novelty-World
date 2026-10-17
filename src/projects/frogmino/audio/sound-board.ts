import { createSoundBoard, type PlayOptions } from "@/shared/lib/sound";
import { useSoundSettings } from "./settings";
import { SOUNDS, type SoundId } from "./sounds";

// The game's one sound board, in the browser (the shared `sound/board.ts`).
// It loads as the game opens, before any input: the first AudioContext of a
// browser session blocks the page for a tenth of a second or more as it
// starts, so it must not wait for the player's first key press, which is
// usually the jump out of the helicopter.
const board = createSoundBoard(SOUNDS, () => useSoundSettings.getState().settings);

// Starts loading the sounds, if they aren't loading yet. Needs no input: the
// game calls it as it opens.
export function loadSounds(): void {
  void board.load();
}

// The sound board unlocked, once it has loaded; for the `?sounds` page, whose
// play buttons are the input that unlocks audio.
export const soundPlayer = board.audition;

// The trigger API: plays a sound now, with its variation and minimum gap.
// Before the first input has unlocked audio there is nothing to hear, so the
// play is dropped rather than queued for later.
export function playSound(id: SoundId, options?: PlayOptions): void {
  board.play(id, options);
}
