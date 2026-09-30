import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SOUND_SETTINGS, loadSoundSettings, saveSoundSettings } from "./settings";

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
  it("remembers mute and volume across visits", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    saveSoundSettings({ muted: true, volume: 0.3 });
    expect(loadSoundSettings()).toEqual({ muted: true, volume: 0.3 });
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
    expect(() => saveSoundSettings({ muted: true, volume: 1 })).not.toThrow();
    expect(loadSoundSettings()).toEqual(DEFAULT_SOUND_SETTINGS);
  });
});
