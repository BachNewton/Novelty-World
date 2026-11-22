import { beforeAll, describe, expect, it } from "vitest";
import { gripAt, slipForGrip } from "../sim/car";
import { limitsOn } from "../sim/car-limits";
import type { CarState } from "../sim/car-state";
import { CARS } from "../sim/cars";
import { Drive, initPhysics } from "../sim/drive";
import { RoadLine } from "../sim/road-net";
import { PAD_M, padPoint, testPad } from "../sim/test-pad";
import { STEP_S } from "../sim/tuning";
import { carPlan, shapeOf } from "./car-plan";
import { LineDriver } from "./driver";
import { RACER_SKILL } from "./skill";
import { planSpeeds, type PacePlan } from "./speed-plan";

/*
 * The two things that keep the driver on its line at the limit, each of which
 * a racer ran off the road without: it holds a fast bend on its line, where
 * steering along the car's nose hangs a metre outside it, and its pedals get
 * only what the turn leaves of the tyres.
 */

const CAR = "skerry-gt";

beforeAll(initPhysics);

describe("the driver in a fast bend", () => {
  it("holds its line round a circle at the plan's speed, neither hanging outside it nor cutting in", () => {
    const radius = 120;
    const centre = { x: PAD_M / 2, z: -PAD_M / 2 };
    // Clockwise from the circle's north, so it starts facing east and turns right, a little over two laps.
    const points: number[] = [];
    for (let along = 0; along <= 2.2 * 2 * Math.PI * radius; along += 4) points.push(centre.x + radius * Math.sin(along / radius), 0, centre.z - radius * Math.cos(along / radius));
    const line = new RoadLine(Float32Array.from(points));
    const plan = carPlan(CAR, "dry", "summer", { pavedAt: () => true }, shapeOf(line), RACER_SKILL, 0);
    const drive = new Drive(testPad("asphalt"), padPoint(centre.x, centre.z - radius), CAR);
    const driver = new LineDriver(line, plan, 0);
    const outside: number[] = [];
    for (let step = 0; step < 30 / STEP_S; step++) {
      const state = drive.stateAt(1);
      drive.step(driver.input(state));
      // Once it is up to the bend's speed and settled.
      if (step * STEP_S > 14) outside.push(Math.hypot(state.position[0] - centre.x, state.position[2] - centre.z) - radius);
    }
    drive.dispose();
    const mean = outside.reduce((sum, each) => sum + each, 0) / outside.length;
    expect(Math.abs(mean)).toBeLessThan(0.15);
    expect(Math.max(...outside.map(Math.abs))).toBeLessThan(0.25);
  });
});

