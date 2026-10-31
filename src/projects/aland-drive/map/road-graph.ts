import { RoadLine } from "../sim/road-net";

/*
 * The island's roads as a network: what the maps draw and the GPS routes along,
 * loaded once from one file whatever the tile count (`pipeline/road_map.py`). It
 * holds no game state and touches no renderer. Places are in the scene: east is
 * +x and north is -z.
 */

/** The file as the pipeline writes it. */
export interface RoadMapFile {
  unitM: number;
  names: string[];
  kinds: string[];
  nodes: number[];
  from: number[];
  to: number[];
  kind: number[];
  name: number[];
  flags: number[];
  counts: number[];
  points: number[];
}

/** The same as typed arrays, ready to send from a worker. */
export interface RoadGraphData {
  names: string[];
  /** What each road kind is drawn as, from 0 the greatest. */
  ranks: Uint8Array;
  nodeX: Float32Array;
  nodeZ: Float32Array;
  from: Int32Array;
  to: Int32Array;
  kind: Uint8Array;
  name: Int32Array;
  flags: Uint8Array;
  /** Where each road's line starts in `pointX`, ends included. */
  first: Int32Array;
  pointX: Float32Array;
  pointZ: Float32Array;
  length: Float32Array;
  bytes: number;
}

const ONE_WAY = 1;
const CAN_ROUTE = 2;

/** How a road is drawn and how fast the GPS reckons it: 0 main, 1 through roads, 2 streets, 3 the rest. */
const RANK_BY_KIND: Partial<Record<string, number>> = { motorway: 0, trunk: 0, primary: 0, primary_link: 0, secondary: 0, secondary_link: 0, tertiary: 1, tertiary_link: 1, unclassified: 2, residential: 2, living_street: 2 };
const LESSER_RANK = 3;
const SPEED_BY_RANK = [25, 20, 11, 5];
const TOP_SPEED_M_S = SPEED_BY_RANK[0];

const CELL_M = 500;
/** Further than this off any road, a place isn't on one. */
const TURN_READ_M = 20;
const TURN_SHOWN_RADIANS = (35 * Math.PI) / 180;
const WRONG_WAY_PENALTY_S = 60;

export function decodeRoadGraph(file: RoadMapFile, bytes: number): RoadGraphData {
  const { unitM, counts } = file;
  const edges = file.from.length;
  const nodeCount = file.nodes.length / 2;
  const nodeX = new Float32Array(nodeCount);
  const nodeZ = new Float32Array(nodeCount);
  for (let node = 0; node < nodeCount; node++) {
    nodeX[node] = file.nodes[node * 2] * unitM;
    nodeZ[node] = -file.nodes[node * 2 + 1] * unitM;
  }
  const first = new Int32Array(edges + 1);
  for (let edge = 0; edge < edges; edge++) first[edge + 1] = first[edge] + counts[edge] + 2;
  const pointX = new Float32Array(first[edges]);
  const pointZ = new Float32Array(first[edges]);
  const length = new Float32Array(edges);
  let next = 0;
  for (let edge = 0; edge < edges; edge++) {
    let at = first[edge];
    pointX[at] = nodeX[file.from[edge]];
    pointZ[at] = nodeZ[file.from[edge]];
    let x = file.nodes[file.from[edge] * 2];
    let y = file.nodes[file.from[edge] * 2 + 1];
    for (let point = 0; point < counts[edge]; point++) {
      x += file.points[next++];
      y += file.points[next++];
      at++;
      pointX[at] = x * unitM;
      pointZ[at] = -y * unitM;
    }
    at++;
    pointX[at] = nodeX[file.to[edge]];
    pointZ[at] = nodeZ[file.to[edge]];
    for (let point = first[edge] + 1; point <= at; point++) length[edge] += Math.hypot(pointX[point] - pointX[point - 1], pointZ[point] - pointZ[point - 1]);
  }
  return {
    names: file.names,
    ranks: Uint8Array.from(file.kinds.map((kind) => RANK_BY_KIND[kind] ?? LESSER_RANK)),
    nodeX,
    nodeZ,
    from: Int32Array.from(file.from),
    to: Int32Array.from(file.to),
    kind: Uint8Array.from(file.kind),
    name: Int32Array.from(file.name),
    flags: Uint8Array.from(file.flags),
    first,
    pointX,
    pointZ,
    length,
    bytes,
  };
}

export function graphTransfers({ ranks, nodeX, nodeZ, from, to, kind, name, flags, first, pointX, pointZ, length }: RoadGraphData): Transferable[] {
  return [ranks, nodeX, nodeZ, from, to, kind, name, flags, first, pointX, pointZ, length].map((array) => array.buffer as ArrayBuffer);
}

