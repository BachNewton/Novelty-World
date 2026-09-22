import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import VARIANTS_TABLE from "./variants.json";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(HERE, "..", "..", "..", "public");

interface VariantFamily {
  canonical: string;
  variants: Record<string, Record<string, string>>;
}

const HEX = /^#[0-9a-f]{8}$/;

describe("tile palette variants", () => {
  it("lists only static, non-test sheets", () => {
    for (const [family, entry] of Object.entries(
      VARIANTS_TABLE as Record<string, VariantFamily>,
    )) {
      expect(
        Object.keys(entry),
        `${family} must be { canonical, variants }`,
      ).toEqual(["canonical", "variants"]);
      const srcs = [entry.canonical, ...Object.keys(entry.variants)];
      expect(srcs.length).toBeGreaterThan(1);
      for (const src of srcs) {
        expect(src, "no animated strips in the variant table").not.toMatch(
          /Anim/,
        );
        expect(src, "no TEST sheets in the variant table").not.toMatch(
          /TEST/,
        );
      }
      for (const [variantSrc, lut] of Object.entries(entry.variants)) {
        expect(
          Object.keys(lut).length,
          `${variantSrc} needs a non-empty LUT`,
        ).toBeGreaterThan(0);
        for (const [oldHex, newHex] of Object.entries(lut)) {
          expect(oldHex, `${variantSrc} old color`).toMatch(HEX);
          expect(newHex, `${variantSrc} new color`).toMatch(HEX);
          expect(newHex, `${variantSrc} must actually remap`).not.toBe(
            oldHex,
          );
        }
      }
    }
  });

  it("keeps canonical sheets on disk", () => {
    for (const entry of Object.values(
      VARIANTS_TABLE as Record<string, VariantFamily>,
    )) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-only check; the path is the repo's own public dir joined with a src URL from the checked-in variant table, never external input
      expect(existsSync(path.join(PUBLIC, entry.canonical))).toBe(true);
    }
  });

  it("keeps synthesized variant PNGs off disk", () => {
    const present: string[] = [];
    for (const entry of Object.values(
      VARIANTS_TABLE as Record<string, VariantFamily>,
    )) {
      for (const variantSrc of Object.keys(entry.variants)) {
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- test-only check; the path is the repo's own public dir joined with a src URL from the checked-in variant table, never external input
        if (existsSync(path.join(PUBLIC, variantSrc))) {
          present.push(variantSrc);
        }
      }
    }
    expect(
      present,
      `variant PNGs must stay deleted (runtime synthesizes them): ${present.join(", ")}`,
    ).toEqual([]);
  });
});
