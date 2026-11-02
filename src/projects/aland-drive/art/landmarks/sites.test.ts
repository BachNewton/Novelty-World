import { describe, expect, it } from "vitest";
import { siteRecords } from "./sites";
import SITES from "./sites.json";

describe("the sites the pipeline reads", () => {
  it("are the art's own, so a moved model moves what it replaces", () => {
    expect(SITES).toEqual(siteRecords());
  });
});
