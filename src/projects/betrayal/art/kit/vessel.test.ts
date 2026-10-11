import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { openEdges, solidLathe, vessel, type Profile } from "./vessel";

const material = new THREE.MeshBasicMaterial();

describe("vessels", () => {
  it("finds the open ends of a bare lathe", () => {
    const cup = new THREE.LatheGeometry([new THREE.Vector2(0.04, 0), new THREE.Vector2(0.045, 0.1)], 8);
    expect(openEdges(cup)).toBe(16);
  });

  const solids: Profile[] = [
    [[0.04, 0], [0.04, 0.01], [0.008, 0.02], [0.008, 0.08], [0.035, 0.1], [0.045, 0.16]],
    [[0.2, 0], [0.18, 0.1], [0, 0.205]],
    [[0, 0], [0.1, 0], [0, 0.2]],
  ];
  it.each(solids)("closes a solid lathe at both ends (%#)", (...profile) => {
    expect(openEdges(solidLathe(profile, material, 9).geometry)).toBe(0);
  });

  const vessels: [Profile, number, number][] = [
    [[[0.04, 0], [0.04, 0.01], [0.008, 0.02], [0.008, 0.08], [0.035, 0.1], [0.045, 0.16]], 0.005, 0.05],
    [[[0.05, 0], [0.12, 0.05], [0.13, 0.07]], 0.01, 0.06],
    [[[0, 0], [0.16, 0], [0.18, 0.3]], 0.015, 0.26],
  ];
  it.each(vessels)("makes an open vessel one closed solid, with a rim and an inside (%#)", (outer, wall, depth) => {
    const mesh = vessel(outer, material, { wall, depth, sides: 8 });
    expect(openEdges(mesh.geometry)).toBe(0);
    mesh.geometry.computeBoundingBox();
    expect(mesh.geometry.boundingBox?.max.y).toBeCloseTo(outer[outer.length - 1][1]);
  });

  it("refuses a rim no wider than its wall", () => {
    expect(() => vessel([[0.01, 0], [0.01, 0.1]], material, { wall: 0.02, depth: 0.05 })).toThrow();
  });
});
