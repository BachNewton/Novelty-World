import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHARACTERS } from "../data/characters";
import { portraitSrc, takenBy } from "./setup";

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
  it("has one for every character, shot by tools/portraits.mjs", () => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- a file under public/ named by a character id from the catalogue; no external input
    for (const { id } of CHARACTERS) expect(existsSync(portraitFile(id)), `No portrait for ${id}: run tools/portraits.mjs`).toBe(true);
  });
});

function portraitFile(character: string): string {
  return path.join(__dirname, "..", "..", "..", "..", "public", portraitSrc(character));
}
