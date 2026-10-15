import { afterEach, describe, expect, it, vi } from "vitest";
import { musicGain, MUSIC_LEVEL } from "./music/mix";
import { DEFAULT_SOUND_SETTINGS, loadSoundSettings, saveSoundSettings, useSoundSettings } from "./settings";

function fakeStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => {
      items.clear();
    },
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => {
      items.delete(key);
    },
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sound settings", () => {
  it("remembers mute, the master volume and the music volume across visits", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    saveSoundSettings({ muted: true, volume: 0.3, music: 0.6 });
    expect(loadSoundSettings()).toEqual({ muted: true, volume: 0.3, music: 0.6 });
  });

  it("keeps mute and the master volume saved before the music had its own, with the music at its default", () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    storage.setItem("nw:frogmino:sound", JSON.stringify({ muted: true, volume: 0.3 }));
    expect(loadSoundSettings()).toEqual({ muted: true, volume: 0.3, music: DEFAULT_SOUND_SETTINGS.music });
  });

  it("starts from the defaults with nothing saved", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    expect(loadSoundSettings()).toEqual(DEFAULT_SOUND_SETTINGS);
  });

  it("ignores a saved value that isn't settings", () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    storage.setItem("nw:frogmino:sound", JSON.stringify({ muted: "yes", volume: 4 }));
    expect(loadSoundSettings()).toEqual(DEFAULT_SOUND_SETTINGS);
    storage.setItem("nw:frogmino:sound", JSON.stringify({ muted: false, volume: 0.5, music: 2 }));
    expect(loadSoundSettings()).toEqual(DEFAULT_SOUND_SETTINGS);
  });

  it("carries on when storage refuses a write or a read", () => {
    const storage = fakeStorage();
    storage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    storage.getItem = () => {
      throw new Error("SecurityError");
    };
    vi.stubGlobal("localStorage", storage);
    expect(() => saveSoundSettings({ muted: true, volume: 1, music: 0.5 })).not.toThrow();
    expect(loadSoundSettings()).toEqual(DEFAULT_SOUND_SETTINGS);
  });

  it("sets the music volume within 0 to 1, saving it, and holds it for the visit when storage refuses", () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    useSoundSettings.getState().setMusic(0.4);
    expect(useSoundSettings.getState().settings.music).toBe(0.4);
    expect(loadSoundSettings().music).toBe(0.4);
    useSoundSettings.getState().setMusic(3);
    expect(useSoundSettings.getState().settings.music).toBe(1);
    useSoundSettings.getState().setMusic(-1);
    expect(useSoundSettings.getState().settings.music).toBe(0);
    storage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    useSoundSettings.getState().setMusic(0.7);
    expect(useSoundSettings.getState().settings.music).toBe(0.7);
  });
});

describe("the music's gain", () => {
  it("is the master volume times the music volume, at the music's place in the mix", () => {
    expect(musicGain({ muted: false, volume: 0.5, music: 0.4 })).toBeCloseTo(0.2 * MUSIC_LEVEL);
  });

  it("is silent when muted or with either volume at nothing", () => {
    expect(musicGain({ muted: true, volume: 1, music: 1 })).toBe(0);
    expect(musicGain({ muted: false, volume: 0, music: 1 })).toBe(0);
    expect(musicGain({ muted: false, volume: 1, music: 0 })).toBe(0);
  });
});
