import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { candle, carrying } from "./explorers/props";
import { declareParts, figureParts, isMeshed, packParts, partsOf, unpackParts } from "./figure-parts";
import { ball, rod, sculpt, shaped, solidOf, drum } from "./forms";
import type { ExplorerBuilder } from "./stage";

/** A small figure's parts, meshed by formula as a figure's are. */
function meshSmall() {
  return {
    head: sculpt().add(ball([0, 1.2, 0], 0.1), "bone").geometry(0.02),
    arms: [sculpt().add(rod([0, 0, 0], [0, -0.3, 0], 0.03), "ash").geometry(0.02)],
    coin: shaped(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 8), drum([0, 0, 0], 0.03, 0.005)),
    sole: { heel: -0.05, toe: 0.08, at: new THREE.Vector3(0.1, 0.08, -0.03) },
  };
}

describe("a figure's parts", () => {
  it("are meshed once, on first use, and shared after", () => {
    let meshings = 0;
    const parts = figureParts("small", () => {
      meshings++;
      return meshSmall();
    });
    expect(parts.ready()).toBe(false);
    const first = parts.get();
    expect(parts.get()).toBe(first);
    expect(meshings).toBe(1);
    expect(parts.ready()).toBe(true);
  });

  it("meshed elsewhere and handed over, are never meshed here; a later hand-over leaves the first", () => {
    let meshings = 0;
    const parts = figureParts("small", () => {
      meshings++;
      return meshSmall();
    });
    const handed = meshSmall();
    parts.prime(handed);
    expect(parts.get()).toBe(handed);
    parts.prime(meshSmall());
    expect(parts.get()).toBe(handed);
    expect(meshings).toBe(0);
  });

  it("are declared on the builder that needs them, and on a builder carrying a prop as well", () => {
    const parts = figureParts("declared", meshSmall);
    const build: ExplorerBuilder = () => new THREE.Group();
    declareParts(build, [parts]);
    expect(partsOf(build).map((each) => each.id)).toEqual(["declared"]);
    expect(isMeshed(build)).toBe(false);
    parts.get();
    expect(isMeshed(build)).toBe(true);
    expect(partsOf(carrying(build, candle)).map((each) => each.id)).toEqual(["declared", "props"]);
    expect(partsOf(() => new THREE.Group())).toEqual([]);
  });
});

describe("packing parts for a worker", () => {
  it("round-trips geometry, vectors and plain data, and moves the arrays rather than copying them", () => {
    const parts = meshSmall();
    const { packed, transfer } = packParts(parts);
    const arrays = [parts.head, parts.arms[0], parts.coin].flatMap((geometry) => [...Object.values(geometry.attributes), ...(geometry.index ? [geometry.index] : [])]);
    for (const attribute of arrays) expect(transfer).toContain((attribute.array as Float32Array).buffer);

    const back = unpackParts(structuredClone(packed), "small") as ReturnType<typeof meshSmall>;
    for (const [before, after] of [[parts.head, back.head], [parts.arms[0], back.arms[0]], [parts.coin, back.coin]] as const) {
      expect(Object.keys(after.attributes).sort()).toEqual(Object.keys(before.attributes).sort());
      for (const name of Object.keys(before.attributes)) {
        expect(Array.from(after.getAttribute(name).array)).toEqual(Array.from(before.getAttribute(name).array));
        expect(after.getAttribute(name).itemSize).toBe(before.getAttribute(name).itemSize);
      }
      expect(after.index ? Array.from(after.index.array) : null).toEqual(before.index ? Array.from(before.index.array) : null);
    }
    expect(back.sole.heel).toBe(-0.05);
    expect(back.sole.at).toBeInstanceOf(THREE.Vector3);
    expect(back.sole.at.toArray()).toEqual([0.1, 0.08, -0.03]);
  });

  it("keeps a solid's bounds, and refuses to measure in it, loudly", () => {
    const parts = meshSmall();
    const back = unpackParts(packParts(parts).packed, "small") as ReturnType<typeof meshSmall>;
    const solid = solidOf(back.head);
    const before = solidOf(parts.head);
    if (!solid || !before) throw new Error("A sculpture keeps its solid");
    expect(solid.min).toEqual(before.min);
    expect(solid.max).toEqual(before.max);
    expect(() => solid.distance(0, 1.2, 0)).toThrow(/meshed in a worker/);
  });

  it("refuses what can't cross to a worker", () => {
    expect(() => packParts({ pose: () => 0 })).toThrow(/can't be packed/);
    expect(() => packParts({ mesh: new THREE.Mesh() })).toThrow(/can't be packed/);
  });
});
