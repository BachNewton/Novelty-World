import { describe, expect, it } from "vitest";
import { ENGINE } from "./game";
import { decodeGame, encodeGame, OutdatedGameError, replay, type SharedGame } from "./share";
import { offered, pendingDecision, waitingOn } from "./testing";
import type { Action } from "./types";

const shared: SharedGame = {
  game: {
    seed: "share-seed",
    sets: ["base"],
    seats: [
      { character: "zoe-ingstrom" },
      { character: "ox-bellows" },
      { character: "father-rhinehardt" },
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
  it("survives encoding as URL-safe text", () => {
    const code = encodeGame(shared);
    expect(code).toMatch(/^v1\.[A-Za-z0-9_-]+$/);
    expect(decodeGame(code)).toEqual(shared);
  });

  it("carries a haunt scenario's sides and roles, secrets included", () => {
    const haunted: SharedGame = {
      ...shared,
      game: {
        ...shared.game,
        scenario: {
          haunt: { number: 14, revealer: 0 },
          sides: [
            { seat: 0, side: "traitor", roles: ["traitor"], knownBy: [0] },
            { seat: 1, side: "heroes" },
          ],
        },
      },
    };
    expect(decodeGame(encodeGame(haunted))).toEqual(haunted);
    const [state] = replay(ENGINE, haunted, "a");
    expect(state.seats[0]).toMatchObject({
      side: "traitor",
      roles: ["traitor"],
      knownBy: [0],
    });
  });

  it("carries the haunt chosen at setup", () => {
    const chosen: SharedGame = { ...shared, game: { ...shared.game, chosenHaunt: 13 } };
    expect(decodeGame(encodeGame(chosen))).toEqual(chosen);
    expect(replay(ENGINE, chosen, "a")[0].chosenHaunt).toBe(13);
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

  it("refuses a code from before codes had a prefix rather than misreplay it", () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({ ...shared, format: 3 }),
    );
    const old = btoa(String.fromCharCode(...bytes));
    expect(() => decodeGame(old)).toThrow(OutdatedGameError);
  });

  it("refuses a code from a newer engine", () => {
    const code = encodeGame(shared).replace(/^v1\./, "v2.");
    expect(() => decodeGame(code)).toThrow(/Unknown shared game format 2/);
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
