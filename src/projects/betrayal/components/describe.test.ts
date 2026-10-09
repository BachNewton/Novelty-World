import { describe, expect, it } from "vitest";
import { ENGINE } from "../game";
import { choose, spectator, testGame } from "../testing";
import { logGroups, logLines } from "./describe";

describe("logGroups", () => {
  it("groups the log into the setup and then one stretch per turn", () => {
    const start = testGame();
    const next = choose(start, "End your turn");
    const lines = [
      ...logLines(ENGINE, spectator(start)),
      ...logLines(ENGINE, spectator(next)),
    ];
    const groups = logGroups(spectator(next), lines);
    expect(groups.map((g) => g.title)).toEqual([
      "Setup",
      "Turn 1: Player 1 (Zoe Ingstrom)",
      "Turn 2: Player 2 (Ox Bellows)",
    ]);
    expect(groups[1].seat).toBe(0);
  });

  it("starts a stretch for the haunt", () => {
    const state = testGame({ haunt: { number: 13, revealer: 0 } });
    const view = spectator(state);
    const groups = logGroups(view, logLines(ENGINE, view));
    expect(groups.at(-1)?.title).toBe("The haunt");
  });
});
