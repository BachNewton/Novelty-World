import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHARACTER_ID,
  PLAYABLE_CHARACTER_IDS,
  nextCharacterId,
  sanitizeCharacterId,
} from "./characters";

describe("character roster", () => {
  it("cycles in fixed order and wraps", () => {
    expect(nextCharacterId("farmer-bob")).toBe("farmer-buba");
    const last = PLAYABLE_CHARACTER_IDS.at(-1) ?? "";
    expect(nextCharacterId(last)).toBe(PLAYABLE_CHARACTER_IDS.at(0));
    // Full loop visits every entry exactly once.
    let id: string = PLAYABLE_CHARACTER_IDS.at(0) ?? "";
    const seen = new Set<string>();
    for (let i = 0; i < PLAYABLE_CHARACTER_IDS.length; i += 1) {
      seen.add(id);
      id = nextCharacterId(id);
    }
    expect(seen.size).toBe(PLAYABLE_CHARACTER_IDS.length);
    expect(id).toBe(PLAYABLE_CHARACTER_IDS.at(0));
  });

  it("restarts unknown input at the roster head", () => {
    expect(nextCharacterId("nope")).toBe(PLAYABLE_CHARACTER_IDS.at(0));
    expect(nextCharacterId(undefined)).toBe(PLAYABLE_CHARACTER_IDS.at(0));
  });

  it("sanitizes unknown/missing ids to the default, which is playable", () => {
    expect(PLAYABLE_CHARACTER_IDS).toContain(DEFAULT_CHARACTER_ID);
    expect(sanitizeCharacterId("chef-chloe")).toBe("chef-chloe");
    expect(sanitizeCharacterId("nope")).toBe(DEFAULT_CHARACTER_ID);
    expect(sanitizeCharacterId(undefined)).toBe(DEFAULT_CHARACTER_ID);
    expect(sanitizeCharacterId(42)).toBe(DEFAULT_CHARACTER_ID);
  });

});
