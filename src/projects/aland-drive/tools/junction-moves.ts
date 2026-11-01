// Every way through every junction of the road network, as lines to drive: for `junction-check.ts`. Read from the map's
// network (`pipeline/road_map.py`), not from the road surface, so the same movements exist on any build of the tiles.
//
// A junction is a node where three or more road ends meet, or a whole roundabout. A movement is one way in to one way
// out. One-way roads are honoured, a roundabout's ring included: its ring is walked the way it runs, and a road is only
// entered or left the way it allows. A hairpin at a plain junction, such as from one leg of a split approach straight
// back into the other, is a U-turn across a traffic island and not a movement; the way back round a roundabout is one.

import type { RoadGraphData } from "../map/road-graph";

export interface Movement {
  /** Where the junction is: the node, or a roundabout's middle. */
  x: number;
  z: number;
  roundabout: boolean;
  /** Kinds of road, in and out. */
  from: string;
  to: string;
  /** Radians, 0 straight on. */
  turn: number;
  /** Scene x and z, every metre or so, rounded the way a driver rounds a corner. */
  line: number[];
  /** Metres along the line that the junction starts and ends. */
  entersAt: number;
  leavesAt: number;
}

const ONE_WAY = 1;
const LONGEST_RING_M = 320;
/** A circle is 1. Further from round than this, a loop of one-way streets is a block of a town. */
const ROUNDEST_RING = 1.5;
const HAIRPIN_RADIANS = (140 * Math.PI) / 180;
const READ_HEADING_M = 15;
const RUN_UP_M = 120;
const RUN_OUT_M = 50;
const POINT_M = 1;
/** How much a driver rounds what the map draws as a corner: less the sharper it is, or they'd cut across the land inside it. */
const ROUNDING_M = 4;
const SHARP_ROUNDING_M = 1.5;
const SHARP_RADIANS = (75 * Math.PI) / 180;
const TIDY_M = 0.01;
const SHORTEST_ROAD_M = 0.5;

/** A road end at a node: `outFromStart` when the road's own line starts here. */
interface Arm {
  edge: number;
  outFromStart: boolean;
}

interface Walked {
  edge: number;
  forwards: boolean;
}

const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

export class JunctionFinder {
  private readonly arms: Arm[][];
  /** Each road on a roundabout's ring, as the ring it's on. */
  private readonly ringOf = new Map<number, number>();
  /** The roads of each ring, in the order they run. */
  private readonly rings: number[][] = [];

  constructor(
    private readonly data: RoadGraphData,
    private readonly kinds: string[],
  ) {
    this.arms = Array.from({ length: data.nodeX.length }, (): Arm[] => []);
    for (let edge = 0; edge < data.from.length; edge++) {
      if (data.length[edge] < SHORTEST_ROAD_M) continue;
      this.arms[data.from[edge]].push({ edge, outFromStart: true });
      this.arms[data.to[edge]].push({ edge, outFromStart: false });
    }
    this.findRings();
  }

  private oneWay(edge: number): boolean {
    return (this.data.flags[edge] & ONE_WAY) !== 0;
  }

  private canLeave({ edge, outFromStart }: Arm): boolean {
    return outFromStart || !this.oneWay(edge);
  }

  private canEnter({ edge, outFromStart }: Arm): boolean {
    return !outFromStart || !this.oneWay(edge);
  }

  /** The nearest way back to a one-way road's start along one-way roads, if it's short. */
  private loopFrom(seed: number): number[] | null {
    const { from, to, length } = this.data;
    const best = new Map<number, { metres: number; edges: number[] }>([[to[seed], { metres: length[seed], edges: [seed] }]]);
    const waiting = [to[seed]];
    while (waiting.length > 0) {
      const node = waiting.shift() as number;
      const here = best.get(node) as { metres: number; edges: number[] };
      for (const arm of this.arms[node]) {
        if (!arm.outFromStart || !this.oneWay(arm.edge) || arm.edge === seed) continue;
        const next = to[arm.edge];
        const metres = here.metres + length[arm.edge];
        if (metres > LONGEST_RING_M || metres >= (best.get(next)?.metres ?? Infinity)) continue;
        best.set(next, { metres, edges: [...here.edges, arm.edge] });
        waiting.push(next);
      }
    }
    return best.get(from[seed])?.edges ?? null;
  }

  private isRound(edges: number[]): boolean {
    const { first, pointX, pointZ, length } = this.data;
    let area = 0;
    for (const edge of edges) {
      for (let point = first[edge]; point < first[edge + 1] - 1; point++) area += pointX[point] * pointZ[point + 1] - pointX[point + 1] * pointZ[point];
    }
    const perimeter = edges.reduce((sum, edge) => sum + length[edge], 0);
    return area !== 0 && (perimeter * perimeter) / (4 * Math.PI * (Math.abs(area) / 2)) <= ROUNDEST_RING;
  }

