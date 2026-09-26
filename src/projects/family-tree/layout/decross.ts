// Exact crossing minimization for d3-dag's sugiyama pipeline, solved by
// OR-Tools CP-SAT. d3-dag's own decrossOpt builds the same model but solves
// it with a pure-JS solver that takes minutes on our trees; CP-SAT proves the
// optimum in seconds. The model itself lives in solver/decross.py; this side
// hands it the layered graph and applies the ordering it returns.
//
// CP-SAT runs in a Python child process from the venv beside the script
// (`npm run setup:family-tree-solver` creates it). d3-dag's decross hook is
// synchronous, hence spawnSync. Anything short of a proven optimum throws:
// a layout must never be stored unsolved.

import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { Decross, SugiNode } from "d3-dag";

const solverPath = (relative: string): string =>
  fileURLToPath(new URL(`./solver/${relative}`, import.meta.url));
const SCRIPT = solverPath("decross.py");
const PYTHON = solverPath(
  process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python",
);

export interface DecrossOptions {
  // Stream the solver's search progress to stderr, so a long solve isn't silent.
  progress?: boolean;
}

// What solver/decross.py reads: each layer's size, and per adjacent layer
// pair the edges between them as (upper index, lower index).
interface LayeredGraph {
  layers: number[];
  edges: Array<Array<[number, number]>>;
}

type SolveResult =
  | { status: "OPTIMAL"; crossings: number; orders: number[][] }
  | { status: string };

export function decrossCpSat<N, L>(options: DecrossOptions = {}): Decross<N, L> {
  return (layers) => {
    decrossInPlace(layers as SugiNode<unknown, unknown>[][], options);
  };
}

function decrossInPlace(
  layers: SugiNode<unknown, unknown>[][],
  options: DecrossOptions,
): void {
  const graph = layeredGraph(layers);
  // With no pair of edges that could cross, the optimum is the incoming
  // order (the tiebreak's minimum), so there is nothing to solve.
  if (!graph.edges.some(hasCrossingCandidate)) return;

  const orders = solve(graph, options);
  layers.forEach((layer, L) => {
    const order = orders[L];
    const isPermutation =
      order.length === layer.length &&
      new Set(order).size === layer.length &&
      order.every((i) => Number.isInteger(i) && i >= 0 && i < layer.length);
    if (!isPermutation) {
      throw new Error(`The layout solver returned an invalid order for layer ${L}`);
    }
    layer.splice(0, layer.length, ...order.map((i) => layer[i]));
  });
}

function layeredGraph(layers: SugiNode<unknown, unknown>[][]): LayeredGraph {
  const idx = new Map<SugiNode<unknown, unknown>, number>();
  for (const layer of layers) layer.forEach((node, i) => idx.set(node, i));
  const edges = layers.slice(0, -1).map((layer) => {
    const gap: Array<[number, number]> = [];
    layer.forEach((node, a) => {
      for (const child of node.children()) {
        const c = idx.get(child);
        if (c !== undefined) gap.push([a, c]);
      }
    });
    return gap;
  });
  return { layers: layers.map((layer) => layer.length), edges };
}

function hasCrossingCandidate(gap: Array<[number, number]>): boolean {
  return gap.some(([a, c], p) => gap.slice(p + 1).some(([b, d]) => a !== b && c !== d));
}

function solve(graph: LayeredGraph, options: DecrossOptions): number[][] {
  const run = spawnSync(PYTHON, [SCRIPT, ...(options.progress === true ? ["--progress"] : [])], {
    input: JSON.stringify(graph),
    stdio: ["pipe", "pipe", options.progress === true ? "inherit" : "pipe"],
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (run.error !== undefined) {
    const missing = (run.error as NodeJS.ErrnoException).code === "ENOENT";
    throw new Error(
      missing
        ? `The layout solver's Python venv is missing (${PYTHON}). Run \`npm run setup:family-tree-solver\` from the repo root.`
        : `Could not run the layout solver: ${run.error.message}`,
    );
  }
  if (run.status !== 0) {
    // With progress on, stderr went straight to the terminal.
    const detail = options.progress === true ? "see its output above" : run.stderr.trim();
    throw new Error(`The layout solver failed (${run.signal ?? `exit code ${run.status}`}): ${detail}`);
  }
  const result = JSON.parse(run.stdout) as SolveResult;
  if (!("orders" in result)) {
    throw new Error(`The layout solver did not prove an optimum (status ${result.status}), so no layout was produced.`);
  }
  if (result.orders.length !== graph.layers.length) {
    throw new Error("The layout solver returned the wrong number of layers");
  }
  return result.orders;
}