/** A place on a road. */
export interface RoadSpot {
  edge: number;
  /** Which segment of the road's line, from its start. */
  segment: number;
  share: number;
  x: number;
  z: number;
  distance: number;
}

/** A direction to give: at this far along the route, turn by this many radians, clockwise on the map. */
export interface Turn {
  along: number;
  radians: number;
}

export interface Route {
  line: RoadLine;
  turns: Turn[];
  /** The snapped end, on a road. */
  end: { x: number; z: number };
}

const headingOf = (dx: number, dz: number) => Math.atan2(dx, -dz);
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

export class RoadGraph {
  private readonly cells = new Map<number, number[]>();
  private readonly linksFirst: Int32Array;
  /** Pairs of (road, 1 when it's walked from its start). */
  private readonly links: Int32Array;
  readonly bounds: { west: number; east: number; top: number; bottom: number };

  constructor(readonly data: RoadGraphData) {
    const { from, to, flags, first, pointX, pointZ, nodeX } = data;
    const nodes = nodeX.length;
    const degree = new Int32Array(nodes + 1);
    for (let edge = 0; edge < from.length; edge++) {
      degree[from[edge] + 1]++;
      if (!(flags[edge] & ONE_WAY)) degree[to[edge] + 1]++;
    }
    for (let node = 0; node < nodes; node++) degree[node + 1] += degree[node];
    this.linksFirst = degree.slice();
    this.links = new Int32Array(this.linksFirst[nodes] * 2);
    const filled = this.linksFirst.slice();
    for (let edge = 0; edge < from.length; edge++) {
      this.links[filled[from[edge]] * 2] = edge;
      this.links[filled[from[edge]]++ * 2 + 1] = 1;
      if (flags[edge] & ONE_WAY) continue;
      this.links[filled[to[edge]] * 2] = edge;
      this.links[filled[to[edge]]++ * 2 + 1] = 0;
    }
    let [west, east, top, bottom] = [Infinity, -Infinity, Infinity, -Infinity];
    for (let edge = 0; edge < from.length; edge++) {
      for (let point = first[edge]; point < first[edge + 1]; point++) {
        const key = this.cellKey(pointX[point], pointZ[point]);
        const list = this.cells.get(key);
        if (!list) this.cells.set(key, [edge]);
        else if (list[list.length - 1] !== edge) list.push(edge);
        west = Math.min(west, pointX[point]);
        east = Math.max(east, pointX[point]);
        top = Math.min(top, pointZ[point]);
        bottom = Math.max(bottom, pointZ[point]);
      }
    }
    this.bounds = { west, east, top, bottom };
  }

  private cellKey(x: number, z: number): number {
    return Math.floor(x / CELL_M) * 8192 + Math.floor(z / CELL_M);
  }

  /** Every road with a point within a box, each once. */
  forRoadsIn(west: number, east: number, top: number, bottom: number, visit: (edge: number) => void): void {
    const seen = new Set<number>();
    for (let column = Math.floor(west / CELL_M) - 1; column <= Math.floor(east / CELL_M) + 1; column++) {
      for (let row = Math.floor(top / CELL_M) - 1; row <= Math.floor(bottom / CELL_M) + 1; row++) {
        for (const edge of this.cells.get(column * 8192 + row) ?? []) {
          if (seen.has(edge)) continue;
          seen.add(edge);
          visit(edge);
        }
      }
    }
  }

  /** The nearest place on a road, within `reachM`, on a road the GPS can use if asked. */
  nearest(x: number, z: number, reachM: number, routable = false): RoadSpot | null {
    const { first, pointX, pointZ, flags } = this.data;
    let best: RoadSpot | null = null;
    this.forRoadsIn(x - reachM, x + reachM, z - reachM, z + reachM, (edge) => {
      if (routable && !(flags[edge] & CAN_ROUTE)) return;
      for (let point = first[edge]; point < first[edge + 1] - 1; point++) {
        const [ax, az, bx, bz] = [pointX[point], pointZ[point], pointX[point + 1], pointZ[point + 1]];
        const [runX, runZ] = [bx - ax, bz - az];
        const share = Math.max(0, Math.min(1, ((x - ax) * runX + (z - az) * runZ) / Math.max(runX * runX + runZ * runZ, 1e-6)));
        const [onX, onZ] = [ax + share * runX, az + share * runZ];
        const distance = Math.hypot(x - onX, z - onZ);
        if (distance <= reachM && (!best || distance < best.distance)) best = { edge, segment: point - first[edge], share, x: onX, z: onZ, distance };
      }
    });
    return best;
  }

