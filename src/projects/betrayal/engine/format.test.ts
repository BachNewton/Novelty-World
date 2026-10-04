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

  it("upgrades a format 1 state: no marks on cards, and the turn isn't over", () => {
    const saved = {
      format: 1,
      gameId: "g",
      ongoing: [],
      turn: { seat: 0, moved: 1, traded: false },
    };
    expect(migrate(saved)).toEqual({
      format: STATE_FORMAT,
      gameId: "g",
      ongoing: [],
      cardMarks: {},
      turn: { seat: 0, moved: 1, traded: false, over: false },
    });
    expect(migrate({ format: 1, turn: null })).toMatchObject({ turn: null });
  });

  it("refuses a state with no format number", () => {
    expect(() => migrate({ gameId: "g" })).toThrow(/format/);
  });
});
