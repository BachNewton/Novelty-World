import { describe, expect, it } from "vitest";
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
});
