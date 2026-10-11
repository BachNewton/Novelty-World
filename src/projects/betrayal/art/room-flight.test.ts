import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { carrying, FLIGHT, flightPose, type FlightEnd } from "./room-flight";

const from: FlightEnd = { centre: new THREE.Vector3(16, 0, -8), turn: Math.PI };
const below: FlightEnd = { centre: new THREE.Vector3(0, -7, 8), turn: -Math.PI / 2 };

describe("a moved room's flight", () => {
  it("starts on its old cell and ends on its new one, turned its new way round", () => {
    expect(flightPose(from, below, 0)).toEqual(from);
    const end = flightPose(from, below, 1);
    expect(end.centre.distanceTo(below.centre)).toBeLessThan(1e-9);
    expect(Math.cos(end.turn - below.turn)).toBeCloseTo(1);
  });

  it("is lifted clear of both floors before it goes across, and set down after", () => {
    const top = Math.max(from.centre.y, below.centre.y) + FLIGHT.lift;
    const lifted = flightPose(from, below, FLIGHT.rise);
    expect(lifted.centre.y).toBeCloseTo(top);
    expect([lifted.centre.x, lifted.centre.z]).toEqual([from.centre.x, from.centre.z]);
    const across = flightPose(from, below, 0.5);
    expect(across.centre.y).toBeCloseTo(top);
    expect(across.centre.x).toBeCloseTo((from.centre.x + below.centre.x) / 2);
    const over = flightPose(from, below, 1 - FLIGHT.fall);
    expect([over.centre.x, over.centre.y, over.centre.z]).toEqual([below.centre.x, top, below.centre.z]);
  });

  it("turns the short way round", () => {
    // From half a turn to three quarters back: a quarter turn anticlockwise, not three quarters clockwise.
    const halfway = flightPose(from, below, 0.5).turn;
    expect(halfway).toBeCloseTo(Math.PI * 1.25);
  });

  it("carries what stands in the room with it", () => {
    // A figure standing a metre east of the new cell's middle, at rest.
    const standing = below.centre.clone().add(new THREE.Vector3(1, 0, 0));
    expect(standing.clone().applyMatrix4(carrying(from, below, 1)).distanceTo(standing)).toBeLessThan(1e-9);
    // At the start it stands as far from the old cell's middle, turned with the room.
    const start = standing.clone().applyMatrix4(carrying(from, below, 0));
    expect(start.distanceTo(from.centre)).toBeCloseTo(1);
    expect(start.y).toBeCloseTo(from.centre.y);
  });
});
