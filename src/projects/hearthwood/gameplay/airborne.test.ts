import { describe, expect, it } from "vitest";
import { GLIDE, glidingMover, JUMP, standingMover, stepMover, type Intent, type Mover } from "./airborne";
import type { WalkGround } from "./walking";

const flat: WalkGround = { heightAt: () => 0, waterAt: () => -10 };
/** A ridge 200 m up falling away in a cliff beyond z = 0 to a valley floor at 0. */
const ridge: WalkGround = { heightAt: (_x, z) => (z < 0 ? 200 : 0), waterAt: () => -10 };
/** A lake 5 m deep beyond z = 10, its far shore at z = 60. */
const lake: WalkGround = { heightAt: (_x, z) => (z > 10 && z < 60 ? -5 : 0), waterAt: () => 0 };
/** A wall rising sheer from z = 5. */
const wall: WalkGround = { heightAt: (_x, z) => (z > 5 ? 50 : 0), waterAt: () => -10 };

const still: Intent = { jump: false, velocity: { x: 0, z: 0 }, facing: 0, steer: null };
const ahead = (speed: number): Intent => ({ ...still, velocity: { x: 0, z: speed } });

/** Runs a mover for `seconds` in frames of `frame`, pressing jump at the given times, and returns where it was after each frame. */
function run(mover: Mover, ground: WalkGround, seconds: number, frame: number, intent: Intent, jumpsAt: number[] = []) {
  const path: { t: number; mode: string; x: number; y: number; z: number; landed: number | null }[] = [];
  const presses = [...jumpsAt];
  for (let t = 0; t < seconds - 1e-9; t += frame) {
    const jump = presses.length > 0 && presses[0] <= t + 1e-9;
    if (jump) presses.shift();
    const result = stepMover(mover, { ...intent, jump }, ground, frame);
    path.push({ t: t + frame, mode: mover.mode, x: mover.x, y: mover.y, z: mover.z, landed: result.landed });
  }
  return path;
}

describe("jumping", () => {
  it("is a small soft hop that lands where it started", () => {
    const mover = standingMover(flat, 0, 0, 0);
    const path = run(mover, flat, 1.2, 1 / 60, still, [0]);
    const top = Math.max(...path.map((p) => p.y));
    expect(top).toBeGreaterThan(0.5);
    expect(top).toBeLessThan(0.7);
    const landing = path.find((p) => p.landed !== null);
    expect(landing?.t).toBeGreaterThan(0.55);
    expect(landing?.t).toBeLessThan(0.7);
    expect(mover.mode).toBe("ground");
    expect(mover.y).toBe(0);
  });

  it("carries a run on through the air", () => {
    const mover = standingMover(flat, 0, 0, 0);
    run(mover, flat, 0.62, 1 / 60, ahead(7), [0]);
    expect(mover.z).toBeGreaterThan(4);
  });

  it("can't jump again in the air: a second press takes out the broom instead", () => {
    const mover = standingMover(flat, 0, 0, 0);
    const path = run(mover, flat, 0.3, 1 / 60, still, [0, 0.15]);
    expect(path.at(-1)?.mode).toBe("broom");
    // The broom never lifts them: the highest point came before it was taken out.
    const after = path.filter((p) => p.t > 0.17);
    for (let i = 1; i < after.length; i++) expect(after[i].y).toBeLessThanOrEqual(after[i - 1].y + 1e-9);
  });

  it("comes out the same at any frame rate", () => {
    const slow = standingMover(flat, 0, 0, 0);
    const fast = standingMover(flat, 0, 0, 0);
    const a = run(slow, flat, 0.3, 1 / 30, ahead(5), [0]);
    const b = run(fast, flat, 0.3, 1 / 144, ahead(5), [0]);
    const at = (path: typeof a, t: number) => path.reduce((best, p) => (Math.abs(p.t - t) < Math.abs(best.t - t) ? p : best));
    expect(at(b, 0.3).y).toBeCloseTo(at(a, 0.3).y, 2);
    expect(at(b, 0.3).z).toBeCloseTo(at(a, 0.3).z, 1);
  });
});

