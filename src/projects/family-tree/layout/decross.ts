// Exact crossing minimization for d3-dag's sugiyama pipeline, solved by
// OR-Tools CP-SAT. d3-dag's own decrossOpt builds the same kind of model but
// solves it with a pure-JS solver that takes minutes on our trees; CP-SAT
// proves the optimum in seconds. The model itself lives in solver/decross.py;
// this side hands it the layered graph and applies the ordering it returns.
//
// A node here is a partner chain, but the lines are drawn to and from the
// people in it: each child's line leaves its parents' marriage midpoint (or a
// lone parent) and ends at the child's own card. So the solver counts
// crossings between those lines, at the port on the chain where each one
// attaches, and chooses each chain's orientation (as is, or reversed) along
// with the order of every layer. Anything short of a proven optimum throws: a
// layout must never be stored unsolved.

import type { Decross, SugiDatum, SugiNode } from "d3-dag";
import { runSolver, type SolverOptions } from "./solver-process";

// How the lines between two chains attach to them. A port is a position
// along a chain in its given (unreversed) order: any numbers that sort the
// way the attachment points do, equal where two lines share one.
export interface ChainPorts<N> {
  // Whether the node is a chain of two or more people, which may be reversed.
  isChain(node: N): boolean;
  // One (port on source, port on target) pair per line from source to target.
  lines(source: N, target: N): ReadonlyArray<readonly [number, number]>;
}

// What solver/decross.py reads: each layer's size, the chains that may be
// reversed as (layer, index), and per adjacent layer pair the lines between
// them as (upper index, upper port, lower index, lower port).
export interface PortGraph {
  layers: number[];
  chains: Array<[number, number]>;
  edges: Array<Array<[number, number, number, number]>>;
}

type SolveResult =
  | { status: "OPTIMAL"; crossings: number; orders: number[][]; reversed: Array<[number, number]> }
  | { status: string };

export interface DecrossSolution<N> {
  crossings: number;
  reversed: Set<SugiNode<N, unknown>>;
}

// The operator, and the solution it found once sugiyama has run it.
export interface ChainDecross<N, L> {
  decross: Decross<N, L>;
  solution: () => DecrossSolution<N>;
}

export function decrossCpSat<N, L>(ports: ChainPorts<N>, options: SolverOptions = {}): ChainDecross<N, L> {
  let solution: DecrossSolution<N> | undefined;
  return {
    decross: (layers) => {
      solution = decrossInPlace(layers as SugiNode<N, unknown>[][], ports, options);
    },
    solution: () => {
      if (solution === undefined) throw new Error("The crossing minimization has not run yet");
      return solution;
    },
  };
}

function decrossInPlace<N>(
  layers: SugiNode<N, unknown>[][],
  ports: ChainPorts<N>,
  options: SolverOptions,
): DecrossSolution<N> {
  const graph = portGraph(layers, ports);
  // With no pair of lines that could cross, the optimum is the incoming
  // order (the tiebreak's minimum), so there is nothing to solve.
  if (!graph.edges.some(hasCrossingCandidate)) return { crossings: 0, reversed: new Set() };

  const result = runSolver("decross.py", graph, options) as SolveResult;
  if (!("orders" in result)) {
    throw new Error(`The layout solver did not prove an optimum (status ${result.status}), so no layout was produced.`);
  }
  if (result.orders.length !== graph.layers.length) {
    throw new Error("The layout solver returned the wrong number of layers");
  }
  const reversed = new Set(
    result.reversed.map(([L, i]) => {
      if (!graph.chains.some(([cl, ci]) => cl === L && ci === i)) {
        throw new Error(`The layout solver reversed node ${i} of layer ${L}, which is not a chain`);
      }
      return layers[L][i];
    }),
  );
  layers.forEach((layer, L) => {
    const order = result.orders[L];
    const isPermutation =
      order.length === layer.length &&
      new Set(order).size === layer.length &&
      order.every((i) => Number.isInteger(i) && i >= 0 && i < layer.length);
    if (!isPermutation) {
      throw new Error(`The layout solver returned an invalid order for layer ${L}`);
    }
    layer.splice(0, layer.length, ...order.map((i) => layer[i]));
  });

  // The solver's count must be what the ordering it returned actually draws.
  const drawn = countCrossings(portGraph(layers, ports), (L, i) => reversed.has(layers[L][i]));
  if (drawn !== result.crossings) {
    throw new Error(`The layout solver reported ${result.crossings} crossings, but its ordering draws ${drawn}`);
  }
  return { crossings: result.crossings, reversed };
}