  private findRings(): void {
    for (let edge = 0; edge < this.data.from.length; edge++) {
      if (!this.oneWay(edge) || this.ringOf.has(edge)) continue;
      const loop = this.loopFrom(edge);
      if (!loop || !this.isRound(loop)) continue;
      loop.forEach((member) => this.ringOf.set(member, this.rings.length));
      this.rings.push(loop);
    }
  }

  /** The road's line from a node outwards, or towards it. */
  private lineOf({ edge, forwards }: Walked): [number, number][] {
    const { first, pointX, pointZ } = this.data;
    const line: [number, number][] = [];
    for (let point = first[edge]; point < first[edge + 1]; point++) line.push([pointX[point], pointZ[point]]);
    return forwards ? line : line.reverse();
  }

  private headingAt(line: [number, number][], fromEnd: boolean): number {
    const ordered = fromEnd ? [...line].reverse() : line;
    let run = 0;
    let at = 0;
    while (at < ordered.length - 1 && run < READ_HEADING_M) {
      run += Math.hypot(ordered[at + 1][0] - ordered[at][0], ordered[at + 1][1] - ordered[at][1]);
      at++;
    }
    const [dx, dz] = fromEnd ? [ordered[0][0] - ordered[at][0], ordered[0][1] - ordered[at][1]] : [ordered[at][0] - ordered[0][0], ordered[at][1] - ordered[0][1]];
    return Math.atan2(dx, -dz);
  }

  private endNode({ edge, forwards }: Walked): number {
    return forwards ? this.data.to[edge] : this.data.from[edge];
  }

  private startNode({ edge, forwards }: Walked): number {
    return forwards ? this.data.from[edge] : this.data.to[edge];
  }

  /** Further along the road out of a node, the straightest way, for at least `metres`, and never on to a ring. */
  private onward(walked: Walked, metres: number): Walked[] {
    const { length } = this.data;
    const run: Walked[] = [];
    let last = walked;
    for (let reach = metres; reach > 0; ) {
      const heading = this.headingAt(this.lineOf(last), true);
      let best: Walked | null = null;
      let straightest = Infinity;
      for (const arm of this.arms[this.endNode(last)]) {
        if (arm.edge === last.edge || !this.canLeave(arm) || this.ringOf.has(arm.edge)) continue;
        const next = { edge: arm.edge, forwards: arm.outFromStart };
        const turn = Math.abs(wrap(this.headingAt(this.lineOf(next), false) - heading));
        if (turn < straightest) {
          straightest = turn;
          best = next;
        }
      }
      if (!best || run.some(({ edge }) => edge === best.edge)) break;
      run.push(best);
      reach -= length[best.edge];
      last = best;
    }
    return run;
  }

  /** The same back from a road into a node: the way a car came. */
  private backward(walked: Walked, metres: number): Walked[] {
    const { length } = this.data;
    const run: Walked[] = [];
    let last = walked;
    for (let reach = metres; reach > 0; ) {
      const heading = this.headingAt(this.lineOf(last), false);
      let best: Walked | null = null;
      let straightest = Infinity;
      for (const arm of this.arms[this.startNode(last)]) {
        if (arm.edge === last.edge || !this.canEnter(arm) || this.ringOf.has(arm.edge)) continue;
        const next = { edge: arm.edge, forwards: !arm.outFromStart };
        const turn = Math.abs(wrap(heading - this.headingAt(this.lineOf(next), true)));
        if (turn < straightest) {
          straightest = turn;
          best = next;
        }
      }
      if (!best || run.some(({ edge }) => edge === best.edge)) break;
      run.unshift(best);
      reach -= length[best.edge];
      last = best;
    }
    return run;
  }

