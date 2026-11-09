import { describe, expect, it } from "vitest";
import type { Gate, RaceChallenge } from "../challenge/types";
import type { CarState } from "../sim/car-state";
import { RoadLine, type RoadPoint } from "../sim/road-net";
import { STEP_S } from "../sim/tuning";
import { Racer } from "./racer";
import { planSpeeds } from "./speed-plan";
import { limitsOn } from "../sim/car-limits";

/*
 * A racer's recovery, on a straight line east along z = 0 with a car that is
 * moved by hand: stuck against something it backs out, stuck again it presses
 * its own R, and lost or rolled it resets at once; over the finish it drives
 * on and stops at its line's end. The driving itself is the vetting tool's to
 * judge.
 */

const EAST = -Math.PI / 2;
const gate = (x: number): Gate => ({ x, z: 0, heading: EAST, halfWidthM: 10 });
const start = { x: 0, z: 0, heading: EAST };
const RACE: RaceChallenge = { id: "race", kind: "race", tier: "A5", number: "A5.0", title: "", car: "skerry-gt", where: "", waypoints: [], shape: "sprint", ground: "road", laps: 1, gates: [gate(400), gate(800)], grid: [start, start], reserve: [], starts: [start, start], lapM: 800, lineM: 0, lengthM: 800 };
const line = new RoadLine(Float32Array.from([0, 0, 0, 1000, 0, 0]));
const plan = planSpeeds({ curvature: new Float64Array(251), stepM: 4, limitsAt: () => limitsOn("skerry-gt", "dry", "asphalt"), cornerShare: 0.8 });

/** A car standing at a place facing east, moving at a speed. */
const carAt = (x: number, speedMS = 0, upright = true): CarState => ({
  car: "skerry-gt",
  position: [x, 0.5, 0],
  rotation: upright ? [0, Math.sin(EAST / 2), 0, Math.cos(EAST / 2)] : [1, 0, 0, 0],
  velocity: [speedMS, 0, 0],
  spin: [0, 0, 0],
  steer: 0,
  suspension: [0, 0, 0, 0],
  roll: [0, 0, 0, 0],
  lamps: { head: true, brake: false, reverse: false },
});

function racerAt(x: number) {
  const resets: RoadPoint[] = [];
  const racer = new Racer(RACE, line, plan, x, { reset: (road) => resets.push(road) });
  // Through the countdown.
  for (let step = 0; step < 3 / STEP_S + 1; step++) racer.step(carAt(x));
  return { racer, resets };
}

describe("a racer", () => {
  it("drives on when it's getting somewhere", () => {
    const { racer, resets } = racerAt(50);
    let x = 50;
    for (let step = 0; step < 5 / STEP_S; step++) {
      const input = racer.step(carAt(x, 20));
      expect(input.throttle).toBeGreaterThan(0);
      expect(input.brake).toBe(0);
      x += 20 * STEP_S;
    }
    expect(resets).toHaveLength(0);
    expect(racer.record.phase).toBe("driving");
  });

  it("backs out when stuck, tries again, and then presses its own R", () => {
    const { racer, resets } = racerAt(100);
    const stuckFor = (seconds: number) => {
      let reversed = 0;
      for (let step = 0; step < seconds / STEP_S; step++) if (racer.step(carAt(100)).brake === 1) reversed++;
      return reversed;
    };
    // Three seconds of no progress: it backs out for two.
    expect(stuckFor(3.1)).toBeGreaterThan(0);
    expect(racer.record.phase).toBe("reversing");
    expect(racer.record.tries).toBe(1);
    stuckFor(2);
    expect(racer.record.phase).toBe("driving");
    // Stuck again after the second try: a reset to its line, counted.
    stuckFor(3.1);
    expect(racer.record.tries).toBe(2);
    stuckFor(2.1);
    stuckFor(3.1);
    expect(resets).toHaveLength(1);
    expect(resets[0].x).toBeCloseTo(100, 0);
    expect(racer.record.resets).toBe(1);
    expect(racer.record.tries).toBe(0);
  });

  it("resets at once when it has left the road or rolled", () => {
    const lost = racerAt(200);
    lost.racer.step(carAt(200));
    lost.racer.step({ ...carAt(200, 10), position: [200, 0.5, 20] });
    expect(lost.resets).toHaveLength(1);
    const rolled = racerAt(200);
    rolled.racer.step(carAt(200, 10, false));
    expect(rolled.resets).toHaveLength(1);
  });

  it("reads its progress as lines crossed and how near the next, and its finish", () => {
    const { racer } = racerAt(300);
    let x = 300;
    const before = racer.progress;
    for (let step = 0; step < 6 / STEP_S; step++) {
      racer.step(carAt(x, 30));
      x += 30 * STEP_S;
    }
    expect(racer.progress).toBeGreaterThan(before);
    expect(racer.run.players[0].nextGate).toBe(1);
    for (let step = 0; step < 20 / STEP_S && racer.finishedS === null; step++) {
      racer.step(carAt(x, 30));
      x += 30 * STEP_S;
    }
    expect(racer.finishedS).not.toBeNull();
    expect(racer.progress).toBe(2);
  });

  it("resets to before the line it has yet to cross, never past it", () => {
    // Knocked off the road just past the first line at x = 400 without crossing it: its R lands it short of the line.
    const { racer, resets } = racerAt(380);
    racer.step(carAt(380, 20));
    racer.step({ ...carAt(405, 20), position: [405, 0.5, 20] });
    expect(resets).toHaveLength(1);
    expect(resets[0].x).toBeLessThan(400);
    expect(resets[0].x).toBeGreaterThan(380);
    expect(racer.run.players[0].nextGate).toBe(0);
  });

  it("drives on over the finish, and stops at its line's end rather than resetting", () => {
    const { racer, resets } = racerAt(300);
    let x = 300;
    for (let step = 0; step < 30 / STEP_S && racer.finishedS === null; step++) {
      racer.step(carAt(x, 30));
      x += 30 * STEP_S;
    }
    expect(racer.finishedS).not.toBeNull();
    // Over the line it keeps driving, slower.
    const over = racer.step(carAt(x, 30));
    expect(over.brake).toBeGreaterThan(0);
    expect(racer.step(carAt(x, 5)).throttle).toBeGreaterThan(0);
    // At the line's end it brakes to a stop and holds, and never resets.
    for (let step = 0; step < 5 / STEP_S; step++) racer.step(carAt(996, 10));
    expect(racer.step(carAt(996, 10)).brake).toBe(1);
    expect(racer.step(carAt(996, 0)).handbrake).toBe(true);
    for (let step = 0; step < 10 / STEP_S; step++) racer.step(carAt(996, 0));
    expect(resets).toHaveLength(0);
  });
});
