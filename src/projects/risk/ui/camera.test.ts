import { describe, expect, it } from "vitest";
import { centreOf, copies, frameBoard, keepInView, panBy, stretched, toScreen, type Frame, type Rect, type Scene } from "./camera";

const board = { width: 1200, height: 600 };
// A territory every 100 board units, so a 0.44 scale keeps them a fingertip apart.
const places: { x: number; y: number }[] = [];
for (let x = 100; x < 1200; x += 100) for (let y = 100; y < 600; y += 100) places.push({ x, y });
const draw: Rect = { left: -40, right: 40, top: -40, bottom: 40 };
const scene = (width: number, height: number, overlays: Rect[] = []): Scene => ({ board, view: { width, height }, overlays, places, draws: places.map(() => draw), touch: 0.44 });

/** What each territory draws, where it shows. */
const shown = (frame: Frame) =>
  places.map((p) => {
    const at = toScreen(frame, p);
    const { scale } = frame.camera;
    return { left: at.x + draw.left * scale, right: at.x + draw.right * scale, top: at.y + draw.top * scale, bottom: at.y + draw.bottom * scale };
  });

describe("framing the board", () => {
  it("shows the whole board as large as the screen allows, stretched to fill a screen of another shape", () => {
    const { camera, pan, stretch } = frameBoard(scene(1200, 900));
    expect(pan.axis).toBe("none");
    expect(camera.scale).toBe(1);
    expect(stretch).toEqual({ x: 1, y: 1.5 });
    expect(camera.left).toBe(0);
    expect(camera.top).toBe(0);
  });

  it("stretches one way at most twice the other, centring what is left over", () => {
    const { camera, stretch } = frameBoard(scene(1200, 2000));
    expect(stretch).toEqual({ x: 1, y: 2 });
    expect(camera.top).toBe((2000 - 1200) / 2);
  });

  it("keeps every territory clear of an overlay, giving up a little size where that fills more of the screen", () => {
    const corner = { left: 0, top: 500, right: 300, bottom: 600 };
    const frame = frameBoard(scene(1200, 600, [corner]));
    expect(frame.pan.axis).toBe("none");
    expect(frame.camera.scale).toBeLessThan(1);
    expect(frame.camera.scale).toBeGreaterThan(0.7);
    for (const f of shown(frame)) expect(f.left >= corner.right || f.bottom <= corner.top).toBe(true);
    const size = stretched(board, frame.stretch);
    expect(size.width * frame.camera.scale * size.height * frame.camera.scale).toBeGreaterThan(1200 * 600 * 0.75);
  });

  it("pans a phone held upright across, filling the height between its top and bottom overlays", () => {
    const { camera, pan } = frameBoard(scene(375, 650, [{ left: 0, top: 0, right: 375, bottom: 60 }, { left: 0, top: 450, right: 375, bottom: 650 }]));
    expect(pan.axis).toBe("x");
    expect(camera.scale).toBeCloseTo(390 / 600);
    expect(camera.top).toBeCloseTo(60);
  });

  it("never goes below the scale a fingertip can use: a short screen pans up and down instead", () => {
    const { camera, pan } = frameBoard(scene(600, 240));
    expect(pan.axis).toBe("y");
    expect(camera.scale).toBeGreaterThanOrEqual(0.44);
    expect(board.height * camera.scale).toBeGreaterThan(240);
  });
});

describe("panning", () => {
  it("wraps across: the board repeats every board width, drawn as often as it takes to cover the screen", () => {
    const frame = frameBoard(scene(375, 650));
    const period = board.width * frame.camera.scale;
    const moved = panBy(frame, period * 2.5, 0, board);
    expect(moved.camera.left).toBeGreaterThanOrEqual(-period);
    expect(moved.camera.left).toBeLessThan(0);
    const turns = (moved.camera.left - frame.camera.left - period * 2.5) / period;
    expect(turns).toBeCloseTo(Math.round(turns));
    const lefts = copies(moved, board, { width: 375, height: 650 });
    expect(lefts[0]).toBeLessThanOrEqual(0);
    expect(lefts[lefts.length - 1] + period).toBeGreaterThanOrEqual(375);
  });

  it("moves only along the way the board pans, and stops at its ends up and down", () => {
    const across = frameBoard(scene(375, 650));
    expect(panBy(across, 10, 50, board).camera.top).toBe(across.camera.top);
    const upDown = frameBoard(scene(600, 240));
    expect(panBy(upDown, 50, 0, board).camera.left).toBe(upDown.camera.left);
    if (upDown.pan.axis !== "y") throw new Error("expected to pan up and down");
    expect(panBy(upDown, 0, 5000, board).camera.top).toBe(upDown.pan.max);
    expect(panBy(upDown, 0, -5000, board).camera.top).toBe(upDown.pan.min);
    const whole = frameBoard(scene(1200, 900));
    expect(panBy(whole, 40, 40, board)).toBe(whole);
  });

  it("brings a territory into view the shorter way round the world", () => {
    const view = { width: 375, height: 650 };
    const frame = frameBoard(scene(375, 650));
    const period = board.width * frame.camera.scale;
    const middle = centreOf(frame, view, board);
    const far = { x: (middle.x + board.width * 0.45) % board.width, y: 300 };
    const moved = keepInView(frame, far, 50, { board, view, overlays: [] });
    const xs = [-1, 0, 1].map((k) => toScreen(moved, far).x + k * period);
    expect(xs.some((x) => x >= 49 && x <= 326)).toBe(true);
    expect(keepInView(moved, far, 50, { board, view, overlays: [] })).toBe(moved);
  });
});
