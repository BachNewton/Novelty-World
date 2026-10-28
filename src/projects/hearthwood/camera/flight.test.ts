import { describe, expect, it } from "vitest";
import { FLY_CLEARANCE, lookDirection, PITCH_LIMIT, stepFlight, turnLook, type FlyInput } from "./flight";

describe("the free camera", () => {
  const flat = () => 0;
  const still: FlyInput = { move: { x: 0, y: 0 }, rise: 0, speed: 10, turn: { yaw: 0, pitch: 0 }, turnRate: { yaw: 0, pitch: 0 } };
  const level = { x: 0, y: 50, z: 0, yaw: 0, pitch: 0 };

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

  it("never looks past straight up or down", () => {
    expect(turnLook(level, { yaw: 0, pitch: -10 }, still.turnRate, 0).pitch).toBe(PITCH_LIMIT);
    expect(turnLook(level, { yaw: 0, pitch: 10 }, still.turnRate, 0).pitch).toBe(-PITCH_LIMIT);
  });

  it("looks along +z at yaw 0, +x a quarter turn on", () => {
    expect(lookDirection({ yaw: 0, pitch: 0 })).toEqual({ x: 0, y: 0, z: 1 });
    const turned = lookDirection({ yaw: Math.PI / 2, pitch: 0 });
    expect(turned.x).toBeCloseTo(1);
    expect(turned.z).toBeCloseTo(0);
  });

  it("turns right and looks down for a drag right and down, as the screen reads", () => {
    const flight = stepFlight(level, { ...still, turn: { yaw: 0.2, pitch: 0.1 } }, flat, 0);
    expect(flight.yaw).toBeCloseTo(-0.2);
    expect(flight.pitch).toBeCloseTo(-0.1);
  });
});
