import { describe, expect, it } from "vitest";
import { CHARACTERS } from "../../data/characters";
import { SKIN_TONES, skinShade } from "./skin";

describe("explorer skin", () => {
  it("gives every character, and only them, a skin tone", () => {
    expect(Object.keys(SKIN_TONES).sort()).toEqual(CHARACTERS.map((character) => character.id).sort());
  });

  it("shades each tone with the step below it", () => {
    expect(skinShade("skinFair")).toBe("skinLight");
    expect(skinShade("skinDeep")).toBe("skinShadow");
  });
});
