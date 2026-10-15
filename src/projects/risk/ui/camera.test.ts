import { describe, expect, it } from "vitest";
import { centredOn, clampCamera, fitScale, keepInView, MAX_ZOOM, startScale, toBoard, toScreen, zoomAbout } from "./camera";

const board = { width: 1200, height: 600 };
const desktop = { width: 1200, height: 900 };
const phone = { width: 375, height: 420 };

describe("the map's camera", () => {
  it("fits the whole board, centring it along the axis it doesn't fill", () => {
    const camera = clampCamera({ left: 0, top: 0, scale: 0 }, board, desktop);
    expect(camera.scale).toBe(fitScale(board, desktop));
    expect(camera.left).toBe(0);
    expect(camera.top).toBe(150);
  });

  it("starts on the whole board while that is readable, else a phone in portrait filling the map's height", () => {
    expect(startScale(board, desktop, 0.5)).toBe(fitScale(board, desktop));
    expect(startScale(board, phone, 0.5)).toBeCloseTo(phone.height / board.height);
    expect(startScale(board, phone, 0.2)).toBe(fitScale(board, phone));
    expect(startScale(board, { width: 700, height: 300 }, 0.8)).toBe(0.8);
  });

  it("never zooms out past the whole board or in past its limit", () => {
    expect(clampCamera({ left: 0, top: 0, scale: 100 }, board, desktop).scale).toBe(MAX_ZOOM);
    expect(clampCamera({ left: 0, top: 0, scale: 0.01 }, board, phone).scale).toBe(fitScale(board, phone));
  });

  it("keeps the board's edges at the box's edges once it is larger than the box", () => {
    const camera = clampCamera({ left: 500, top: -5000, scale: 2 }, board, desktop);
    expect(camera.left).toBe(0);
    expect(camera.top).toBe(desktop.height - board.height * 2);
  });

  it("zooms about a point, which stays under it", () => {
    const camera = centredOn({ x: 600, y: 300 }, 2, board, desktop);
    const at = { x: 400, y: 300 };
    const before = toBoard(camera, at);
    const zoomed = zoomAbout(camera, 1.5, at, board, desktop);
    const after = toScreen(zoomed, before);
    expect(after.x).toBeCloseTo(at.x);
    expect(after.y).toBeCloseTo(at.y);
  });

  it("pans only as far as brings a point into view", () => {
    const camera = centredOn({ x: 600, y: 300 }, 1.5, board, phone);
    const moved = keepInView(camera, { x: 800, y: 300 }, 50, board, phone);
    expect(toScreen(moved, { x: 800, y: 300 }).x).toBeCloseTo(phone.width - 50);
    expect(keepInView(camera, { x: 600, y: 300 }, 50, board, phone)).toBe(camera);
  });
});
