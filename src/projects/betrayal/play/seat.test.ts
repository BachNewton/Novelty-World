import { describe, expect, it } from "vitest";
import { ENGINE } from "../game";
import { viewFor } from "../engine/view";
import { choose, spectator, testGame } from "../testing";
import { due, nextHolder } from "./seat";

describe("hot-seat", () => {
  it("is due to the seat whose turn it is, and passes on when the turn ends", () => {
    const state = testGame();
    expect(due(spectator(state))).toBe(0);
    expect(due(spectator(choose(state, "End your turn")))).toBe(1);
  });

  it("reads the same from any seat's view", () => {
    const state = testGame();
    for (const seat of [0, 1, 2]) expect(due(viewFor(ENGINE, state, seat))).toBe(0);
  });

  it("is due to the first seat of a ready wait yet to confirm", () => {
    const state = testGame({ haunt: { number: 13, revealer: 1 } });
    const pending = state.pending;
    if (pending?.type !== "ready") throw new Error("Haunt 13 should open on a ready wait");
    expect(due(spectator(state))).toBe(pending.seats[0]);
  });

  it("keeps the device with its holder when nothing is pending", () => {
    const view = { ...spectator(testGame()), pending: null };
    expect(due(view)).toBeNull();
    expect(nextHolder(2, view)).toBe(2);
  });
});
