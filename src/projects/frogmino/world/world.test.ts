import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TUNING } from "../tuning";
import { faceClashes, type EyeHeights, type FaceClash } from "./coplanar";
import {
  GROUND_DROP,
  NEAR_HEIGHT_LIMIT,
  ROAD_LEFT,
  ROAD_RIGHT,
  TALL_OFFSET,
  box,
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
import { propBoxes, type PropKind } from "./props";
import { ROAD_TILE, roadTile, roadTiles, structuresNear, type WorldPlan } from "./road";
import { SCENERY_TILE, cloudPlace, clouds, sceneryTile } from "./scenery";
import { DECK_TOP, DECK_UNDERSIDE, HEADROOM, MARK_THICKNESS, VEHICLE_TOP, gantryBoxes, overpassBoxes } from "./structures";

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

describe("depth fighting", () => {
  // The camera rides at its height above the road, or above a deck.
  const EYE: EyeHeights = { lowest: TUNING.cameraHeight, highest: DECK_TOP + TUNING.cameraHeight };
  // The land under everything, drawn as a plane whose top is this box's.
  const ground = box([0, -GROUND_DROP - 0.5, 0], [4000, 1, 4000], "meadow");
  const ALL_TILES = Array.from({ length: 16 }, (_, i) => i - 4);

  function roadOf(plan: WorldPlan, tiles: readonly number[]) {
    const road = tiles.map((k) => roadTile(plan, k));
    return {
      surfaces: road.flatMap((t) => t.surfaces),
      markings: road.flatMap((t) => t.markings),
      props: road.flatMap((t) => t.props),
    };
  }

  // Paint over the same paint, in the plain markings material, is one colour
  // whichever wins, so it can't flicker: the arms of a chevron overlap.
  function visible(clashes: FaceClash[], markings: readonly WorldBox[]): FaceClash[] {
    const marks = new Set(markings);
    return clashes.filter(({ a, b }) => !(a.paint === b.paint && marks.has(a) && marks.has(b)));
  }

  const describeClash = ({ a, b, gap }: FaceClash): string => `${a.paint} at ${a.center.join(",")} ~ ${b.paint} at ${b.center.join(",")}, ${gap.toFixed(4)} apart`;

  it("the scanner finds faces sharing a plane, and only those", () => {
    const slab = box([0, 0.5, 0], [2, 1, 2], "rock");
    const scan = (boxes: WorldBox[], minGap = 0.01) => faceClashes(boxes, minGap, EYE).length;
    // A decal lying in the slab's top, and one lifted a layer clear of it.
    expect(scan([slab, box([0, 0.995, 0], [1, 0.01, 1], "sign")])).toBe(1);
    expect(scan([slab, box([0, 1.005, 0], [1, 0.01, 1], "sign")])).toBe(0);
    expect(scan([slab, box([0, 1.005, 0], [1, 0.01, 1], "sign")], 0.02)).toBe(1);
    // A turned decal still overlaps.
    expect(scan([slab, { ...box([0, 0.995, 0], [1, 0.01, 1], "sign"), yaw: 0.7 }])).toBe(1);
    // Stacked, or side by side: faces meet looking opposite ways, or only
    // along an edge.
    expect(scan([slab, box([0, 1.5, 0], [2, 1, 2], "rock")])).toBe(0);
    expect(scan([slab, box([2, 0.5, 0], [2, 1, 2], "rock")])).toBe(0);
    // A box set into another, flush with its top, shares that plane; the
    // bottoms they share look down, away from a camera above them.
    expect(scan([slab, box([0, 0.5, 0], [1, 1, 1], "sign")])).toBe(1);
    // A decal on the slab's front, and a smaller one laid over it: their backs
    // lie against the slab, buried, but their fronts must stand apart.
    const decal = box([0, 0.5, 1.01], [1, 0.5, 0.02], "sign");
    expect(scan([slab, decal, box([0, 0.5, 1.0175], [0.5, 0.25, 0.035], "sign-ink")])).toBe(0);
    expect(scan([slab, decal, box([0, 0.5, 1.0125], [0.5, 0.25, 0.025], "sign-ink")])).toBe(1);
    // Laid over it edge to edge, the two decals' sides share a plane.
    expect(scan([slab, decal, box([0.25, 0.5, 1.0175], [0.5, 0.25, 0.035], "sign-ink")])).toBe(1);
  });

  it("keeps the hand-built parts at least a paint layer apart", () => {
    const finishTiles = [-1, 0, Math.floor(PLAN.courseLength / ROAD_TILE), Math.floor(PLAN.courseLength / ROAD_TILE) + 1];
    const road = roadOf(PLAN, finishTiles);
    const built = [ground, ...road.surfaces, ...road.markings, ...overpassBoxes(), ...gantryBoxes(PLAN.courseLength)];
    expect(visible(faceClashes(built, MARK_THICKNESS, EYE), road.markings).map(describeClash)).toEqual([]);

    const kinds: PropKind[] = ["guardRail", "reflectorPost", "frogSign", "blockSign", "cone", "rock", "shrub", "mailbox", "roundTree", "pine"];
    for (const kind of kinds) {
      const parts = propBoxes({ kind, x: 0, depth: 0, yaw: 0, scale: 1 });
      expect(faceClashes([ground, ...parts], MARK_THICKNESS, EYE).map(describeClash)).toEqual([]);
    }
  });

  it.each([PLAN.seed, 1, 2, 3])("lays no two faces of the whole world in one plane, for seed %d", (seed) => {
    const plan = { ...PLAN, seed };
    const road = roadOf(plan, ALL_TILES);
    const sky = clouds(seed).flatMap((cloud) => {
      const { x, depth } = cloudPlace(cloud, 0, 0);
      return cloud.boxes.map((b) => box([x + b.center[0], cloud.y + b.center[1], -depth + b.center[2]], b.size, b.paint));
    });
    const world = [
      ground,
      ...road.surfaces,
      ...road.markings,
      ...road.props,
      ...structuresNear(plan, ALL_TILES),
      ...[-2, -1, 0, 1, 2, 3, 4].flatMap((k) => sceneryTile(plan, k)),
      ...sky,
    ];
    expect(visible(faceClashes(world, 1e-4, EYE), road.markings).map(describeClash)).toEqual([]);
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
