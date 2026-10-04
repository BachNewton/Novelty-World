import { describe, expect, it } from "vitest";
import { ENGINE } from "../game";
import { at, choose, offered, put, testGame } from "../testing";
import type { GameState, RuleRef } from "../types";
import { moveCloser, routeDistances } from "./movement";
import { start } from "./step-loop";

const RULE: RuleRef = { source: "card", card: "bell" };
/** Seat 0's and seat 1's explorers, by figure id. */
const ZOE = "zoe-ingstrom";
const OX = "ox-bellows";

const run = (state: GameState, ...steps: Parameters<typeof start>[2]) =>
  start(ENGINE, { ...state, pending: null }, steps);

describe("routeDistances", () => {
  it("counts spaces along connections, stairs included", () => {
    const state = testGame();
    const away = routeDistances(
      ENGINE,
      state,
      { kind: "figure", figure: ZOE },
      { room: "entrance-hall", side: null },
      true,
    );
    const to = (room: string) =>
      away.find((r) => r.place.room === room)?.distance;
    expect(to("entrance-hall")).toBe(0);
    expect(to("foyer")).toBe(1);
    expect(to("grand-staircase")).toBe(2);
    expect(to("upper-landing")).toBe(3);
  });

  it("counts crossing a barrier room as no space, when crossing is allowed", () => {
    const state = testGame();
    state.board.tiles.push(
      { tile: "chasm", floor: "basement", x: 1, y: 0, rotation: 0 },
      { tile: "furnace-room", floor: "basement", x: 2, y: 0, rotation: 0 },
    );
    const from = { room: "basement-landing", side: null };
    const mover = { kind: "figure", figure: ZOE } as const;
    const furnace = (cross: boolean) =>
      routeDistances(ENGINE, state, mover, from, cross).find(
        (r) => r.place.room === "furnace-room",
      )?.distance;
    expect(furnace(true)).toBe(2);
    expect(furnace(false)).toBeUndefined();
  });
});

describe("moveCloser (the Bell's 5+)", () => {
  it("moves an explorer 1 space along the shortest route, spending none of their movement", () => {
    const state = testGame();
    put(state, 1, "upper-landing");
    const after = run(state, moveCloser(OX, "entrance-hall", ZOE, RULE));
    expect(at(after, 1).room).toBe("grand-staircase");
    expect(after.turn?.moved).toEqual({});
  });

  it("lets the chooser pick between routes that tie", () => {
    const state = testGame();
    // The Ballroom joins the Entrance Hall and the Foyer's north doors to the room north of both.
    state.board.tiles.push(
      { tile: "ballroom", floor: "ground", x: 2, y: -1, rotation: 0 },
      { tile: "abandoned-room", floor: "ground", x: 1, y: -1, rotation: 0 },
    );
    put(state, 1, "abandoned-room");
    const after = run(state, moveCloser(OX, "entrance-hall", ZOE, RULE));
    expect(offered(after).map((c) => c.label)).toEqual([
      "Move Ox Bellows to the Ballroom",
      "Move Ox Bellows to the Foyer",
    ]);
    expect(at(choose(after, "to the Foyer"), 1).room).toBe("foyer");
  });

  it("leaves an explorer already there where they are", () => {
    const state = testGame();
    const after = run(state, moveCloser(OX, "entrance-hall", ZOE, RULE));
    expect(at(after, 1).room).toBe("entrance-hall");
    expect(after.lastEvents).toEqual([]);
  });
});
