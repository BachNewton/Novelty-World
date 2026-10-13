import { describe, expect, it } from "vitest";
import { evenStop, nearestStop, splitStops, stepStop } from "./damage";

/** Every split of `points` physical damage, as the engine lists them: most on Might first. */
const everySplit = (points: number) => Array.from({ length: points + 1 }, (_, i) => ({ might: points - i, speed: i }));

describe("the split control's stops", () => {
  it("are the engine's choices, fewest on the first trait first, each keeping its choice", () => {
    const stops = splitStops("physical", everySplit(2));
    expect(stops).toEqual([
      { choice: 2, first: 0, second: 2 },
      { choice: 1, first: 1, second: 1 },
      { choice: 0, first: 2, second: 0 },
    ]);
  });

  it("read a mental split on Sanity and Knowledge", () => {
    expect(splitStops("mental", [{ sanity: 1, knowledge: 2 }])).toEqual([{ choice: 0, first: 1, second: 2 }]);
  });

  it("fail loudly with no choices, or with a choice that isn't a split", () => {
    expect(() => splitStops("physical", [])).toThrow();
    expect(() => splitStops("physical", [null])).toThrow();
  });
});

describe("the split control", () => {
  it("starts on an even split, or the legal one nearest it", () => {
    const even = splitStops("physical", everySplit(8));
    expect(even[evenStop(even, 8)]).toMatchObject({ first: 4, second: 4 });
    // Of 7, 3 and 4 are as near: the one further left.
    const odd = splitStops("physical", everySplit(7));
    expect(odd[evenStop(odd, 7)]).toMatchObject({ first: 3, second: 4 });
    // A Might of 1 before the haunt: every split with 1 or more on Might
    // ends with Might at its lowest, so the engine offers only all of it there.
    const low = splitStops("physical", [{ might: 6, speed: 0 }, { might: 0, speed: 6 }]);
    expect(low[evenStop(low, 6)]).toMatchObject({ first: 0 });
  });

  it("steps one legal split at a time, skipping splits the engine doesn't offer", () => {
    // After the haunt with Might on 2: 3 or more on Might reaches the skull, so of those only one is offered.
    const stops = splitStops("physical", [{ might: 7, speed: 0 }, { might: 2, speed: 5 }, { might: 1, speed: 6 }, { might: 0, speed: 7 }]);
    expect(stops.map((stop) => stop.first)).toEqual([0, 1, 2, 7]);
    expect(stops[stepStop(stops, 2, 1)].first).toBe(7);
    expect(stops[stepStop(stops, 3, -1)].first).toBe(2);
  });

  it("stays on the control at its ends", () => {
    const stops = splitStops("physical", everySplit(18));
    expect(stepStop(stops, 0, -1)).toBe(0);
    expect(stepStop(stops, 18, 1)).toBe(18);
  });

  it("lands a dragged divider on the nearest legal split", () => {
    const stops = splitStops("physical", [{ might: 7, speed: 0 }, { might: 2, speed: 5 }, { might: 1, speed: 6 }, { might: 0, speed: 7 }]);
    expect(stops[nearestStop(stops, 4)].first).toBe(2);
    expect(stops[nearestStop(stops, 5)].first).toBe(7);
    expect(stops[nearestStop(stops, -3)].first).toBe(0);
  });
});
