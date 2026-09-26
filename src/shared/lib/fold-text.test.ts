import { describe, expect, it } from "vitest";
import { foldText } from "./fold-text";

describe("foldText", () => {
  it("strips accents and case alike", () => {
    expect(foldText("Leppälä")).toBe("leppala");
    expect(foldText("LEPPALA")).toBe("leppala");
    expect(foldText("Björk Zoë Débeau")).toBe("bjork zoe debeau");
  });

  it("folds precomposed and decomposed spellings to the same text", () => {
    expect(foldText("Leppälä")).toBe(foldText("Leppälä"));
  });

  it("leaves letters that are not accented forms of another letter", () => {
    expect(foldText("Søren Strauß")).toBe("søren strauß");
  });
});
