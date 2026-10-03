import { describe, expect, it } from "vitest";
import { EMPTY_LINEUP, isFull, join, leave, lineupSeating, seatOf } from "./lineup";

describe("local co-op's lineup", () => {
  it("seats each device that joins in the next free slot, P1 first", () => {
    const one = join(EMPTY_LINEUP, "keys:right");
    expect(one).toEqual(["keys:right", null]);
    expect(isFull(one)).toBe(false);
    const two = join(one, "pad:0");
    expect(two).toEqual(["keys:right", "pad:0"]);
    expect(isFull(two)).toBe(true);
  });

  it("never gives a device two slots", () => {
    const one = join(EMPTY_LINEUP, "keys:left");
    expect(join(one, "keys:left")).toBe(one);
  });

  it("turns away a device once every slot is taken", () => {
    const full = join(join(EMPTY_LINEUP, "keys:left"), "keys:right");
    expect(join(full, "pad:1")).toBe(full);
  });

  it("frees a leaving device's slot for the next to join, the other player keeping theirs", () => {
    const full = join(join(EMPTY_LINEUP, "keys:left"), "keys:right");
    const left = leave(full, "keys:left");
    expect(left).toEqual([null, "keys:right"]);
    expect(join(left, "pad:0")).toEqual(["pad:0", "keys:right"]);
    expect(leave(left, "pad:3")).toBe(left);
  });

  it("seats the game's players by device, and nobody else", () => {
    const lineup = join(join(EMPTY_LINEUP, "pad:2"), "keys:left");
    const seating = lineupSeating(lineup);
    expect(seating("pad:2")).toBe(0);
    expect(seating("keys:left")).toBe(1);
    expect(seating("keys:right")).toBeNull();
    expect(seating("touch")).toBeNull();
    expect(seatOf(lineup, "pad:0")).toBeNull();
  });
});
