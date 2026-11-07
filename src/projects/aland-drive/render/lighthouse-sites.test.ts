import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lighthouseSiteRecords } from "./lighthouse-sites";

/*
 * `art/lighthouses/sites.json` is the pipeline's copy of the landmark lighthouses' plans, which take away the map's
 * buildings under them. It must match the art and where the game places it. After moving a lighthouse or changing a
 * far version, write it again:
 *
 *   WRITE_LIGHTHOUSE_SITES=1 npx vitest run src/projects/aland-drive/render/lighthouse-sites.test.ts
 */

const FILE = "src/projects/aland-drive/art/lighthouses/sites.json";
const written = () => `[\n${lighthouseSiteRecords().map((record) => JSON.stringify(record)).join(",\n")}\n]\n`;

describe("the lighthouses' sites for the pipeline", () => {
  it("match the art and where the game places it", () => {
    if (process.env.WRITE_LIGHTHOUSE_SITES === "1") writeFileSync(FILE, written());
    expect(existsSync(FILE) ? readFileSync(FILE, "utf8") : "").toBe(written());
  });
});
