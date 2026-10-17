import { describe, expect, it } from "vitest";
import { centreOf, copies, frameBoard, keepInView, panBy, toScreen, type Rect, type Scene } from "./camera";

const board = { width: 1200, height: 600 };
// A territory every 100 board units, so a 0.44 scale keeps them a fingertip apart.
const footprints: Rect[] = [];
for (let x = 100; x < 1200; x += 100) for (let y = 100; y < 600; y += 100) footprints.push({ left: x - 40, right: x + 40, top: y - 40, bottom: y + 40 });
const scene = (width: number, height: number, overlays: Rect[] = []): Scene => ({ board, view: { width, height }, overlays, footprints, touch: 0.44 });

describe("framing the board", () => {
  it("shows the whole board as large as the screen allows, centred", () => {
    const { camera, pan } = frameBoard(scene(1200, 900));
    expect(pan.axis).toBe("none");
    expect(camera.scale).toBe(1);
    expect(camera.left).toBe(0);
    expect(camera.top).toBe(150);
  });

  it("shrinks and shifts the board just enough to keep every territory clear of an overlay", () => {
    const corner = { left: 0, top: 500, right: 300, bottom: 600 };
    const { camera, pan } = frameBoard(scene(1200, 600, [corner]));
    expect(pan.axis).toBe("none");
    expect(camera.scale).toBeLessThan(1);
    expect(camera.scale).toBeGreaterThan(0.85);
    for (const f of footprints) {
      const a = toScreen(camera, { x: f.left, y: f.top });
      const b = toScreen(camera, { x: f.right, y: f.bottom });
      expect(a.x >= corner.right || b.y <= corner.top).toBe(true);
    }
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
    const middle = centreOf(frame.camera, view, board);
    const far = { x: (middle.x + board.width * 0.45) % board.width, y: 300 };
    const moved = keepInView(frame, far, 50, { board, view, overlays: [] });
    const xs = [-1, 0, 1].map((k) => toScreen(moved.camera, far).x + k * period);
    expect(xs.some((x) => x >= 49 && x <= 326)).toBe(true);
    expect(keepInView(moved, far, 50, { board, view, overlays: [] })).toBe(moved);
  });
});
