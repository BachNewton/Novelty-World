import { afterEach, beforeEach, expect, it, vi } from "vitest";

/*
 * The render scale is the player's alone: 100% until they lower it, held to its
 * ends, and the same on their next visit. A page is a fresh import of the store.
 */

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

let storage: Storage;

const visit = async () => {
  vi.resetModules();
  return import("./graphics-settings");
};

beforeEach(() => {
  storage = fakeStorage();
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { devicePixelRatio: 2 });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("draws every physical pixel until the player lowers the scale, held to 20–100%, and kept for the next visit", async () => {
  const first = await visit();
  expect(first.pixelRatio()).toBe(2);
  first.useDriveGraphics.getState().stepRenderScale(1);
  expect(first.pixelRatio()).toBe(2);
  first.useDriveGraphics.getState().stepRenderScale(-2);
  expect(first.pixelRatio()).toBeCloseTo(1.6);
  first.useDriveGraphics.getState().stepRenderScale(-20);
  expect(first.useDriveGraphics.getState().settings.renderScale).toBe(0.2);
  first.useDriveGraphics.getState().stepRenderScale(6);

  const next = await visit();
  expect(next.useDriveGraphics.getState().settings.renderScale).toBe(0.8);
  storage.setItem("nw:aland-drive:graphics", JSON.stringify({ renderScale: 0.25 }));
  expect((await visit()).useDriveGraphics.getState().settings.renderScale).toBe(1);
});
