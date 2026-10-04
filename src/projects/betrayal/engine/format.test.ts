import { describe, expect, it } from "vitest";
import { migrate, NewerFormatError, STATE_FORMAT } from "./format";

describe("migrate", () => {
  it("passes a current state through unchanged", () => {
    const saved = { format: STATE_FORMAT, gameId: "g" };
    expect(migrate(saved)).toEqual(saved);
  });

  it("refuses a state from newer code, so the client reloads", () => {
    expect(() => migrate({ format: STATE_FORMAT + 1 })).toThrow(
      NewerFormatError,
    );
  });

  it("refuses a state with no format number", () => {
    expect(() => migrate({ gameId: "g" })).toThrow(/format/);
  });
});
