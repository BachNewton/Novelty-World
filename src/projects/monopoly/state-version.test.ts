import { describe, expect, it } from "vitest";
import { createLobby } from "./lobby";
import { freshGame } from "./mocks";
import { isOutdated, STATE_VERSION } from "./state-version";

describe("isOutdated", () => {
  it("accepts a state stamped with the current version", () => {
    expect(isOutdated({ stateVersion: STATE_VERSION })).toBe(false);
  });

  it("rejects a state stamped with another version", () => {
    expect(isOutdated({ stateVersion: STATE_VERSION - 1 })).toBe(true);
  });

  it("rejects a state from before versioning, which has no stamp", () => {
    expect(isOutdated({})).toBe(true);
  });

  it("is false for every freshly seeded game", () => {
    expect(isOutdated(freshGame("seed"))).toBe(false);
    expect(isOutdated(createLobby({ id: "p1", name: "Ann" }, "seed"))).toBe(false);
  });
});
