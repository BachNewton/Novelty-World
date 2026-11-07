/*
 * A tile's lane map, as `pipeline/lanes.py` writes it: the lines traffic drives
 * along, one direction of one laid road between junctions, and the connectors
 * across each junction from one lane's end to another's start, each listing the
 * connectors it gives way to. Places are in the scene (east +x, up +y, north -z).
 * Decoded in the tile worker into plain arrays; `LaneNet` joins the loaded tiles'.
 */

export type Turn = "straight" | "left" | "right" | "back";

/** How a junction's right of way works: by a sign, a ring, lights, a drive giving way, or traffic from the right. */
export type JunctionKind = "roundabout" | "signals" | "stop" | "give-way" | "drive" | "right" | "join" | "end";

/** Where a lane or connector can't sit cleanly on the drawn road. */
export type LaneIssueKind = "off-road" | "tight" | "buried" | "step" | "kink" | "unreachable";

export interface LaneIssue {
  kind: LaneIssueKind;
  x: number;
  y: number;
  z: number;
  detail: string;
  /** How many of its kind were found within a few tens of metres. */
  count: number;
  /** On a footway or cycleway rather than a road. */
  path?: true;
}

/** Every `points` is scene (x, y, z) in whole centimetres, the first point as it is and each after as the step from the one before. */
export interface LanesFile {
  lanes: {
    points: number[];
    kind: string;
    chain: number;
    forward: boolean;
    lane: number;
    of: number;
    width: number;
    /** Each limit in km/h from where it starts, in metres along the lane. */
    speeds: [number, number][];
    from?: number;
    to?: number;
    seamStart?: true;
    seamEnd?: true;
  }[];
  connectors: { from: number; to: number; junction: number; turn: Turn; points: number[]; yields?: number[]; offM?: number }[];
  /** Where a path meets a road: from the path's end on to a road lane, or off a road lane on to the path's start. */
  links?: { path: number; road: number; along: number; onToRoad: boolean; points: number[] }[];
  junctions: { kind: JunctionKind; x: number; z: number; arms: { sign?: "stop" | "give-way"; yields?: true; phase?: number }[] }[];
  issues: LaneIssue[];
}

/** A line of points in `TileLanes.points`. */
export interface LaneLine {
  first: number;
  count: number;
}

export interface Lane extends LaneLine {
  kind: string;
  /** The road or path it's one way of: a two-way one's other way has the same chain, running the other way. */
  chain: number;
  forward: boolean;
  /** A footway or cycleway's, for cyclists and walkers. */
  path: boolean;
  width: number;
  speeds: [number, number][];
  /** The connectors leaving its end. */
  next: number[];
  seamStart: boolean;
  seamEnd: boolean;
}

export interface Connector extends LaneLine {
  from: number;
  to: number;
  junction: number;
  turn: Turn;
  /** The connectors it gives way to. */
  yields: number[];
  /** How far it leaves the drawn road, where it does by more than half a metre. */
  offM: number;
}

/** A path's end on a road lane, at a distance along it: walkers and cyclists step on or off there. */
export interface PathLink extends LaneLine {
  path: number;
  road: number;
  along: number;
  onToRoad: boolean;
}

export interface TileLanes {
  /** Scene (x, y, z) of every lane's points, then every connector's, then every link's. */
  points: Float32Array;
  lanes: Lane[];
  connectors: Connector[];
  links: PathLink[];
  junctions: LanesFile["junctions"];
  issues: LaneIssue[];
}

export const NO_LANES: TileLanes = { points: new Float32Array(0), lanes: [], connectors: [], links: [], junctions: [], issues: [] };

const PATH_KINDS = new Set(["footway", "path", "cycleway", "steps", "bridleway", "pedestrian", "corridor"]);

