import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  NEAR_HEIGHT_LIMIT,
  ROAD_LEFT,
  ROAD_RIGHT,
  TALL_OFFSET,
  boxArea,
  boxBottom,
  boxTop,
  overlaps,
  pullOffArea,
  roadArea,
  sideX,
  type Area,
  type WorldBox,
} from "./geometry";
import { WORLD_PAINTS, worldToken } from "./paints";
import { PREVIEW_ROWS, passingPose } from "./preview-rows";
import { ROAD_TILE, roadTile, roadTiles, structuresNear, type WorldPlan } from "./road";
import { SCENERY_TILE, sceneryTile } from "./scenery";
import { DECK_UNDERSIDE, HEADROOM, VEHICLE_TOP, gantryBoxes, overpassBoxes } from "./structures";

const PLAN: WorldPlan = {
  seed: 20260930,
  courseLength: 214,
  pullOffs: [
    { side: "left", near: 40, far: 46, width: 3 },
    { side: "right", near: 95, far: 101, width: 3 },
    { side: "left", near: 150, far: 156, width: 3 },
  ],
};

// Every tile from well behind the start to well past the finish.
const COURSE_TILES = Array.from({ length: 16 }, (_, i) => i - 4);

function propsOf(plan: WorldPlan): WorldBox[] {
  return COURSE_TILES.flatMap((k) => roadTile(plan, k).props);
}

const lanes: Area = { minX: ROAD_LEFT, maxX: ROAD_RIGHT, minDepth: -Infinity, maxDepth: Infinity };

describe("the roadside", () => {
  it("is the same for the same seed, and differs for another", () => {
    expect(propsOf(PLAN)).toEqual(propsOf(PLAN));
    expect(propsOf({ ...PLAN, seed: 1 })).not.toEqual(propsOf(PLAN));
    expect(sceneryTile(PLAN, 2)).toEqual(sceneryTile(PLAN, 2));
  });

  it("puts something along every side of the course", () => {
    const props = propsOf(PLAN);
    expect(props.some((b) => b.center[0] < ROAD_LEFT)).toBe(true);
    expect(props.some((b) => b.center[0] > ROAD_RIGHT)).toBe(true);
  });

  it("keeps everything off the road and out of the pull-offs", () => {
    const blocked = [roadArea(-Infinity, Infinity), ...PLAN.pullOffs.map(pullOffArea)];
    const intruders = propsOf(PLAN).filter((b) => blocked.some((area) => overlaps(boxArea(b), area)));
    expect(intruders).toEqual([]);
  });

  it("keeps the land beyond out of the lanes and the pull-offs too", () => {
    const blocked = [lanes, ...PLAN.pullOffs.map(pullOffArea)];
    const scenery = [-2, -1, 0, 1, 2, 3, 4].flatMap((k) => sceneryTile(PLAN, k));
    expect(scenery.filter((b) => blocked.some((area) => overlaps(boxArea(b), area)))).toEqual([]);
  });

  it("leaves a gap in the shoulders and kerbs for each pull-off", () => {
    const surfaces = COURSE_TILES.flatMap((k) => roadTile(PLAN, k).surfaces).filter((b) => b.paint !== "asphalt");
    const inPullOffs = surfaces.filter((b) => PLAN.pullOffs.some((p) => overlaps(boxArea(b), pullOffArea(p))));
    expect(inPullOffs).toEqual([]);
  });

  it("stays low near the road, with anything taller standing back", () => {
    const tooTall = [...propsOf(PLAN), ...[-1, 0, 1, 2, 3].flatMap((k) => sceneryTile(PLAN, k))].filter((b) => {
      if (boxTop(b) <= NEAR_HEIGHT_LIMIT) return false;
      const area = boxArea(b);
      return area.maxX > sideX("left", TALL_OFFSET) && area.minX < sideX("right", TALL_OFFSET);
    });
    expect(tooTall).toEqual([]);
  });
});

describe("the road", () => {
  function covered(camera: number): [number, number][] {
    return roadTiles(camera)
      .flatMap((k) => roadTile(PLAN, k).surfaces)
      .filter((b) => b.paint === "asphalt")
      .map((b) => {
        const area = boxArea(b);
        return [area.minDepth, area.maxDepth] as [number, number];
      })
      .sort((a, b) => a[0] - b[0]);
  }

  it.each([-100000, -5000, -45, -3, 0, 107, 214, 900, 100000])("runs unbroken around a camera at depth %d", (camera) => {
    const pieces = covered(camera);
    for (let i = 1; i < pieces.length; i++) expect(pieces[i][0]).toBeCloseTo(pieces[i - 1][1]);
    expect(pieces[0][0]).toBeLessThanOrEqual(camera - 20);
    expect(pieces[pieces.length - 1][1]).toBeGreaterThanOrEqual(camera + 520);
  });

  it.each([-5000, 5000])("keeps its roadside and land far from the course, around depth %d", (camera) => {
    const tiles = roadTiles(camera).filter((k) => Math.abs(k * ROAD_TILE - camera) < 100);
    const props = tiles.flatMap((k) => roadTile(PLAN, k).props);
    expect(props.some((b) => b.center[0] < ROAD_LEFT)).toBe(true);
    expect(props.some((b) => b.center[0] > ROAD_RIGHT)).toBe(true);
    expect(sceneryTile(PLAN, Math.floor(camera / SCENERY_TILE)).length).toBeGreaterThan(0);
  });
});

describe("the structures", () => {
  it("let the tallest vehicle, lifted, pass under with headroom", () => {
    expect(DECK_UNDERSIDE).toBeGreaterThanOrEqual(VEHICLE_TOP + HEADROOM);
  });

  it("stand clear of the lanes and verges below their decks", () => {
    for (const boxes of [overpassBoxes(), gantryBoxes(PLAN.courseLength)]) {
      const below = boxes.filter((b) => boxBottom(b) < DECK_UNDERSIDE - 1e-9);
      expect(below.filter((b) => overlaps(boxArea(b), roadArea(-Infinity, Infinity)))).toEqual([]);
    }
  });

  it("have decks wide and deep enough for a frog across every lane", () => {
    const deck = (boxes: WorldBox[]): Area => boxArea(boxes[0]);
    for (const area of [deck(overpassBoxes()), deck(gantryBoxes(PLAN.courseLength))]) {
      expect(area.minX).toBeLessThan(ROAD_LEFT);
      expect(area.maxX).toBeGreaterThan(ROAD_RIGHT);
      expect(area.maxDepth - area.minDepth).toBeGreaterThanOrEqual(2);
    }
  });

  it("appear when the camera is near them", () => {
    expect(structuresNear(PLAN, roadTiles(-8)).length).toBeGreaterThan(0);
    expect(structuresNear(PLAN, roadTiles(-5000))).toEqual([]);
  });
});

describe("the world's paints", () => {
  it("each have a design token", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(WORLD_PAINTS.filter((paint) => !css.includes(`${worldToken(paint)}:`))).toEqual([]);
  });
});

describe("the preview's rows", () => {
  it.each(PREVIEW_ROWS.map((row, i) => [i, row] as const))("row %d lets an L through", (_, row) => {
    expect(passingPose(row)).not.toBeNull();
  });
});
