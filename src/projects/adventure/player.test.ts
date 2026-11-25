import { describe, expect, it } from "vitest";
import { JUMP_HEIGHT, STANDING, stepPlayer, type Move, type Player } from "./player";

const STILL: Move = { x: 0, z: 0, sprint: false, jump: false };
const DT = 1 / 60;

/** Step until `done`, or a few seconds, returning every state along the way. */
function run(from: Player, move: (step: number) => Move, done: (player: Player) => boolean): Player[] {
  const states = [from];
  for (let step = 0; step < 600 && !done(states[states.length - 1]); step++) states.push(stepPlayer(states[states.length - 1], move(step), DT, 20));
  return states;
}

describe("jumping", () => {
  it("rises to the jump's height, falls, and lands standing", () => {
    const states = run(STANDING, (step) => ({ ...STILL, jump: step === 0 }), (p) => p.gait === "idle" && p !== STANDING);
    const peak = Math.max(...states.map((p) => p.y));
    expect(peak).toBeCloseTo(JUMP_HEIGHT, 1);
    expect(states.some((p) => p.gait === "jump")).toBe(true);
    expect(states.some((p) => p.gait === "fall")).toBe(true);
    expect(states[states.length - 1]).toMatchObject({ y: 0, rise: 0, gait: "idle" });
  });

  it("never jumps again from the air", () => {
    const states = run(STANDING, () => ({ ...STILL, jump: true }), (p) => p.gait === "fall");
    const rises = states.map((p) => p.rise);
    // Once in the air, upward speed only ever falls.
    for (let i = 2; i < rises.length; i++) expect(rises[i]).toBeLessThan(rises[i - 1]);
  });
});
