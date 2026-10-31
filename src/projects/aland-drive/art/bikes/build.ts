import type { Soup } from "../cars/mesh";
import { bikePieces, bikePiecesFar, type Pieces } from "./frame";
import { PARTS, type Part } from "./rig";
import { riderPieces, riderPiecesFar } from "./rider";
import type { Piece } from "./shapes";
import type { BikeSpec } from "./specs";

/*
 * A bike and its rider as one mesh, each vertex tagged with the rigid part it
 * belongs to, so a cyclist is one draw call however many limbs it has.
 */

export type BikeDetail = "near" | "far";

export interface BikeMesh extends Soup {
  /** Per vertex: the index in `PARTS`. */
  parts: Uint8Array;
  /** Triangles of the bike alone. */
  bikeTriangles: number;
}

const NEAR_CREASE_DEG = 42;
const FAR_CREASE_DEG = 1;

export function buildBikeMesh(spec: BikeSpec, detail: BikeDetail): BikeMesh {
  const near = detail === "near";
  const crease = near ? NEAR_CREASE_DEG : FAR_CREASE_DEG;
  const finished = (pieces: Pieces) => (Object.entries(pieces) as [Part, Piece][]).map(([part, made]) => ({ part: PARTS.indexOf(part), soup: made.finish(crease) }));
  const bike = finished(near ? bikePieces(spec) : bikePiecesFar(spec));
  const soups = [...bike, ...finished(near ? riderPieces() : riderPiecesFar())];
  const triangles = soups.reduce((sum, { soup }) => sum + soup.triangles, 0);
  const positions = new Float32Array(triangles * 9);
  const normals = new Float32Array(triangles * 9);
  const surfaces = new Uint8Array(triangles * 3);
  const parts = new Uint8Array(triangles * 3);
  let at = 0;
  for (const { part, soup } of soups) {
    positions.set(soup.positions, at * 3);
    normals.set(soup.normals, at * 3);
    surfaces.set(soup.surfaces, at);
    parts.fill(part, at, at + soup.triangles * 3);
    at += soup.triangles * 3;
  }
  return { positions, normals, surfaces, parts, triangles, bikeTriangles: bike.reduce((sum, { soup }) => sum + soup.triangles, 0) };
}
