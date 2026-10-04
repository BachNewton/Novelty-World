import { describe, expect, it } from "vitest";
import { ENGINE } from "../game";
import { at, choose, explorer, offered, testGame, spectator } from "../testing";
import { placed } from "./board";
import { describeEvent } from "./describe";
import { traitValue } from "./questions";
import { hauntCells, hauntNumbers } from "./scenario";

describe("a scenario", () => {
  it("stacks the decks and the room stack, top first", () => {
    const state = testGame({
      decks: { item: ["axe", "bell"], event: ["angry-being"] },
      stack: ["chasm", "larder"],
    });
    expect(state.decks.item.draw.slice(0, 2)).toEqual(["axe", "bell"]);
    expect(state.decks.event.draw[0]).toBe("angry-being");
    expect(state.board.stack.slice(0, 2)).toEqual(["chasm", "larder"]);
    expect(state.decks.item.draw.filter((c) => c === "axe")).toHaveLength(1);
  });

  it("puts rooms in the house and explorers in them, with chosen traits", () => {
    const state = testGame({
      rooms: ["larder"],
      explorers: [{ seat: 1, room: "chapel", clips: { might: 0, speed: 7 } }],
    });
    expect(placed(state.board, "larder")).toBeDefined();
    expect(placed(state.board, "chapel")).toBeDefined();
    expect(state.board.stack).not.toContain("chapel");
    const ox = explorer(state, 1);
    expect(at(state, 1).room).toBe("chapel");
    expect(ox.traits.clips.might).toBe(0);
    expect(traitValue(ENGINE, state, "ox-bellows", "speed")).toBe(
      ENGINE.catalog.characters["ox-bellows"].tracks.speed[7],
    );
  });

  it("deals cards as if gained, so their effects on gaining apply", () => {
    const plain = testGame();
    const state = testGame({
      explorers: [{ seat: 0, room: "chapel", cards: ["dog", "bell"] }],
    });
    expect(explorer(state, 0).cards).toEqual(["dog", "bell"]);
    expect(state.decks.omen.draw).not.toContain("dog");
    expect(state.decks.item.draw).not.toContain("bell");
    expect(state.omensDrawn).toBe(1);
    expect(
      traitValue(ENGINE, state, "zoe-ingstrom", "sanity"),
    ).toBeGreaterThan(traitValue(ENGINE, plain, "zoe-ingstrom", "sanity"));
    // The Dog's token goes where its holder is.
    expect(state.tokens.find((t) => t.holder === "zoe-ingstrom")?.room).toBe(
      "chapel",
    );
  });

  it("chooses who goes first", () => {
    const state = testGame({ first: 2 });
    expect(state.turn?.seat).toBe(2);
    expect(offered(state).length).toBeGreaterThan(0);
  });

  it("plays on normally from where it starts", () => {
    const state = testGame({ explorers: [{ seat: 0, room: "chapel" }] });
    expect(() => choose(state, "End your turn")).not.toThrow();
  });

  it("is reproducible from its seed", () => {
    const scenario = {
      seed: "repro",
      rooms: ["larder"],
      explorers: [{ seat: 2, room: "larder", cards: ["axe"] }],
    };
    expect(testGame(scenario)).toEqual(testGame(scenario));
  });

  it("fails loudly on what it can't set up", () => {
    expect(() => testGame({ decks: { item: ["dog"] } })).toThrow(/omen/);
    expect(() =>
      testGame({
        decks: { item: ["axe"] },
        explorers: [{ seat: 0, cards: ["axe"] }],
      }),
    ).toThrow(/twice/);
    expect(() => testGame({ stack: ["entrance-hall"] })).toThrow(/starting/);
    expect(() => testGame({ explorers: [{ seat: 5 }] })).toThrow(/seat 5/);
    expect(() =>
      testGame({ explorers: [{ seat: 0, clips: { might: 8 } }] }),
    ).toThrow(/might/);
    expect(() => testGame({ haunt: { number: 999, revealer: 0 } })).toThrow(
      /999/,
    );
    expect(() =>
      testGame({ stack: ["chapel"], explorers: [{ seat: 0, room: "chapel" }] }),
    ).toThrow(/stacked/);
  });
});

describe("start haunt N", () => {
  it("starts with the haunt revealed, as a haunt roll would leave it", () => {
    const state = testGame({ haunt: { number: 14, revealer: 1 } });
    const cell = hauntCells(ENGINE.catalog, 14)[0];
    expect(state.status).toBe("haunt");
    expect(state.haunt).toMatchObject({
      number: 14,
      revealer: 1,
      omen: cell.omen,
      room: cell.room,
    });
    expect(state.pending).toBeNull();
    expect(state.work).toEqual([]);
    // The revealer drew the omen in the omen room.
    expect(at(state, 1).room).toBe(cell.room);
    expect(explorer(state, 1).cards).toContain(cell.omen);
    expect(placed(state.board, cell.room)).toBeDefined();
  });

  it("uses the chosen omen and room, and keeps the revealer where the scenario puts them", () => {
    const cell = hauntCells(ENGINE.catalog, 14).at(-1);
    if (!cell) throw new Error("Haunt 14 isn't on the chart");
    const state = testGame({
      haunt: { number: 14, revealer: 0, omen: cell.omen, room: cell.room },
      explorers: [{ seat: 0, room: "foyer" }],
    });
    expect(state.haunt?.room).toBe(cell.room);
    expect(at(state, 0).room).toBe("foyer");
  });

  it("sets seats' sides and roles before the haunt starts, secret ones known only to the seats named", () => {
    const state = testGame({
      haunt: { number: 14, revealer: 1 },
      sides: [
        { seat: 0, side: "traitor", roles: ["traitor"], knownBy: [0] },
        { seat: 1, side: "heroes" },
        { seat: 2, side: "heroes" },
      ],
    });
    expect(state.seats.map((s) => [s.side, s.roles, s.knownBy])).toEqual([
      ["traitor", ["traitor"], [0]],
      ["heroes", [], null],
      ["heroes", [], null],
    ]);
    const lines = state.lastEvents
      .filter((e) => e.type === "side-set")
      .map((e) => describeEvent(ENGINE, spectator(state, ENGINE), e));
    expect(lines).toEqual([
      "Scenario: Zoe Ingstrom is the traitor, which is kept secret.",
      "Scenario: Ox Bellows is a hero.",
      "Scenario: Father Rhinehardt is a hero.",
    ]);
  });

  it("refuses sides without a haunt, and sides it can't give", () => {
    expect(() => testGame({ sides: [{ seat: 0, side: "heroes" }] })).toThrow(
      /sides come with a haunt/,
    );
    const haunt = { number: 14, revealer: 0 };
    expect(() =>
      testGame({
        haunt,
        sides: [
          { seat: 0, side: "heroes" },
          { seat: 0, side: "traitor" },
        ],
      }),
    ).toThrow(/twice/);
    expect(() =>
      testGame({ haunt, sides: [{ seat: 0, side: "heroes", knownBy: [7] }] }),
    ).toThrow(/seat 7/);
  });

  it("offers every haunt on the chart", () => {
    const numbers = hauntNumbers(ENGINE.catalog);
    expect(numbers[0]).toBe(1);
    for (const n of numbers)
      expect(hauntCells(ENGINE.catalog, n).length).toBeGreaterThan(0);
  });
});
