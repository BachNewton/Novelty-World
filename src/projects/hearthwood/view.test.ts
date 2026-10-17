import { describe, expect, it } from "vitest";
import { hearthwoodView } from "./view";

describe("hearthwoodView", () => {
  it("opens on the world", () => {
    expect(hearthwoodView("")).toBe("world");
    expect(hearthwoodView("?seed=b&hour=12")).toBe("world");
  });

  it("opens the cat preview with ?cats", () => {
    expect(hearthwoodView("?cats")).toBe("cats");
  });

  it("opens the art gallery with ?art", () => {
    expect(hearthwoodView("?art")).toBe("art");
    expect(hearthwoodView("?art&hour=20")).toBe("art");
  });
});
