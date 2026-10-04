import { describe, expect, it } from "vitest";
import { ENGINE } from "./game";
import { decodeGame, encodeGame, replay, type SharedGame } from "./share";
import { offered, pendingDecision, waitingOn } from "./testing";
import type { Action } from "./types";

const shared: SharedGame = {
  game: {
    seed: "share-seed",
    sets: ["base"],
    seats: [
      { name: "Zoë", character: "zoe-ingstrom" },
      { name: "Ox", character: "ox-bellows" },
      { name: "Père", character: "father-rhinehardt" },
    ],
    today: { month: 3, day: 1 },
    scenario: {
      first: 1,
      decks: { item: ["axe"] },
      explorers: [{ seat: 0, room: "chapel", clips: { might: 6 }, cards: ["bell"] }],
    },
  },
  actions: [],
};

describe("a shared game", () => {
  it("survives encoding, accents and all, as URL-safe text", () => {
    const code = encodeGame(shared);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeGame(code)).toEqual(shared);
  });

  it("replays to exactly the same game", () => {
    let [state] = replay(ENGINE, shared, "a");
    const actions: Action[] = [];
    for (let i = 0; i < 12 && state.pending?.type === "decision"; i++) {
      const choice = offered(state)[i % offered(state).length].choice;
      const act: Action = {
        kind: "choose",
        decision: pendingDecision(state).id,
        seat: waitingOn(state),
        choice,
      };
      actions.push(act);
      state = replay(ENGINE, { ...shared, actions }, "a").at(-1) ?? state;
    }
    const again = replay(
      ENGINE,
      decodeGame(encodeGame({ ...shared, actions })),
      "a",
    );
    expect(again).toHaveLength(actions.length + 1);
    expect(again.at(-1)).toEqual(state);
  });

  it("fails loudly on a code it can't read", () => {
    expect(() => decodeGame("not a code!")).toThrow(/isn't a shared game/);
    expect(() =>
      decodeGame(encodeGame({ ...shared, game: { ...shared.game, seed: 4 as unknown as string } })),
    ).toThrow(/game.seed/);
  });

  it("names the action a replay rejects", () => {
    expect(() =>
      replay(
        ENGINE,
        { ...shared, actions: [{ kind: "ready", wait: "w9", seat: 0 }] },
        "a",
      ),
    ).toThrow(/Action 1/);
  });
});