  private movement(x: number, z: number, roundabout: boolean, into: Arm, through: Walked[], out: Arm): Movement {
    const { length } = this.data;
    const approach = { edge: into.edge, forwards: !into.outFromStart };
    const exit = { edge: out.edge, forwards: out.outFromStart };
    const before = [...this.backward(approach, RUN_UP_M - length[approach.edge]), approach];
    const after = [exit, ...this.onward(exit, RUN_OUT_M - length[exit.edge])];
    const run = [...before, ...through, ...after];
    const points: [number, number][] = [];
    for (const walked of run) {
      for (const point of this.lineOf(walked)) {
        const last = points[points.length - 1] as [number, number] | undefined;
        if (!last || Math.hypot(last[0] - point[0], last[1] - point[1]) > TIDY_M) points.push(point);
      }
    }
    const metres = (walked: Walked[]) => walked.reduce((sum, { edge }) => sum + length[edge], 0);
    const turn = wrap(this.headingAt(this.lineOf(exit), false) - this.headingAt(this.lineOf(approach), true));
    const smooth = rounded(points, Math.abs(turn) >= SHARP_RADIANS && !roundabout ? SHARP_ROUNDING_M : ROUNDING_M);
    // A long road is only driven for the run-up and the run-out.
    const entersAt = Math.min(metres(before), RUN_UP_M);
    const leavesAt = entersAt + metres(through);
    const first = Math.max(0, Math.round((metres(before) - entersAt) / POINT_M));
    const kept = smooth.slice(first, first + Math.ceil((leavesAt + RUN_OUT_M) / POINT_M) + 1);
    return {
      x,
      z,
      roundabout,
      from: this.kinds[this.data.kind[into.edge]],
      to: this.kinds[this.data.kind[out.edge]],
      turn,
      line: kept.flat(),
      entersAt,
      leavesAt,
    };
  }

  /** Every movement through the junctions a test picks by place. */
  movements(inside: (x: number, z: number) => boolean): { moves: Movement[]; junctions: number; hairpins: number } {
    const { nodeX, nodeZ, from, to } = this.data;
    const moves: Movement[] = [];
    let junctions = 0;
    let hairpins = 0;
    for (let node = 0; node < this.arms.length; node++) {
      const arms = this.arms[node];
      if (arms.length < 3 || arms.some(({ edge }) => this.ringOf.has(edge)) || !inside(nodeX[node], nodeZ[node])) continue;
      junctions++;
      for (const into of arms) {
        if (!this.canEnter(into)) continue;
        for (const out of arms) {
          if (out === into || !this.canLeave(out) || out.edge === into.edge) continue;
          const move = this.movement(nodeX[node], nodeZ[node], false, into, [], out);
          if (Math.abs(move.turn) > HAIRPIN_RADIANS) hairpins++;
          else moves.push(move);
        }
      }
    }
    for (const ring of this.rings) {
      const onRing = ring.map((edge) => from[edge]);
      const middleX = onRing.reduce((sum, node) => sum + nodeX[node], 0) / ring.length;
      const middleZ = onRing.reduce((sum, node) => sum + nodeZ[node], 0) / ring.length;
      if (!inside(middleX, middleZ)) continue;
      junctions++;
      const legs = ring.map((edge) => this.arms[from[edge]].filter((arm) => !this.ringOf.has(arm.edge)));
      legs.forEach((entries, start) => {
        for (const into of entries) {
          if (!this.canEnter(into)) continue;
          legs.forEach((exits, offset) => {
            // Walks the ring from where the car came on, to the leg it leaves by.
            const steps = (offset - start + ring.length) % ring.length;
            for (const out of exits) {
              if (!this.canLeave(out)) continue;
              const whole = out.edge === into.edge && steps === 0;
              const through = Array.from({ length: whole ? ring.length : steps }, (_, step) => ({ edge: ring[(start + step) % ring.length], forwards: true }));
              if (out.edge === into.edge && !whole) continue;
              moves.push(this.movement(middleX, middleZ, true, into, through, out));
            }
          });
        }
      });
      if (to[ring[ring.length - 1]] !== from[ring[0]]) throw new Error(`a ring at ${middleX}, ${middleZ} doesn't close`);
    }
    return { moves, junctions, hairpins };
  }
}

/** A line every metre or so, smoothed along its length with both ends left where they are. */
function rounded(points: [number, number][], sigma: number): [number, number][] {
  const even: [number, number][] = [points[0]];
  for (let at = 1; at < points.length; at++) {
    const [ax, az] = points[at - 1];
    const [bx, bz] = points[at];
    const steps = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / POINT_M));
    for (let step = 1; step <= steps; step++) even.push([ax + ((bx - ax) * step) / steps, az + ((bz - az) * step) / steps]);
  }
  const reach = Math.ceil(sigma * 3);
  const weights = Array.from({ length: 2 * reach + 1 }, (_, at) => Math.exp(-((at - reach) ** 2) / (2 * sigma ** 2)));
  return even.map((point, at) => {
    const near = Math.min(reach, at, even.length - 1 - at);
    if (near === 0) return point;
    let [x, z, total] = [0, 0, 0];
    for (let step = -near; step <= near; step++) {
      const weight = weights[step + reach];
      x += even[at + step][0] * weight;
      z += even[at + step][1] * weight;
      total += weight;
    }
    return [x / total, z / total];
  });
}
