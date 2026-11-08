import { describe, expect, it } from "vitest";
import { createLobby } from "./lobby";
import { freshGame } from "./mocks";
import { isOutdated } from "./state-version";

describe("isOutdated", () => {

  it("rejects a state from before versioning, which has no stamp", () => {
    expect(isOutdated({})).toBe(true);
  });

  it("is false for every freshly seeded game", () => {
    expect(isOutdated(freshGame("seed"))).toBe(false);
    expect(isOutdated(createLobby({ id: "p1", name: "Ann" }, "seed"))).toBe(false);
  });
});
