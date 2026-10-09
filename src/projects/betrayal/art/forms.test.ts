import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { ball, ellipsoid, loft, rod, roundBox, sculpt, smoothMin, surfaceNet, type Net } from "./forms";

/** Every edge of a closed mesh is shared by exactly two triangles, running opposite ways. */
function isClosed(index: ArrayLike<number>): boolean {
  const edges = new Map<string, number>();
  for (let t = 0; t < index.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const key = `${index[t + e]}>${index[t + ((e + 1) % 3)]}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  return [...edges].every(([key, count]) => {
    const [a, b] = key.split(">");
    return count === 1 && edges.get(`${b}>${a}`) === 1;
  });
}

/** The volume a closed, outward-wound mesh encloses (divergence theorem). */
function volume({ positions, triangles }: Net): number {
  let sum = 0;
  const p = (i: number) => new THREE.Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
  for (let t = 0; t < triangles.length; t += 3) sum += p(triangles[t]).dot(p(triangles[t + 1]).cross(p(triangles[t + 2]))) / 6;
  return sum;
}

describe("distances", () => {
  it("measure the true distance to a ball and a rod", () => {
    expect(ball([1, 0, 0], 0.5).distance(3, 0, 0)).toBeCloseTo(1.5);
    const limb = rod([0, 0, 0], [0, 1, 0], 0.2, 0.1);
    expect(limb.distance(0.5, 0, 0)).toBeCloseTo(0.3, 2);
    expect(limb.distance(0, 1.5, 0)).toBeCloseTo(0.4);
    expect(limb.distance(0, 0.5, 0)).toBeLessThan(0);
  });

  it("put an ellipsoid's surface at its radii", () => {
    const egg = ellipsoid([0, 0, 0], [0.3, 0.5, 0.2]);
    for (const [x, y, z] of [[0.3, 0, 0], [0, 0.5, 0], [0, 0, 0.2]] as const) expect(egg.distance(x, y, z)).toBeCloseTo(0);
  });

  it("measure a turned rounded box in its own frame", () => {
    const slab = roundBox([0, 0, 0], [1, 0.1, 0.1], 0.02, [0, 0, Math.PI / 2]);
    expect(slab.distance(0, 0.9, 0)).toBeLessThan(0);
    expect(slab.distance(0.9, 0, 0)).toBeGreaterThan(0);
  });

  it("blend smoothly, never further out than the nearer", () => {
    expect(smoothMin(1, 3, 0.5)).toBe(1);
    expect(smoothMin(1, 1.1, 0.5)).toBeLessThan(1);
  });
});

describe("surface nets", () => {
  const radius = 0.3;
  const sphere = ball([0, 0, 0], radius);
  const net = surfaceNet(sphere.distance, sphere.min, sphere.max, 0.03);

  it("mesh a closed surface, wound outwards", () => {
    expect(isClosed(net.triangles)).toBe(true);
    expect(volume(net)).toBeGreaterThan(0);
    expect(volume(net)).toBeCloseTo((4 / 3) * Math.PI * radius ** 3, 2);
  });

  it("settle every vertex onto the surface", () => {
    const geometry = sculpt().add(sphere, "bone").geometry(0.03);
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    for (let i = 0; i < position.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(position, i);
      expect(Math.abs(p.length() - radius)).toBeLessThan(1e-3);
      expect(new THREE.Vector3().fromBufferAttribute(normal, i).dot(p.normalize())).toBeGreaterThan(0.99);
    }
  });
});

describe("sculpt", () => {
  it("colours the surface by the nearest solid, and by paint", () => {
    const shape = sculpt()
      .add(ball([0, 0, 0], 0.2), "bone")
      .add(ball([0.25, 0, 0], 0.1), "blood", 0.05)
      .paint(ball([0, 0.2, 0], 0.05), "void");
    expect(shape.colourAt(-0.2, 0, 0)).toBe("bone");
    expect(shape.colourAt(0.35, 0, 0)).toBe("blood");
    expect(shape.colourAt(0, 0.2, 0)).toBe("void");
  });

  it("carves away", () => {
    const shape = sculpt().add(ball([0, 0, 0], 0.2), "bone").carve(ball([0.2, 0, 0], 0.1));
    expect(shape.distance(0.15, 0, 0)).toBeGreaterThan(0);
    expect(shape.distance(-0.15, 0, 0)).toBeLessThan(0);
  });
});

describe("loft", () => {
  it("sweeps a closed tube through its sections, banded by colour", () => {
    const geometry = loft(
      [
        { at: [0, 0, 0], radius: 0.1, colour: "ash" },
        { at: [0, -0.5, 0.1], radius: 0.08, colour: "blood" },
        { at: [0, -1, 0], radius: 0.05, colour: "ash" },
      ],
      { sides: 10, ends: ["round", "point"] },
    );
    const position = geometry.getAttribute("position");
    const box = new THREE.Box3().setFromBufferAttribute(position as THREE.BufferAttribute);
    expect(box.max.y).toBeCloseTo(0.1, 1);
    expect(box.min.y).toBeLessThan(-1.1);
    const welded = new Map<string, number>();
    const index = Array.from({ length: position.count }, (_, i) => {
      const key = [position.getX(i), position.getY(i), position.getZ(i)].map((v) => v.toFixed(5)).join();
      if (!welded.has(key)) welded.set(key, welded.size);
      return welded.get(key) ?? -1;
    });
    expect(isClosed(index)).toBe(true);
  });

  it("faces outwards", () => {
    const geometry = loft([
      { at: [0, 0, 0], radius: 0.1, colour: "ash" },
      { at: [0, -1, 0], radius: 0.1, colour: "ash" },
    ]);
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    for (let i = 0; i < position.count; i++) {
      const out = new THREE.Vector3(position.getX(i), 0, position.getZ(i));
      if (out.length() > 0.09 && position.getY(i) < -0.2 && position.getY(i) > -0.8) {
        expect(new THREE.Vector3().fromBufferAttribute(normal, i).dot(out.normalize())).toBeGreaterThan(0.9);
      }
    }
  });
});
