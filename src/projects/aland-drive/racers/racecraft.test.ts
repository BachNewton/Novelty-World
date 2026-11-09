import { describe, expect, it } from "vitest";
import type { Relative, SeenCar } from "./awareness";
import { craft, freshCraft, type Room } from "./racecraft";

/*
 * Racecraft on a straight road, cars placed on the racer's line by hand: the
 * rules the owner decided, each as the two numbers it gives the driver.
 */

const me = { speedMS: 30, halfWidthM: 0.9, halfLengthM: 2.2 };
/** A 7 m carriageway with the line down its middle: 2.2 m of room each way for a car this wide. */
const room: Room = { rightM: 2.2, leftM: 2.2, middleM: 0 };
const car = (id: string, alongM: number, lateralM: number, speedAlongMS: number, sameWay = true): Relative => ({
  car: { id, x: 0, z: 0, heading: 0, vx: 0, vz: 0, halfWidthM: 0.9, halfLengthM: 2.2 } satisfies SeenCar,
  alongM,
  lateralM,
  sameWay,
  speedAlongMS,
});

describe("racecraft", () => {
  it("holds its speed under a car ahead in its path, by a gap that grows with speed", () => {
    const slow = craft(me, () => 40, 0, 0, room, [car("a", 30, 0, 20)], freshCraft(), 1000);
    expect(slow.holdUnderMS).not.toBeNull();
    expect(slow.holdUnderMS ?? 0).toBeGreaterThan(20);
    expect(slow.holdUnderMS ?? 0).toBeLessThan(40);
    // On its bumper, slower than it.
    const close = craft(me, () => 40, 0, 0, room, [car("a", 7, 0, 20)], freshCraft(), 1000);
    expect(close.holdUnderMS).toBeLessThan(20);
    // A car beside the path doesn't hold it.
    expect(craft(me, () => 40, 0, 0, room, [car("a", 30, 3.5, 20)], freshCraft(), 1000).holdUnderMS).toBeNull();
  });

  it("passes a slow car on the side with room, and comes back once past", () => {
    // The slow car sits left of the line: the pass goes right.
    const started = craft(me, () => 40, 0, 0, room, [car("a", 25, -1, 20)], freshCraft(), 1000);
    expect(started.state.passing).toEqual({ id: "a", side: 1 });
    expect(started.offsetM).toBeGreaterThan(1);
    expect(started.holdUnderMS).toBeNull();
    // Not closing on it, as off a standing start where everyone ahead is slow: no pass, hold behind.
    const abreast = craft({ ...me, speedMS: 20 }, () => 40, 0, 0, room, [car("a", 25, -1, 20)], freshCraft(), 1000);
    expect(abreast.state.passing).toBeNull();
    expect(abreast.holdUnderMS).not.toBeNull();
    // Alongside it, still out to the right.
    const beside = craft(me, () => 40, 0, started.offsetM, room, [car("a", 0, -1, 20)], started.state, 1030);
    expect(beside.state.passing).not.toBeNull();
    expect(beside.offsetM).toBeGreaterThan(1);
    // Clear of it: the pass is over and the line is the target again.
    const past = craft(me, () => 40, 0, beside.offsetM, room, [car("a", -10, -1, 20)], beside.state, 1060);
    expect(past.state.passing).toBeNull();
    expect(past.offsetM).toBe(0);
  });

  it("passes on the inside into a bend, where both sides have room", () => {
    const wide: Room = { rightM: 3.5, leftM: 3.5, middleM: 0 };
    const leftBend = craft(me, () => 40, -1 / 60, 0, wide, [car("a", 25, 0, 20)], freshCraft(), 1000);
    expect(leftBend.state.passing?.side).toBe(-1);
    const rightBend = craft(me, () => 40, 1 / 60, 0, wide, [car("a", 25, 0, 20)], freshCraft(), 1000);
    expect(rightBend.state.passing?.side).toBe(1);
    // On a narrow road a car on the line leaves no room either side: hold behind it.
    expect(craft(me, () => 40, -1 / 60, 0, room, [car("a", 25, 0, 20)], freshCraft(), 1000).state.passing).toBeNull();
  });

  it("keeps right of oncoming traffic until it has passed, and never passes into its side", () => {
    const oncoming = car("t", 80, -1.5, -20, false);
    const kept = craft(me, () => 40, 0, 0, room, [oncoming], freshCraft(), 1000);
    expect(kept.offsetM).toBeGreaterThan(0.5);
    const pass = craft(me, () => 40, 0, 0, room, [car("a", 25, 0.5, 20), oncoming], freshCraft(), 1000);
    expect(pass.state.passing).toBeNull();
    expect(pass.holdUnderMS).not.toBeNull();
    expect(craft(me, () => 40, 0, 0, room, [car("t", -10, -1.5, -20, false)], freshCraft(), 1000).offsetM).toBe(0);
  });

  it("holds the inside once before a bend when caught, and doesn't weave", () => {
    const threat = car("b", -10, 0, 34);
    const first = craft(me, () => 40, 1 / 60, 0, room, [threat], freshCraft(), 1000);
    expect(first.offsetM).toBe(room.rightM);
    expect(first.state.defence).toEqual({ atM: 1000, side: 1 });
    // Through the bend it holds that side, even as a left kink enters its view, and a little later it is back on the line.
    expect(craft(me, () => 40, 1 / 60, first.offsetM, room, [threat], first.state, 1050).offsetM).toBe(room.rightM);
    expect(craft(me, () => 40, -1 / 60, first.offsetM, room, [threat], first.state, 1080).offsetM).toBe(room.rightM);
    const later = craft(me, () => 40, 1 / 60, first.offsetM, room, [threat], first.state, 1150);
    expect(later.offsetM).toBe(0);
    expect(later.state.defence).toEqual({ atM: 1000, side: 1 });
    // Standing still as the field streams past, or passed at a rush, there is nothing to defend.
    expect(craft({ ...me, speedMS: 0 }, () => 40, 1 / 60, 0, room, [car("b", -10, 0, 15)], freshCraft(), 1000).state.defence).toBeNull();
    expect(craft(me, () => 40, 1 / 60, 0, room, [car("b", -10, 0, 45)], freshCraft(), 1000).state.defence).toBeNull();
  });

  it("leaves a car's width side by side", () => {
    const beside = craft(me, () => 40, 0, 0, room, [car("a", 1, 1.2, 30)], freshCraft(), 1000);
    expect(beside.offsetM).toBeLessThan(-1);
    expect(beside.offsetM).toBeGreaterThanOrEqual(-room.leftM);
  });
});
