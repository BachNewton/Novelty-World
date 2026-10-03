"use client";

import { useHydrated } from "@/shared/lib/use-hydrated";
import { useSoundSettings } from "./settings";

// The master volume, for the dev pages. The saved setting is only known in
// the browser, so the slider appears once the page has hydrated.
export function VolumeSlider() {
  const hydrated = useHydrated();
  const volume = useSoundSettings((s) => s.settings.volume);
  const setVolume = useSoundSettings((s) => s.setVolume);
  if (!hydrated) return null;
  return (
    <label className="flex items-center gap-2 text-sm text-text-secondary">
      Volume
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        className="w-32 accent-brand-green"
      />
      <span className="w-10 font-mono text-xs text-text-muted">{Math.round(volume * 100)}%</span>
    </label>
  );
}
