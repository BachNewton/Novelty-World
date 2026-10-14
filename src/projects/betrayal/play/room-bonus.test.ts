import { describe, expect, it } from "vitest";
import { describeEvent } from "../engine/describe";
import { viewFor } from "../engine/view";
import { ENGINE } from "../game";
import {
  choose,
  explorer,
  put,
  testGame,
  placeTiles,
} from "../testing";
import type { GameState } from "../types";
import { statChanges } from "./cards";
import { badgeSpot, bonusBadges, bonusRooms, bonusRow, bonusState, bonusTakers } from "./room-bonus";

const viewOf = (state: GameState) => viewFor(ENGINE, state, null);
const HALF = 3;
const tokenOf = (state: GameState, seat: number) => {
  const token = ENGINE.catalog.figures[explorer(state, seat).definition].token;
  if (token === null) throw new Error("An explorer without a token");
  return token;
};

/** A game with the Gymnasium and the Library in the house, and Zoe (seat 0) having taken the Gymnasium's bonus. */
function gymTaken(): GameState {
  const state = testGame();
  placeTiles(state, { tile: "gymnasium", floor: "basement", x: 0, y: -1, rotation: 0 }, { tile: "library", floor: "upper", x: 0, y: -1, rotation: 0 });
  state.tokens.push({ token: tokenOf(state, 0), room: "gymnasium" });
  return state;
}

describe("room bonuses", () => {
  it("come from the rules' data: the base game's four rooms, each with its trait", () => {
    expect(bonusRooms(ENGINE, { sets: ["base"] }).map(({ room, traits }) => [room, traits])).toEqual(
      expect.arrayContaining([
        ["larder", ["might"]],
        ["gymnasium", ["speed"]],
        ["chapel", ["sanity"]],
        ["library", ["knowledge"]],
      ]),
    );
    expect(bonusRooms(ENGINE, { sets: ["base"] })).toHaveLength(4);
  });

  it("know who has taken each, and what each is to every explorer", () => {
    const state = gymTaken();
    const view = viewOf(state);
    const zoe = explorer(state, 0).id;
    const other = explorer(state, 1).id;
    expect(bonusTakers(ENGINE, view, "gymnasium")).toEqual([zoe]);
    expect(bonusTakers(ENGINE, view, "library")).toEqual([]);
    expect(bonusState(ENGINE, view, zoe, "gymnasium")).toBe("taken");
    expect(bonusState(ENGINE, view, other, "gymnasium")).toBe("available");
    expect(bonusState(ENGINE, view, zoe, "library")).toBe("available");
    expect(bonusState(ENGINE, view, zoe, "chapel")).toBe("undiscovered");
  });

  it("fill each explorer's sheet row: lit, ticked or outlined", () => {
    const state = gymTaken();
    const view = viewOf(state);
    const row = (seat: number) => Object.fromEntries(bonusRow(ENGINE, view, explorer(state, seat).id).map(({ room, state: s }) => [room, s]));
    expect(row(0)).toEqual({ larder: "undiscovered", gymnasium: "taken", chapel: "undiscovered", library: "available" });
    expect(row(1)).toEqual({ larder: "undiscovered", gymnasium: "available", chapel: "undiscovered", library: "available" });
  });

  it("badge only the bonus rooms in the house, lit or ticked for the explorer whose turn it is", () => {
    const state = gymTaken();
    const view = viewOf(state);
    const states = (active: string | null) => Object.fromEntries(bonusBadges(ENGINE, view, active, HALF).map((badge) => [badge.room, badge.state]));
    expect(states(explorer(state, 0).id)).toEqual({ gymnasium: "taken", library: "available" });
    expect(states(explorer(state, 1).id)).toEqual({ gymnasium: "available", library: "available" });
    expect(states(null)).toEqual({ gymnasium: null, library: null });
  });

  it("lay each badge in a corner clear of the doorways", () => {
    // The Gymnasium's doors are right and bottom: its badge lies by the top and left walls.
    expect(badgeSpot(ENGINE.catalog.rooms.gymnasium, HALF)).toEqual([-1.9, -1.9]);
    // Every room's badge keeps off the middles of its walls, where the doorways are.
    for (const room of Object.values(ENGINE.catalog.rooms)) {
      const [x, z] = badgeSpot(room, HALF);
      expect(Math.min(Math.abs(x), Math.abs(z)), room.id).toBeGreaterThan(1.5);
    }
  });
});

describe("taking a room bonus", () => {
  it("gains the trait once, floated over the figure, then tells why ending a turn there again gains nothing", () => {
    let state = testGame();
    placeTiles(state, { tile: "gymnasium", floor: "basement", x: 0, y: -1, rotation: 0 });
    put(state, 0, "gymnasium");
    state = choose(state, "End your turn");
    const taken = viewOf(state);
    expect(statChanges(taken.events)).toMatchObject([{ figure: explorer(state, 0).id, trait: "speed", spaces: 1 }]);

    let again = testGame();
    placeTiles(again, { tile: "gymnasium", floor: "basement", x: 0, y: -1, rotation: 0 });
    again.tokens.push({ token: tokenOf(again, 0), room: "gymnasium" });
    put(again, 0, "gymnasium");
    again = choose(again, "End your turn");
    const view = viewOf(again);
    expect(statChanges(view.events)).toEqual([]);
    const spent = view.events.find((event) => event.type === "room-bonus-spent");
    expect(spent?.rule).toEqual({ source: "room", room: "gymnasium" });
    expect(spent && describeEvent(ENGINE, view, spent)).toBe("Gymnasium: Zoe Ingstrom has already taken the Gymnasium's bonus this game, so gains nothing.");
  });
});
