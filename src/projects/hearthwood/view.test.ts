import { describe, expect, it } from "vitest";
import { hearthwoodView } from "./view";

describe("hearthwoodView", () => {
  it("opens on the valley", () => {
    expect(hearthwoodView("")).toBe("valley");
  });

  it("opens the cat preview with ?cats", () => {
    expect(hearthwoodView("?cats")).toBe("cats");
  });
});
