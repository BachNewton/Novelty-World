import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dealerSiteRecords } from "./sites";

/*
 * `art/dealers/sites.json` is the pipeline's copy of the dealerships' plots and walls, which take away the map's
 * buildings under them. It must match the art and where the game places it. After moving a site or changing a plot or
 * its walls, write it again, and rebuild the tiles it stands on:
 *
 *   WRITE_DEALER_SITES=1 npx vitest run src/projects/aland-drive/art/dealers/sites.test.ts
 */

const FILE = "src/projects/aland-drive/art/dealers/sites.json";
const written = () => `[\n${dealerSiteRecords().map((record) => JSON.stringify(record)).join(",\n")}\n]\n`;

describe("the dealerships' sites for the pipeline", () => {
  it("match the art and where the game places it", () => {
    if (process.env.WRITE_DEALER_SITES === "1") writeFileSync(FILE, written());
    expect(existsSync(FILE) ? readFileSync(FILE, "utf8") : "").toBe(written());
  });
});
