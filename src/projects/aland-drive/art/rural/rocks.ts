import type { RoadsideModel } from "../roadside/index";
import { seeded, type V3 } from "../roadside/mesh";
import { finished, RuralMesh } from "./mesh";

/*
 * Åland's bedrock: pink rapakivi granite, ground smooth and low by the ice and split
 * along its joints. Corners are worked out here and the crystals are the material's.
 * A seed gives a different stone; a handful of seeds, turned and scaled per place, is
 * a whole shore's worth, with one mesh per seed.
 */

/** Seeds that came out well, so a placement can pick one by its own roll. */
export const ROCK_SEEDS = [3, 11, 24, 37] as const;

type Triangle = readonly [number, number, number];

const GOLDEN = (1 + Math.sqrt(5)) / 2;
const ICOSAHEDRON: V3[] = [[-1, GOLDEN, 0], [1, GOLDEN, 0], [-1, -GOLDEN, 0], [1, -GOLDEN, 0], [0, -1, GOLDEN], [0, 1, GOLDEN], [0, -1, -GOLDEN], [0, 1, -GOLDEN], [GOLDEN, 0, -1], [GOLDEN, 0, 1], [-GOLDEN, 0, -1], [-GOLDEN, 0, 1]];
const ICOSAHEDRON_FACES: Triangle[] = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];

const unit = ([x, y, z]: V3): V3 => {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
};

/** The unit ball with each face split in four, or not. */
function ball(split: boolean): { corners: V3[]; faces: Triangle[] } {
  const corners = ICOSAHEDRON.map(unit);
  if (!split) return { corners, faces: ICOSAHEDRON_FACES };
  const middles = new Map<string, number>();
  const middle = (a: number, b: number) => {
    const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
    const known = middles.get(key);
    if (known !== undefined) return known;
    corners.push(unit([corners[a][0] + corners[b][0], corners[a][1] + corners[b][1], corners[a][2] + corners[b][2]]));
    middles.set(key, corners.length - 1);
    return corners.length - 1;
  };
  const faces = ICOSAHEDRON_FACES.flatMap(([a, b, c]): Triangle[] => {
    const [ab, bc, ca] = [middle(a, b), middle(b, c), middle(c, a)];
    return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]];
  });
  return { corners, faces };
}

/** Sliced by flat joints: every corner past a plane is pulled back on to it, which leaves a broken face. */
function jointed(random: () => number, cuts: number) {
  const planes = Array.from({ length: cuts }, () => {
    const turn = random() * 6.283;
    const rise = random() * 1.2 - 0.2;
    return { way: unit([Math.cos(turn), rise, Math.sin(turn)]), keep: 0.58 + random() * 0.26 };
  });
  return (corner: V3): V3 => {
    let at = corner;
    for (const { way, keep } of planes) {
      const over = at[0] * way[0] + at[1] * way[1] + at[2] * way[2] - keep;
      if (over > 0) at = [at[0] - way[0] * over, at[1] - way[1] * over, at[2] - way[2] * over];
    }
    return at;
  };
}

function boulderMesh(split: boolean, stretch: V3, sinkM: number, cut: (corner: V3) => V3, roughness: number, random: () => number): RuralMesh {
  const { corners, faces } = ball(split);
  const shaped = corners.map((corner) => {
    const bump = 1 + (random() - 0.5) * roughness;
    const [x, y, z] = cut([corner[0] * bump, corner[1] * bump, corner[2] * bump]);
    return [x * stretch[0], y * stretch[1] - sinkM, z * stretch[2]] as V3;
  });
  const shown = faces.filter((face) => face.some((index) => shaped[index][1] > -0.12));
  return new RuralMesh().solid(shaped, shown, "rapakivi", ([, y]) => 0.8 + Math.min(1, Math.max(0, (y + 0.1) / stretch[1])) * 0.3);
}

/** A loose boulder about a metre and a half across, its widest part near the ground. Scale it from 0.4 to 2.5. */
export function buildBoulder(seed: number = ROCK_SEEDS[0]): RoadsideModel {
  const random = seeded(seed * 7919 + 1);
  const stretch: V3 = [0.85 + random() * 0.35, 0.62 + random() * 0.26, 0.7 + random() * 0.3];
  const cut = jointed(random, 5);
  const sink = stretch[1] * 0.3;
  return finished(boulderMesh(true, stretch, sink, cut, 0.14, random), boulderMesh(false, stretch, sink, cut, 0, random), 110, 520);
}

