import { afterEach, describe, expect, it, vi } from "vitest";
import { ALL_ASSISTS } from "../sim/car";
import { keepAssists, keptAssists } from "./assists";
import { fitTyres, tyresOn } from "./tyres";

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
  it("keeps each car on the tyres it was given, summer until then, past what another version kept", () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    storage.setItem("nw:aland-drive:fitted-tyres", JSON.stringify({ "a-car-to-come": "winter", sten: "slicks" }));
    expect(tyresOn("sten")).toBe("summer");
    fitTyres("sten", "studded");
    fitTyres("kobb", "winter");
    expect(tyresOn("sten")).toBe("studded");
    expect(tyresOn("kobb")).toBe("winter");
    expect(tyresOn("skerry-gt")).toBe("summer");
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
});
