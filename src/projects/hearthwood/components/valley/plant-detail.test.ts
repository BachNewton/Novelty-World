import { describe, expect, it } from "vitest";
import { chunkDetail } from "./plant-detail";

describe("plant detail by distance", () => {
  it("draws trees in full near by, in their far shape further out, thinned in the distance", () => {
    expect(chunkDetail("conifer", 10)).toEqual({ detail: "near", keep: 1 });
    expect(chunkDetail("conifer", 100)).toEqual({ detail: "far", keep: 1 });
    expect(chunkDetail("conifer", 300)?.keep).toBeLessThan(1);
  });

  it("draws flowers only near by", () => {
    expect(chunkDetail("flowers", 20)?.detail).toBe("near");
    expect(chunkDetail("flowers", 80)).toBeNull();
  });
});
