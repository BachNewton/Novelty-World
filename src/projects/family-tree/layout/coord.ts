// The x placement: d3-dag's coordSimplex, which pulls every link as close to
// vertical as the layer order allows, plus a clearance rule it can't express.
// Each family's connector has vertical pieces (the drop from the parents, the
// descent to each child), and two families' vertical pieces must never run
// down the same column, or they read as one family. coordSimplex doesn't
// know the lines exist, so when its placement breaks the rule, the placement
// is solved again exactly in CP-SAT (solver/coord.py): the same weighted line
// length, minimized with the pieces kept apart, then as little movement from
// coordSimplex's placement as that optimum allows.

import { coordSimplex } from "d3-dag";
import type { Coord, SugiNode, SugiSeparation } from "d3-dag";
import { runSolver, type SolverOptions } from "./solver-process";

// How far apart, in px, two families' vertical pieces must stay: the same
// spacing that keeps stacked elbow rows apart.
export const LINE_CLEARANCE = 32;

// The weights coordSimplex gives a link by how many of its two ends are real
// nodes rather than dummies partway along a long line (its default [1, 2, 8]).
const LINK_WEIGHT_BY_REAL_ENDS = [8, 2, 1];

// A vertical piece of one family's connector. Its x is the mean of its
// terms, each a node's x plus an offset; `from` and `to` bound the vertical
// span it can occupy, in any consistent units. Pieces of one family may
// share a column; pieces of different families whose spans meet may not.
export interface VerticalPiece<N> {
  family: string;
  at: ReadonlyArray<{ node: SugiNode<N, unknown>; offset: number }>;
  from: number;
  to: number;
}

type CoordResult = { status: "OPTIMAL"; x: number[] } | { status: string };

// `piecesOf` is called once coordSimplex has placed the layers, and returns
// the vertical pieces the drawn connectors will have.
export function coordWithClearance<N, L>(
  piecesOf: (layers: SugiNode<N, unknown>[][]) => VerticalPiece<N>[],
  options: SolverOptions = {},
): Coord<N, L> {
  return (layers, sep) => {
    const sugiLayers = layers as SugiNode<N, unknown>[][];
    const sugiSep = sep as SugiSeparation<N, unknown>;
    coordSimplex()(sugiLayers, sugiSep);
    const pieces = piecesOf(sugiLayers);

    const apart: Array<[VerticalPiece<N>, VerticalPiece<N>]> = [];
    const addViolations = (): number => {
      const found = tooClose(pieces).filter(([a, b]) => !apart.some(([c, d]) => c === a && d === b));
      apart.push(...found);
      return found.length;
    };
    // Solving for the pairs seen so far can crowd others, so repeat until a
    // placement keeps every pair apart. It is then optimal for all of them,
    // because it is optimal for a subset of the constraints and meets the rest.
    while (addViolations() > 0) resolve(sugiLayers, sugiSep, apart, options);
    return normalize(sugiLayers, sugiSep);
  };
}

function lineX<N>(piece: VerticalPiece<N>): number {
  return piece.at.reduce((sum, { node, offset }) => sum + node.x + offset, 0) / piece.at.length;
}

function tooClose<N>(pieces: VerticalPiece<N>[]): Array<[VerticalPiece<N>, VerticalPiece<N>]> {
  const pairs: Array<[VerticalPiece<N>, VerticalPiece<N>]> = [];
  const xs = pieces.map(lineX);
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i];
      const b = pieces[j];
      if (a.family === b.family || a.to < b.from || b.to < a.from) continue;
      if (Math.abs(xs[i] - xs[j]) < LINE_CLEARANCE) pairs.push([a, b]);
    }
  }
  return pairs;
}

function resolve<N>(
  layers: SugiNode<N, unknown>[][],
  sep: SugiSeparation<N, unknown>,
  apart: Array<[VerticalPiece<N>, VerticalPiece<N>]>,
  options: SolverOptions,
): void {
  const nodes = layers.flat();
  const idx = new Map(nodes.map((node, i) => [node, i]));
  const index = (node: SugiNode<N, unknown>): number => {
    const i = idx.get(node);
    if (i === undefined) throw new Error("A line is attached to a node outside the layout");
    return i;
  };
  const sepPairs = layers.flatMap((layer) =>
    layer.slice(1).map((right, i) => {
      const left = layer[i];
      return [index(left), index(right), Math.ceil(sep(left, right))];
    }),
  );
  const links = nodes.flatMap((node) =>
    [...node.children()].map((child) => {
      const realEnds = Number(node.data.role === "node") + Number(child.data.role === "node");
      return [index(node), index(child), LINK_WEIGHT_BY_REAL_ENDS[realEnds]];
    }),
  );
  const terms = (piece: VerticalPiece<N>): Array<[number, number]> =>
    piece.at.map(({ node, offset }) => [index(node), offset]);
  const problem = {
    x0: nodes.map((node) => node.x),
    sep: sepPairs,
    links,
    apart: apart.map(([a, b]) => ({ a: terms(a), b: terms(b), min: LINE_CLEARANCE })),
  };

  const result = runSolver("coord.py", problem, options) as CoordResult;
  if (!("x" in result)) {
    throw new Error(`The layout solver could not place the lines apart (status ${result.status}), so no layout was produced.`);
  }
  if (result.x.length !== nodes.length) {
    throw new Error("The layout solver returned the wrong number of positions");
  }
  nodes.forEach((node, i) => (node.x = result.x[i]));
}

// Shift the placement so the leftmost edge sits at 0, and return its width,
// as a d3-dag coord operator must.
function normalize<N>(layers: SugiNode<N, unknown>[][], sep: SugiSeparation<N, unknown>): number {
  let min = Infinity;
  let max = -Infinity;
  for (const layer of layers) {
    if (layer.length === 0) continue;
    const first = layer[0];
    const last = layer[layer.length - 1];
    min = Math.min(min, first.x - sep(undefined, first));
    max = Math.max(max, last.x + sep(last, undefined));
  }
  for (const layer of layers) for (const node of layer) node.x -= min;
  return max - min;
}
