"use client";

import { SoundLab as Lab } from "@/shared/components/sound-lab";
import { MuteButton } from "./mute-button";
import { soundPlayer } from "./sound-board";
import { passStreakSemitones, SOUND_IDS, SOUNDS } from "./sounds";
import { MusicSlider, VolumeSlider } from "./volume-slider";

// The `?sounds` page (the shared sound audition). Ten passes in a row climb
// their streak, as clean passes in a row do.
export function SoundLab() {
  return (
    <Lab
      title="Frogmino sounds"
      intro={
        <>
          Each sound plays through the game&apos;s own player, with its random pitch and volume stray and its minimum gap. The ZzFX
          parameters paste into the ZzFX designer; edit them in <code>audio/sounds.ts</code>. Slides, turns and jumps are silent on
          purpose.
        </>
      }
      controls={
        <>
          <VolumeSlider />
          <MusicSlider readout />
          <MuteButton />
        </>
      }
      ids={SOUND_IDS}
      designs={SOUNDS}
      player={soundPlayer}
      inARow={(id, i) => ({ semitones: id === "pass" ? passStreakSemitones(i) : 0 })}
    />
  );
}
