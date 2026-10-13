import { describe, expect, it } from "vitest";
import { openFloors } from "../art/open-floor";
import { viewFor } from "../engine/view";
import { ENGINE } from "../game";
import { choose, testGame } from "../testing";
import type { GameState } from "../types";
import { aheadRooms, arrivalSpot, firstSpots, nextSpots, type Spots } from "./spots";

const viewOf = (state: GameState) => viewFor(ENGINE, state, null);
/** Every room an open floor, its prime place off the middle. */
const PRIME = [1, 1] as const;
const FLOORS = openFloors(PRIME);
const onPrime = (spots: Spots) => Object.entries(spots).flatMap(([id, spot]) => (spot && spot.x === PRIME[0] && spot.z === PRIME[1] ? [`${spot.room}:${id}`] : [])).sort();
const rooms = (spots: Spots) => Object.fromEntries(Object.entries(spots).map(([id, spot]) => [id, spot?.room]));

describe("standing spots", () => {
  it("start with the first player on the prime place and the rest in turn order, apart", () => {
    const spots = firstSpots(viewOf(testGame()), FLOORS);
    expect(Object.keys(spots)).toEqual(["zoe-ingstrom", "ox-bellows", "father-rhinehardt"]);
    expect(onPrime(spots)).toEqual(["entrance-hall:zoe-ingstrom"]);
    expect(Object.values(spots).map((spot) => spot?.crowding)).toEqual([0, 0, 0]);
  });

  it("start a resumed game with the active explorer on the prime place", () => {
    const state = choose(testGame(), "End your turn");
    expect(onPrime(firstSpots(viewOf(state), FLOORS))).toEqual(["entrance-hall:ox-bellows"]);
  });

  it("are kept until a figure moves, and one arriving takes the prime place when it is free", () => {
    let state = testGame();
    const first = firstSpots(viewOf(state), FLOORS);
    let spots = first;
    state = choose(state, "Move to the Foyer");
    spots = nextSpots(spots, viewOf(state), FLOORS);
    expect(rooms(spots)).toEqual({ "zoe-ingstrom": "foyer", "ox-bellows": "entrance-hall", "father-rhinehardt": "entrance-hall" });
    expect(onPrime(spots)).toEqual(["foyer:zoe-ingstrom"]);
    expect(spots["ox-bellows"]).toEqual(first["ox-bellows"]);
    expect(spots["father-rhinehardt"]).toEqual(first["father-rhinehardt"]);
    // Ox's turn: the prime place Zoe left stays empty, and both stand still.
    state = choose(state, "End your turn");
    spots = nextSpots(spots, viewOf(state), FLOORS);
    expect(onPrime(spots)).toEqual(["foyer:zoe-ingstrom"]);
    expect(spots["ox-bellows"]).toEqual(first["ox-bellows"]);
    expect(spots["father-rhinehardt"]).toEqual(first["father-rhinehardt"]);
    // Ox follows Zoe into the Foyer, beside her, as the route preview foresaw.
    const foreseen = arrivalSpot(spots, "ox-bellows", "foyer", null, FLOORS);
    state = choose(state, "Move to the Foyer");
    spots = nextSpots(spots, viewOf(state), FLOORS);
    expect(spots["ox-bellows"]).toEqual(foreseen);
    expect(spots["ox-bellows"]).toMatchObject({ room: "foyer", crowding: 0 });
    expect(onPrime(spots)).toEqual(["foyer:zoe-ingstrom"]);
  });

  it("are kept as the turn passes: no one steps onto the prime place", () => {
    let state = testGame();
    const first = firstSpots(viewOf(state), FLOORS);
    let spots = first;
    for (let turn = 0; turn < 3; turn++) {
      state = choose(state, "End your turn");
      spots = nextSpots(spots, viewOf(state), FLOORS);
      expect(spots).toEqual(first);
    }
  });

  it("are a figure's own while it stands still, whatever else changes", () => {
    const view = viewOf(testGame());
    const spots = firstSpots(view, FLOORS);
    expect(nextSpots(spots, view, FLOORS)).toEqual(spots);
    expect(arrivalSpot(spots, "ox-bellows", "entrance-hall", null, FLOORS)).toEqual(spots["ox-bellows"]);
  });

  it("place a room no one arrived at without reading its floor", () => {
    let state = testGame();
    const read: string[] = [];
    const floors = (room: string, side: Parameters<typeof FLOORS>[1]) => {
      read.push(room);
      return FLOORS(room, side);
    };
    const spots = firstSpots(viewOf(state), floors);
    read.length = 0;
    state = choose(state, "Move to the Foyer");
    nextSpots(spots, viewOf(state), floors);
    expect(read).toEqual(["foyer"]);
  });
});

describe("aheadRooms", () => {
  it("reads ahead every room in the house", () => {
    const view = viewOf(testGame());
    expect(aheadRooms(view).sort()).toEqual(view.board.tiles.map((tile) => tile.tile).sort());
  });

  it("reads ahead a discovered room's floor while its ghost is turned, before it is placed", () => {
    const state = choose(testGame({ stack: ["game-room"] }), "Explore");
    expect(state.pending?.type === "decision" && state.pending.kind).toBe("rotation");
    expect(aheadRooms(viewFor(ENGINE, state, 0))).toContain("game-room");
  });
});