// The lines between adjacent layers, with node indices in each layer's
// current order. A long line runs through a dummy node per layer it passes,
// which has a single port.
export function portGraph<N>(layers: SugiNode<N, unknown>[][], ports: ChainPorts<N>): PortGraph {
  const idx = new Map<SugiNode<N, unknown>, number>();
  for (const layer of layers) layer.forEach((node, i) => idx.set(node, i));
  const chains: Array<[number, number]> = [];
  layers.forEach((layer, L) => {
    layer.forEach((node, i) => {
      if (node.data.role === "node" && ports.isChain(node.data.node.data)) chains.push([L, i]);
    });
  });

  const edges = layers.slice(0, -1).map((layer) => {
    const seen = new Set<string>();
    const gap: Array<[number, number, number, number]> = [];
    const add = (a: number, pa: number, c: number, pc: number): void => {
      const key = `${a},${pa},${c},${pc}`;
      if (seen.has(key)) return;
      seen.add(key);
      gap.push([a, pa, c, pc]);
    };
    layer.forEach((node, a) => {
      for (const child of node.children()) {
        const c = idx.get(child);
        if (c === undefined) continue;
        const up = node.data;
        const down = child.data;
        const [source, target] = segmentEnds(up, down);
        const lines = ports.lines(source, target);
        if (lines.length === 0) throw new Error("A link between two chains carries no lines");
        for (const [pa, pc] of lines) {
          add(a, up.role === "node" ? pa : 0, c, down.role === "node" ? pc : 0);
        }
      }
    });
    return gap;
  });
  return { layers: layers.map((layer) => layer.length), chains, edges };
}

// The two chains a segment's link joins. A dummy node sits partway along a
// long link, so its segment belongs to that link.
function segmentEnds<N>(up: SugiDatum<N, unknown>, down: SugiDatum<N, unknown>): [N, N] {
  if (up.role === "link") return [up.link.source.data, up.link.target.data];
  if (down.role === "link") return [down.link.source.data, down.link.target.data];
  return [up.node.data, down.node.data];
}

function hasCrossingCandidate(gap: Array<[number, number, number, number]>): boolean {
  const differ = (a: number, pa: number, b: number, pb: number): boolean => a !== b || pa !== pb;
  return gap.some(([a, pa, c, pc], p) =>
    gap.slice(p + 1).some(([b, pb, d, pd]) => differ(a, pa, b, pb) && differ(c, pc, d, pd)),
  );
}

// How many pairs of lines cross, given which chains are reversed. The same
// rule as the solver's model: two lines cross when their ends are in
// opposite left-to-right order at the top and at the bottom.
export function countCrossings(
  graph: PortGraph,
  isReversed: (layer: number, index: number) => boolean,
): number {
  // Where an end sits in its layer: the node's position, then the port's
  // position within the node as drawn.
  const compare = (L: number, a: number, pa: number, b: number, pb: number): number =>
    a !== b ? a - b : isReversed(L, a) ? pb - pa : pa - pb;
  let crossings = 0;
  graph.edges.forEach((gap, L) => {
    for (let p = 0; p < gap.length; p++) {
      for (let q = p + 1; q < gap.length; q++) {
        const [a, pa, c, pc] = gap[p];
        const [b, pb, d, pd] = gap[q];
        if (compare(L, a, pa, b, pb) * compare(L + 1, c, pc, d, pd) < 0) crossings++;
      }
    }
  });
  return crossings;
}
