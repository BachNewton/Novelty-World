import { describe, expect, it } from "vitest";
import { backdropFromSearch } from "./backdrop";

describe("backdropFromSearch", () => {
  it("is off unless the page asks for the night", () => {
    expect(backdropFromSearch("")).toBe("off");
    expect(backdropFromSearch("?house&backdrop=night")).toBe("night");
    expect(backdropFromSearch("?backdrop=off")).toBe("off");
  });

  it("fails loudly on a backdrop it doesn't know", () => {
    expect(() => backdropFromSearch("?backdrop=day")).toThrow(/night or off/);
  });
});
