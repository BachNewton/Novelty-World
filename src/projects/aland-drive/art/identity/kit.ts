import type { V3 } from "../roadside/mesh";
import type { IdentityMesh, IdentityPart } from "./mesh";

/* Shapes more than one identity model is made of. */

export interface HouseShape {
  /** Footprint, ridge along x, the front facing +z. */
  x: readonly [number, number];
  z: readonly [number, number];
  eave: number;
  ridge: number;
  wall: IdentityPart;
  roof: IdentityPart;
  /** Past the walls, all round. */
  overhang?: number;
  /** A skirt below 0 for ground that isn't flat. */
  foot?: number;
  gable?: IdentityPart;
}

/** A plain gabled house: walls, gable ends and a roof of two sheets. 14 triangles. */
export function house(mesh: IdentityMesh, { x: [x0, x1], z: [z0, z1], eave, ridge, wall, roof, overhang = 0.25, foot = -0.2, gable = wall }: HouseShape): IdentityMesh {
  const middle = (z0 + z1) / 2;
  const slope = (ridge - eave) / (middle - z0);
  const dropY = eave - overhang * slope;
  return mesh
    .face([[x0, foot, z1], [x1, foot, z1], [x1, eave, z1], [x0, eave, z1]], wall, 1)
    .face([[x0, foot, z0], [x1, foot, z0], [x1, eave, z0], [x0, eave, z0]], wall, 0.92)
    .face([[x1, foot, z0], [x1, foot, z1], [x1, eave, z1], [x1, ridge, middle], [x1, eave, z0]], gable, 0.96)
    .face([[x0, foot, z0], [x0, foot, z1], [x0, eave, z1], [x0, ridge, middle], [x0, eave, z0]], gable, 0.9)
    .face([[x0 - overhang, dropY, z1 + overhang], [x1 + overhang, dropY, z1 + overhang], [x1 + overhang, ridge, middle], [x0 - overhang, ridge, middle]], roof, 1.04)
    .face([[x0 - overhang, dropY, z0 - overhang], [x1 + overhang, dropY, z0 - overhang], [x1 + overhang, ridge, middle], [x0 - overhang, ridge, middle]], roof, 0.94);
}

/** The far version of `house`: the same outline, 8 triangles. */
export function houseFar(mesh: IdentityMesh, { x: [x0, x1], z: [z0, z1], eave, ridge, wall, roof, overhang = 0.25 }: HouseShape): IdentityMesh {
  const middle = (z0 + z1) / 2;
  return mesh
    .box([x0, -0.2, z0], [x1, eave, z1], wall, { open: true })
    .face([[x0 - overhang, eave - 0.1, z1 + overhang], [x1 + overhang, eave - 0.1, z1 + overhang], [x1 + overhang, ridge, middle], [x0 - overhang, ridge, middle]], roof, 1.04)
    .face([[x0 - overhang, eave - 0.1, z0 - overhang], [x1 + overhang, eave - 0.1, z0 - overhang], [x1 + overhang, ridge, middle], [x0 - overhang, ridge, middle]], roof, 0.94);
}

/** A framed window on a wall facing +z, or -z with `side` -1. 8 triangles. */
export function windowFacingZ(mesh: IdentityMesh, x: number, y: number, z: number, wide: number, tall: number, side = 1): IdentityMesh {
  const out = 0.015 * side;
  const [hw, hh, frame] = [wide / 2, tall / 2, 0.07];
  return mesh
    .face([[x - hw - frame, y - hh - frame, z + out], [x + hw + frame, y - hh - frame, z + out], [x + hw + frame, y + hh + frame, z + out], [x - hw - frame, y + hh + frame, z + out]], "trim")
    .face([[x - hw, y - hh, z + out * 2], [x + hw, y - hh, z + out * 2], [x + hw, y + hh, z + out * 2], [x - hw, y + hh, z + out * 2]], "glass")
    .face([[x - 0.025, y - hh, z + out * 3], [x + 0.025, y - hh, z + out * 3], [x + 0.025, y + hh, z + out * 3], [x - 0.025, y + hh, z + out * 3]], "trim")
    .face([[x - hw, y - 0.025, z + out * 3], [x + hw, y - 0.025, z + out * 3], [x + hw, y + 0.025, z + out * 3], [x - hw, y + 0.025, z + out * 3]], "trim");
}

/** A flat plate on a plane given by its corner and two ways: for doors and the fronts of things. */
export function plate(mesh: IdentityMesh, at: V3, right: V3, up: V3, part: IdentityPart, shade = 1): IdentityMesh {
  const point = (a: number, b: number): V3 => [at[0] + right[0] * a + up[0] * b, at[1] + right[1] * a + up[1] * b, at[2] + right[2] * a + up[2] * b];
  return mesh.face([point(0, 0), point(1, 0), point(1, 1), point(0, 1)], part, shade);
}

/** A flat ring of quads round a centre in the x-y plane: a wheel, a lifebuoy. */
export function ring(mesh: IdentityMesh, centre: V3, radius: number, thick: number, sides: number, part: IdentityPart, shade = 1): IdentityMesh {
  for (let side = 0; side < sides; side++) {
    const [a, b] = [(side / sides) * 2 * Math.PI, ((side + 1) / sides) * 2 * Math.PI];
    const point = (angle: number, reach: number): V3 => [centre[0] + Math.cos(angle) * reach, centre[1] + Math.sin(angle) * reach, centre[2]];
    mesh.face([point(a, radius), point(b, radius), point(b, radius - thick), point(a, radius - thick)], part, shade);
  }
  return mesh;
}

