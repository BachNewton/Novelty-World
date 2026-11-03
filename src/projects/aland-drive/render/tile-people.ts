// Not the kit's index, which brings its materials and their stylesheet into the worker.
import { bakeCrowdArrays, type CrowdArrays, type PlacedFigure } from "../art/people/crowd";
import { cyclist, sailor, worker, type FigureSpec } from "../art/people/figure";
import type { PoseName } from "../art/people/poses";

/*
 * A tile's people, as the pipeline placed them (`pipeline/people.py`): any number of
 * files, one for each module that places people, baked together into one crowd in the
 * tile's worker. Kept apart from what draws them, so the worker reads them without the
 * materials.
 */

export type Look = "sailor" | "worker" | "cyclist";
export const LOOKS: Record<Look, (seed: number) => Partial<FigureSpec>> = { sailor, worker, cyclist };

/** x, y, z, yaw, pose, seed, and what's fixed about who they are. */
export type FigureRow = [number, number, number, number, PoseName, number, (Partial<FigureSpec> & { look?: Look })?];

export interface PeopleFile {
  figures: FigureRow[];
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
  return figures.length > 0 ? bakeCrowdArrays(figures) : null;
}
