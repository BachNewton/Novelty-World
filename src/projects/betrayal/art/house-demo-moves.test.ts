import { describe, expect, it } from "vitest";
import { CATALOG } from "../data";
import { afterLeg, moveIsOver, nextLegs, reachable } from "./house-demo-moves";
import { HOUSE_FIXTURE } from "./house-layout";

describe("reachable", () => {
  const from = (room: string, movement: number) => reachable(HOUSE_FIXTURE, CATALOG, room, movement);

  it("offers every room within the move, nearest first, each by its shortest route", () => {
    expect(from("library", 4)).toEqual([
      { room: "chapel", route: ["library", "chapel"] },
      { room: "foyer", route: ["library", "foyer"] },
      { room: "dining-room", route: ["library", "foyer", "dining-room"] },
      { room: "entrance-hall", route: ["library", "foyer", "entrance-hall"] },
      { room: "grand-staircase", route: ["library", "foyer", "grand-staircase"] },
      { room: "upper-landing", route: ["library", "foyer", "grand-staircase", "upper-landing"] },
      { room: "bedroom", route: ["library", "foyer", "grand-staircase", "upper-landing", "bedroom"] },
      { room: "drawing-room", route: ["library", "foyer", "grand-staircase", "upper-landing", "drawing-room"] },
    ]);
  });

  it("stops at the edge of the move", () => {
    expect(from("library", 2).map((reach) => reach.room)).toEqual(["chapel", "foyer", "dining-room", "entrance-hall", "grand-staircase"]);
  });

  it("goes down the stairs as well as up them", () => {
    expect(from("upper-landing", 1).map((reach) => reach.room)).toEqual(["bedroom", "drawing-room", "grand-staircase"]);
  });

  it("offers nothing from a room nothing joins", () => {
    expect(from("basement-landing", 4)).toEqual([]);
  });
});

describe("a move in legs", () => {
  const legTo = (move: { room: string; left: number }, room: string) => {
    const reach = nextLegs(HOUSE_FIXTURE, CATALOG, move).find((leg) => leg.room === room);
    if (!reach) throw new Error(`${room} is out of reach`);
    return afterLeg(move, reach);
  };

  it("spends each leg's spaces from one budget, a stair step costing one like any other", () => {
    const start = { room: "library", left: 4 };
    const landing = legTo(start, "upper-landing");
    expect(landing).toEqual({ room: "upper-landing", left: 1 });
    expect(nextLegs(HOUSE_FIXTURE, CATALOG, landing).map((leg) => leg.room)).toEqual(["bedroom", "drawing-room", "grand-staircase"]);
    expect(legTo(landing, "drawing-room")).toEqual({ room: "drawing-room", left: 0 });
  });

  it("offers only what the movement left can reach", () => {
    const foyer = legTo({ room: "library", left: 4 }, "foyer");
    expect(foyer.left).toBe(3);
    expect(nextLegs(HOUSE_FIXTURE, CATALOG, foyer).map((leg) => leg.room)).toContain("drawing-room");
    expect(nextLegs(HOUSE_FIXTURE, CATALOG, { room: "foyer", left: 1 }).every((leg) => leg.route.length === 2)).toBe(true);
  });

  it("ends a move with nothing left, or nowhere to go", () => {
    expect(moveIsOver(HOUSE_FIXTURE, CATALOG, { room: "drawing-room", left: 0 })).toBe(true);
    expect(moveIsOver(HOUSE_FIXTURE, CATALOG, { room: "basement-landing", left: 4 })).toBe(true);
    expect(moveIsOver(HOUSE_FIXTURE, CATALOG, { room: "foyer", left: 1 })).toBe(false);
  });

  it("refuses a leg longer than the movement left, or from somewhere else", () => {
    const far = reachable(HOUSE_FIXTURE, CATALOG, "library", 4).find((leg) => leg.room === "bedroom");
    if (!far) throw new Error("The bedroom is out of reach");
    expect(() => afterLeg({ room: "library", left: 2 }, far)).toThrow(/more than/);
    expect(() => afterLeg({ room: "foyer", left: 4 }, far)).toThrow(/can't continue/);
  });
});
