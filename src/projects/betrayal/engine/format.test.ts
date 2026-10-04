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
      turn: { seat: 0, moved: 1, traded: false, over: false, attacked: false },
    });
    expect(migrate({ format: 1, turn: null })).toMatchObject({ turn: null });
  });

  it("upgrades a format 2 state: the turn's attack hasn't been made", () => {
    const saved = {
      format: 2,
      gameId: "g",
      cardMarks: {},
      turn: { seat: 1, moved: 0, traded: true, over: false },
    };
    expect(migrate(saved)).toEqual({
      format: STATE_FORMAT,
      gameId: "g",
      cardMarks: {},
      turn: { seat: 1, moved: 0, traded: true, over: false, attacked: false },
    });
    expect(migrate({ format: 2, turn: null })).toMatchObject({ turn: null });
  });

  it("upgrades a format 3 state: the turn's omens were drawn by its own explorer", () => {
    const saved = {
      format: 3,
      gameId: "g",
      turn: {
        seat: 2,
        attacked: false,
        omens: [{ card: "book", room: "attic" }],
      },
    };
    expect(migrate(saved)).toEqual({
      format: STATE_FORMAT,
      gameId: "g",
      turn: {
        seat: 2,
        attacked: false,
        omens: [{ card: "book", seat: 2, room: "attic" }],
      },
    });
    expect(migrate({ format: 3, turn: null })).toMatchObject({ turn: null });
  });

  it("refuses a state with no format number", () => {
    expect(() => migrate({ gameId: "g" })).toThrow(/format/);
  });
});
