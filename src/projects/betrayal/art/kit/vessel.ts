import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** A lathe profile: [radius, height] points, bottom to top. */
export type Profile = [radius: number, height: number][];

/**
 * A solid of revolution closed at both ends: a profile that ends off the
 * axis is carried in to the axis there, so no end is left open to see
 * through. For anything turned and solid: a knob, a shut cloche, a stoppered
 * decanter.
 */
export function solidLathe(profile: Profile, material: THREE.Material, sides = 10): THREE.Mesh {
  const [first, last] = [profile[0], profile[profile.length - 1]];
  const closed: Profile = [...(first[0] > 0 ? [[0, first[1]] as [number, number]] : []), ...profile, ...(last[0] > 0 ? [[0, last[1]] as [number, number]] : [])];
  return new THREE.Mesh(new THREE.LatheGeometry(closed.map(([r, y]) => new THREE.Vector2(r, y)), sides), material);
}

/** The outer radius of a profile at height `y`, along its last stretch that spans it. */
function radiusAt(profile: Profile, y: number): number {
  for (let i = profile.length - 1; i > 0; i--) {
    const [[r0, y0], [r1, y1]] = [profile[i - 1], profile[i]];
    if (y >= Math.min(y0, y1) && y <= Math.max(y0, y1)) return y1 === y0 ? Math.min(r0, r1) : r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  throw new Error(`The vessel's profile doesn't reach a height of ${y}`);
}

export interface VesselOptions {
  /** How thick its wall is, in metres. */
  wall: number;
  /** How deep it is inside, from the rim down to the inside of its floor. */
  depth: number;
  sides?: number;
}

/**
 * An open vessel (a cup, a goblet's bowl, a basin, a bucket) as one closed
 * solid: the outer profile, given bottom to the rim, then a flat rim `wall`
 * wide, and the inside, following the outside `wall` in from it, down to a
 * floor `depth` below the rim. Every face is one-sided and faces out of the
 * solid, so the inside is drawn and lit as the inside, and nothing shows
 * through its far wall.
 */
export function vessel(outer: Profile, material: THREE.Material, { wall, depth, sides = 10 }: VesselOptions): THREE.Mesh {
  const [rim, top] = outer[outer.length - 1];
  const floor = top - depth;
  if (rim <= wall) throw new Error(`A vessel's rim (${rim}) must be wider than its wall (${wall})`);
  const inner: Profile = [[rim - wall, top]];
  for (let i = outer.length - 2; i >= 0; i--) {
    const [r, y] = outer[i];
    if (y <= floor) break;
    inner.push([Math.max(r - wall, wall / 2), y]);
  }
  inner.push([Math.max(radiusAt(outer, floor) - wall, wall / 2), floor], [0, floor]);
  return solidLathe([...outer, ...inner], material, sides);
}

/**
 * The edges of a mesh that only one face uses, where the surface stops and
 * the inside of the shape shows through: none in a closed solid. Corners
 * that share a position count as one, so a lathe's seam and its pole are
 * joined, and faces folded to nothing at the axis are left out.
 */
export function openEdges(geometry: THREE.BufferGeometry): number {
  const positions = new THREE.BufferGeometry();
  positions.setAttribute("position", geometry.getAttribute("position"));
  if (geometry.index) positions.setIndex(geometry.index);
  const welded = mergeVertices(positions, 1e-6);
  const index = welded.getIndex();
  if (!index) throw new Error("mergeVertices always indexes a geometry");
  const uses = new Map<string, number>();
  for (let i = 0; i < index.count; i += 3) {
    const corners = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    if (new Set(corners).size < 3) continue;
    for (let k = 0; k < 3; k++) {
      const [a, b] = [corners[k], corners[(k + 1) % 3]];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      uses.set(key, (uses.get(key) ?? 0) + 1);
    }
  }
  return [...uses.values()].filter((count) => count === 1).length;
}
