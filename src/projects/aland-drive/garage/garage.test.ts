import { afterEach, describe, expect, it, vi } from "vitest";
import { ALL_ASSISTS } from "../sim/car";
import { keepAssists, keptAssists } from "./assists";
import { carKept, keepCar } from "./car";
import { keepTyres, keptTyres } from "./tyres";

/*
 * What the player chose in the garage outlives the page, and survives what
 * another version of the game kept: a car or tyre it doesn't know, an aid it
 * doesn't have, or one it has that wasn't kept.
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the garage", () => {
  it("keeps the tyres chosen, summer until then, and a tyre it doesn't know as summer", () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    expect(keptTyres()).toBe("summer");
    keepTyres("studded");
    expect(keptTyres()).toBe("studded");
    storage.setItem("nw:aland-drive:tyres", JSON.stringify("slicks"));
    expect(keptTyres()).toBe("summer");
  });

  it("keeps the driver's aids, all on until turned off, an aid not kept on, and one it doesn't know dropped", () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    expect(keptAssists()).toEqual(ALL_ASSISTS);
    keepAssists({ abs: true, traction: false, stability: true });
    expect(keptAssists()).toEqual({ abs: true, traction: false, stability: true });
    storage.setItem("nw:aland-drive:assists", JSON.stringify({ traction: false, launch: true }));
    expect(keptAssists()).toEqual({ ...ALL_ASSISTS, traction: false });
  });

  it("starts the next drive in the car last chosen, and forgets a car this version doesn't know", () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    expect(carKept()).toBeNull();
    keepCar("hagel");
    expect(carKept()).toBe("hagel");
    storage.setItem("nw:aland-drive:car", JSON.stringify("a-car-gone"));
    expect(carKept()).toBeNull();
  });
});