export function decodeLanes(file: LanesFile): TileLanes {
  const links = file.links ?? [];
  const total = [...file.lanes, ...file.connectors, ...links].reduce((sum, line) => sum + line.points.length, 0);
  const points = new Float32Array(total);
  let at = 0;
  // Whole centimetres, each point after the first as the step from the one before.
  const place = (values: number[]): LaneLine => {
    const sum = [0, 0, 0];
    for (let value = 0; value < values.length; value++) {
      sum[value % 3] += values[value];
      points[at + value] = sum[value % 3] / 100;
    }
    const line = { first: at / 3, count: values.length / 3 };
    at += values.length;
    return line;
  };
  const lanes: Lane[] = file.lanes.map((lane) => ({ ...place(lane.points), kind: lane.kind, chain: lane.chain, forward: lane.forward, path: PATH_KINDS.has(lane.kind), width: lane.width, speeds: lane.speeds, next: [], seamStart: lane.seamStart === true, seamEnd: lane.seamEnd === true }));
  const connectors: Connector[] = file.connectors.map((connector, index) => {
    if (connector.from >= lanes.length || connector.to >= lanes.length) throw new Error(`connector ${index} joins lanes the file doesn't have`);
    lanes[connector.from].next.push(index);
    return { ...place(connector.points), from: connector.from, to: connector.to, junction: connector.junction, turn: connector.turn, yields: connector.yields ?? [], offM: connector.offM ?? 0 };
  });
  const pathLinks = links.map((link) => ({ ...place(link.points), path: link.path, road: link.road, along: link.along, onToRoad: link.onToRoad }));
  return { points, lanes, connectors, links: pathLinks, junctions: file.junctions, issues: file.issues };
}

/** The points of a lane, a connector or a link, by its index in its own list. */
export function lineOf(tile: TileLanes, line: { index: number; connector: boolean; link?: boolean }): LaneLine {
  const found = line.link ? tile.links[line.index] : line.connector ? tile.connectors[line.index] : tile.lanes[line.index];
  if (!(found as LaneLine | undefined)) throw new Error(`no ${line.link ? "link" : line.connector ? "connector" : "lane"} ${line.index}`);
  return found;
}

export const laneTransfers = (lanes: TileLanes): ArrayBuffer[] => [lanes.points.buffer as ArrayBuffer];

/** A line's length along the ground, in metres. */
export function lineLength(points: Float32Array, line: LaneLine): number {
  let length = 0;
  for (let at = line.first; at < line.first + line.count - 1; at++) length += Math.hypot(points[at * 3 + 3] - points[at * 3], points[at * 3 + 5] - points[at * 3 + 2]);
  return length;
}

/** The place metres along a line, held to its ends, and the way it runs there on the ground. */
export function pointAlong(points: Float32Array, line: LaneLine, along: number): { x: number; y: number; z: number; dx: number; dz: number } {
  let left = Math.max(0, along);
  let last = { x: points[line.first * 3], y: points[line.first * 3 + 1], z: points[line.first * 3 + 2], dx: 0, dz: -1 };
  for (let at = line.first; at < line.first + line.count - 1; at++) {
    const [x0, y0, z0, x1, y1, z1] = points.subarray(at * 3, at * 3 + 6);
    const length = Math.hypot(x1 - x0, z1 - z0);
    if (length < 1e-6) continue;
    const share = Math.min(1, left / length);
    last = { x: x0 + (x1 - x0) * share, y: y0 + (y1 - y0) * share, z: z0 + (z1 - z0) * share, dx: (x1 - x0) / length, dz: (z1 - z0) / length };
    if (left <= length) return last;
    left -= length;
  }
  return last;
}

/**
 * How far along a line the nearest point to a place lies, looking only between `from` and `to` metres along it so a
 * line that comes back near itself isn't confused. Past the line's end it runs on along its last step, so a car
 * past the end reads further than the line's length.
 */
export function alongNearest(points: Float32Array, line: LaneLine, x: number, z: number, from: number, to: number): number {
  let best = { off: Infinity, along: from };
  let travelled = 0;
  // The last step with any length: a line may end on a point written twice, and a place past its end runs on along this.
  let last = line.first + line.count - 2;
  while (last > line.first && points[last * 3] === points[last * 3 + 3] && points[last * 3 + 2] === points[last * 3 + 5]) last--;
  for (let at = line.first; at <= last; at++) {
    const [x0, , z0, x1, , z1] = points.subarray(at * 3, at * 3 + 6);
    const length = Math.hypot(x1 - x0, z1 - z0);
    if (length > 1e-6 && travelled + length >= from && travelled <= to) {
      const raw = ((x - x0) * (x1 - x0) + (z - z0) * (z1 - z0)) / (length * length);
      const share = Math.max(at === line.first ? -Infinity : 0, Math.min(at === last ? Infinity : 1, raw));
      const off = Math.hypot(x - (x0 + (x1 - x0) * share), z - (z0 + (z1 - z0) * share));
      if (off < best.off) best = { off, along: travelled + share * length };
    }
    travelled += length;
  }
  return Math.max(from, Math.min(to, best.along));
}
