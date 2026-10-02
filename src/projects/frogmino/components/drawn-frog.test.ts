import { describe, expect, it } from "vitest";
import { MOVE_HOP_HEIGHT, moveDuration } from "../frog/moves";
import type { RuleFrog } from "../run";
import { TUNING } from "../tuning";
import { arrived, frogTarget, glideAt, moveLift, movesSince, seeMoves, withPiece, type DrawnFrog } from "./drawn-frog";

describe("a gate's new piece in the drawn frog", () => {
  // Mid-jump, mid-hop, swinging out of a turn and knocked back by a bonk,
  // after the drop: everything a piece change could catch in progress.
  const drawn: DrawnFrog = {
    kind: "L",
    rotation: 0,
    x: 3.4,
    y: 1,
    depth: 6.2,
    level: 0,
    swing: 0.3,
    lift: 0.6,
    glideX: { from: 3, to: 3.5, startedAt: 4.1 },
    glideDepth: { from: 5, to: 6.5, startedAt: 4.1 },
    moveHops: [4.1],
    seen: { kind: "L", rotation: 0, col: 3, depth: 6.5 },
    hopAt: 4,
    bonk: { time: 3, depth: 8 },
    bonkMotion: { from: 8, to: 5, startedAt: 3 },
    drop: { fromDepth: -1, fromLevel: 2, startedAt: 1, landed: true },
    leap: null,
  };
  const frog: RuleFrog = { kind: "I", col: 4, rotation: 1, depth: 8, latestHop: { startedAt: 4, landedAt: null } };

  it("draws the new piece at once, in its rule pose", () => {
    const next = withPiece(drawn, frog);
    const { x, y } = frogTarget(frog);
    expect(next).toMatchObject({ kind: "I", rotation: 1, x, y, swing: 0, glideX: null });
  });

  it("carries on easing the depth and drawing the hop, bonk, drop and leap", () => {
    const next = withPiece(drawn, frog);
    expect(next).toMatchObject({
      depth: drawn.depth,
      level: drawn.level,
      lift: drawn.lift,
      glideDepth: drawn.glideDepth,
      moveHops: drawn.moveHops,
      hopAt: drawn.hopAt,
      bonk: drawn.bonk,
      bonkMotion: drawn.bonkMotion,
      drop: drawn.drop,
      leap: drawn.leap,
    });
  });
});

describe("the drawn frog's moves", () => {
  const stride = moveDuration(TUNING);
  const start: RuleFrog = { kind: "T", col: 2, rotation: 0, depth: 3, latestHop: null };
  const resting: DrawnFrog = {
    ...frogTarget(start),
    kind: "T",
    rotation: 0,
    level: 0,
    swing: 0,
    lift: 0,
    glideX: null,
    glideDepth: null,
    moveHops: [],
    seen: { kind: "T", rotation: 0, col: 2, depth: 3 },
    hopAt: null,
    bonk: null,
    bonkMotion: null,
    drop: null,
    leap: null,
  };

  it("tells a slide and a jump from a turn", () => {
    expect(movesSince(resting.seen, { ...start, col: 3 })).toEqual({ slid: true, jumped: false });
    expect(movesSince(resting.seen, { ...start, depth: 4.5 })).toEqual({ slid: false, jumped: true });
    expect(movesSince(resting.seen, { ...start, col: 1, rotation: 1 })).toEqual({ slid: false, jumped: false });
  });

  it("glides from where the frog is drawn to where the rules put it, with a hop", () => {
    const jumped: RuleFrog = { ...start, depth: 4.5, col: 3 };
    const next = seeMoves(resting, jumped, 10, true);
    expect(next.glideDepth).toEqual({ from: 3, to: 4.5, startedAt: 10 });
    expect(next.glideX).toEqual({ from: resting.x, to: frogTarget(jumped).x, startedAt: 10 });
    expect(next.moveHops).toEqual([10]);
    expect(seeMoves(next, jumped, 10.05, true)).toMatchObject({ glideDepth: next.glideDepth, moveHops: [10] });
  });

  it("draws nothing for a move drawn as its own motion, and drops any glide in depth", () => {
    const gliding = seeMoves(resting, { ...start, depth: 4.5 }, 10, true);
    const knocked = seeMoves(gliding, { ...start, depth: 0 }, 10.1, false);
    expect(knocked).toMatchObject({ glideDepth: null, moveHops: [10], seen: { depth: 0 } });
  });

  it("chains held jumps into one flowing motion, never jolting or going back", () => {
    // Four jumps held, one every repeat interval, sampled every millisecond.
    const step = 0.001;
    const jumpsBy = (time: number): number => Math.min(4, Math.floor(time / stride) + 1);
    let drawn = resting;
    const depths: number[] = [];
    const lifts: number[] = [];
    for (let k = 0; k * step < 5 * stride; k++) {
      const time = k * step;
      drawn = seeMoves(drawn, { ...start, depth: 3 + jumpsBy(time) * TUNING.depthStep }, time, true);
      const jump = drawn.glideDepth;
      if (jump !== null) {
        drawn = { ...drawn, depth: glideAt(jump, time, stride) };
        if (arrived(jump, time, stride)) drawn = { ...drawn, glideDepth: null };
      }
      depths.push(drawn.depth);
      lifts.push(moveLift(drawn.moveHops, time, stride));
    }
    const steps = (values: number[]) => values.slice(1).map((value, i) => value - values[i]);
    // Never back, never a leap: the fastest a glide goes is 1.5 times its
    // average speed, so a millisecond carries it no further than that, give
    // or take the sampling.
    const fastest = (1.5 * TUNING.depthStep * step) / stride;
    for (const move of steps(depths)) {
      expect(move).toBeGreaterThanOrEqual(0);
      expect(move).toBeLessThanOrEqual(fastest * 1.01);
    }
    // The hop arc never jumps either: its steepest slope is pi times its height
    // over the move.
    const steepest = (Math.PI * MOVE_HOP_HEIGHT * step) / stride;
    for (const rise of steps(lifts)) expect(Math.abs(rise)).toBeLessThanOrEqual(steepest * 1.01);
    expect(Math.max(...lifts)).toBeCloseTo(MOVE_HOP_HEIGHT, 3);
    expect(depths.at(-1)).toBeCloseTo(3 + 4 * TUNING.depthStep, 2);
  });

  it("lifts the frog by the higher of a held slide's hop and a held jump's", () => {
    expect(moveLift([0, stride / 4], stride / 2, stride)).toBeCloseTo(MOVE_HOP_HEIGHT * Math.sin(Math.PI / 2));
    expect(moveLift([0], stride, stride)).toBe(0);
    expect(moveLift([], 1, stride)).toBe(0);
  });
});
