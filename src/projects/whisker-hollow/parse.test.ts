import { describe, expect, it } from "vitest";
import { DEFAULT_LOOK } from "./caretaker";
import { parseAvatar } from "./parse";

const avatar = { x: 1, z: 2, heading: 0.5, moving: true, look: DEFAULT_LOOK };

describe("an avatar off the wire", () => {
  it("keeps a caretaker in the picker's colours", () => {
    expect(parseAvatar(avatar)).toEqual(avatar);
  });

  it("refuses a colour the picker doesn't offer, and the old cat-or-rat avatar", () => {
    expect(parseAvatar({ ...avatar, look: { ...DEFAULT_LOOK, shirt: "neon" } })).toBeNull();
    expect(parseAvatar({ x: 1, z: 2, heading: 0, moving: false, species: "cat", coat: "ginger" })).toBeNull();
  });
});
