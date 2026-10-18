import { describe, expect, it } from "vitest";
import { FIRST_VIEW, otherView } from "./point-of-view";

describe("the point of view", () => {
  it("starts in first person", () => {
    expect(FIRST_VIEW).toBe("first");
  });

  it("switches between the two", () => {
    expect(otherView("first")).toBe("third");
    expect(otherView("third")).toBe("first");
  });
});
