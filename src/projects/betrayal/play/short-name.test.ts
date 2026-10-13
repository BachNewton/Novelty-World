import { describe, expect, it } from "vitest";
import { ENGINE } from "../game";
import { shortName } from "./short-name";

describe("a character's short name", () => {
  it("is the nickname, the surname after a title, or the first name", () => {
    const names = Object.fromEntries(Object.entries(ENGINE.catalog.characters).map(([id, character]) => [id, shortName(character.name)]));
    expect(names).toEqual({
      "father-rhinehardt": "Rhinehardt",
      "professor-longfellow": "Longfellow",
      "darrin-flash-williams": "Flash",
      "ox-bellows": "Ox",
      "zoe-ingstrom": "Zoe",
      "missy-dubourde": "Missy",
      "brandon-jaspers": "Brandon",
      "peter-akimoto": "Peter",
      "vivian-lopez": "Vivian",
      "madame-zostra": "Zostra",
      "heather-granville": "Heather",
      "jenny-leclerc": "Jenny",
    });
  });
});
