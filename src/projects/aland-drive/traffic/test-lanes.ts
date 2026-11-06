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


/** A straight two-way road `width` metres wide along z = 0, from x = 0 to `length`: eastbound keeps right, on +z (south), westbound on -z. */
export function twoWayRoad(width: number, length = 400): LanesFile {
  const middle = width / 4;
  return {
    lanes: [
      lane([[0, 0, middle], [length, 0, middle]], { width: width / 2 }),
      lane([[length, 0, -middle], [0, 0, -middle]], { width: width / 2 }),
    ],
    connectors: [],
    junctions: [],
    issues: [],
  };
}

/** Two cars' outlines on the ground, as their middles, yaws and half sizes: whether they overlap, by the separating axes of both. */
export function touching(a: { x: number; z: number; yaw: number; half: readonly [number, number] }, b: typeof a): boolean {
  const corners = ({ x, z, yaw, half: [wide, long] }: typeof a) =>
    [
      [1, 1],
      [1, -1],
      [-1, -1],
      [-1, 1],
    ].map(([forth, side]) => [x - Math.sin(yaw) * long * forth + Math.cos(yaw) * wide * side, z - Math.cos(yaw) * long * forth - Math.sin(yaw) * wide * side]);
  const [ca, cb] = [corners(a), corners(b)];
  for (const yaw of [a.yaw, b.yaw]) {
    for (const [ax, az] of [
      [Math.cos(yaw), -Math.sin(yaw)],
      [Math.sin(yaw), Math.cos(yaw)],
    ]) {
      const span = (points: number[][]) => points.map(([x, z]) => x * ax + z * az);
      const [sa, sb] = [span(ca), span(cb)];
      if (Math.max(...sa) < Math.min(...sb) || Math.max(...sb) < Math.min(...sa)) return false;
    }
  }
  return true;
}

/**
 * A two-way road 6 m wide along z = 0 (as `twoWayRoad`), a cycleway coming up from the south to meet it at x = 100,
 * with a link from its end on to the eastbound lane there, and a link off the eastbound lane at x = 300 on to a
 * cycleway leaving south.
 */
export function pathMeetsRoad(): LanesFile {
  const road = twoWayRoad(6, 600);
  const cycleway = { kind: "cycleway", width: 1, speeds: [[0, 20]] as [number, number][] };
  return {
    ...road,
    lanes: [...road.lanes, lane([[100, 0, 80], [100, 0, 4]], cycleway), lane([[300, 0, 4], [300, 0, 80]], cycleway)],
    links: [
      { path: 2, road: 0, along: 102, onToRoad: true, points: encoded([[100, 0, 4], [101, 0, 2.5], [102, 0, 1.5]]) },
      { path: 3, road: 0, along: 298, onToRoad: false, points: encoded([[298, 0, 1.5], [299, 0, 2.5], [300, 0, 4]]) },
    ],
  };
}
