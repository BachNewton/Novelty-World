import { describe, expect, it } from "vitest";
import { MOVE_HOP_HEIGHT, moveDuration } from "../frog/moves";
import { applyAction, createRun, hopHeight, playTo, pressHeld, type PlacedFrog, type RuleRow, type Run } from "../run";
import { frameTicks, toSeconds } from "../ticks";
import { TUNING } from "../tuning";
import {
  BONK_DURATION,
  amongVehicles,
  arrived,
  bonkPose,
  drawnRuleFrog,
  followDepth,
  frogTarget,
  glideAt,
  moveLift,
  movesSince,
  seeBonk,
  seeMoves,
  snapped,
  withHop,
  withPiece,
  type DrawnFrog,
} from "./drawn-frog";

describe("a gate's new piece in the drawn frog", () => {
  // Mid-jump, mid-hop, swinging out of a turn and knocked back by a bonk,
  // after the drop: everything a piece change could catch in progress.
  const drawn: DrawnFrog = {
    player: 0,
    kind: "L",
    rotation: 0,
    x: 3.4,
    y: 1,
    depth: 6.2,
    level: 0,
    swing: 0.3,
    lift: 0.6,
    rodeUntil: null,
    glideX: { from: 3, to: 3.5, startedAt: 4.1 },
    glideDepth: { from: 5, to: 6.5, startedAt: 4.1 },
    moveHops: [4.1],
    seen: { kind: "L", rotation: 0, col: 3, depth: 6.5 },
    hopAt: 4,
    bonk: { tick: 300, depth: 8 },
    bonkMotion: { from: 8, to: 5, startedAt: 3 },
    drop: { fromDepth: -1, fromLevel: 2, startedAt: 1, landed: true },
    leap: null,
  };
  const frog: PlacedFrog = { kind: "I", col: 4, rotation: 1, depth: 8, latestHop: { startedAt: 4, landedAt: null } };

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
  const start: PlacedFrog = { kind: "T", col: 2, rotation: 0, depth: 3, latestHop: null };
  const resting: DrawnFrog = {
    ...frogTarget(start),
    player: 0,
    kind: "T",
    rotation: 0,
    level: 0,
    swing: 0,
    lift: 0,
    rodeUntil: null,
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
    const jumped: PlacedFrog = { ...start, depth: 4.5, col: 3 };
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

// The drawn frog frame by frame with the real rules, as the scene steps it:
// the rules run the frame's ticks, then the drawn frog sees a bonk and the
// moves, and follows in depth and hop, on the drawing's clock. The frames
// are shorter than a tick, so some run none, and the drawing must still move
// on smoothly between ticks. The camera follows the drawn depth.
interface Frame {
  depth: number;
  lift: number;
  among: boolean;
  up: boolean;
}

const FRAME = 1 / 120;
const stride = moveDuration(TUNING);
// The fastest the drawn frog may go in a frame: a glide peaks at 1.5 times
// its average speed, and a knock-back starts at twice its own, over at most
// the knock-back's distance.
const GLIDE_FRAME = (1.5 * TUNING.depthStep * FRAME) / stride;
const KNOCK_BACK_FRAME = (2 * TUNING.bonkKnockback * TUNING.depthStep * FRAME) / BONK_DURATION;

// One row of `row` with its front `gap` ahead of the start, and the rest of
// the stream out of reach, with the frog dropped onto the road at depth 5.
function runWith(row: Omit<RuleRow, "gap">, gap: number): Run {
  const start = createRun((index) => ({ ...row, gap: index === 0 ? gap : 1e6 }), TUNING);
  return { ...start, droppedAt: 0, depth: 5 };
}

// Plays `seconds` from `first`, acting with `act` before the drawn frog looks
// each frame.
function drive(first: Run, seconds: number, act: (run: Run) => Run = (run) => run): { run: Run; frames: Frame[] } {
  let run = first;
  let carry = 0;
  let drawn = snapped(run, 0);
  const frames: Frame[] = [];
  for (let k = 1; k * FRAME < seconds; k++) {
    const due = frameTicks(carry, FRAME, TUNING.maxFrameDelta);
    carry = due.carry;
    run = act(playTo(run, run.tick + due.ticks));
    const now = toSeconds(run.tick + carry);
    const bonked = run.lastBonk !== drawn.bonk;
    drawn = seeMoves(seeBonk(drawn, run), drawnRuleFrog(run, drawn), now, !bonked);
    const pose = bonkPose(drawn.bonkMotion, run, now);
    if (pose === null) drawn = { ...drawn, bonkMotion: null };
    drawn = withHop(run, followDepth(drawn, run, now, pose, FRAME), now);
    frames.push({ depth: drawn.depth, lift: drawn.lift, among: amongVehicles(run, drawn.depth), up: hopHeight(run.frogs[0]) === 1 });
  }
  return { run, frames };
}

// Acts once, on the first frame at or after `time`.
function at(time: number, action: (run: Run) => Run): (run: Run) => Run {
  let done = false;
  return (run) => {
    if (done || toSeconds(run.tick) < time) return run;
    done = true;
    return action(run);
  };
}

const steps = (values: number[]) => values.slice(1).map((value, i) => value - values[i]);

// The camera follows the drawn depth, so it never steps further in a frame
// than the drawn frog's own glides and knock-backs.
function expectSmooth(frames: readonly Frame[], fastest: number): void {
  for (const move of steps(frames.map((frame) => frame.depth))) expect(Math.abs(move)).toBeLessThanOrEqual(fastest * 1.01);
}

describe("the drawn frog riding a row and jumping off it", () => {
  // A low car across every lane, three long, its front a unit ahead of the
  // frog: the frog must hop to pass it, and rides it once passed.
  const lowCar = {
    solids: [{ cells: Array.from({ length: TUNING.corridorCols }, (_, col) => ({ col, row: 0 })), length: 3 }],
    gates: [],
  };
  // Riding from when the car arrives, the first jump forward keeps the frog
  // on it and the second carries it clear, where the rules land it, while the
  // drawn frog is still gliding after it among the car.
  const firstJump = 0.8;
  const secondJump = firstJump + stride;
  const forward = (run: Run) => applyAction(run, "forward");

  function play() {
    const first = at(firstJump, forward);
    const second = at(secondJump, forward);
    return drive(applyAction(runWith(lowCar, 6), "hop"), 2.5, (run) => second(first(run)));
  }

  it("lands by the rules while the drawn frog is still among the car", () => {
    const { run, frames } = play();
    expect(run.walls[0].passed).toBe(true);
    expect(run.depth).toBe(5 + 2 * TUNING.depthStep);
    expect(toSeconds(run.frogs[0].latestHop?.landedAt ?? 0)).toBeCloseTo(secondJump, 1);
    expect(frames.some((frame) => !frame.up && frame.among)).toBe(true);
  });

  it("glides on, never snapping forward, so the camera following it never jumps", () => {
    const { frames } = play();
    for (const move of steps(frames.map((frame) => frame.depth))) expect(move).toBeGreaterThanOrEqual(0);
    expectSmooth(frames, GLIDE_FRAME);
    expect(frames.at(-1)?.depth).toBeCloseTo(5 + 2 * TUNING.depthStep);
  });

  it("rides on up until the car has gone by it too, then falls smoothly along the arc", () => {
    const { frames } = play();
    for (const frame of frames) if (frame.among) expect(frame.lift).toBe(1);
    // The arc's steepest slope is its overshoot times pi over the airtime.
    const steepest = (1.3 * Math.PI * FRAME) / TUNING.hopAirtime;
    for (const change of steps(frames.map((frame) => frame.lift))) expect(Math.abs(change)).toBeLessThanOrEqual(steepest * 1.01);
    expect(frames.at(-1)?.lift).toBe(0);
  });
});

describe("the drawn frog bonked while it moves", () => {
  // A row filling the whole face, two long: the frog never fits it.
  const solid = {
    solids: [
      {
        cells: Array.from({ length: TUNING.corridorCols * TUNING.wallRows }, (_, i) => ({
          col: i % TUNING.corridorCols,
          row: Math.floor(i / TUNING.corridorCols),
        })),
        length: 2,
      },
    ],
    gates: [],
  };
  const forward = (run: Run) => applyAction(run, "forward");
  const fastest = Math.max(GLIDE_FRAME, KNOCK_BACK_FRAME);

  it("knocks a frog standing still back smoothly", () => {
    const { run, frames } = drive(runWith(solid, 6), 1);
    expect(toSeconds(run.lastBonk?.tick ?? 0)).toBeCloseTo(0.4, 1);
    expectSmooth(frames, fastest);
    expect(frames.at(-1)?.depth).toBeCloseTo(run.depth);
  });

  it("knocks a jump forward into a row's face back from where the frog is drawn, short of the face", () => {
    // From 5, the jump at 0.1 s reaches the face at 5.95 and bonks.
    const { run, frames } = drive(runWith(solid, 6.2), 1, at(0.1, forward));
    expect(run.lastBonk?.depth).toBeGreaterThan(5.5);
    expect(Math.max(...frames.map((frame) => frame.depth))).toBeLessThanOrEqual(5);
    expectSmooth(frames, fastest);
    expect(frames.at(-1)?.depth).toBeCloseTo(run.depth);
  });

  it("knocks a frog back from mid-glide when a row arrives before the glide is done", () => {
    // The jump at 0.5 s glides from 5 to 6.5; the row reaches 6.5 at 0.6 s.
    const { run, frames } = drive(runWith(solid, 8), 1, at(0.5, forward));
    expect(toSeconds(run.lastBonk?.tick ?? 0)).toBeCloseTo(0.6, 1);
    expect(Math.max(...frames.map((frame) => frame.depth))).toBeLessThan(6.5);
    expectSmooth(frames, fastest);
    expect(frames.at(-1)?.depth).toBeCloseTo(run.depth);
  });

  it("keeps a held jump smooth through the bonk and the jumps after it, mid-knock-back", () => {
    const { run, frames } = drive(runWith(solid, 9), 3, at(0.05, (r) => pressHeld(r, "forward")));
    expect(run.lastBonk).not.toBeNull();
    expectSmooth(frames, fastest);
  });

  it("sees a bonk the rules made afresh, as a correction re-running them does, as the same bonk", () => {
    const { run } = drive(runWith(solid, 6), 1);
    const bonk = run.lastBonk;
    if (bonk === null) throw new Error("the row didn't bonk the frog");
    const drawn = seeBonk(snapped(run, 0), { ...run, lastBonk: null });
    const seen = seeBonk(drawn, run);
    expect(seeBonk(seen, { ...run, lastBonk: { ...bonk } })).toBe(seen);
    expect(seeBonk(seen, { ...run, lastBonk: { ...bonk, tick: bonk.tick + 1 } })).not.toBe(seen);
  });
});
