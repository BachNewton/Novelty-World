import { blend, type MeshBuilder, type Paint, type Vec2, type Vec3 } from "./kit";

/*
 * A ship's hull, lofted along +x, from a table of its fullness and sheer: a stack of levels, each running between its
 * own stern and stem, so a raked stem and a counter stern come from where the levels end, with the last level the rail.
 */

export interface HullSpec {
  halfBeam: number;
  /** (share of the length, share of full beam), 0 at the stern and 1 at the stem. */
  beamShare: readonly Vec2[];
  /** (share of the length, rail height), on the same scale. */
  sheer: readonly Vec2[];
  /** From the water up. The last level's height is the sheer's; `sharpen` narrows a low level's ends. */
  levels: readonly { y: number; from: number; to: number; beam: number; sharpen?: number }[];
}

export function lookup(table: readonly Vec2[], at: number) {
  const after = table.findIndex(([place]) => place >= at);
  if (after <= 0) return table[Math.max(after, 0)][1];
  const [fromPlace, fromValue] = table[after - 1];
  const [toPlace, toValue] = table[after];
  return fromValue + ((toValue - fromValue) * (at - fromPlace)) / (toPlace - fromPlace);
}

export function createHull(spec: HullSpec) {
  const top = spec.levels.length - 1;
  /** Where a level lies at a share of its length, on side -1 (port) or 1. */
  const point = (level: number, share: number, side: number): Vec3 => {
    const { y, from, to, beam, sharpen = 1 } = spec.levels[level];
    return [from + (to - from) * share, level === top ? lookup(spec.sheer, share) : y, side * spec.halfBeam * beam * Math.pow(lookup(spec.beamShare, share), sharpen)];
  };
  return {
    point,
    top,
    /** The plating from the water to the rail, a paint per band between levels, with faint plate seams along it. */
    skin(mesh: MeshBuilder, stations: number, bands: readonly Paint[], seam: Paint | null = null) {
      for (let station = 0; station < stations; station++) {
        const a = station / stations;
        const b = (station + 1) / stations;
        for (const side of [-1, 1]) {
          bands.forEach((paint, band) => {
            const shown = seam && station % 2 === 0 ? blend(paint, seam, 0.07) : paint;
            mesh.quad(point(band, a, side), point(band, b, side), point(band + 1, b, side), point(band + 1, a, side), shown);
          });
        }
      }
      bands.forEach((paint, band) => {
        mesh.quad(point(band, 0, -1), point(band, 0, 1), point(band + 1, 0, 1), point(band + 1, 0, -1), paint);
      });
    },
    /** A flat deck inside the rail, between two places along it. */
    deck(mesh: MeshBuilder, fromX: number, toX: number, y: number, paint: Paint, steps = 10) {
      const { from, to } = spec.levels[top];
      const edge = (x: number, side: number): Vec3 => [x, y, side * spec.halfBeam * lookup(spec.beamShare, (x - from) / (to - from)) * 0.97];
      for (let step = 0; step < steps; step++) {
        const a = fromX + ((toX - fromX) * step) / steps;
        const b = fromX + ((toX - fromX) * (step + 1)) / steps;
        mesh.quad(edge(a, -1), edge(b, -1), edge(b, 1), edge(a, 1), paint);
      }
    },
  };
}
