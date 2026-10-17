import { BufferAttribute, type BufferGeometry, type Color, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/*
 * A shape built from pieces, each with its colour in its vertices, merged
 * into one geometry so it draws in one call with one material. A piece can
 * shade darker at its bottom and lighter on top, and foliage can take
 * rounded normals, pointing out from the middle of its crown, so a canopy
 * shades as one soft mass the way a painted tree does.
 */

export interface Piece {
  geometry: BufferGeometry;
  /** Normals pointed out from here instead, for a soft crown. */
  crown?: Vector3;
  colour: Color;
  /** Darker at the bottom of the piece and lighter on top, by this much. */
  shading?: number;
}

export function paint(pieces: Piece[]): BufferGeometry {
  const prepared = pieces.map(({ geometry, crown, colour, shading = 0 }) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    g.deleteAttribute("uv");
    const position = g.getAttribute("position");
    const normal = g.getAttribute("normal");
    const colours = new Float32Array(position.count * 3);
    g.computeBoundingBox();
    const box = g.boundingBox;
    const low = box ? box.min.y : 0;
    const high = box ? box.max.y : 1;
    const out = new Vector3();
    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i);
      const lift = high > low ? (y - low) / (high - low) : 0.5;
      const shade = 1 + shading * (lift - 0.6);
      colours[i * 3] = colour.r * shade;
      colours[i * 3 + 1] = colour.g * shade;
      colours[i * 3 + 2] = colour.b * shade;
      if (crown) {
        out.set(position.getX(i) - crown.x, (y - crown.y) * 0.8, position.getZ(i) - crown.z).normalize();
        out.lerp(new Vector3(normal.getX(i), normal.getY(i), normal.getZ(i)), 0.25).normalize();
        normal.setXYZ(i, out.x, out.y, out.z);
      }
    }
    g.setAttribute("color", new BufferAttribute(colours, 3));
    return g;
  });
  const merged = mergeGeometries(prepared);
  for (const g of prepared) g.dispose();
  return merged;
}

/**
 * Pushes a shape's corners in and out by a random share between `low` and
 * `high`, the same for every face meeting at a corner, so the surface stays
 * whole (a non-indexed shape repeats each corner once per face).
 */
export function lumpy(geometry: BufferGeometry, next: () => number, low: number, high: number): BufferGeometry {
  const position = geometry.getAttribute("position");
  const shares = new Map<string, number>();
  for (let i = 0; i < position.count; i++) {
    const key = `${position.getX(i).toFixed(4)},${position.getY(i).toFixed(4)},${position.getZ(i).toFixed(4)}`;
    let share = shares.get(key);
    if (share === undefined) {
      share = low + (high - low) * next();
      shares.set(key, share);
    }
    position.setXYZ(i, position.getX(i) * share, position.getY(i) * share, position.getZ(i) * share);
  }
  geometry.computeVertexNormals();
  return geometry;
}
