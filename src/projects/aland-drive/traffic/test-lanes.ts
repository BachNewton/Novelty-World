import type { LanesFile } from "./lane-map";

/** A line's scene points as the file writes them: whole centimetres, each after the first a step from the one before. */
export function encoded(points: [number, number, number][]): number[] {
  const centimetres = points.map((point) => point.map((value) => Math.round(value * 100)));
  return centimetres.flatMap((point, index) => (index === 0 ? point : point.map((value, axis) => value - centimetres[index - 1][axis])));
}

export const lane = (points: [number, number, number][], extra: Partial<LanesFile["lanes"][number]> = {}): LanesFile["lanes"][number] => ({ points: encoded(points), kind: "tertiary", chain: 0, forward: true, lane: 0, of: 1, width: 3, speeds: [[0, 70]], ...extra });

/**
 * East along z = 0 to a junction at x = 100, where a lane carries on east and a side road comes in from the south
 * (+z is south), its right turn merging into the eastbound lane. The east lane runs on over a seam at x = 6000.
 */
export function junctionTile(): LanesFile {
  return {
    lanes: [lane([[0, 0, 0], [95, 0, 0]]), lane([[105, 0, 0], [6000, 0, 0]], { seamEnd: true }), lane([[100, 0, 100], [100, 0, 5]])],
    connectors: [
      { from: 0, to: 1, junction: 0, turn: "straight", points: encoded([[95, 0, 0], [105, 0, 0]]) },
      { from: 2, to: 1, junction: 0, turn: "right", points: encoded([[100, 0, 5], [102, 0, 1], [105, 0, 0]]), yields: [0] },
    ],
    junctions: [{ kind: "give-way", x: 100, z: 0, arms: [{}, {}, { sign: "give-way", yields: true }] }],
    issues: [],
  };
}

export const overTheSeam = (): LanesFile => ({ lanes: [lane([[6000, 0, 0], [6200, 0, 0]], { seamStart: true })], connectors: [], junctions: [], issues: [] });

