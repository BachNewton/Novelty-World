import { describe, expect, it } from "vitest";
import { openFloor } from "../open-floor";
import { NO_HINTS, type PlacementRoom } from "../placement";
import { INNER, onWall } from "../room";
import { MARK_FOOTPRINTS, MARK_ICON, markSpot } from "./mark-spot";

const PLAIN = { doors: [], passages: [], windows: [], frontDoor: null };

/** An open room with whatever `blocked` covers standing in it, a step up to the marks' height. */
function room(blocked: (x: number, z: number) => boolean = () => false): PlacementRoom {
  const floor = openFloor();
  const cells = [...floor.markClearance.keys()];
  const taken = cells.filter((cell) => blocked(...floor.centre(cell))).map((cell) => floor.centre(cell));
  for (const cell of cells) {
    const [x, z] = floor.centre(cell);
    const nearest = Math.min(Infinity, ...taken.map(([bx, bz]) => Math.hypot(x - bx, z - bz)));
    floor.markClearance[cell] = Math.min(floor.markClearance[cell], Math.max(0, nearest - 0.025));
  }
  return { floor, hints: NO_HINTS };
}

const PASSAGE = MARK_FOOTPRINTS["secret-passage"];

describe("where a connection's mark goes", () => {
  it("goes in the middle of the wall the game names, with its icon on the floor in front", () => {
    const spot = markSpot(room(), PLAIN, "secret-passage", ["left"]);
    expect(spot).toMatchObject({ edge: "left", fits: true });
    expect(Math.abs(spot.along)).toBeLessThan(0.05);
    const [x, z] = spot.icon;
    expect(x).toBeGreaterThan(-INNER + PASSAGE.depth);
    expect(Math.abs(z)).toBeLessThan(0.1);
  });

  it("moves along its wall off a piece standing against it", () => {
    // A bookcase across the middle of the top wall.
    const spot = markSpot(room((x, z) => z < -INNER + 0.5 && Math.abs(x) < 1.2), PLAIN, "secret-passage", ["top"]);
    expect(spot.fits).toBe(true);
    expect(spot.edge).toBe("top");
    expect(Math.abs(spot.along) - PASSAGE.width / 2).toBeGreaterThanOrEqual(1.2 - 0.025);
  });

  it("keeps the wall it is put on when that has no clear stretch: its art gives way, and its icon stands on the nearest clear floor", () => {
    const shelved = (x: number) => x > INNER - 0.6;
    const spot = markSpot(room(shelved), PLAIN, "wall-switch", ["right"]);
    expect(spot).toMatchObject({ edge: "right", fits: false });
    const [x] = spot.icon;
    // Read on the floor plan's grid, to within half a cell.
    expect(shelved(x + MARK_ICON.clear - 0.025)).toBe(false);
    expect(x).toBeGreaterThan(INNER - 0.6 - MARK_ICON.clear - 0.2);
  });

  it("goes into a corner, along either of its walls", () => {
    const spot = markSpot(room(), PLAIN, "wall-switch", ["top", "right"]);
    expect(spot).toMatchObject({ edge: "top", fits: true });
    expect(onWall("top", spot.along).at[0]).toBeGreaterThan(1.5);
    // With the top wall's end blocked, it takes the right wall's.
    const blocked = markSpot(room((x, z) => z < -INNER + 0.6 && x > 0), PLAIN, "wall-switch", ["top", "right"]);
    expect(blocked).toMatchObject({ edge: "right", fits: true });
    expect(onWall("right", blocked.along).at[1]).toBeLessThan(-1.2);
  });

  it("put on no wall in particular, takes a plain wall before one with a window or a doorway, and keeps off its doorway and window", () => {
    const tile = { doors: ["top", "right", "left"] as const, passages: [], windows: ["bottom", "right"] as const, frontDoor: null };
    const spot = markSpot(room(), { ...tile, doors: [...tile.doors], windows: [...tile.windows] }, "secret-stairs", null);
    expect(spot.edge).toBe("bottom");
    expect(Math.abs(spot.along) - MARK_FOOTPRINTS["secret-stairs"].width / 2).toBeGreaterThanOrEqual(0.5);
    const doorway = markSpot(room(), { doors: ["top", "right", "bottom", "left"], passages: [], windows: [], frontDoor: null }, "secret-stairs", ["top"]);
    expect(Math.abs(doorway.along) - MARK_FOOTPRINTS["secret-stairs"].width / 2).toBeGreaterThanOrEqual(0.55);
  });

  it("keeps off the stretch another mark already takes", () => {
    const first = markSpot(room(), PLAIN, "secret-passage", ["left"]);
    const second = markSpot(room(), PLAIN, "secret-passage", ["left"], [{ edge: "left", from: first.along - PASSAGE.width / 2, to: first.along + PASSAGE.width / 2 }]);
    expect(Math.abs(second.along - first.along)).toBeGreaterThanOrEqual(PASSAGE.width - 1e-9);
  });
});