describe("the driver's pedals", () => {
  const EAST = -Math.PI / 2;
  const line = new RoadLine(Float32Array.from([0, 0, 0, 1000, 0, 0]));
  const plan = planSpeeds({ bends: new Float64Array(251), stepM: 4, limitsAt: () => limitsOn(CAR, "dry", "asphalt"), cornerShare: 0.8 });
  /** A car on the line facing east at a speed, travelling an angle to the right of where it points: both axles at that slip. */
  const carSlipping = (slip: number, speedMS = 20): CarState => ({
    car: CAR,
    position: [500, 0.5, 0],
    rotation: [0, Math.sin(EAST / 2), 0, Math.cos(EAST / 2)],
    velocity: [speedMS * Math.cos(slip), 0, speedMS * Math.sin(slip)],
    spin: [0, 0, 0],
    steer: 0,
    suspension: [0, 0, 0, 0],
    roll: [0, 0, 0, 0],
    lamps: { head: true, brake: false, reverse: false },
  });
  /** The same straight in a braking zone: the plan slows hard through where the car stands, to the car's own speed a moment ahead. */
  const braking: PacePlan = { ...plan, speeds: Float64Array.from({ length: 251 }, (_, sample) => Math.sqrt(Math.max(0, 20 * 20 - 2 * 12 * (sample * 4 - 506)))) };
  const pedals = (slip: number, holdUnderMS: number | null = null, on = plan) => new LineDriver(line, on, 500).input(carSlipping(slip), 0, holdUnderMS);
  const { peakSlip } = CARS[CAR].grip;

  it("has the whole of each pedal while the tyres give nothing sideways", () => {
    expect(pedals(0).throttle).toBeGreaterThan(0.95);
    expect(pedals(0, null, braking).brake).toBeGreaterThan(0.9);
  });

  it("has a share of each while the tyres are part way to their grip sideways", () => {
    const { throttle } = pedals(peakSlip / 2);
    expect(throttle).toBeGreaterThan(0.2);
    expect(throttle).toBeLessThan(0.95);
    const { brake } = pedals(peakSlip / 2, null, braking);
    expect(brake).toBeGreaterThan(0.2);
    expect(brake).toBeLessThan(0.9);
  });

  it("pushes neither way while the tyres are sliding: no brake, and only the throttle that stops the engine holding the car back", () => {
    expect(pedals(2 * peakSlip).throttle).toBeLessThan(0.15);
    expect(pedals(2 * peakSlip, null, braking).brake).toBe(0);
  });

  it("presses no harder than the plan slows where the car holds its speed: a braking zone is one press, not full and nothing by turns", () => {
    const gentle: PacePlan = { ...plan, speeds: Float64Array.from({ length: 251 }, (_, sample) => Math.sqrt(Math.max(0, 20 * 20 - 2 * 3 * (sample * 4 - 506)))) };
    const { brake, throttle } = pedals(0, null, gentle);
    expect(throttle).toBe(0);
    expect(brake).toBeGreaterThan(0.1);
    expect(brake).toBeLessThan(0.5);
  });

  it("has the whole brake when well over the speed it is to hold, sliding or not", () => {
    expect(pedals(2 * peakSlip, 5).brake).toBeGreaterThan(0.9);
  });
});

describe("the driver held to a stand", () => {
  it("stops behind what holds it and stays there, and from rolling backwards too: a brake held on at a stand is reverse", () => {
    const z = -PAD_M / 2;
    const line = new RoadLine(Float32Array.from([200, 0, z, PAD_M - 200, 0, z]));
    const plan = carPlan(CAR, "dry", "summer", { pavedAt: () => true }, shapeOf(line), RACER_SKILL, 0);
    const drive = new Drive(testPad("asphalt"), padPoint(200, z), CAR);
    const driver = new LineDriver(line, plan, 0);
    const run = (seconds: number, holdUnderMS: number | null) => {
      const east: number[] = [];
      for (let step = 0; step < seconds / STEP_S; step++) {
        drive.step(driver.input(drive.stateAt(1), 0, holdUnderMS));
        east.push(drive.stateAt(1).position[0]);
      }
      return east;
    };
    run(6, null);
    // Held to a stand from speed: stopped within a few seconds, and no further back ten seconds on.
    const stood = run(14, 0);
    expect(Math.abs(stood[stood.length - 1] - stood[Math.round(4 / STEP_S)])).toBeLessThan(0.3);
    expect(drive.engine().reversing).toBe(false);
    // Backed out, as its recovery does, and held to a stand again: it stops, where the brake pedal would back it away for good.
    for (let step = 0; step < 2 / STEP_S; step++) drive.step({ throttle: 0, brake: 1, steer: 0, handbrake: false });
    const back = run(6, 0);
    expect(Math.abs(back[back.length - 1] - back[Math.round(3 / STEP_S)])).toBeLessThan(0.3);
    // And let go, it drives on.
    const on = run(4, null);
    expect(on[on.length - 1] - back[back.length - 1]).toBeGreaterThan(10);
    drive.dispose();
  });
});

describe("the tyre's curve", () => {
  it("is read the same both ways: the slip for a share of the grip gives that share", () => {
    const tyre = { peakSlip: 0.13, slideShare: 0.7 };
    for (const share of [0, 0.2, 0.5, 0.85, 1]) expect(gripAt(tyre, slipForGrip(share) * tyre.peakSlip)).toBeCloseTo(share, 6);
  });
});
