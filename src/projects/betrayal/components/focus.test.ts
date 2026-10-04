import { describe, expect, it } from "vitest";
import { ENGINE } from "../game";
import { choose, offered, spectator, testGame, waitingOn } from "../testing";
import { apply } from "../engine/step-loop";
import { viewFor } from "../engine/view";
import { logGroups, logLines } from "./describe";
import { boardFocus, NO_FOCUS } from "./focus";

const focusOf = (state: ReturnType<typeof testGame>) =>
  boardFocus(viewFor(ENGINE, state, waitingOn(state)));

describe("boardFocus", () => {
  it("highlights the rooms a turn can move to and the doorways it can explore", () => {
    const state = testGame();
    const focus = focusOf(state);
    const moves = offered(state).filter((c) => c.label.startsWith("Move to"));
    expect(focus.rooms.size).toBe(moves.length);
    const [room, action] = [...focus.rooms][0];
    if (!action) throw new Error(`No single action for ${room}`);
    expect(apply(ENGINE, state, action).ok).toBe(true);
    expect(focus.doorways.length).toBe(
      offered(state).filter((c) => c.label.startsWith("Explore")).length,
    );
  });

  it("highlights nothing for a seat the decision isn't put to", () => {
    const state = testGame();
    expect(boardFocus(viewFor(ENGINE, state, 1))).toEqual(NO_FOCUS);
  });

  it("shows where a discovered room goes", () => {
    // Three doors, so it can face more than one way and the engine asks.
    const state = choose(testGame({ stack: ["game-room"] }), "Explore");
    expect(state.pending?.type === "decision" && state.pending.kind).toBe("rotation");
    const focus = focusOf(state);
    expect(focus.cells).toHaveLength(1);
    expect(focus.cells[0].tile).toBe("game-room");
  });
});

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