describe("the broom", () => {
  it("settles to a slow sink and a steady speed forward", () => {
    const mover = glidingMover(flat, 0, 0, 100, 0);
    run(mover, flat, 5, 1 / 60, still);
    expect(mover.vy).toBeCloseTo(-GLIDE.sink, 3);
    expect(Math.hypot(mover.vx, mover.vz)).toBeCloseTo(GLIDE.speed, 3);
  });

  it("sails a long way down off a ridge into the valley", () => {
    const mover = standingMover(ridge, 0, -1, 0);
    const path = run(mover, ridge, 200, 1 / 60, ahead(7), [0, 0.3]);
    const landing = path.find((p) => p.landed !== null);
    expect(landing).toBeDefined();
    expect(landing?.z).toBeGreaterThan(800);
    // A soft landing, at the broom's sink.
    expect(landing?.landed).toBeLessThan(GLIDE.sink + 0.01);
  });

  it("turns towards where it is steered, never on the spot", () => {
    const mover = glidingMover(flat, 0, 0, 100, 0);
    stepMover(mover, { ...still, steer: Math.PI / 2 }, flat, 0.1);
    expect(mover.heading).toBeGreaterThan(0);
    expect(mover.heading).toBeLessThan(Math.PI / 4);
    run(mover, flat, 4, 1 / 60, { ...still, steer: Math.PI / 2 });
    expect(mover.heading).toBeCloseTo(Math.PI / 2, 2);
  });

  it("puts away with another press, and they fall, landing unhurt", () => {
    const mover = glidingMover(flat, 0, 0, 30, 0);
    const path = run(mover, flat, 6, 1 / 60, still, [0.5]);
    expect(path.find((p) => p.t > 0.52)?.mode).toBe("air");
    expect(mover.mode).toBe("ground");
  });

  it("catches a fall: taken out while falling fast, it slows to its sink without lifting", () => {
    const mover = glidingMover(flat, 0, 0, 100, 0);
    mover.mode = "air";
    mover.vy = -15;
    const path = run(mover, flat, 3, 1 / 60, still, [0]);
    for (let i = 1; i < path.length; i++) expect(path[i].y).toBeLessThan(path[i - 1].y);
    expect(mover.vy).toBeGreaterThan(-GLIDE.sink - 1);
  });

  it("never lands in deep water: it skims across to the far shore", () => {
    const mover = glidingMover(lake, 0, 15, 1, 0);
    const path = run(mover, lake, 20, 1 / 60, still);
    for (const p of path.filter((q) => q.z > 11 && q.z < 59)) expect(p.mode).toBe("broom");
    expect(path.every((p) => p.y >= -0.45 - 1e-9)).toBe(true);
    const landing = path.find((p) => p.landed !== null);
    expect(landing?.z).toBeGreaterThanOrEqual(59.9);
  });

  it("catches a hop that would come down in deep water", () => {
    const mover = standingMover(lake, 0, 9.5, 0);
    run(mover, lake, 0.8, 1 / 60, ahead(6), [0]);
    expect(mover.mode).toBe("broom");
    expect(mover.y).toBeCloseTo(0);
  });

  it("stops against a wall rather than passing into it, and sinks to its foot", () => {
    const mover = glidingMover(wall, 0, 0, 3, 0);
    const path = run(mover, wall, 6, 1 / 60, still);
    expect(path.every((p) => p.z <= 5.01)).toBe(true);
    expect(mover.mode).toBe("ground");
  });
});

describe("a hop", () => {
  it("lands on a slope it jumps up rather than stopping against it", () => {
    const slope: WalkGround = { heightAt: (_x, z) => Math.max(0, z * 0.5), waterAt: () => -10 };
    const mover = standingMover(slope, 0, 1, 0);
    run(mover, slope, 1, 1 / 60, ahead(JUMP.speed), [0]);
    expect(mover.mode).toBe("ground");
    expect(mover.z).toBeGreaterThan(2);
  });
});
