import { create } from "zustand";
import { getProjectStorage } from "@/shared/lib/storage/project-storage";

export interface SoundSettings {
  muted: boolean;
  // The master volume, from 0 to 1, for the effects and the music.
  volume: number;
  // The music's own volume under the master, from 0 to 1.
  music: number;
}

export const DEFAULT_SOUND_SETTINGS: SoundSettings = { muted: false, volume: 0.8, music: 1 };

const KEY = "sound";

function isLevel(value: unknown): value is number {
  return typeof value === "number" && value >= 0 && value <= 1;
}

// Settings saved by an earlier visit, or the defaults if there are none.
// Settings saved before the music had its own volume keep their mute and
// master volume, with the music at its default.
export function loadSoundSettings(): SoundSettings {
  const saved = getProjectStorage("frogmino").get<unknown>(KEY);
  if (typeof saved !== "object" || saved === null) return DEFAULT_SOUND_SETTINGS;
  const { muted, volume, music = DEFAULT_SOUND_SETTINGS.music } = saved as Record<string, unknown>;
  if (typeof muted !== "boolean" || !isLevel(volume) || !isLevel(music)) return DEFAULT_SOUND_SETTINGS;
  return { muted, volume, music };
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
  setMusic: (music: number) => void;
}

function clampLevel(level: number): number {
  return Math.min(Math.max(level, 0), 1);
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
  setVolume: (volume) => set((s) => update({ ...s.settings, volume: clampLevel(volume) })),
  setMusic: (music) => set((s) => update({ ...s.settings, music: clampLevel(music) })),
}));