export interface HullStation {
  /** Along the boat. */
  x: number;
  /** Half the width at the gunwale. */
  beam: number;
  /** The gunwale's height and the keel's. */
  gunwale: number;
  keel: number;
}

/** A clinker-ish hull lofted through its stations, two strakes a side; a vertex is on the model's own axes, so turn it by turning `at`. */
export function hull(mesh: IdentityMesh, stations: readonly HullStation[], upper: IdentityPart, lower: IdentityPart, at: (point: V3) => V3 = (point) => point): IdentityMesh {
  const point = ({ x, beam, gunwale, keel }: HullStation, side: number, level: 0 | 1 | 2): V3 => {
    if (level === 0) return at([x, gunwale, side * beam]);
    if (level === 1) return at([x, keel + (gunwale - keel) * 0.42, side * beam * 0.74]);
    return at([x, keel, 0]);
  };
  for (const side of [-1, 1]) {
    for (let station = 0; station + 1 < stations.length; station++) {
      const [a, b] = [stations[station], stations[station + 1]];
      mesh.face([point(a, side, 0), point(b, side, 0), point(b, side, 1), point(a, side, 1)], upper, side > 0 ? 1 : 0.92);
      mesh.face([point(a, side, 1), point(b, side, 1), point(b, side, 2), point(a, side, 2)], lower, side > 0 ? 0.95 : 0.86);
    }
  }
  return mesh;
}

/** The stroke font: strokes across a letter 1 wide and 1 tall, painted by hand, so it needn't be tidy. */
const STROKES: Record<string, readonly (readonly (readonly [number, number])[])[]> = {
  A: [[[0, 0], [0.5, 1], [1, 0]], [[0.22, 0.4], [0.78, 0.4]]],
  D: [[[0, 0], [0, 1], [0.6, 0.95], [1, 0.6], [1, 0.35], [0.6, 0.05], [0, 0]]],
  E: [[[1, 0], [0, 0], [0, 1], [1, 1]], [[0, 0.5], [0.75, 0.5]]],
  G: [[[1, 0.85], [0.55, 1], [0.1, 0.8], [0, 0.45], [0.15, 0.1], [0.6, 0], [1, 0.2], [1, 0.48], [0.58, 0.48]]],
  I: [[[0.5, 0], [0.5, 1]]],
  K: [[[0, 0], [0, 1]], [[1, 1], [0, 0.42], [1, 0]]],
  L: [[[0, 1], [0, 0], [0.9, 0]]],
  N: [[[0, 0], [0, 1], [1, 0], [1, 1]]],
  O: [[[0.3, 0], [0.7, 0], [1, 0.3], [1, 0.7], [0.7, 1], [0.3, 1], [0, 0.7], [0, 0.3], [0.3, 0]]],
  P: [[[0, 0], [0, 1], [0.75, 1], [1, 0.8], [1, 0.6], [0.75, 0.42], [0, 0.42]]],
  R: [[[0, 0], [0, 1], [0.75, 1], [1, 0.8], [1, 0.6], [0.75, 0.42], [0, 0.42]], [[0.45, 0.42], [1, 0]]],
  S: [[[1, 0.85], [0.6, 1], [0.15, 0.9], [0.1, 0.62], [0.85, 0.4], [0.9, 0.12], [0.45, 0], [0, 0.15]]],
  T: [[[0, 1], [1, 1]], [[0.5, 1], [0.5, 0]]],
  U: [[[0, 1], [0, 0.25], [0.3, 0], [0.7, 0], [1, 0.25], [1, 1]]],
};
const DOTS: Record<string, readonly (readonly [number, number])[]> = { Ä: [[0.28, 1.16], [0.72, 1.16]], Ö: [[0.28, 1.16], [0.72, 1.16]], Å: [[0.5, 1.2]] };
const BASE: Record<string, string> = { Ä: "A", Ö: "O", Å: "A" };

/** Words painted on a board facing +z: `left` is the first letter's foot, and letters run along +x. A stroke is a quad, 2 triangles. */
export function lettering(mesh: IdentityMesh, text: string, left: V3, tall: number, part: IdentityPart): IdentityMesh {
  const [wide, gap, stroke] = [tall * 0.68, tall * 0.28, tall * 0.15];
  let cursor = left[0];
  const dab = (a: readonly [number, number], b: readonly [number, number], origin: number) => {
    const [ax, ay, bx, by] = [origin + a[0] * wide, left[1] + a[1] * tall, origin + b[0] * wide, left[1] + b[1] * tall];
    const length = Math.hypot(bx - ax, by - ay);
    const [nx, ny] = [(-(by - ay) / length) * stroke * 0.5, ((bx - ax) / length) * stroke * 0.5];
    mesh.face([[ax + nx, ay + ny, left[2]], [bx + nx, by + ny, left[2]], [bx - nx, by - ny, left[2]], [ax - nx, ay - ny, left[2]]], part);
  };
  for (const letter of text) {
    if (letter !== " ") {
      for (const line of STROKES[BASE[letter] ?? letter]) {
        for (let at = 0; at + 1 < line.length; at++) dab(line[at], line[at + 1], cursor);
      }
      for (const [x, y] of DOTS[letter] ?? []) dab([x - 0.08, y], [x + 0.08, y + 0.1], cursor);
    }
    cursor += wide + gap;
  }
  return mesh;
}

/** How wide `lettering` paints a word. */
export const letteredWidth = (text: string, tall: number) => text.length * tall * 0.96 - tall * 0.28;
