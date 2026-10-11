import { describe, expect, it } from "vitest";
import { HOUSE_FIXTURE } from "./house-layout";
import { inHouse, inRoom, walkPath } from "./house-walk";
import { openFloor } from "./open-floor";
import { BASE_RADIUS, INNER, type RoomPoint } from "./room";
import { aroundBases, passesThrough, type StandingBase } from "./walk-around";

const base = (x: number, z: number): StandingBase => ({ x, z, radius: BASE_RADIUS });
/** Every leg of a path that takes a walker's base through a standing one. */
const through = (path: readonly RoomPoint[], bases: readonly StandingBase[]) => path.slice(1).filter((point, i) => passesThrough(path[i], point, bases));

describe("walking round standing figures", () => {
  const floor = openFloor();
  const across: RoomPoint[] = [[-2, 0, 0], [2, 0, 0]];

  it("leaves a walk that passes no one as it is", () => {
    expect(aroundBases(floor, across, [base(0, 1.5)])).toEqual(across);
  });

  it("goes round a figure standing in the way, from the same start to the same end", () => {
    const bases = [base(0, 0)];
    const path = aroundBases(floor, across, bases);
    expect(through(path, bases)).toEqual([]);
    expect(path[0]).toEqual(across[0]);
    expect(path.at(-1)).toEqual(across[1]);
    expect(path.length).toBeGreaterThan(2);
  });

  it("goes round a crowd, through the gap between them", () => {
    const bases = [base(0, 0), base(0, 1.6), base(0, -1.6)];
    const path = aroundBases(floor, across, bases);
    expect(through(path, bases)).toEqual([]);
  });

  it("squeezes past where no way round avoids a base, and still gets there", () => {
    const corridor = openFloor(INNER, 0.8);
    const bases = [base(0, 0)];
    const path = aroundBases(corridor, across, bases);
    expect(path[0]).toEqual(across[0]);
    expect(path.at(-1)).toEqual(across[1]);
    expect(through(path, bases).length).toBeGreaterThan(0);
  });

  it("keeps a fixed leg (a barrier room's crossing) as it is", () => {
    const crossing: RoomPoint[] = [[-0.5, 0.3, 0], [0.5, 0.3, 0]];
    const path: RoomPoint[] = [[-2, 0, 0], ...crossing, [2, 0, 0]];
    const fixed = (a: RoomPoint, b: RoomPoint) => crossing.includes(a) && crossing.includes(b);
    const planned = aroundBases(floor, path, [base(0, 0)], fixed);
    const at = planned.indexOf(crossing[0]);
    expect(planned[at + 1]).toBe(crossing[1]);
  });

  it("is deterministic", () => {
    const bases = [base(0, 0), base(0.9, 0.9)];
    expect(aroundBases(floor, across, bases)).toEqual(aroundBases(floor, across, bases));
  });

  it("steers a walk through the house round those standing in the rooms it crosses", () => {
    // The Entrance Hall stands to the right of the Foyer in the fixture; someone stands in the Foyer's middle.
    const standing = inHouse(HOUSE_FIXTURE, "foyer", [0, 0, 0]);
    const from = inHouse(HOUSE_FIXTURE, "entrance-hall", [0, 0, 0]);
    const to = inHouse(HOUSE_FIXTURE, "foyer", [-2, 0, 0]);
    const ways = () => ({});
    const straight = walkPath(HOUSE_FIXTURE, ["entrance-hall", "foyer"], from, to, ways);
    const avoid = (room: string, points: readonly RoomPoint[]) => {
      const [x, , z] = inRoom(HOUSE_FIXTURE, room, standing);
      return room === "foyer" ? aroundBases(floor, points, [base(x, z)]) : [...points];
    };
    const round = walkPath(HOUSE_FIXTURE, ["entrance-hall", "foyer"], from, to, ways, avoid);
    const flat = (path: typeof round): RoomPoint[] => path.map((point) => inRoom(HOUSE_FIXTURE, "foyer", point));
    const [x, , z] = inRoom(HOUSE_FIXTURE, "foyer", standing);
    expect(through(flat(straight), [base(x, z)]).length).toBeGreaterThan(0);
    expect(through(flat(round), [base(x, z)])).toEqual([]);
  });
});
