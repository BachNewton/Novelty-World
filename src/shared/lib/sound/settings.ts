import { create, type StoreApi, type UseBoundStore } from "zustand";
import { getProjectStorage } from "@/shared/lib/storage";
import type { SoundSettings } from "./player";

// A game's sound settings, mute and the master volume, kept in this browser's
// storage under the game's own name, so muting one game leaves the others be.

export const DEFAULT_SOUND_SETTINGS: SoundSettings = { muted: false, volume: 0.8 };

const KEY = "sound";

const isLevel = (value: unknown): value is number => typeof value === "number" && value >= 0 && value <= 1;

// Settings saved by an earlier visit, or the defaults if there are none.
export function loadSoundSettings(projectId: string): SoundSettings {
  const saved = getProjectStorage(projectId).get<unknown>(KEY);
  if (typeof saved !== "object" || saved === null) return DEFAULT_SOUND_SETTINGS;
  const { muted, volume } = saved as Record<string, unknown>;
  if (typeof muted !== "boolean" || !isLevel(volume)) return DEFAULT_SOUND_SETTINGS;
  return { muted, volume };
}

export function saveSoundSettings(projectId: string, settings: SoundSettings): void {
  // Storage can refuse a write (a private window, a full quota, blocked site
  // data). The setting still holds for this visit; it just isn't remembered.
  try {
    getProjectStorage(projectId).set(KEY, settings);
  } catch {
    return;
  }
}

export interface SoundSettingsStore {
  settings: SoundSettings;
  toggleMuted: () => void;
  setVolume: (volume: number) => void;
}

// A game's settings as a store. The server render has no storage, so it
// starts from the defaults; UI that shows a setting waits for hydration.
export function createSoundSettings(projectId: string): UseBoundStore<StoreApi<SoundSettingsStore>> {
  const update = (settings: SoundSettings) => {
    saveSoundSettings(projectId, settings);
    return { settings };
  };
  return create<SoundSettingsStore>()((set) => ({
    settings: typeof window === "undefined" ? DEFAULT_SOUND_SETTINGS : loadSoundSettings(projectId),
    toggleMuted: () => set((s) => update({ ...s.settings, muted: !s.settings.muted })),
    setVolume: (volume) => set((s) => update({ ...s.settings, volume: Math.min(Math.max(volume, 0), 1) })),
  }));
}
