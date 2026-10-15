import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RULES } from "./rules-data";
import { extractRules } from "./rules-text";

describe("the rules the Why dialog shows", () => {
  it("match RULES.md (run write-rules-data.ts after changing the rules)", () => {
    expect(RULES).toEqual(extractRules(readFileSync("src/projects/risk/RULES.md", "utf8")));
  });

  it("hold the rules and notes events cite, as readable text", () => {
    for (const id of ["SETUP-4", "SETUP-5", "REINF-2", "CARDS-6", "CARDS-7", "COMBAT-4", "COMBAT-6", "ELIM-3", "FORT-1", "WIN-1", "defender-dice", "public-cards"]) {
      expect(RULES[id].paragraphs.length, id).toBeGreaterThan(0);
    }
    expect(RULES["COMBAT-4"].title).toBe("Resolving a battle");
    expect(JSON.stringify(RULES)).not.toMatch(/\[(R93|H15|GD|FAQ)\]|\*\*/);
  });
});
