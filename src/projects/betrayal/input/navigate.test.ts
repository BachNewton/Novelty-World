import { describe, expect, it } from "vitest";
import { nextInDirection, pickTarget, type ScreenPoint, type Target } from "./navigate";

/** A 3×3 grid, 100 px apart, named by column and row. */
const GRID: ScreenPoint[] = [0, 1, 2].flatMap((row) => [0, 1, 2].map((column) => ({ id: `${column}${row}`, x: column * 100, y: row * 100 })));

const RIGHT = { x: 1, y: 0 };
const DOWN = { x: 0, y: 1 };

describe("nextInDirection", () => {
  it("moves to the neighbour in each direction", () => {
    expect(nextInDirection(GRID, "11", RIGHT)).toBe("21");
    expect(nextInDirection(GRID, "11", { x: -1, y: 0 })).toBe("01");
    expect(nextInDirection(GRID, "11", DOWN)).toBe("12");
    expect(nextInDirection(GRID, "11", { x: 0, y: -1 })).toBe("10");
  });

  it("stays put when nothing lies that way", () => {
    expect(nextInDirection(GRID, "21", RIGHT)).toBeNull();
    expect(nextInDirection(GRID, "10", { x: 0, y: -1 })).toBeNull();
  });

  it("prefers a choice on the line to a nearer one well off it", () => {
    const points: ScreenPoint[] = [
      { id: "from", x: 0, y: 0 },
      { id: "far-on-line", x: 300, y: 10 },
      { id: "near-off-line", x: 120, y: 150 },
    ];
    expect(nextInDirection(points, "from", RIGHT)).toBe("far-on-line");
  });

  it("ignores choices outside the cone round the direction", () => {
    const points: ScreenPoint[] = [
      { id: "from", x: 0, y: 0 },
      { id: "steep", x: 20, y: 200 },
    ];
    expect(nextInDirection(points, "from", RIGHT)).toBeNull();
    expect(nextInDirection(points, "from", DOWN)).toBe("steep");
  });

  it("takes a diagonal from a stick", () => {
    expect(nextInDirection(GRID, "11", { x: 0.7, y: 0.7 })).toBe("22");
  });

  it("does not depend on the direction's length", () => {
    expect(nextInDirection(GRID, "00", { x: 0.3, y: 0 })).toBe(nextInDirection(GRID, "00", { x: 5, y: 0 }));
  });

  it("returns null for an unknown origin or no direction", () => {
    expect(nextInDirection(GRID, "nope", RIGHT)).toBeNull();
    expect(nextInDirection(GRID, "11", { x: 0, y: 0 })).toBeNull();
  });
});

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
