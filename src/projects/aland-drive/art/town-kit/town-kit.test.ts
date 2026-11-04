import { describe, expect, it } from "vitest";
import type { RoadsideModel } from "../roadside/models";
import { buildBalticFerry, buildBicycle, buildHangingLamp, buildStreetNamePlate, buildStreetNamePost, buildTerminal, buildTownLamp, buildTrafficLight, buildVillagePlate, buildVillageSign, buildWindowBox, clearOfRoads, deliveryVan, FERRY_BERTH, ferryPlace, LEG_ROAD_CLEAR_M, signalsAtJunction, terminalFeet, buildRoadFerry } from "./index";

const triangles = (geometry: RoadsideModel["near"] | null) => (geometry?.index?.count ?? 0) / 3;

// The brief's limits: an object placed by the hundred mustn't creep past them as it's worked on.
describe("town triangle budgets", () => {
  const small: Record<string, RoadsideModel> = {
    lamp: buildTownLamp(),
    signal: buildTrafficLight(),
    plate: buildStreetNamePlate(),
    post: buildStreetNamePost(),
    bicycle: buildBicycle(),
    hanging: buildHangingLamp(),
    box: buildWindowBox(),
    village: buildVillageSign(),
    villagePlate: buildVillagePlate(),
  };

  it.each(Object.entries(small))("%s stays small", (_, model) => {
    expect(triangles(model.near)).toBeLessThan(150);
    expect(triangles(model.far)).toBeLessThan(50);
  });

  it("keeps the two big models in theirs", () => {
    const [terminal, ferry] = [buildTerminal(), buildBalticFerry()];
    expect(triangles(terminal.near)).toBeLessThan(3500);
    expect(triangles(terminal.far)).toBeLessThan(700);
    expect(triangles(ferry.near)).toBeLessThan(4000);
    expect(triangles(ferry.far)).toBeLessThan(300);
  });

  it("keeps the archipelago's car ferry in its", () => {
    const ferry = buildRoadFerry();
    expect(triangles(ferry.near)).toBeLessThan(600);
    expect(triangles(ferry.far)).toBeLessThan(150);
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

it("parks a van in its livery as the delivery van", () => {
  expect(deliveryVan({ x: 1, y: 0, z: 2 }, 0).spec.livery).toBe(true);
});
