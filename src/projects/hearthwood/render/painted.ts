import { BufferAttribute, type BufferGeometry, type Color, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { SEASON_GROUPS, type SeasonGroup } from "../engine/seasons";

/*
 * A shape built from pieces, each with its colour in its vertices, merged
 * into one geometry so it draws in one call with one material. A piece can
 * shade darker at its bottom and lighter on top, and foliage can take
 * rounded normals, pointing out from the middle of its crown, so a canopy
 * shades as one soft mass the way a painted tree does.
 *
 * A plant's pieces can also say what each is to the seasons (a crown of
 * leaves, a branch, a flower's head), and the shape then carries it in two
 * attributes the plants' shader reads (`plants.ts`): `hwSeason` (the part
 * and its season group, the shading, a share of its own, and a 0 that marks
 * the data as there) and `hwSeasonPiece` (the point the piece grows and
 * shrinks about).
 */

/** What a piece is to the seasons: how it changes through the year. */
export const SEASON_PARTS = [
  /** Not changed by the seasons (the first, so a shape without the attributes reads as it). */
  "none",
  /** A tree's mass of leaves: out in spring, coloured by the year, falling one mass at a time. */
  "crown",
  /** The one mass of a far tree: thinning to a haze of bare twigs rather than vanishing. */
  "far-crown",
  /** A bare tree's branches and twigs, hidden in its crown in leaf. */
  "branch",
  "bark",
  /** A flower's head or heather's bells. */
  "blossom",
  /** A small plant's leaves and fronds: growing up and dying back whole. */
  "herb",
  /** Stone, which only holds snow. */
  "stone",
] as const;
export type SeasonPart = (typeof SEASON_PARTS)[number];

export interface SeasonTag {
  part: SeasonPart;
  group: SeasonGroup;
  /** Where it grows and shrinks about: the middle of the piece unless given. */
  centre?: Vector3;
}

export interface Piece {
  geometry: BufferGeometry;
  /** Normals pointed out from here instead, for a soft crown. */
  crown?: Vector3;
  colour: Color;
  /** Darker at the bottom of the piece and lighter on top, by this much. */
  shading?: number;
  season?: SeasonTag;
}

/** A piece's own share, 0 to 1, from its place in the shape: no draw on the shape's random stream, so tagging a shape changes nothing else in it. */
function share(index: number): number {
  const s = Math.sin(index * 12.9898 + 4.1414) * 43758.5453;
  return s - Math.floor(s);
}

export function paint(pieces: Piece[]): BufferGeometry {
  const seasonal = pieces.some((piece) => piece.season !== undefined);
  const prepared = pieces.map(({ geometry, crown, colour, shading = 0, season }, index) => {
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
    const tags = seasonal ? new Float32Array(position.count * 4) : null;
    const centres = seasonal ? new Float32Array(position.count * 3) : null;
    const centre = season?.centre ?? (box ? box.getCenter(new Vector3()) : new Vector3());
    const role = season ? SEASON_PARTS.indexOf(season.part) * 16 + SEASON_GROUPS.indexOf(season.group) : 0;
    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i);
      const lift = high > low ? (y - low) / (high - low) : 0.5;
      const shade = 1 + shading * (lift - 0.6);
      colours[i * 3] = colour.r * shade;
      colours[i * 3 + 1] = colour.g * shade;
      colours[i * 3 + 2] = colour.b * shade;
      tags?.set([role, shade, share(index), 0], i * 4);
      centres?.set([centre.x, centre.y, centre.z], i * 3);
      if (crown) {
        out.set(position.getX(i) - crown.x, (y - crown.y) * 0.8, position.getZ(i) - crown.z).normalize();
        out.lerp(new Vector3(normal.getX(i), normal.getY(i), normal.getZ(i)), 0.25).normalize();
        normal.setXYZ(i, out.x, out.y, out.z);
      }
    }
    g.setAttribute("color", new BufferAttribute(colours, 3));
    if (tags && centres) {
      g.setAttribute("hwSeason", new BufferAttribute(tags, 4));
      g.setAttribute("hwSeasonPiece", new BufferAttribute(centres, 3));
    }
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
