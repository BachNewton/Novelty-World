import { describe, expect, it } from "vitest";
import { playGame } from "../../eval/runner";
import { riskBot } from "..";

const GD = ["gd-defensive", "gd-continental", "gd-aggressive", "gd-stacker"];

/** Seats for game `i`: GD's personas round the table, with greedy in one seat. */
function seating(i: number, players: number): string[] {
  return Array.from({ length: players }, (_, seat) => (seat === i % players ? "greedy" : GD[(i + seat) % GD.length]));
}

// Rarer paths only many games reach: forced trades after an elimination, Stacker turning
// Aggressive, stacks big enough for the estimated odds, near-empty boards.
describe("GD's Expert bots over many seeded games", () => {
  it("never make an illegal move", () => {
    let decisions = 0;
    for (let i = 0; i < 40; i++) {
      const players = 3 + (i % 4);
      decisions += playGame({ seed: `gd-sweep-${i}`, bots: seating(i, players).map(riskBot), maxTurns: 600 }).decisions;
    }
    expect(decisions).toBeGreaterThan(10_000);
    // Measured at about 45 seconds.
  }, 120_000);
});
