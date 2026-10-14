import { describe, expect, it } from "vitest";
import { migrate, NewerFormatError, STATE_FORMAT } from "./format";

describe("migrate", () => {
  it("leaves a state of the current format as it is", () => {
    const saved = { format: STATE_FORMAT, gameId: "g" };
    expect(migrate(saved)).toEqual(saved);
  });

  it("refuses a state from newer code, so the client reloads its own", () => {
    expect(() => migrate({ format: STATE_FORMAT + 1 })).toThrow(
      NewerFormatError,
    );
  });

  it("refuses a state older than any migration it has", () => {
    expect(() => migrate({ format: 0, gameId: "g" })).toThrow(
      /No migration from state format 0/,
    );
  });

  it("refuses a state with no format number", () => {
    expect(() => migrate({ gameId: "g" })).toThrow(/format/);
  });
});
