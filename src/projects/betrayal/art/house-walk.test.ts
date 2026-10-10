import { describe, expect, it } from "vitest";
import { HOUSE_FIXTURE } from "./house-layout";
import { inHouse, shownOn, walkLength, walkPath, walkPose, RUN_SPEED, WALK_SPEED, type HousePoint, type Stairway } from "./house-walk";
import { TILE } from "./room";

const near = (a: HousePoint, b: Omit<HousePoint, "floor"> & { floor?: HousePoint["floor"] }) => {
  expect(a.x).toBeCloseTo(b.x);
  expect(a.y).toBeCloseTo(b.y);
  expect(a.z).toBeCloseTo(b.z);
  if (b.floor) expect(a.floor).toBe(b.floor);
};

describe("shownOn", () => {
  const stairs: Stairway = (room, toward) =>
    (room === "grand-staircase" && toward === "upper-landing") || (room === "upper-landing" && toward === "grand-staircase") ? [[0, 0, 0]] : undefined;
  const route = (...rooms: string[]) => ({ room: rooms[rooms.length - 1], route: rooms });

  it("shows a room on its own floor as itself", () => {
    expect(shownOn(HOUSE_FIXTURE, route("library", "foyer"), "ground", stairs)).toEqual({ room: "foyer" });
  });

  it("shows the room across a stair as the stair, from either end", () => {
    expect(shownOn(HOUSE_FIXTURE, route("library", "foyer", "grand-staircase", "upper-landing"), "ground", stairs)).toEqual({ stairFrom: "grand-staircase" });
    expect(shownOn(HOUSE_FIXTURE, route("bedroom", "upper-landing", "grand-staircase"), "upper", stairs)).toEqual({ stairFrom: "upper-landing" });
  });

  it("leaves a room further across the floor to be reached by changing floor", () => {
    expect(shownOn(HOUSE_FIXTURE, route("foyer", "grand-staircase", "upper-landing", "bedroom"), "ground", stairs)).toBeNull();
  });

  it("shows every room as itself when every floor shows", () => {
    expect(shownOn(HOUSE_FIXTURE, route("foyer", "grand-staircase", "upper-landing", "bedroom"), "all", stairs)).toEqual({ room: "bedroom" });
  });

  it("shows nothing for a stair that has no run to glow", () => {
    expect(shownOn(HOUSE_FIXTURE, route("grand-staircase", "upper-landing"), "ground", () => undefined)).toBeNull();
  });
});

describe("inHouse", () => {
  it("lays an unturned room's point at its cell", () => {
    near(inHouse(HOUSE_FIXTURE, "foyer", [1, 0, 2]), { floor: "ground", x: TILE + 1, y: 0, z: 2 });
  });

  it("turns a room's point with the tile, a quarter turn clockwise seen from above per step", () => {
    // The Dining Room is turned once: its printed top edge faces right on the board.
    near(inHouse(HOUSE_FIXTURE, "dining-room", [0, 0, -1]), { x: TILE + 1, y: 0, z: -TILE });
    // The Library is turned twice: its printed top faces down.
    near(inHouse(HOUSE_FIXTURE, "library", [0, 1, -1]), { x: TILE, y: 1, z: TILE + 1 });
  });
});

describe("walkPath", () => {
  const noStairs: Stairway = () => undefined;
  const ground = (x: number, z: number): HousePoint => ({ floor: "ground", x, y: 0, z });

  it("walks through the centre of each doorway, lined up with it on both sides", () => {
    const path = walkPath(HOUSE_FIXTURE, ["library", "foyer"], ground(6, 7), ground(5, 0), noStairs);
    // The Library is below the Foyer on the board: the door is on their shared edge, z = TILE / 2.
    expect(path.map((p) => [p.x, p.z])).toEqual([
      [6, 7],
      [6, 3 + 0.8],
      [6, 3],
      [6, 3 - 0.8],
      [5, 0],
    ]);
  });

  it("climbs one room's stairway and comes down the other's, changing floor between them", () => {
    const stairs: Stairway = (room) =>
      room === "grand-staircase"
        ? [
            [1, 0, -2],
            [-2, 3, -2],
          ]
        : [
            [-1, 0, -2],
            [-2, -1, -2],
          ];
    const path = walkPath(HOUSE_FIXTURE, ["grand-staircase", "upper-landing"], ground(1, 0), { floor: "upper", x: 1, y: 0, z: 1 }, stairs);
    expect(path.map((p) => p.floor)).toEqual(["ground", "ground", "ground", "upper", "upper", "upper"]);
    near(path[2], { x: -2, y: 3, z: -2 });
    near(path[3], { x: -2, y: -1, z: -2 });
    near(path[4], { x: -1, y: 0, z: -2 });
  });

  it("fails loudly where a link has no stairway to walk", () => {
    expect(() => walkPath(HOUSE_FIXTURE, ["grand-staircase", "upper-landing"], ground(0, 0), ground(0, 0), noStairs)).toThrow(/No stairway/);
  });
});

describe("walkPose", () => {
  const path: HousePoint[] = [
    { floor: "ground", x: 0, y: 0, z: 0 },
    { floor: "ground", x: 4, y: 0, z: 0 },
    { floor: "ground", x: 4, y: 0, z: 4 },
    { floor: "upper", x: 0, y: 0, z: 0 },
    { floor: "upper", x: 0, y: 0, z: 2 },
  ];
  const walk = { path, start: 10 };
  const at = (metres: number) => walkPose(walk, 10 + metres / WALK_SPEED);

  it("measures a path without counting a change of floor", () => {
    expect(walkLength(path)).toBe(10);
  });

  it("stands at the start, in no stride, until the walk begins", () => {
    const pose = walkPose(walk, 5);
    near(pose.point, { floor: "ground", x: 0, y: 0, z: 0 });
    expect(pose.stride.amount).toBe(0);
    expect(pose.done).toBe(false);
  });

  it("moves along the path at walking pace, facing the way it goes", () => {
    const pose = at(2);
    near(pose.point, { floor: "ground", x: 2, y: 0, z: 0 });
    expect(pose.heading).toBeCloseTo(Math.PI / 2);
    expect(pose.stride.amount).toBe(1);
    near(at(6).point, { floor: "ground", x: 4, y: 0, z: 2 });
    expect(at(6).heading).toBeCloseTo(0);
  });

  it("runs at running pace, with a longer stride, when the walk is a run", () => {
    const pose = walkPose({ ...walk, pace: "run" }, 10 + 2 / RUN_SPEED, 0.5);
    near(pose.point, { floor: "ground", x: 2, y: 0, z: 0 });
    expect(pose.stride.running).toBe(true);
    expect(pose.stride.phase).toBeLessThan(walkPose(walk, 10 + 2 / WALK_SPEED, 0.5).stride.phase);
  });

  it("turns through a corner rather than snapping round it", () => {
    expect(at(4).heading).toBeCloseTo(Math.PI / 4);
  });

  it("changes floor on reaching the stair's end", () => {
    expect(at(7.99).point.floor).toBe("ground");
    near(at(8.5).point, { floor: "upper", x: 0, y: 0, z: 0.5 });
  });

  it("ends at the last point, out of its stride", () => {
    const pose = at(50);
    near(pose.point, { floor: "upper", x: 0, y: 0, z: 2 });
    expect(pose.stride.amount).toBe(0);
    expect(pose.done).toBe(true);
    expect(at(9.9).done).toBe(false);
  });

  it("is a pure function of the clock", () => {
    expect(at(3.3)).toEqual(at(3.3));
  });
});
