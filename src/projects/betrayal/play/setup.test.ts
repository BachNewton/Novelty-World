import { describe, expect, it } from "vitest";
import { CHARACTERS } from "../data/characters";
import { PORTRAITS } from "./portraits";
import { takenBy } from "./setup";

const seats = [
  { character: "father-rhinehardt" },
  { character: "ox-bellows" },
  { character: "zoe-ingstrom" },
];

describe("choosing characters at setup", () => {
  it("counts a character taken when another seat has its card", () => {
    expect(takenBy(CHARACTERS, seats, 0, "professor-longfellow")).toBeNull();
    expect(takenBy(CHARACTERS, seats, 0, "darrin-flash-williams")).toBe(1);
  });
});

describe("portraits", () => {
  it("has one for every character and none for anyone else, shot by tools/portraits.mjs", () => {
    expect(Object.keys(PORTRAITS).sort()).toEqual(CHARACTERS.map(({ id }) => id).sort());
  });
});