  roadName(edge: number): string {
    return this.data.names[this.data.name[edge]];
  }

  /** What a road's line runs through from one end, as (x, z) pairs. */
  private walked(edge: number, forwards: boolean): number[] {
    const { first, pointX, pointZ } = this.data;
    const line: number[] = [];
    for (let point = first[edge]; point < first[edge + 1]; point++) line.push(pointX[point], pointZ[point]);
    if (forwards) return line;
    const back: number[] = [];
    for (let at = line.length - 2; at >= 0; at -= 2) back.push(line[at], line[at + 1]);
    return back;
  }

  /** Metres along a road's line, from its start, to a place on it. */
  private spotAlong(spot: RoadSpot): number {
    const { first, pointX, pointZ } = this.data;
    let along = 0;
    const start = first[spot.edge];
    for (let point = start; point < start + spot.segment; point++) along += Math.hypot(pointX[point + 1] - pointX[point], pointZ[point + 1] - pointZ[point]);
    return along + spot.share * Math.hypot(pointX[start + spot.segment + 1] - pointX[start + spot.segment], pointZ[start + spot.segment + 1] - pointZ[start + spot.segment]);
  }

  /** A stretch of a road's line between two places on it, as (x, z) pairs from `fromAlong` to `toAlong`. */
  private stretch(spot: { edge: number }, fromAlong: number, toAlong: number): number[] {
    const { length } = this.data;
    const forwards = toAlong >= fromAlong;
    const line = this.walked(spot.edge, forwards);
    const [start, end] = forwards ? [fromAlong, toAlong] : [length[spot.edge] - fromAlong, length[spot.edge] - toAlong];
    const kept: number[] = [];
    let along = 0;
    for (let at = 0; at + 3 < line.length; at += 2) {
      const run = Math.hypot(line[at + 2] - line[at], line[at + 3] - line[at + 1]);
      const place = (distance: number) => {
        const share = Math.max(0, Math.min(1, (distance - along) / Math.max(run, 1e-6)));
        kept.push(line[at] + share * (line[at + 2] - line[at]), line[at + 1] + share * (line[at + 3] - line[at + 1]));
      };
      if (kept.length === 0 && along + run >= start) place(start);
      if (kept.length > 0 && along + run < end) kept.push(line[at + 2], line[at + 3]);
      if (along + run >= end) {
        place(end);
        break;
      }
      along += run;
    }
    return kept;
  }

  private secondsOn(edge: number): number {
    const { length, ranks, kind } = this.data;
    return length[edge] / SPEED_BY_RANK[ranks[kind[edge]]];
  }

