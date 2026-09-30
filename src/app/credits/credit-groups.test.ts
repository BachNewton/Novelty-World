import { describe, expect, it } from "vitest";
import { ART_LICENSES, SYMBOL_ART } from "@/projects/family-tree/symbol-art";
import { PROJECTS } from "@/shared/lib/constants";
import { CREDIT_GROUPS, PROJECT_CREDITS } from "./credit-groups";

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

const allCredits = CREDIT_GROUPS.flatMap((group) =>
  group.credits.map((credit) => ({ group: group.name, credit })),
);

describe("credits", () => {
  it("registers only projects that exist", () => {
    const slugs = new Set(PROJECTS.map((p) => p.slug));
    for (const slug of Object.keys(PROJECT_CREDITS)) {
      expect(slugs.has(slug), slug).toBe(true);
    }
  });

  it("shows every registered project, and none without credits", () => {
    const names = CREDIT_GROUPS.map((g) => g.name);
    expect(new Set(names).size).toBe(names.length);
    expect(CREDIT_GROUPS).toHaveLength(Object.keys(PROJECT_CREDITS).length + 1);
    for (const group of CREDIT_GROUPS) {
      expect(group.credits.length, group.name).toBeGreaterThan(0);
    }
  });

  it.each(allCredits)("$group: $credit.work is well formed", ({ credit }) => {
    for (const field of [credit.work, credit.author, credit.license.name]) {
      expect(field.trim()).not.toBe("");
      expect(field).toBe(field.trim());
    }
    expect(credit.attribution).toBe(credit.attribution.trim());
    expect(isHttpUrl(credit.source), credit.source).toBe(true);
    if (credit.license.url !== null) {
      expect(isHttpUrl(credit.license.url), credit.license.url).toBe(true);
    }
    if (credit.license.attribution) {
      expect(credit.attribution, "a licence that requires a credit needs its credit line").not.toBe("");
    }
  });

  it("credits every Family Tree art record whose licence requires it", () => {
    const familyTree = CREDIT_GROUPS.find((g) => g.name === "Family Tree");
    const sources = new Set(familyTree?.credits.map((c) => c.source));
    for (const [symbol, art] of Object.entries(SYMBOL_ART)) {
      if (!ART_LICENSES[art.license].attribution) continue;
      expect(art.kind === "published" && sources.has(art.source), symbol).toBe(true);
    }
  });
});
