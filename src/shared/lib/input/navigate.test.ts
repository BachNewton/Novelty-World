import { describe, expect, it } from "vitest";
import { cycleChoice, pickTarget, type ScreenPoint, type Target } from "./navigate";

const square = (id: string, x: number, y: number, size: number): Target => ({
  id,
  outline: [
    { x, y },
    { x: x + size, y },
    { x: x + size, y: y + size },
    { x, y: y + size },
  ],
  anchor: { x: x + size / 2, y: y + size / 2 },
});

describe("pickTarget", () => {
  const big = square("big", 0, 0, 200);
  const tiny = square("tiny", 300, 0, 4);

  it("picks the outline under the point", () => {
    expect(pickTarget([big, tiny], { x: 10, y: 190 }, 22)).toBe("big");
  });

  it("reaches a choice drawn smaller than a finger", () => {
    expect(pickTarget([big, tiny], { x: 318, y: 2 }, 22)).toBe("tiny");
    expect(pickTarget([big, tiny], { x: 340, y: 2 }, 22)).toBeNull();
  });

  it("takes the nearest anchor where outlines overlap", () => {
    const overlapping = square("overlapping", 150, 150, 200);
    expect(pickTarget([big, overlapping], { x: 160, y: 160 }, 22)).toBe("big");
    expect(pickTarget([big, overlapping], { x: 240, y: 240 }, 22)).toBe("overlapping");
  });

  it("follows a skewed outline, as a room seen in perspective is", () => {
    const skewed: Target = {
      id: "skewed",
      outline: [
        { x: 100, y: 0 },
        { x: 200, y: 50 },
        { x: 100, y: 100 },
        { x: 0, y: 50 },
      ],
      anchor: { x: 100, y: 50 },
    };
    expect(pickTarget([skewed], { x: 20, y: 50 }, 0)).toBe("skewed");
    expect(pickTarget([skewed], { x: 10, y: 10 }, 0)).toBeNull();
  });
});

describe("cycleChoice", () => {
  /** Out of order on purpose: the order is the screen's, not the list's. */
  const points: ScreenPoint[] = [
    { id: "c", x: 300, y: 0 },
    { id: "a", x: 0, y: 50 },
    { id: "b-high", x: 100, y: 0 },
    { id: "b-low", x: 100, y: 90 },
  ];
  const centre = { x: 150, y: 50 };

  it("steps left to right, top to bottom where choices line up", () => {
    expect(cycleChoice(points, "a", 1, centre)).toBe("b-high");
    expect(cycleChoice(points, "b-high", 1, centre)).toBe("b-low");
    expect(cycleChoice(points, "b-low", 1, centre)).toBe("c");
    expect(cycleChoice(points, "b-low", -1, centre)).toBe("b-high");
  });

  it("wraps round at either end", () => {
    expect(cycleChoice(points, "c", 1, centre)).toBe("a");
    expect(cycleChoice(points, "a", -1, centre)).toBe("c");
  });

  it("with nothing selected, takes the first choice past the centre that way", () => {
    expect(cycleChoice(points, null, 1, centre)).toBe("c");
    expect(cycleChoice(points, null, -1, centre)).toBe("b-low");
    expect(cycleChoice(points, null, 1, { x: 400, y: 0 })).toBe("a");
  });

  it("returns null with no choices", () => {
    expect(cycleChoice([], null, 1, centre)).toBeNull();
  });
});
