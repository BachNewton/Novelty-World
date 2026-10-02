import { describe, expect, it } from "vitest";
import { HELD_KEYS, KEY_ACTIONS } from "./controls";

describe("the controls", () => {
  it("map each key to one action", () => {
    for (const key of HELD_KEYS.keys()) expect(KEY_ACTIONS.has(key)).toBe(false);
  });
});