  /**
   * The quickest way from a place on a road to the road nearest a target, honouring one-way
   * streets, starting the way the car already faces where it can. Null when none joins them.
   */
  route(fromX: number, fromZ: number, headingRadians: number, toX: number, toZ: number): Route | null {
    const start = this.nearest(fromX, fromZ, 3000, true);
    const goal = this.nearest(toX, toZ, 3000, true);
    if (!start || !goal) return null;
    const { from, to, flags, length, nodeX, nodeZ } = this.data;
    const startAlong = this.spotAlong(start);
    const goalAlong = this.spotAlong(goal);
    if (start.edge === goal.edge && (!(flags[start.edge] & ONE_WAY) || goalAlong >= startAlong)) return this.finish([this.stretch(start, startAlong, goalAlong)], { x: goal.x, z: goal.z });

    const nodes = nodeX.length;
    const seconds = new Float64Array(nodes).fill(Infinity);
    const cameBy = new Int32Array(nodes).fill(-1);
    const heap = new NodeHeap();
    const speed = TOP_SPEED_M_S;
    const estimate = (node: number) => Math.hypot(nodeX[node] - goal.x, nodeZ[node] - goal.z) / speed;
    const line = this.walked(start.edge, true);
    const at = start.segment * 2;
    const faces = headingOf(line[at + 2] - line[at], line[at + 3] - line[at + 1]);
    const forwardsFits = Math.cos(wrap(faces - headingRadians)) >= 0;
    const seed = (node: number, cost: number) => {
      if (cost < seconds[node]) {
        seconds[node] = cost;
        heap.push(node, cost + estimate(node));
      }
    };
    const perMetre = this.secondsOn(start.edge) / Math.max(length[start.edge], 1);
    seed(to[start.edge], (length[start.edge] - startAlong) * perMetre + (forwardsFits ? 0 : WRONG_WAY_PENALTY_S));
    if (!(flags[start.edge] & ONE_WAY)) seed(from[start.edge], startAlong * perMetre + (forwardsFits ? WRONG_WAY_PENALTY_S : 0));

    const ends = [from[goal.edge], to[goal.edge]];
    const goalPerMetre = this.secondsOn(goal.edge) / Math.max(length[goal.edge], 1);
    const costToGoal = (node: number) => {
      if (node === from[goal.edge]) return goalAlong * goalPerMetre;
      if (flags[goal.edge] & ONE_WAY) return Infinity;
      return (length[goal.edge] - goalAlong) * goalPerMetre;
    };
    let bestEnd = -1;
    let bestCost = Infinity;
    for (let node = heap.pop(); node >= 0; node = heap.pop()) {
      if (seconds[node] >= bestCost) break;
      if (ends.includes(node) && seconds[node] + costToGoal(node) < bestCost) {
        bestCost = seconds[node] + costToGoal(node);
        bestEnd = node;
      }
      for (let link = this.linksFirst[node]; link < this.linksFirst[node + 1]; link++) {
        const edge = this.links[link * 2];
        const forwards = this.links[link * 2 + 1] === 1;
        const next = forwards ? to[edge] : from[edge];
        const cost = seconds[node] + this.secondsOn(edge);
        if (cost >= seconds[next]) continue;
        seconds[next] = cost;
        cameBy[next] = link;
        heap.push(next, cost + estimate(next));
      }
    }
    if (bestEnd < 0) return null;

    const legs: number[][] = [];
    legs.push(this.stretch(goal, bestEnd === from[goal.edge] ? 0 : length[goal.edge], goalAlong));
    let node = bestEnd;
    while (cameBy[node] >= 0) {
      const edge = this.links[cameBy[node] * 2];
      const forwards = this.links[cameBy[node] * 2 + 1] === 1;
      legs.push(this.walked(edge, forwards));
      node = forwards ? from[edge] : to[edge];
    }
    legs.push(this.stretch(start, startAlong, node === from[start.edge] ? 0 : length[start.edge]));
    return this.finish(legs.reverse(), { x: goal.x, z: goal.z });
  }

  private finish(legs: number[][], end: Route["end"]): Route {
    const points: number[] = [];
    const junctions: number[] = [];
    for (const leg of legs) {
      for (let at = 0; at < leg.length; at += 2) {
        const [x, z] = [leg[at], leg[at + 1]];
        const count = points.length;
        if (count >= 3 && Math.hypot(points[count - 3] - x, points[count - 1] - z) < 0.05) continue;
        points.push(x, 0, z);
      }
      junctions.push(points.length / 3 - 1);
    }
    const line = new RoadLine(Float32Array.from(points.length >= 6 ? points : [...points, points[0], 0, points[2] + 1]));
    const turns: Turn[] = [];
    for (const junction of junctions.slice(0, -1)) {
      const along = line.lengths[junction];
      const before = line.at(along - TURN_READ_M);
      const here = line.at(along);
      const after = line.at(along + TURN_READ_M);
      const radians = wrap(headingOf(after.x - here.x, after.z - here.z) - headingOf(here.x - before.x, here.z - before.z));
      if (Math.abs(radians) >= TURN_SHOWN_RADIANS) turns.push({ along, radians });
    }
    return { line, turns, end };
  }
}

/** A binary heap of nodes by cost. A node may be in it twice: the cheaper comes out first, and the rest is only a repeat. */
class NodeHeap {
  private readonly nodes: number[] = [];
  private readonly costs: number[] = [];

  push(node: number, cost: number): void {
    const { nodes, costs } = this;
    let at = nodes.length;
    nodes.push(node);
    costs.push(cost);
    while (at > 0) {
      const parent = (at - 1) >> 1;
      if (costs[parent] <= cost) break;
      nodes[at] = nodes[parent];
      costs[at] = costs[parent];
      at = parent;
    }
    nodes[at] = node;
    costs[at] = cost;
  }

  /** The cheapest node, or -1 when there's none. */
  pop(): number {
    const { nodes, costs } = this;
    if (nodes.length === 0) return -1;
    const top = nodes[0];
    const node = nodes.pop() as number;
    const cost = costs.pop() as number;
    const size = nodes.length;
    if (size > 0) {
      let at = 0;
      for (;;) {
        let child = at * 2 + 1;
        if (child >= size) break;
        if (child + 1 < size && costs[child + 1] < costs[child]) child++;
        if (costs[child] >= cost) break;
        nodes[at] = nodes[child];
        costs[at] = costs[child];
        at = child;
      }
      nodes[at] = node;
      costs[at] = cost;
    }
    return top;
  }
}
