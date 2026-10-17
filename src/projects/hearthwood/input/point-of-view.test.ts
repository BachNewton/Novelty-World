import { describe, expect, it } from "vitest";
import { FIRST_VIEW, otherView, parsePointOfView } from "./point-of-view";

describe("the point of view", () => {
  it("starts in first person", () => {
    expect(FIRST_VIEW).toBe("first");
    expect(parsePointOfView(null)).toBe("first");
  });

  it("reads a stored choice back, and anything else as the default", () => {
    expect(parsePointOfView("third")).toBe("third");
    expect(parsePointOfView("first")).toBe("first");
    expect(parsePointOfView("sideways")).toBe("first");
  });

  it("switches between the two", () => {
    expect(otherView("first")).toBe("third");
    expect(otherView("third")).toBe("first");
  });
});
