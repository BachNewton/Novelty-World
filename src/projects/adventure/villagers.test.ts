import { describe, expect, it } from "vitest";
import { CHARACTERS } from "./characters";
import { PLAYER_CHARACTER, VILLAGERS } from "./villagers";

describe("villagers", () => {
  it("stands every character but the player's in the world, once each", () => {
    const others = CHARACTERS.map((c) => c.id).filter((id) => id !== PLAYER_CHARACTER);
    expect(VILLAGERS.map((v) => v.character).sort()).toEqual(others.sort());
  });
});
