import { describe, expect, it } from "vitest";
import { frogCells } from "../logic";
import { TUNING } from "../tuning";
import { LAYER, type Vec3 } from "../vehicles/parts";
import { VEHICLES } from "../vehicles";
import { faceClashes, spanning } from "../world/coplanar";
import { PREVIEW_PIECES, PREVIEW_ROWS, startPoses } from "../world/preview-rows";
import { HEADROOM, VEHICLE_TOP } from "../world/structures";
import { BOB, HELI_DECK_TOP, aboardFrogDepth, cruiseDepth, frogLeap, heliPose, rowAhead } from "./flight";
import { DECK_HALF_LENGTH, DECK_THICKNESS, RAIL_TOP, heliModel, type HeliPart, type Rotor } from "./model";

const LANES = 10;
const [ROAD_LEFT, ROAD_RIGHT] = [-0.5, LANES - 0.5];
const model = heliModel(LANES);
const EPSILON = 1e-9;

const overRoad = (min: number, max: number): boolean => max > ROAD_LEFT + EPSILON && min < ROAD_RIGHT - EPSILON;

// A rotor's reach across the road, whichever way round it has turned.
function rotorAcross(rotor: Rotor): [number, number] {
  const [cx] = rotor.centre;
  if (rotor.axis === "y") return [cx - rotor.radius, cx + rotor.radius];
  const xs = rotor.parts.flatMap((p) => [p.min[0], p.max[0]]);
  return [cx + Math.min(...xs), cx + Math.max(...xs)];
}

describe("the Lily Lifter", () => {
  it("spans the road with its deck, a tile per lane, the frogs' feet on its top", () => {
    const tiles = model.body.filter((p) => p.paint === "deck");
    expect(tiles.map((t) => [t.min[0], t.max[0]])).toEqual(Array.from({ length: LANES }, (_, k) => [k - 0.5, k + 0.5]));
    tiles.forEach((t) => {
      expect(t.max[1]).toBe(0);
    });
  });

  it("carries the traffic clear under its deck, with the overpass's headroom, as it bobs", () => {
    expect(HELI_DECK_TOP - BOB - DECK_THICKNESS).toBeGreaterThanOrEqual(VEHICLE_TOP + HEADROOM - EPSILON);
  });

  it("has nothing over the lanes but its deck and the low railing on its back edge", () => {
    const over = model.body.filter((p) => overRoad(p.min[0], p.max[0]));
    expect(over.length).toBeGreaterThan(0);
    over.forEach((p) => {
      expect(p.min[1]).toBeGreaterThanOrEqual(-DECK_THICKNESS);
      expect(p.max[1]).toBeLessThanOrEqual(RAIL_TOP);
      expect(p.min[2]).toBeGreaterThanOrEqual(-DECK_HALF_LENGTH);
      expect(p.max[2]).toBeLessThanOrEqual(DECK_HALF_LENGTH);
    });
    model.rotors.forEach((rotor) => {
      expect(overRoad(...rotorAcross(rotor))).toBe(false);
    });
  });

  it("stands the co-op pair wholly on its deck, each in its own half of the road", () => {
    const frogs = startPoses(LANES, PREVIEW_PIECES.coop);
    frogs.forEach((frog, i) => {
      frogCells(frog).forEach(({ col }) => {
        expect(col).toBeGreaterThanOrEqual((i * LANES) / 2);
        expect(col).toBeLessThan(((i + 1) * LANES) / 2);
      });
    });
    // The frogs are a cell deep, centred on the deck.
    const front = aboardFrogDepth(0);
    expect(front).toBeLessThanOrEqual(DECK_HALF_LENGTH);
    expect(front - 1).toBeGreaterThanOrEqual(-DECK_HALF_LENGTH);
  });

  it("lays no two faces of different paints in one plane", () => {
    const boxes = (parts: readonly HeliPart[], at: Vec3 = [0, 0, 0]) =>
      parts
        .filter((p) => p.shape === "box")
        .map((p) => ({
          ...spanning([p.min[0] + at[0], p.min[1] + at[1], p.min[2] + at[2]], [p.max[0] + at[0], p.max[1] + at[1], p.max[2] + at[2]]),
          paint: p.paint,
        }));
    const scanned = [model.body, ...model.rotors.map((r) => r.parts)].flatMap((parts) =>
      faceClashes(boxes(parts), LAYER / 2, { lowest: -Infinity, highest: Infinity }).filter(({ a, b }) => a.paint !== b.paint),
    );
    expect(scanned).toEqual([]);
  });
});

describe("the flight", () => {
  const START = -1000;
  const rows = [...PREVIEW_ROWS.coop[10], ...PREVIEW_ROWS.coop[10]];
  const rowLength = (i: number) => Math.max(...rows[i].map((v) => VEHICLES[v.id].length));

  it("lands the frogs in a gap in the traffic, with a reading room before the next row, whenever they jump", () => {
    for (const jumpedAt of [0, 1.3, 7.9, 30]) {
      const from = aboardFrogDepth(cruiseDepth(START, jumpedAt));
      const landing = frogLeap(from, HELI_DECK_TOP, TUNING.dropDuration);
      const landedAt = jumpedAt + TUNING.dropDuration;
      const ahead = rows.map((_, i) => rowAhead(i, rows.length, landedAt, START, landing.depth));
      rows.forEach((_, i) => {
        // Either wholly behind the frogs' backs, or its front ahead of theirs.
        const clear = ahead[i] + rowLength(i) < -1 || ahead[i] > 0;
        expect(clear).toBe(true);
      });
      expect(Math.min(...ahead.filter((a) => a > 0))).toBeGreaterThanOrEqual(5);
    }
  });

  it("flies off up the road beside it, never over the lanes ahead of the camera", () => {
    // The farthest any of it reaches from the deck's middle, across or along
    // the road, however it has turned.
    const corners = [
      ...model.body.flatMap((p) => [p.min, p.max, [p.min[0], 0, p.max[2]] as Vec3, [p.max[0], 0, p.min[2]] as Vec3]),
      ...model.rotors.flatMap((r) => [
        [r.centre[0] - r.radius, 0, r.centre[2] - r.radius] as Vec3,
        [r.centre[0] + r.radius, 0, r.centre[2] + r.radius] as Vec3,
      ]),
    ];
    const middle = (LANES - 1) / 2;
    const reach = Math.max(...corners.map(([x, , z]) => Math.hypot(Math.abs(x - middle) + 0.5, Math.abs(z) + 0.5)));
    const jumpedAt = 4;
    const from = aboardFrogDepth(cruiseDepth(START, jumpedAt));
    const camera = frogLeap(from, HELI_DECK_TOP, TUNING.dropDuration).depth - TUNING.cameraFollow;
    let ahead = 0;
    for (let s = 0; s < 12; s += 0.05) {
      const pose = heliPose(START, middle, jumpedAt + s, jumpedAt);
      if (pose.depth - reach > camera) {
        ahead++;
        expect(pose.x - reach).toBeGreaterThan(ROAD_RIGHT);
      }
    }
    expect(ahead).toBeGreaterThan(0);
  });
});
