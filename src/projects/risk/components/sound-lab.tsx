"use client";

import { Volume2, VolumeX } from "lucide-react";
import { SoundLab } from "@/shared/components/sound-lab";
import { RISK_SOUND_IDS, RISK_SOUNDS } from "../ui/sounds";
import { riskSounds, useRiskSoundSettings } from "./sound-board";

/** Risk's `?sounds` page (the shared sound audition), to judge and retune the sounds by ear. */
export function RiskSoundLab() {
  const muted = useRiskSoundSettings((s) => s.settings.muted);
  const toggleMuted = useRiskSoundSettings((s) => s.toggleMuted);
  const Icon = muted ? VolumeX : Volume2;
  return (
    <SoundLab
      title="Risk sounds"
      intro={
        <>
          Each sound plays through the game&apos;s own player, with its random pitch and volume stray and its minimum gap. The ZzFX
          parameters paste into the ZzFX designer; edit them in <code>ui/sounds.ts</code>. When each plays is <code>ui/sound-cues.ts</code>.
        </>
      }
      controls={
        <button
          type="button"
          onClick={toggleMuted}
          aria-label="Mute sound"
          aria-pressed={muted}
          className="rounded-lg bg-surface-secondary p-2 text-text-secondary transition-colors hover:text-text-primary"
        >
          <Icon className="h-4 w-4" aria-hidden />
        </button>
      }
      ids={RISK_SOUND_IDS}
      designs={RISK_SOUNDS}
      player={riskSounds.audition}
    />
  );
}
