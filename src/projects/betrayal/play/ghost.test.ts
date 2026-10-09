import { describe, expect, it } from "vitest";
import { ENGINE } from "../game";
import {
  adjacent,
  connections,
  freeDoorways,
  neighbourCell,
  openings,
  opposite,
  placed,
  placements,
  roomAt,
  type Doorway,
} from "../engine/board";
import { apply } from "../engine/step-loop";
import { viewFor } from "../engine/view";
import { simulate } from "../simulation";
import { choose, testGame } from "../testing";
import type { GameState } from "../types";
import { playChoices } from "./choices";
import { countDoors, cycle, ghostDoors, type GhostDoorway } from "./ghost";
import { due } from "./seat";

const catalog = ENGINE.catalog;

describe("cycle", () => {
  it("steps through the legal ways round only, both ways, round and round", () => {
    const legal = [0, 2, 3];
    expect(cycle(legal, 0, 1)).toBe(2);
    expect(cycle(legal, 2, 1)).toBe(3);
    expect(cycle(legal, 3, 1)).toBe(0);
    expect(cycle(legal, 0, -1)).toBe(3);
    expect(cycle(legal, 2, -1)).toBe(0);
    // Turning all the way round comes back to where it started, through every legal way and nothing else.
    const seen: number[] = [];
    let at = 0;
    for (let i = 0; i < legal.length; i++) {
      at = cycle(legal, at, 1);
      seen.push(at);
    }
    expect(seen.sort()).toEqual(legal);
  });

  it("starts from the first when the current one isn't legal, and stays put with one", () => {
    expect(cycle([1, 2], 0, 1)).toBe(1);
    expect(cycle([1], 1, 1)).toBe(1);
    expect(cycle([1], 1, -1)).toBe(1);
    expect(() => cycle([], 0, 1)).toThrow();
  });
});

describe("ghostDoors", () => {
  it("tells a discovered room's ways round apart by what their doorways do", () => {
    // The Game Room has three doors, so through the Entrance Hall's north door it fits several ways round.
    const state = choose(testGame({ stack: ["game-room"] }), "Explore");
    const ghost = playChoices(viewFor(ENGINE, state, 0)).ghost;
    if (!ghost) throw new Error("No ghost");
    const [{ spot, options }] = ghost.cells;
    const kinds = options.map((option) =>
      JSON.stringify(
        ghostDoors(catalog, state.board, ghost.tile, spot, option.rotation),
      ),
    );
    expect(new Set(kinds).size).toBe(options.length);
    // Every way round joins the doorway it was found through.
    for (const option of options) {
      const doors = ghostDoors(
        catalog,
        state.board,
        ghost.tile,
        spot,
        option.rotation,
      );
      expect(countDoors(doors).joined).toBeGreaterThanOrEqual(1);
    }
  });

  /** What placing the tile did, by the engine's own board queries, against what the ghost said it would do. */
  function checkPlacement(
    before: GameState,
    after: GameState,
    tile: string,
    doorway: Doorway,
    rotation: number,
  ) {
    const now = placed(after.board, tile);
    if (!now) throw new Error(`${tile} was not placed`);
    expect(now.rotation).toBe(rotation);
    const spot = { floor: now.floor, x: now.x, y: now.y };
    const doors = ghostDoors(catalog, before.board, tile, spot, now.rotation);
    const by = (doorway: GhostDoorway) =>
      doors
        .filter((door) => door.doorway === doorway)
        .map((door) => door.direction)
        .sort();
    const neighbour = (direction: (typeof doors)[number]["direction"]) => {
      const cell = neighbourCell(spot, direction);
      return roomAt(after.board, spot.floor, cell.x, cell.y)?.tile;
    };
    const beside = adjacent(after.board, tile);
    const through = connections(after.board, catalog, tile).filter((room) =>
      beside.includes(room),
    );
    // Joined: exactly the rooms beside it that movement now connects it to, as many as the placement rule counted.
    expect(by("joined").map(neighbour).sort()).toEqual(through.sort());
    expect(by("joined")).toHaveLength(
      placements(before.board, catalog, tile, doorway).find(
        (p) => p.rotation === rotation,
      )?.matched ?? -1,
    );
    // Unexplored: exactly its free doorways once placed.
    expect(by("unexplored")).toEqual(
      freeDoorways(after.board, catalog, spot.floor)
        .filter((free) => free.room === tile)
        .map((free) => free.direction)
        .sort(),
    );
    // Blind: its other openings, each facing a room it doesn't connect to.
    const mine = openings(catalog, now);
    expect(by("blind")).toEqual(
      mine
        .filter(
          (direction) =>
            !by("joined").includes(direction) &&
            !by("unexplored").includes(direction),
        )
        .sort(),
    );
    for (const direction of by("blind"))
      expect(through).not.toContain(neighbour(direction));
    // Shut: a neighbour's opening facing it where it has none.
    const shut = beside.flatMap((room) => {
      const other = placed(after.board, room);
      if (!other) return [];
      return openings(catalog, other).flatMap((direction) => {
        const cell = neighbourCell(other, direction);
        return cell.x === spot.x &&
          cell.y === spot.y &&
          !mine.includes(opposite(direction))
          ? [opposite(direction)]
          : [];
      });
    });
    expect(by("shut")).toEqual(shut.sort());
  }

  // Every way round of every discovery in whole games, each one placed by the engine.
  it("says what every legal way round would do, as the engine then places it", () => {
    let checked = 0;
    for (const seed of ["ghost-1", "ghost-2", "ghost-3", "ghost-4"])
      simulate(seed, ENGINE, (state) => {
        if (
          state.pending?.type !== "decision" ||
          state.pending.kind !== "rotation"
        )
          return;
        const seat = due(viewFor(ENGINE, state, null));
        if (seat === null)
          throw new Error("A rotation is pending but no seat is due");
        const ghost = playChoices(viewFor(ENGINE, state, seat)).ghost;
        if (!ghost) throw new Error("A rotation without a ghost");
        const { doorway } = state.pending.params as { doorway: Doorway };
        for (const option of ghost.cells[0].options) {
          const result = apply(ENGINE, state, option.action);
          if (!result.ok)
            throw new Error(`${option.label} was rejected: ${result.reason}`);
          checkPlacement(
            state,
            result.state,
            ghost.tile,
            doorway,
            option.rotation,
          );
          checked++;
        }
      });
    expect(checked).toBeGreaterThan(10);
  }, 30_000);
});
