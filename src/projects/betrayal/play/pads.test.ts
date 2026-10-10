import { describe, expect, it } from "vitest";
import { claim, keepConnected, NO_PADS, padMayAct, padOf, release, seatListPress, seatsOf, toggle, trimSeats } from "./pads";

describe("pad assignment", () => {
  it("leaves every seat open at first, so any pad acts for anyone", () => {
    expect(padOf(NO_PADS, 0)).toBeNull();
    for (const pad of [0, 1, 3]) expect(padMayAct(NO_PADS, 2, pad)).toBe(true);
  });

  it("lets one pad play several seats", () => {
    const pads = claim(claim(claim(NO_PADS, 0, 0), 1, 1), 2, 1);
    expect(seatsOf(pads, 0)).toEqual([0]);
    expect(seatsOf(pads, 1)).toEqual([1, 2]);
  });

  it("gives a seat one pad: claiming takes it from the pad that had it", () => {
    const pads = claim(claim(NO_PADS, 0, 0), 0, 1);
    expect(padOf(pads, 0)).toBe(1);
    expect(seatsOf(pads, 0)).toEqual([]);
  });

  it("lets only a seat's own pad act for it, and any pad for an open seat", () => {
    const pads = claim(NO_PADS, 0, 0);
    expect(padMayAct(pads, 0, 0)).toBe(true);
    expect(padMayAct(pads, 0, 1)).toBe(false);
    expect(padMayAct(pads, 1, 1)).toBe(true);
  });

  it("lets any pad act when the game waits on no one", () => {
    expect(padMayAct(claim(NO_PADS, 0, 0), null, 1)).toBe(true);
  });

  it("releases a seat, opening it", () => {
    const pads = release(claim(claim(NO_PADS, 0, 0), 1, 0), 0);
    expect(padOf(pads, 0)).toBeNull();
    expect(seatsOf(pads, 0)).toEqual([1]);
    expect(release(pads, 5)).toBe(pads);
  });

  it("toggles: A claims a seat, and on a seat the pad already has, releases it", () => {
    const claimed = toggle(NO_PADS, 2, 1);
    expect(padOf(claimed, 2)).toBe(1);
    expect(padOf(toggle(claimed, 2, 1), 2)).toBeNull();
    expect(padOf(toggle(claimed, 2, 0), 2)).toBe(0);
  });

  it("drops seats a game doesn't have", () => {
    const pads = trimSeats(claim(claim(NO_PADS, 1, 0), 4, 1), 3);
    expect(padOf(pads, 1)).toBe(0);
    expect(padOf(pads, 4)).toBeNull();
  });

  it("opens the seats of a pad that disconnects, and says which", () => {
    const pads = claim(claim(claim(NO_PADS, 0, 0), 1, 1), 2, 1);
    const { assignment, freed } = keepConnected(pads, [0]);
    expect(freed).toEqual([{ pad: 1, seats: [1, 2] }]);
    expect(padOf(assignment, 1)).toBeNull();
    expect(padOf(assignment, 0)).toBe(0);
  });

  it("changes nothing while every assigned pad is connected", () => {
    const pads = claim(NO_PADS, 0, 2);
    expect(keepConnected(pads, [0, 2])).toEqual({ assignment: pads, freed: [] });
  });

  it("moves a list's highlight round the seats with the d-pad, and A takes the seat for the pad pressed", () => {
    const list = { focus: 0, count: 3, assignment: NO_PADS };
    expect(seatListPress("DpadUp", 0, list)?.focus).toBe(2);
    expect(seatListPress("DpadDown", 0, { ...list, focus: 2 })?.focus).toBe(0);
    const taken = seatListPress("A", 1, { ...list, focus: 1 });
    expect(taken && padOf(taken.assignment, 1)).toBe(1);
    expect(seatListPress("X", 0, list)).toBeNull();
  });
});
