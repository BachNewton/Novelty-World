import { describe, expect, it } from "vitest";
import { ALONE, padLeft, playerOf, pressedJoin, used, type Lineup } from "./lineup";

describe("joining", () => {
  it("joins a second player on a pad while the first plays on the keyboard", () => {
    const lineup = pressedJoin(ALONE, 0);
    expect(lineup).toEqual({ first: "keys", second: 0 });
    expect(playerOf(lineup, 0)).toBe(1);
    expect(playerOf(lineup, "keys")).toBe(0);
  });

  it("joins a second player on the keyboard, or a second pad, while the first plays on a pad", () => {
    const onPad = used(ALONE, 0);
    expect(pressedJoin(onPad, "keys")).toEqual({ first: 0, second: "keys" });
    expect(pressedJoin(onPad, 1)).toEqual({ first: 0, second: 1 });
  });

  it("never joins from the input the first player is using", () => {
    expect(pressedJoin(ALONE, "keys")).toBe(ALONE);
    const onPad = used(ALONE, 0);
    expect(pressedJoin(onPad, 0)).toBe(onPad);
  });

  it("leaves only from the second player's own input", () => {
    const two: Lineup = { first: "keys", second: 0 };
    expect(pressedJoin(two, 1)).toBe(two);
    expect(pressedJoin(two, "keys")).toBe(two);
    expect(pressedJoin(two, 0)).toEqual({ first: "keys", second: null });
  });

  it("never hands the second player's input to the first", () => {
    const two: Lineup = { first: "keys", second: 0 };
    expect(used(two, 0)).toBe(two);
    expect(used(two, 1)).toEqual({ first: 1, second: 0 });
  });
});

describe("unplugging", () => {
  it("drops a second player whose pad is unplugged", () => {
    expect(padLeft({ first: "keys", second: 1 }, 1)).toEqual({ first: "keys", second: null });
  });

  it("puts a first player whose pad is unplugged back on the keyboard, so the keyboard can't join them", () => {
    const after = padLeft({ first: 0, second: null }, 0);
    expect(after).toEqual(ALONE);
    expect(pressedJoin(after, "keys")).toBe(after);
  });
});
