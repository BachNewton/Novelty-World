// Not the kit's index, which brings its materials and their stylesheet into the worker.
import { bakeCrowdArrays, type CrowdArrays, type CrowdPart, type PlacedFigure } from "../art/people/crowd";
import { BOATS_AFLOAT, TERRACES, thresholdOf, type InSeason } from "../climate/placed-season";
import { cyclist, sailor, worker, type FigureSpec } from "../art/people/figure";
import type { PoseName } from "../art/people/poses";

/*
 * A tile's people, as the pipeline placed them (`pipeline/people.py`): any number of
 * files, one for each module that places people, baked together into one crowd in the
 * tile's worker. Kept apart from what draws them, so the worker reads them without the
 * materials.
 *
 * Someone there only in a season goes with it: a sitter at a café table with their
 * table's terrace, on the table's own roll, and someone sunbathing or tending a boat
 * on a roll of their own. Each vertex carries its person's season (`SEASON_KINDS`'s
 * place, from 1, or 0 for always, and their threshold), which `render/people.ts` reads.
 */

export type Look = "sailor" | "worker" | "cyclist";
export const LOOKS: Record<Look, (seed: number) => Partial<FigureSpec>> = { sailor, worker, cyclist };

/** x, y, z, yaw, pose, seed, and what's fixed about who they are. */
export type FigureRow = [number, number, number, number, PoseName, number, (Partial<FigureSpec> & { look?: Look })?];

export interface PeopleFile {
  figures: FigureRow[];
}

/** A café chair's seat is this far from its table, which it faces (`pipeline/furniture.py`'s `CAFE_CHAIR_Z`). */
const CAFE_CHAIR_M = 0.62;

/** What each person out only in a season goes by, in the order the vertices number them from 1. */
export const SEASON_KINDS: readonly InSeason[] = [TERRACES, BOATS_AFLOAT, { dial: "terraces", salt: 7311 }];

/** A person's season, as the vertices carry it: the kind, from 1 (0 is always out), and its threshold. */
function seasonOf({ x, z, yaw = 0, pose }: PlacedFigure): [number, number] {
  if (pose === "sit-cafe") return [1, thresholdOf(x + Math.sin(yaw) * CAFE_CHAIR_M, z + Math.cos(yaw) * CAFE_CHAIR_M, SEASON_KINDS[0])];
  if (pose === "tend-boat") return [2, thresholdOf(x, z, SEASON_KINDS[1])];
  if (pose === "sunbathe") return [3, thresholdOf(x, z, SEASON_KINDS[2])];
  return [0, 0];
}

/** Each vertex's person's season, found by the place every vertex of a person carries. */
function withSeason(part: CrowdPart, seasons: ReadonlyMap<string, [number, number]>): CrowdPart {
  const place = part.attributes.place.array;
  const vertices = place.length / 4;
  const season = new Float32Array(vertices * 2);
  for (let vertex = 0; vertex < vertices; vertex++) season.set(seasons.get(`${place[vertex * 4]},${place[vertex * 4 + 2]}`) ?? [0, 0], vertex * 2);
  return { ...part, attributes: { ...part.attributes, season: { array: season, itemSize: 2 } } };
}

export function figuresOf(files: readonly PeopleFile[]): PlacedFigure[] {
  return files.flatMap(({ figures }) =>
    figures.map(([x, y, z, yaw, pose, seed, fixed]): PlacedFigure => {
      if (fixed === undefined) return { x, y, z, yaw, pose, seed };
      const { look, ...spec } = fixed;
      return { x, y, z, yaw, pose, seed, spec: look === undefined ? spec : { ...LOOKS[look](seed), ...spec } };
    }),
  );
}

/** Every person the files place, as one crowd's arrays, or nothing for a tile with no one. */
export function tileCrowd(files: readonly PeopleFile[]): CrowdArrays | null {
  const figures = figuresOf(files);
  if (figures.length === 0) return null;
  const { near, far, shadow } = bakeCrowdArrays(figures);
  // Keyed by the place as the vertices store it, in 32-bit floats.
  const seasons = new Map(figures.map((figure) => [`${Math.fround(figure.x)},${Math.fround(figure.z)}`, seasonOf(figure)]));
  return { near: withSeason(near, seasons), far: withSeason(far, seasons), shadow: withSeason(shadow, seasons) };
}
