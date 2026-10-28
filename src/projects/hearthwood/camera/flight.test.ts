import { describe, expect, it } from "vitest";
import { FLY_CLEARANCE, flightFrom, stepFlight, type FlyInput } from "./fly-camera";

describe("the free camera", () => {
  const flat = () => 0;
  const still: FlyInput = { move: { x: 0, y: 0 }, rise: 0, speed: 10, turn: { yaw: 0, pitch: 0 }, turnRate: { yaw: 0, pitch: 0 } };
  const level = { x: 0, y: 50, z: 0, yaw: 0, pitch: 0 };

  it("takes up the way a camera already looks", () => {
    const flight = flightFrom({ x: 1, y: 2, z: 3 }, { x: 1, y: 0, z: 0 });
    expect(flight).toMatchObject({ x: 1, y: 2, z: 3, pitch: 0 });
    expect(flight.yaw).toBeCloseTo(Math.PI / 2);
  });

  it("flies ahead the way it looks at its speed", () => {
    const flight = stepFlight(level, { ...still, move: { x: 0, y: 1 } }, flat, 0.5);
    expect(flight.z).toBeCloseTo(5);
    expect(flight.x).toBeCloseTo(0);
  });

  it("dives when it looks down and flies ahead", () => {
    const flight = stepFlight({ ...level, pitch: -Math.PI / 4 }, { ...still, move: { x: 0, y: 1 } }, flat, 1);
    expect(flight.y).toBeCloseTo(50 - 10 * Math.SQRT1_2);
  });

  it("slides sideways along the level, to the right for a push right", () => {
    const flight = stepFlight({ ...level, pitch: -1 }, { ...still, move: { x: 1, y: 0 } }, flat, 1);
    expect(flight.x).toBeCloseTo(-10);
    expect(flight.y).toBeCloseTo(50);
  });

  it("rises and sinks straight up and down", () => {
    expect(stepFlight(level, { ...still, rise: 1 }, flat, 1).y).toBeCloseTo(60);
    expect(stepFlight(level, { ...still, rise: -1 }, flat, 1).y).toBeCloseTo(40);
  });

  it("never goes below the ground", () => {
    const flight = stepFlight(level, { ...still, rise: -1, speed: 1000 }, () => 30, 1);
    expect(flight.y).toBe(30 + FLY_CLEARANCE);
  });

  it("looks round as first person does", () => {
    const flight = stepFlight(level, { ...still, turn: { yaw: 0.2, pitch: 0.1 } }, flat, 0);
    expect(flight.yaw).toBeCloseTo(-0.2);
    expect(flight.pitch).toBeCloseTo(-0.1);
  });
});
