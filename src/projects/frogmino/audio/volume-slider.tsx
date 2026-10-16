"use client";

import { Music, Volume2 } from "lucide-react";
import { useHydrated } from "@/shared/lib/use-hydrated";
import { LevelSlider } from "./level-slider";
import { useSoundSettings } from "./settings";

// The master volume, for the dev pages. The saved settings are only known in
// the browser, so the sliders appear once the page has hydrated.
export function VolumeSlider() {
  const hydrated = useHydrated();
  const volume = useSoundSettings((s) => s.settings.volume);
  const setVolume = useSoundSettings((s) => s.setVolume);
  if (!hydrated) return null;
  return <LevelSlider icon={Volume2} label="Master volume" value={volume} onChange={setVolume} readout />;
}

// The music's own volume, under the master.
export function MusicSlider({ readout = false }: { readout?: boolean }) {
  const hydrated = useHydrated();
  const music = useSoundSettings((s) => s.settings.music);
  const setMusic = useSoundSettings((s) => s.setMusic);
  if (!hydrated) return null;
  return <LevelSlider icon={Music} label="Music volume" value={music} onChange={setMusic} readout={readout} />;
}
