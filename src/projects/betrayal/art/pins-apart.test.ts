import { describe, expect, it } from "vitest";
import { pinsApart, type PinBox } from "./pins-apart";

const GAP = 4;
const box = (x: number, top = 100, width = 40, height = 32): PinBox => ({ x, top, width, height });

/** Whether any two boxes, at the places given, overlap. */
function overlapping(boxes: readonly PinBox[], xs: readonly number[]): boolean {
  return boxes.some((a, i) =>
    boxes.some((b, j) => j > i && a.top < b.top + b.height && b.top < a.top + a.height && Math.abs(xs[i] - xs[j]) < (a.width + b.width) / 2),
  );
}

describe("pinsApart", () => {
  it("leaves boxes that don't overlap where they are", () => {
    const boxes = [box(50), box(150), box(50, 300)];
    expect(pinsApart(boxes, GAP)).toEqual([50, 150, 50]);
  });

  it("lays overlapping boxes side by side, in their order across, centred where they wanted to be", () => {
    const boxes = [box(110), box(100)];
    const xs = pinsApart(boxes, GAP);
    expect(xs[1]).toBeLessThan(xs[0]);
    expect(xs[0] - xs[1]).toBe(40 + GAP);
    expect((xs[0] + xs[1]) / 2).toBe(105);
  });

  it("keeps three figures' marks on one spot from covering each other", () => {
    const boxes = [box(100), box(100), box(100)];
    const xs = pinsApart(boxes, GAP);
    expect(overlapping(boxes, xs)).toBe(false);
    expect(xs).toEqual([56, 100, 144]);
  });

  it("joins a run that grows into the one beside it", () => {
    // The first two clash; spread, they reach the third, which joins them.
    const boxes = [box(100), box(105), box(170, 100, 60)];
    const xs = pinsApart(boxes, GAP);
    expect(overlapping(boxes, xs)).toBe(false);
    expect(xs[0]).toBeLessThan(xs[1]);
    expect(xs[1]).toBeLessThan(xs[2]);
  });

  it("never moves a box up or down: boxes in different rows stay where they are", () => {
    const boxes = [box(100, 100), box(100, 200)];
    expect(pinsApart(boxes, GAP)).toEqual([100, 100]);
  });

  it("slides a row the screen's edge would cut back onto the screen whole, its boxes still apart", () => {
    const boxes = [box(10), box(30)];
    const xs = pinsApart(boxes, GAP, { left: 8, right: 352 });
    expect(xs[0] - 20).toBe(8);
    expect(xs[1] - xs[0]).toBe(40 + GAP);
  });

  it("joins a row slid off the edge to the box it now reaches", () => {
    const boxes = [box(0), box(70)];
    const xs = pinsApart(boxes, GAP, { left: 8, right: 352 });
    expect(overlapping(boxes, xs)).toBe(false);
    expect(Math.min(...xs) - 20).toBeGreaterThanOrEqual(8);
  });
});
