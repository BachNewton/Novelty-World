import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OG_COLORS } from "./colors";

describe("OG_COLORS", () => {
  it("matches the design tokens in globals.css", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const drifted = Object.entries(OG_COLORS).filter(
      ([token, value]) => !css.includes(`--color-${token}: ${value};`),
    );
    expect(drifted).toEqual([]);
  });
});
