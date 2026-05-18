import { describe, expect, it } from "vitest";
import { hasMonopoly } from "./logic";
import { MOCK_STATE } from "./mocks";

describe("hasMonopoly", () => {
  it("returns true when the player owns every property of a color", () => {
    // p2 owns Oriental (6), Vermont (8), and Connecticut (9) in MOCK_STATE.
    expect(hasMonopoly(MOCK_STATE, "light-blue", "p2")).toBe(true);
  });

  it("returns false when the player does not own the full set", () => {
    expect(hasMonopoly(MOCK_STATE, "light-blue", "p1")).toBe(false);
  });
});
