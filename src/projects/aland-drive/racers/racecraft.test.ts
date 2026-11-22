import { describe, expect, it } from "vitest";
import type { Relative, SeenCar } from "./awareness";
import { craft, freshCraft, type Room } from "./racecraft";

/*
 * Racecraft on a straight road, cars placed on the racer's line by hand: the
 * rules the owner decided, each as the two numbers it gives the driver.
 */

const me = { speedMS: 30, lateralM: 0, offGridM: 1000, halfWidthM: 0.9, halfLengthM: 2.2 };
/** A 7 m carriageway with the line down its middle: 2.2 m of room each way for a car this wide. */
const room: Room = { rightM: 2.2, leftM: 2.2, middleM: 0, bridged: false };
const car = (id: string, alongM: number, lateralM: number, speedAlongMS: number, sameWay = true): Relative => ({
  car: { id, x: 0, z: 0, heading: 0, vx: 0, vz: 0, halfWidthM: 0.9, halfLengthM: 2.2 } satisfies SeenCar,
  alongM,
  lateralM,
  sameWay,
  speedAlongMS,
  meetLateralM: lateralM,
});

describe("racecraft", () => {
  it("holds its speed under a car ahead in its path, by a gap that grows with speed", () => {
    const slow = craft(me, () => 40, 0, 0, room, () => room, [car("a", 30, 0, 20)], freshCraft(), 1000);
    expect(slow.holdUnderMS).not.toBeNull();
    expect(slow.holdUnderMS ?? 0).toBeGreaterThan(20);
    expect(slow.holdUnderMS ?? 0).toBeLessThan(40);
    // On its bumper, slower than it.
    const close = craft(me, () => 40, 0, 0, room, () => room, [car("a", 7, 0, 20)], freshCraft(), 1000);
    expect(close.holdUnderMS).toBeLessThan(20);
    // A car beside the path doesn't hold it.
    expect(craft(me, () => 40, 0, 0, room, () => room, [car("a", 30, 3.5, 20)], freshCraft(), 1000).holdUnderMS).toBeNull();
  });

  it("passes a slow car on the side with room, and comes back once past", () => {
    // The slow car sits left of the line: the pass goes right.
    const started = craft(me, () => 40, 0, 0, room, () => room, [car("a", 25, -1, 20)], freshCraft(), 1000);
    expect(started.state.passing).toMatchObject({ id: "a", side: 1 });
    expect(started.offsetM).toBeGreaterThan(1);
    // Still behind it where it stands, it holds back for it; moved clear of it sideways, it doesn't.
    expect(started.holdUnderMS).not.toBeNull();
    const moved = craft({ ...me, lateralM: started.offsetM }, () => 40, 0, started.offsetM, room, () => room, [car("a", 15, -1, 20)], started.state, 1010);
    expect(moved.state.passing).not.toBeNull();
    expect(moved.holdUnderMS).toBeNull();
    // Not closing on one near the plan's own pace: no pass, hold behind.
    const abreast = craft({ ...me, speedMS: 36 }, () => 40, 0, 0, room, () => room, [car("a", 25, -1, 36)], freshCraft(), 1000);
    expect(abreast.state.passing).toBeNull();
    expect(abreast.holdUnderMS).not.toBeNull();
    // Just off its place on the grid, creeping up on a car that hasn't moved yet: it holds its lane.
    const launching = craft({ ...me, speedMS: 3, offGridM: 2 }, () => 40, 0, 0, room, () => room, [car("a", 12, -1, 0)], freshCraft(), 10);
    expect(launching.state.passing).toBeNull();
    // Alongside it, still out to the right.
    const beside = craft(me, () => 40, 0, started.offsetM, room, () => room, [car("a", 0, -1, 20)], started.state, 1030);
    expect(beside.state.passing).not.toBeNull();
    expect(beside.offsetM).toBeGreaterThan(1);
    // Clear of it: the pass is over and the line is the target again.
    const past = craft(me, () => 40, 0, beside.offsetM, room, () => room, [car("a", -10, -1, 20)], beside.state, 1060);
    expect(past.state.passing).toBeNull();
    expect(past.offsetM).toBe(0);
  });

  it("waits behind a stopped car with no way round, and goes round one by the verge where the road has no room", () => {
    // Crawling on the line of a narrow road: no room beside it, and it isn't stopped, so the racer waits behind it.
    const behind = craft({ ...me, speedMS: 0 }, () => 40, 0, 0, room, () => room, [car("a", 8, 0, 1.8)], freshCraft(), 1000);
    expect(behind.state.passing).toBeNull();
    expect(behind.waiting).toBe(true);
    // Stopped there, as the car ahead on a grid is until the lights: nothing to go round yet.
    const onGrid = craft({ ...me, speedMS: 0 }, () => 40, 0, 0, room, () => room, [car("a", 8, 0, 0)], freshCraft(), 1000);
    expect(onGrid.state.passing).toBeNull();
    expect(onGrid.waiting).toBe(true);
    // Still stopped once the racer has stood behind it a while: round it by the verge, past where the road's own room ends, and slowly.
    expect(craft({ ...me, speedMS: 0 }, () => 40, 0, 0, room, () => room, [car("a", 12, 0, 0)], { ...freshCraft(), stoodS: 3 }, 1000).state.passing).toBeNull();
    const round = craft({ ...me, speedMS: 0 }, () => 40, 0, 0, room, () => room, [car("a", 12, 0, 0)], { ...freshCraft(), stoodS: 9 }, 1000);
    expect(round.state.passing?.verge).toBe(true);
    expect(Math.abs(round.offsetM)).toBeGreaterThan(room.rightM);
    expect(round.waiting).toBe(false);
    expect(round.holdUnderMS).toBeGreaterThan(0);
    expect(round.holdUnderMS).toBeLessThan(10);
  });

  it("takes no side of a slow car that another is in the way on", () => {
    const wide: Room = { rightM: 3.5, leftM: 3.5, middleM: 0, bridged: false };
    // Two abreast at one pace, a little apart: no way by on the left, so it goes right; with one there too, it holds behind.
    const slow = car("a", 25, 0, 20);
    const left = car("b", 32, -2.4, 20);
    expect(craft(me, () => 40, 0, 0, wide, () => wide, [slow, left], freshCraft(), 1000).state.passing).toMatchObject({ id: "a", side: 1 });
    const both = craft(me, () => 40, 0, 0, wide, () => wide, [slow, left, car("c", 30, 2.4, 20)], freshCraft(), 1000);
    expect(both.state.passing).toBeNull();
    expect(both.holdUnderMS).not.toBeNull();
  });

  it("goes round a car stopped in the way of a pass it had begun on another", () => {
    const wide: Room = { rightM: 3.5, leftM: 3.5, middleM: 0, bridged: false };
    const passing = { passing: { id: "a", side: -1 as const, verge: false }, defence: null, stoodS: 9 };
    // Out to the left of a slow car, and stood behind one stopped there.
    const blocked = craft({ ...me, speedMS: 0, lateralM: -2.4 }, () => 40, 0, -2.4, wide, () => wide, [car("a", 6, 0, 0.2), car("t", 9, -2.6, 0)], passing, 1000);
    expect(blocked.state.passing).toMatchObject({ id: "t" });
  });

  it("queues behind a car stopped on a junction's apron, where there is no telling what the verge is", () => {
    const apron: Room = { ...room, rightM: 0, leftM: 0, bridged: true };
    const queued = craft({ ...me, speedMS: 0 }, () => 40, 0, 0, apron, () => apron, [car("a", 9, 0, 0)], { ...freshCraft(), stoodS: 6 }, 1000);
    expect(queued.state.passing).toBeNull();
    expect(queued.waiting).toBe(true);
    // A queue that never moves is something else: after long enough it is stuck there.
    expect(craft({ ...me, speedMS: 0 }, () => 40, 0, 0, apron, () => apron, [car("a", 9, 0, 0)], { ...freshCraft(), stoodS: 25 }, 1000).waiting).toBe(false);
  });

  it("passes on the inside into a bend, where both sides have room", () => {
    const wide: Room = { rightM: 3.5, leftM: 3.5, middleM: 0, bridged: false };
    const leftBend = craft(me, () => 40, -1 / 60, 0, wide, () => wide, [car("a", 25, 0, 20)], freshCraft(), 1000);
    expect(leftBend.state.passing?.side).toBe(-1);
    const rightBend = craft(me, () => 40, 1 / 60, 0, wide, () => wide, [car("a", 25, 0, 20)], freshCraft(), 1000);
    expect(rightBend.state.passing?.side).toBe(1);
    // On a narrow road a car on the line leaves no room either side: hold behind it.
    expect(craft(me, () => 40, -1 / 60, 0, room, () => room, [car("a", 25, 0, 20)], freshCraft(), 1000).state.passing).toBeNull();
  });

  it("meets an oncoming car on a narrow road at a pace, by the verge where the road hasn't room, and never stops for one it clears", () => {
    // A 7 m road, each on its own side: nothing to slow for.
    const clear = craft(me, () => 40, 0, 0, room, () => room, [car("t", 80, -1.5, -20, false)], freshCraft(), 1000);
    expect(clear.holdUnderMS).toBeNull();
    // A lane of 4.4 m: 0.9 m of room each way. The oncoming car is down its middle, so the road hasn't room for both.
    const lane: Room = { rightM: 0.9, leftM: 0.9, middleM: 0, bridged: false };
    const far = craft(me, () => 40, 0, 0, lane, () => lane, [car("t", 150, 0, -15, false)], freshCraft(), 1000);
    // Out on the verge, past the lane's own room, and slowing for the meeting rather than stopping where it stands.
    expect(far.offsetM).toBeGreaterThan(lane.rightM);
    expect(far.holdUnderMS).toBeGreaterThan(8);
    expect(far.holdUnderMS).toBeLessThan(40);
    const near = craft({ ...me, speedMS: 8, lateralM: far.offsetM }, () => 40, 0, far.offsetM, lane, () => lane, [car("t", 12, 0, -5, false)], freshCraft(), 1000);
    expect(near.holdUnderMS).toBeGreaterThan(0);
    expect(near.holdUnderMS).toBeLessThanOrEqual(8);
    expect(near.waiting).toBe(false);
  });

  it("moves out to pass a car it is closing on fast from far enough back to do it", () => {
    // Closing at 50 m/s on a car 120 m ahead: under three seconds away, and the road is wide.
    const wide: Room = { rightM: 4, leftM: 4, middleM: 0, bridged: false };
    const fast = craft({ ...me, speedMS: 70 }, () => 75, 0, 0, wide, () => wide, [car("t", 120, 0, 20)], freshCraft(), 1000);
    expect(fast.state.passing).not.toBeNull();
    // The same car, closed on gently, is not yet one to move out for.
    const gentle = craft({ ...me, speedMS: 24 }, () => 75, 0, 0, wide, () => wide, [car("t", 120, 0, 20)], freshCraft(), 1000);
    expect(gentle.state.passing).toBeNull();
  });

  it("keeps right of oncoming traffic until it has passed, and never passes into its side", () => {
    const oncoming = car("t", 80, -1.5, -20, false);
    const kept = craft(me, () => 40, 0, 0, room, () => room, [oncoming], freshCraft(), 1000);
    expect(kept.offsetM).toBeGreaterThan(0.5);
    const pass = craft(me, () => 40, 0, 0, room, () => room, [car("a", 25, 0.5, 20), oncoming], freshCraft(), 1000);
    expect(pass.state.passing).toBeNull();
    expect(pass.holdUnderMS).not.toBeNull();
    expect(craft(me, () => 40, 0, 0, room, () => room, [car("t", -10, -1.5, -20, false)], freshCraft(), 1000).offsetM).toBe(0);
  });

  it("passes traffic it is held behind without closing on it, and not a car a little off its pace", () => {
    const behind = { ...me, speedMS: 20 };
    // Sat behind a car at the road's limit where the plan is twice that: out it goes.
    expect(craft(behind, () => 40, 0, 0, room, () => room, [car("t", 12, -1, 20)], freshCraft(), 1000).state.passing).toMatchObject({ id: "t" });
    // Nose to tail with a car near the plan's pace: a queue.
    expect(craft({ ...me, speedMS: 36 }, () => 40, 0, 0, room, () => room, [car("a", 12, -1, 36)], freshCraft(), 1000).state.passing).toBeNull();
  });

  it("starts no pass on the other side of the road with something coming that it would meet before it was by", () => {
    // A wide road, the slow car on the right: the pass is by the left. What comes is well off, but a pass from behind a car at its own speed takes seconds.
    const wide: Room = { rightM: 2.2, leftM: 5.7, middleM: -1.75, bridged: false };
    const slow = car("t", 12, 1, 20);
    const behind = { ...me, speedMS: 20 };
    expect(craft(behind, () => 40, 0, 0, wide, () => wide, [slow], freshCraft(), 1000).state.passing).toMatchObject({ id: "t", side: -1 });
    expect(craft(behind, () => 40, 0, 0, wide, () => wide, [slow, car("o", 250, -3.5, -22, false)], freshCraft(), 1000).state.passing).toBeNull();
    // Far enough off for the pass to be over first, it goes.
    expect(craft(behind, () => 40, 0, 0, wide, () => wide, [slow, car("o", 390, -3.5, -22, false)], freshCraft(), 1000).state.passing).toMatchObject({ id: "t", side: -1 });
  });

  it("holds the inside once before a bend when caught, and doesn't weave", () => {
    const threat = car("b", -10, 0, 34);
    const first = craft(me, () => 40, 1 / 60, 0, room, () => room, [threat], freshCraft(), 1000);
    // A car's width or so to the inside, not the road's whole width.
    expect(first.offsetM).toBe(1.5);
    expect(first.state.defence).toEqual({ atM: 1000, side: 1 });
    // Through the bend it holds that side, even as a left kink enters its view, and a little later it is back on the line.
    expect(craft(me, () => 40, 1 / 60, first.offsetM, room, () => room, [threat], first.state, 1050).offsetM).toBe(1.5);
    expect(craft(me, () => 40, -1 / 60, first.offsetM, room, () => room, [threat], first.state, 1080).offsetM).toBe(1.5);
    const later = craft(me, () => 40, 1 / 60, first.offsetM, room, () => room, [threat], first.state, 1150);
    expect(later.offsetM).toBe(0);
    expect(later.state.defence).toEqual({ atM: 1000, side: 1 });
    // Standing still as the field streams past, or passed at a rush, there is nothing to defend.
    expect(craft({ ...me, speedMS: 0 }, () => 40, 1 / 60, 0, room, () => room, [car("b", -10, 0, 15)], freshCraft(), 1000).state.defence).toBeNull();
    expect(craft(me, () => 40, 1 / 60, 0, room, () => room, [car("b", -10, 0, 45)], freshCraft(), 1000).state.defence).toBeNull();
  });

  it("meets no one who is off the road: a walker coming along a path beside it changes nothing", () => {
    const walker = (lateralM: number): Relative => ({ ...car("w", 60, lateralM, -1.2, false), car: { id: "w", x: 0, z: 0, heading: 0, vx: 0, vz: 0, halfWidthM: 0.3, halfLengthM: 0.3 } });
    for (const lateralM of [8, -8]) {
      const by = craft(me, () => 40, 0, 0, room, () => room, [walker(lateralM)], freshCraft(), 1000);
      expect(by.offsetM).toBe(0);
      expect(by.holdUnderMS).toBeNull();
    }
    // One walking the racer's own edge of the road is left on that side, not squeezed past on the verge.
    const edge = craft(me, () => 40, 0, 0, room, () => room, [walker(3.2)], freshCraft(), 1000);
    expect(edge.offsetM).toBeLessThanOrEqual(3.2 - 0.3 - 0.9 - 0.8);
    expect(edge.holdUnderMS).toBeNull();
  });

  it("holds for a car that is beside its line now and will be on it when the racer gets there", () => {
    // In the next lane, where the line crosses to that lane before the racer reaches it.
    const crossing = { ...car("t", 60, 3.5, 6), meetLateralM: 0.3 };
    expect(craft(me, () => 40, 0, 0, room, () => room, [car("t", 60, 3.5, 6)], freshCraft(), 1000).holdUnderMS).toBeNull();
    const held = craft(me, () => 40, 0, 0, room, () => room, [crossing], freshCraft(), 1000);
    expect(held.holdUnderMS).not.toBeNull();
    expect(held.holdUnderMS ?? 0).toBeLessThan(30);
  });

  it("leaves a car's width side by side", () => {
    const beside = craft(me, () => 40, 0, 0, room, () => room, [car("a", 1, 1.2, 30)], freshCraft(), 1000);
    expect(beside.offsetM).toBeLessThan(-1);
    expect(beside.offsetM).toBeGreaterThanOrEqual(-room.leftM);
  });
});
