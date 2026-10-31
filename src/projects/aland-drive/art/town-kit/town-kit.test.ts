import { describe, expect, it } from "vitest";
import { buildFerry } from "../landmarks/ferry";
import type { RoadsideModel } from "../roadside/models";
import { buildBalticFerry, buildBicycle, buildBusStopPole, buildCrossingPole, buildHangingLamp, buildMarinaDeck, buildMooredLaunch, buildMooredYacht, buildStreetNamePlate, buildStreetNamePost, buildTerminal, buildTownLamp, buildTrafficLight, buildVillagePlate, buildVillageSign, buildWindowBox, clearOfRoads, deliveryVan, FERRY_BERTH, ferryPlace, LEG_ROAD_CLEAR_M, marinaRow, signalsAtJunction, terminalFeet } from "./index";

const triangles = (geometry: RoadsideModel["near"] | null) => (geometry?.index?.count ?? 0) / 3;

// The brief's limits: an object placed by the hundred mustn't creep past them as it's worked on.
describe("town triangle budgets", () => {
  const small: Record<string, RoadsideModel> = {
    lamp: buildTownLamp(),
    signal: buildTrafficLight(),
    plate: buildStreetNamePlate(),
    post: buildStreetNamePost(),
    crossing: buildCrossingPole(),
    bicycle: buildBicycle(),
    hanging: buildHangingLamp(),
    box: buildWindowBox(),
    village: buildVillageSign(),
    villagePlate: buildVillagePlate(),
    bus: buildBusStopPole(),
    deck: buildMarinaDeck(),
    yacht: buildMooredYacht(),
    launch: buildMooredLaunch(),
  };

  it.each(Object.entries(small))("%s stays small", (_, model) => {
    expect(triangles(model.near)).toBeLessThan(150);
    expect(triangles(model.far)).toBeLessThan(50);
  });

  it("keeps the two big models in theirs", () => {
    const [terminal, ferry] = [buildTerminal(), buildBalticFerry()];
    expect(triangles(terminal.near)).toBeLessThan(3000);
    expect(triangles(terminal.far)).toBeLessThan(700);
    expect(triangles(ferry.near)).toBeLessThan(4000);
    expect(triangles(ferry.far)).toBeLessThan(300);
  });
});

describe("the terminal", () => {
  it("keeps every leg off the drivable roads", () => {
    const feet = terminalFeet();
    expect(feet.length).toBeGreaterThan(30);
    for (const [x, z] of feet) expect(clearOfRoads(x, z)).toBeGreaterThanOrEqual(LEG_ROAD_CLEAR_M - 1e-9);
  });
});

describe("the ferry", () => {
  it("lies where the landmark did", () => {
    const { east, north, baseM } = buildFerry();
    expect([FERRY_BERTH.east, FERRY_BERTH.north, FERRY_BERTH.baseM]).toEqual([east, north, baseM]);
  });

  it("points its bow south along the quay", () => {
    const { yaw = 0 } = ferryPlace();
    expect(Math.cos(yaw)).toBeCloseTo(Math.sin((FERRY_BERTH.bearingDeg * Math.PI) / 180));
    expect(-Math.sin(yaw)).toBeCloseTo(-Math.cos((FERRY_BERTH.bearingDeg * Math.PI) / 180));
  });
});

describe("traffic signals", () => {
  const arms = [{ dx: 0, dz: -1 }, { dx: 1, dz: 0 }, { dx: 0, dz: 1 }, { dx: -1, dz: 0 }];
  const heads = signalsAtJunction({ x: 0, y: 0, z: 0 }, arms, { backM: 8, kerbM: 5 });

  it("gives a road's two ends one start and the crossing road the other", () => {
    expect(heads.map(({ phase }) => phase)).toEqual([0, 0.5, 0, 0.5]);
  });

  it("stands each head on the right of the traffic it faces", () => {
    // The north arm's traffic drives south: its right is west.
    expect(heads[0].x).toBeCloseTo(-5);
    expect(heads[0].z).toBeCloseTo(-8);
    const yaw = heads[0].yaw ?? 0;
    expect([Math.sin(yaw), Math.cos(yaw)].map((part) => Math.round(part))).toEqual([0, -1]);
  });
});

describe("the marina", () => {
  const line = [{ x: 0, y: 0, z: 0 }, { x: 80, y: 0, z: 0 }];
  const spec = { berthM: 3.2, fill: 0.6, seaY: 0.1, deck: true, seed: 5 };

  it("moors the same boats on the same pier every time", () => {
    expect(marinaRow(line, spec)).toEqual(marinaRow(line, spec));
  });

  it("fills to its share and keeps boats off the walkway", () => {
    const { yachts, navyYachts, launches, deck } = marinaRow(line, spec);
    const boats = [...yachts, ...navyYachts, ...launches];
    expect(boats.length / (2 * Math.floor(80 / spec.berthM))).toBeCloseTo(spec.fill, 0);
    expect(deck.length).toBe(10);
    for (const { z } of boats) expect(Math.abs(z)).toBeGreaterThan(3);
  });
});

it("parks the cars kit's van as a white delivery van", () => {
  expect(deliveryVan({ x: 1, y: 0, z: 2 }, 0).paint).toBe("car-paint-white");
});
