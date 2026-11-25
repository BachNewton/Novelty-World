import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FANTASY_TOWN_PIECES } from "./fantasy-town";

describe("FANTASY_TOWN_PIECES", () => {
  it("names exactly the kit's files served", () => {
    const served = readdirSync("public/adventure/fantasy-town").filter((file) => file.endsWith(".glb")).map((file) => file.slice(0, -".glb".length));
    expect([...FANTASY_TOWN_PIECES].sort()).toEqual(served.sort());
  });
});
