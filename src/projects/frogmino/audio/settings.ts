import { create } from "zustand";
import { getProjectStorage } from "@/shared/lib/storage/project-storage";

export interface SoundSettings {
  muted: boolean;
  // The master volume, from 0 to 1.
  volume: number;
}

export const DEFAULT_SOUND_SETTINGS: SoundSettings = { muted: false, volume: 0.8 };

const KEY = "sound";

function isSoundSettings(value: unknown): value is SoundSettings {
  if (typeof value !== "object" || value === null) return false;
  const { muted, volume } = value as Record<string, unknown>;
  return typeof muted === "boolean" && typeof volume === "number" && volume >= 0 && volume <= 1;
}

// Settings saved by an earlier visit, or the defaults if there are none.
export function loadSoundSettings(): SoundSettings {
  const saved = getProjectStorage("frogmino").get<unknown>(KEY);
  return isSoundSettings(saved) ? saved : DEFAULT_SOUND_SETTINGS;
}

export function saveSoundSettings(settings: SoundSettings): void {
  // Storage can refuse a write (a private window, a full quota, blocked site
  // data). The setting still holds for this visit; it just isn't remembered.
  try {
    getProjectStorage("frogmino").set(KEY, settings);
  } catch {
    return;
  }
}

interface SoundSettingsStore {
  settings: SoundSettings;
  toggleMuted: () => void;
  setVolume: (volume: number) => void;
}

function update(settings: SoundSettings): { settings: SoundSettings } {
  saveSoundSettings(settings);
  return { settings };
}

// The server render has no storage, so it starts from the defaults; UI that
// shows a setting waits for hydration (see `mute-button.tsx`).
export const useSoundSettings = create<SoundSettingsStore>()((set) => ({
  settings: typeof window === "undefined" ? DEFAULT_SOUND_SETTINGS : loadSoundSettings(),
  toggleMuted: () => set((s) => update({ ...s.settings, muted: !s.settings.muted })),
  setVolume: (volume) => set((s) => update({ ...s.settings, volume: Math.min(Math.max(volume, 0), 1) })),
}));
