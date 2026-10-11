import { describe, expect, it } from "vitest";
import { openFloor } from "./open-floor";
import { NO_HINTS, placeFigures, type PlacingFigure, type Placement } from "./placement";
import { INNER } from "./room";

const people = (n: number): PlacingFigure[] => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, size: "person" }));
const distances = (placement: Placement) => {
  const all = Object.values(placement.figures);
  return all.flatMap((a, i) => all.slice(i + 1).map((b) => Math.hypot(a.x - b.x, a.z - b.z)));
};
const moved = (a: Placement, b: Placement) => Object.keys(a.figures).filter((id) => b.figures[id].x !== a.figures[id].x || b.figures[id].z !== a.figures[id].z).sort();

describe("placeFigures", () => {
  const room = openFloor(INNER);
  const prime = { ...NO_HINTS, prime: [0, 0] as const };

  it("stands a few explorers apart, rings never touching", () => {
    const placement = placeFigures(room, NO_HINTS, people(3));
    expect(placement.crowding).toBe(0);
    expect(Math.min(...distances(placement))).toBeGreaterThanOrEqual(1.25 - 1e-9);
    expect(placement.badge).toBeNull();
  });

  it("puts the first to arrive on the prime place", () => {
    const placement = placeFigures(room, { ...NO_HINTS, prime: [1, 1] }, people(3));
    expect(placement.figures.p0).toMatchObject({ x: 1, z: 1, crowding: 0 });
  });

  it("is deterministic", () => {
    const figures = [...people(6), { id: "spider", size: "large" as const }];
    expect(placeFigures(room, NO_HINTS, figures)).toEqual(placeFigures(room, NO_HINTS, figures));
  });

  it("degrades in steps past capacity and never fails", () => {
    const small = openFloor(1.6);
    const levels = [2, 6, 12, 20].map((n) => placeFigures(small, NO_HINTS, people(n)));
    const crowding = levels.map((placement) => placement.crowding);
    expect(crowding).toEqual([...crowding].sort());
    expect(crowding[0]).toBe(0);
    expect(levels[3].badge).toBe(20);
    expect(Object.keys(levels[3].figures)).toHaveLength(20);
  });

  it("coils a large figure before anyone stands behind another", () => {
    const tight = openFloor(1.8);
    const placement = placeFigures(tight, NO_HINTS, [...people(6), { id: "spider", size: "large" }]);
    expect(placement.figures.spider.pose).toBe("crowded");
  });

  it("keeps each figure's place when another arrives", () => {
    const first = placeFigures(room, prime, people(4));
    const next = placeFigures(room, prime, people(5), first.figures);
    expect(moved(first, next)).toEqual([]);
  });

  it("keeps each figure's place when another leaves, the prime place too", () => {
    const first = placeFigures(room, prime, people(4));
    const next = placeFigures(room, prime, people(4).slice(1), first.figures);
    expect(moved({ ...first, figures: Object.fromEntries(Object.entries(first.figures).slice(1)) }, next)).toEqual([]);
  });

  it("moves only the explorer stepping onto the prime place and whoever stood there", () => {
    const first = placeFigures(room, prime, people(4));
    expect(first.figures.p0).toMatchObject({ x: 0, z: 0 });
    const next = placeFigures(room, prime, people(4), first.figures, "p2");
    expect(next.figures.p2).toMatchObject({ x: 0, z: 0 });
    expect(moved(first, next)).toEqual(["p0", "p2"]);
    expect(next.crowding).toBe(0);
  });

  it("in a crowd, moves only those standing near enough the prime place to be crowded by the stepper", () => {
    const small = openFloor(1.6);
    const first = placeFigures(small, prime, people(8));
    expect(first.crowding).toBeGreaterThan(0);
    const next = placeFigures(small, prime, people(8), first.figures, "p5");
    expect(next.figures.p5).toMatchObject({ x: 0, z: 0 });
    expect(moved(first, next)).toContain("p0");
    const far = Object.keys(first.figures).filter((id) => Math.hypot(first.figures[id].x, first.figures[id].z) >= 1.25);
    for (const id of far) expect(moved(first, next)).not.toContain(id);
  });

  it("keeps out of the keep-clear areas while the room has room", () => {
    const keepClear = [{ from: [-INNER, 0] as const, to: [INNER, 0] as const, radius: 0.8 }];
    const placement = placeFigures(room, { ...NO_HINTS, keepClear }, people(6));
    for (const placed of Object.values(placement.figures)) expect(Math.abs(placed.z)).toBeGreaterThanOrEqual(0.8);
  });

  it("keeps off the walking lanes until rings overlap", () => {
    const lanes = [{ from: [0, -INNER] as const, to: [0, INNER] as const, radius: 0.72 }];
    const placement = placeFigures(room, { ...NO_HINTS, lanes }, people(4));
    expect(placement.crowding).toBe(0);
    for (const placed of Object.values(placement.figures)) expect(Math.abs(placed.x)).toBeGreaterThanOrEqual(0.72);
  });

  it("stands figures only on their own half of a barrier room", () => {
    const placement = placeFigures(room, { ...NO_HINTS, within: (x) => x > 0 }, people(4));
    for (const placed of Object.values(placement.figures)) expect(placed.x).toBeGreaterThan(0);
  });
});