interface Dome {
  lengthM: number;
  widthM: number;
  tallM: number;
  /** Corners round each ring, and rings from the edge in. */
  sides: number;
  rings: number;
}

/** The hump of bare rock the ice left: a long gentle back, one side plucked steeper, and split along a joint. */
function domeMesh({ lengthM, widthM, tallM, sides, rings }: Dome, random: () => number, seed: number, parts: { rough: number }, grounded = true): RuralMesh {
  const lobeA = seed * 1.3;
  const lobeB = seed * 2.1;
  const heightAt = (share: number, angle: number) => {
    const plucked = 1 + 0.22 * Math.cos(angle);
    const rounded = Math.pow(Math.max(0, 1 - Math.pow(share, 2.4 * plucked)), 0.7);
    // A step along one joint, so the back isn't one smooth loaf.
    const joint = Math.sin(angle * 2 + lobeA) * share > 0.25 ? 0.82 : 1;
    return tallM * rounded * joint;
  };
  const corners: V3[] = [];
  for (let ring = 0; ring < rings; ring++) {
    const share = 1 - ring / rings;
    for (let side = 0; side < sides; side++) {
      const angle = (side / sides) * 2 * Math.PI + ring * 0.21;
      const lobe = 1 + 0.16 * Math.sin(angle * 2 + lobeA) + 0.09 * Math.sin(angle * 3 + lobeB);
      const jitter = 1 + (random() - 0.5) * parts.rough;
      const radius = share * lobe * jitter;
      corners.push([Math.cos(angle) * radius * lengthM, ring === 0 ? -0.5 : heightAt(share, angle) * jitter, Math.sin(angle) * radius * widthM]);
    }
  }
  corners.push([0, tallM * (0.92 + random() * 0.1), 0]);
  const triangles: [number, number, number][] = [];
  for (let ring = 0; ring < rings - 1; ring++) {
    for (let side = 0; side < sides; side++) {
      const [a, b] = [ring * sides + side, ring * sides + ((side + 1) % sides)];
      triangles.push([a, b, a + sides], [a + sides, b, b + sides]);
    }
  }
  const last = (rings - 1) * sides;
  for (let side = 0; side < sides; side++) triangles.push([last + side, last + ((side + 1) % sides), corners.length - 1]);
  return new RuralMesh({ grounded }).solid(corners, triangles, "rapakivi", ([, y]) => 0.84 + Math.max(0, y / tallM) * 0.24);
}

/** A hump of bare rock breaking through a field or a wood's edge, about 12 × 8 m and 1.8 m tall. Scale it from 0.5 to 3. In the sea it's a skerry. */
export function buildOutcrop(seed: number = ROCK_SEEDS[0]): RoadsideModel {
  const size = { lengthM: 6 + (seed % 5) * 0.4, widthM: 4 + (seed % 3) * 0.5, tallM: 1.6 + (seed % 4) * 0.2 };
  const near = domeMesh({ ...size, sides: 12, rings: 5 }, seeded(seed * 104729 + 3), seed, { rough: 0.12 });
  const far = domeMesh({ ...size, sides: 6, rings: 2 }, seeded(seed * 104729 + 3), seed, { rough: 0 });
  return finished(near, far, 170, 1000);
}

/** A sheet of bare rock sliding under the water, the shore itself: about 18 × 14 m, its edges sunk under land and sea. Its y 0 is the water; stand it on the shoreline. */
export function buildShoreSlab(seed: number = ROCK_SEEDS[0]): RoadsideModel {
  const size = { lengthM: 9 + (seed % 4) * 0.6, widthM: 7, tallM: 1.3 + (seed % 3) * 0.15 };
  const near = domeMesh({ ...size, sides: 12, rings: 4 }, seeded(seed * 15485863 + 7), seed, { rough: 0.1 }, false);
  const far = domeMesh({ ...size, sides: 6, rings: 2 }, seeded(seed * 15485863 + 7), seed, { rough: 0 }, false);
  return finished(near, far, 170, 1000);
}
