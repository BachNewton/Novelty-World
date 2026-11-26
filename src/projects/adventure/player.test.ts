import { describe, expect, it } from "vitest";
import { JUMP_HEIGHT, STANDING, stepPlayer, type FloorBelow, type Move, type Player } from "./player";

const STILL: Move = { x: 0, z: 0, sprint: false, jump: false };
const AHEAD: Move = { ...STILL, z: 1 };
const DT = 1 / 60;

/** Flat ground everywhere. */
const FLAT: FloorBelow = (_x, _z, top) => (top >= 0 ? 0 : null);

/** Ground at `height` from z = 1 on, flat before it. */
const LEDGE = (height: number): FloorBelow => (_x, z, top) => {
  const ground = z >= 1 ? height : 0;
  return ground <= top ? ground : null;
};

/** Step until `done`, or a few seconds, returning every state along the way. */
function run(from: Player, move: (step: number) => Move, done: (player: Player) => boolean, floor = FLAT): Player[] {
  const states = [from];
  for (let step = 0; step < 600 && !done(states[states.length - 1]); step++) states.push(stepPlayer(states[states.length - 1], move(step), DT, 20, floor));
  return states;
}

const last = (states: Player[]): Player => states[states.length - 1];

describe("jumping", () => {
  it("rises to the jump's height, falls, and lands standing", () => {
    const states = run(STANDING, (step) => ({ ...STILL, jump: step === 0 }), (p) => p.gait === "idle" && p !== STANDING);
    const peak = Math.max(...states.map((p) => p.y));
    expect(peak).toBeCloseTo(JUMP_HEIGHT, 1);
    expect(states.some((p) => p.gait === "jump")).toBe(true);
    expect(states.some((p) => p.gait === "fall")).toBe(true);
    expect(last(states)).toMatchObject({ y: 0, rise: 0, airborne: false, gait: "idle" });
  });

  it("never jumps again from the air", () => {
    const states = run(STANDING, () => ({ ...STILL, jump: true }), (p) => p.gait === "fall");
    const rises = states.map((p) => p.rise);
    // Once in the air, upward speed only ever falls.
    for (let i = 2; i < rises.length; i++) expect(rises[i]).toBeLessThan(rises[i - 1]);
  });
});

describe("the ground underfoot", () => {
  it("walks down into a dip and up out of it, never leaving the ground", () => {
    const dip: FloorBelow = (_x, z, top) => {
      const ground = z >= 1 && z < 2 ? -0.05 : 0;
      return ground <= top ? ground : null;
    };
    const states = run(STANDING, () => AHEAD, (p) => p.z >= 3, dip);
    expect(states.some((p) => p.y === -0.05)).toBe(true);
    expect(states.every((p) => !p.airborne && p.gait !== "fall")).toBe(true);
    expect(last(states).y).toBe(0);
  });

  it("steps up a step, but is stopped by a ledge too tall to step onto", () => {
    expect(last(run(STANDING, () => AHEAD, (p) => p.z >= 2, LEDGE(0.2))).y).toBe(0.2);
    const stopped = run(STANDING, () => AHEAD, (p) => p.z >= 2, LEDGE(0.45));
    expect(last(stopped).z).toBeLessThan(1);
    expect(last(stopped).y).toBe(0);
  });

  it("jumps up onto a ledge too tall to step onto", () => {
    const states = run(STANDING, (step) => ({ ...AHEAD, jump: step === 20 }), (p) => p.z >= 2 && !p.airborne, LEDGE(0.45));
    expect(last(states)).toMatchObject({ y: 0.45, airborne: false });
  });

  it("falls off an edge too deep to step down, and lands below", () => {
    const high: Player = { ...STANDING, y: 1 };
    const cliff: FloorBelow = (_x, z, top) => {
      const ground = z < 1 ? 1 : 0;
      return ground <= top ? ground : null;
    };
    const states = run(high, () => AHEAD, (p) => p.z >= 2 && !p.airborne, cliff);
    expect(states.some((p) => p.gait === "fall")).toBe(true);
    expect(last(states)).toMatchObject({ y: 0, airborne: false });
  });
});
