import { describe, expect, it } from "vitest";
import { playGame } from "../../eval/runner";
import { riskBot } from "..";

const GD = ["gd-defensive", "gd-continental", "gd-aggressive", "gd-stacker"];

/** Seats at `players`: GD's personas round the table, with greedy in one seat. */
function seating(players: number): string[] {
  return Array.from({ length: players }, (_, seat) => (seat === players - 1 ? "greedy" : GD[seat % GD.length]));
}

describe("GD's Expert bots", () => {
  // The runner throws on any move the engine refuses: an illegal move is a bug, never replaced.
  it.each([3, 4, 5, 6])("play whole games at %i players with every move legal", (players) => {
    const labels = seating(players);
    const game = playGame({ seed: `gd-legal-${players}`, bots: labels.map(riskBot), maxTurns: 600 });
    expect(game.decisions).toBeGreaterThan(100);
  });
});
