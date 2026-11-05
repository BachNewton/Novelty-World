import { describe, expect, it } from "vitest";
import data from "../sea/marks.json";
import { seaMarkKinds } from "./sea-marks";

describe("the sea marks", () => {
  it("names only models the game can draw", () => {
    const known = new Set(Object.keys(seaMarkKinds()));
    for (const [model] of data.marks) expect(known).toContain(model);
  });
});
