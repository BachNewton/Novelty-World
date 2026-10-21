import { describe, expect, it } from "vitest";
import { centreOf, copies, keepInView, layoutScreen, panBy, toScreen, type Composition } from "./camera";

// A board twice as wide as it is tall, its territories drawn in all of it but a 50-unit margin,
// with a slot along its top-left and one at its bottom-middle.
const board = { width: 1000, height: 500 };
const composition: Composition = {
  board,
  drawn: { left: 50, top: 50, right: 950, bottom: 450 },
  slots: { players: { left: 0, top: 0, right: 500, bottom: 100 }, action: { left: 400, top: 350, right: 700, bottom: 500 } },
  least: { players: [{ width: 400, height: 80 }], action: [{ width: 200, height: 120 }, { width: 400, height: 60 }] },
  column: 100,
  bands: { top: 100, bottom: 150 },
  touch: 0.3,
};
const at = (width: number, height: number) => layoutScreen({ width, height }, composition);

describe("laying out a landscape screen", () => {
  it("scales the composition as one piece, never stretched, its slots holding the panels", () => {
    const { form, frame, panels } = at(2000, 1000);
    expect(form).toBe("landscape");
    expect(frame).toEqual({ camera: { left: 0, top: 0, scale: 2 }, pan: { axis: "none" } });
    expect(panels.players).toEqual({ left: 0, top: 0, right: 1000, bottom: 200 });
    expect(panels.action).toEqual({ left: 800, top: 700, right: 1400, bottom: 1000 });
  });

  it("gives spare height to the panels: the players panel up to the top edge, the action panel down to the bottom", () => {
    const { frame, panels } = at(1000, 700);
    expect(frame.camera).toEqual({ left: 0, top: 100, scale: 1 });
    expect(panels.players).toEqual({ left: 0, top: 0, right: 500, bottom: 200 });
    expect(panels.action).toEqual({ left: 400, top: 450, right: 700, bottom: 700 });
  });

  it("keeps spare width as sea either side", () => {
    const { frame, panels } = at(3000, 1000);
    expect(frame.camera).toEqual({ left: 500, top: 0, scale: 2 });
    expect(panels.players).toEqual({ left: 500, top: 0, right: 1500, bottom: 200 });
  });

  it("takes a slot that fits any one of a panel's least sizes", () => {
    const wideOnly = { ...composition, least: { ...composition.least, action: [{ width: 400, height: 60 }] } };
    expect(layoutScreen({ width: 1000, height: 700 }, wideOnly).form).toBe("short");
    expect(at(1000, 700).form).toBe("landscape");
  });

  it("puts the panels in columns either side of the board, filling the height, when the slots would be smaller than them", () => {
    const { form, frame, panels } = at(900, 300);
    expect(form).toBe("short");
    expect(frame.pan.axis).toBe("none");
    // The drawn part, 400 units tall, fills the 300px height.
    expect(frame.camera.scale).toBeCloseTo(0.75);
    expect(toScreen(frame, { x: 0, y: 50 }).y).toBeCloseTo(0);
    expect(toScreen(frame, { x: 0, y: 450 }).y).toBeCloseTo(300);
    const gutter = (900 - 900 * 0.75) / 2;
    expect(toScreen(frame, { x: 50, y: 0 }).x).toBeCloseTo(gutter);
    expect(panels.players).toEqual({ left: 0, top: 0, right: gutter, bottom: 300 });
    expect(panels.action).toEqual({ left: 900 - gutter, top: 0, right: 900, bottom: 300 });
  });

  it("shrinks the board to leave the columns their width, and pans it across between them below the fingertip scale", () => {
    const narrow = at(700, 300);
    expect(narrow.frame.pan.axis).toBe("none");
    expect(narrow.frame.camera.scale).toBeCloseTo(500 / 900);
    expect(narrow.panels.players.right).toBeCloseTo(100);

    const { frame, panels } = at(400, 300);
    expect(frame.camera.scale).toBe(0.3);
    expect(frame.pan).toEqual({ axis: "x", left: 100, right: 300 });
    expect(panels.players).toEqual({ left: 0, top: 0, right: 100, bottom: 300 });
    expect(panels.action).toEqual({ left: 300, top: 0, right: 400, bottom: 300 });
  });
});

describe("laying out a portrait screen", () => {
  it("puts the panels in bands across the top and bottom, and the board filling the height between them, panning across", () => {
    const { form, frame, panels } = at(400, 850);
    expect(form).toBe("portrait");
    expect(frame.pan).toEqual({ axis: "x", left: 0, right: 400 });
    expect(frame.camera.scale).toBeCloseTo(600 / 400);
    expect(toScreen(frame, { x: 0, y: 50 }).y).toBeCloseTo(100);
    expect(toScreen(frame, { x: 0, y: 450 }).y).toBeCloseTo(700);
    expect(panels.players).toEqual({ left: 0, top: 0, right: 400, bottom: 100 });
    expect(panels.action).toEqual({ left: 0, top: 700, right: 400, bottom: 850 });
  });

  it("starts with the board's middle in the middle of the screen", () => {
    const { frame, view } = at(400, 850);
    expect(centreOf(frame, view, board).x).toBeCloseTo(500);
  });
});

describe("panning", () => {
  const { frame, view } = at(400, 850);
  const period = board.width * frame.camera.scale;

  it("wraps across: the board repeats every board width, drawn as often as it takes to cover the screen", () => {
    const moved = panBy(frame, period * 2.5, board);
    expect(moved.camera.left).toBeGreaterThanOrEqual(-period);
    expect(moved.camera.left).toBeLessThan(0);
    const turns = (moved.camera.left - frame.camera.left - period * 2.5) / period;
    expect(turns).toBeCloseTo(Math.round(turns));
    const lefts = copies(moved, board, view);
    expect(lefts[0]).toBeLessThanOrEqual(0);
    expect(lefts[lefts.length - 1] + period).toBeGreaterThanOrEqual(400);
  });

  it("leaves a board that shows whole where it is", () => {
    const whole = at(2000, 1000).frame;
    expect(panBy(whole, 40, board)).toBe(whole);
    expect(copies(whole, board, { width: 2000, height: 1000 })).toEqual([0]);
  });

  it("brings a territory into view the shorter way round the world, between the columns", () => {
    const far = { x: (centreOf(frame, view, board).x + board.width * 0.45) % board.width, y: 300 };
    const moved = keepInView(frame, far, 50, board);
    const xs = [-1, 0, 1].map((k) => toScreen(moved, far).x + k * period);
    expect(xs.some((x) => x >= 49 && x <= 351)).toBe(true);
    expect(keepInView(moved, far, 50, board)).toBe(moved);

    const between = at(400, 300).frame;
    const shown = keepInView(between, { x: 950, y: 250 }, 10, board);
    const copiesAt = [-1, 0, 1].map((k) => toScreen(shown, { x: 950, y: 250 }).x + k * board.width * 0.3);
    expect(copiesAt.some((x) => x >= 110 && x <= 290)).toBe(true);
  });
});
