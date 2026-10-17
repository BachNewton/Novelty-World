import { afterEach, describe, expect, it, vi } from "vitest";
import { createSoundSettings, DEFAULT_SOUND_SETTINGS, loadSoundSettings, saveSoundSettings } from "./settings";

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
  it("remembers mute and the volume across visits, per game", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    saveSoundSettings("one", { muted: true, volume: 0.3 });
    expect(loadSoundSettings("one")).toEqual({ muted: true, volume: 0.3 });
    expect(loadSoundSettings("two")).toEqual(DEFAULT_SOUND_SETTINGS);
  });

  it("ignores a saved value that isn't settings", () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    storage.setItem("nw:one:sound", JSON.stringify({ muted: "yes", volume: 0.5 }));
    expect(loadSoundSettings("one")).toEqual(DEFAULT_SOUND_SETTINGS);
    storage.setItem("nw:one:sound", JSON.stringify({ muted: false, volume: 2 }));
    expect(loadSoundSettings("one")).toEqual(DEFAULT_SOUND_SETTINGS);
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
    expect(() => saveSoundSettings("one", { muted: true, volume: 1 })).not.toThrow();
    expect(loadSoundSettings("one")).toEqual(DEFAULT_SOUND_SETTINGS);
  });

  it("toggles mute and sets the volume within 0 to 1, saving both", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    const store = createSoundSettings("one");
    store.getState().toggleMuted();
    expect(store.getState().settings.muted).toBe(true);
    store.getState().setVolume(3);
    expect(store.getState().settings.volume).toBe(1);
    store.getState().setVolume(0.25);
    expect(loadSoundSettings("one")).toEqual({ muted: true, volume: 0.25 });
  });
});
