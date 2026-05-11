// HiGHS-WASM-backed crossing minimization for d3-dag's sugiyama pipeline.
//
// d3-dag's bundled `decrossOpt` uses javascript-lp-solver, a hand-rolled
// pure-JS simplex + branch-and-bound. On the 67-person production tree the
// interpreted simplex pivots take ~70 seconds. HiGHS (C++, compiled to
// WebAssembly) solves the same MIP in ~2.3 seconds — a measured 30× speedup.
//
// We reproduce d3-dag's IP formulation (Jünger-Mutzel) exactly:
//   - Binary order var x_L_i_j (per layer L, i<j): 0 means i is before j in
//     the final layer ordering, 1 means reversed.
//   - Transitivity per layer for each i<j<k: 0 <= x_ij + x_jk - x_ik <= 1.
//   - For each pair of edges (a→c, b→d) between consecutive layers that don't
//     share an endpoint, a continuous slack s >= 0 forced to 1 iff the edges
//     cross. Linearization depends on whether c<d or c>d (see below).
//   - Objective: sum of slacks (= crossing count), plus a small tiebreak
//     coefficient on order vars to make the optimum unique.
//
// HiGHS init is async (WASM load), but the d3-dag Decross interface is sync.
// Callers must `await loadHighs()` before invoking sugiyama().

import type highsLoader from "highs";
import type { Decross, SugiNode } from "d3-dag";

type HighsInstance = Awaited<ReturnType<typeof highsLoader>>;

let highsPromise: Promise<HighsInstance> | undefined;

// In a browser/worker context we hand highs an explicit URL for its .wasm
// asset, since the bundler's emitted location won't match highs's default
// __dirname-relative resolution. `new URL(..., import.meta.url)` is the
// standard Next.js / Turbopack pattern for asset imports — the bundler
// rewrites this at build time to the fingerprinted URL it emits the .wasm
// at. In Node (tests), highs's own __dirname-based resolution finds the
// file in node_modules without help.
function highsLoaderOptions(): Parameters<typeof highsLoader>[0] {
  if (typeof process !== "undefined") {
    return undefined;
  }
  const wasmUrl = new URL(
    "../../../node_modules/highs/build/highs.wasm",
    import.meta.url,
  ).href;
  return { locateFile: (file) => (file.endsWith(".wasm") ? wasmUrl : file) };
}

export function loadHighs(): Promise<HighsInstance> {
  highsPromise ??= import("highs").then((mod) => mod.default(highsLoaderOptions()));
  return highsPromise;
}

export function decrossHighs<N, L>(highs: HighsInstance): Decross<N, L> {
  return (layers) => {
    decrossInPlace(highs, layers as SugiNode<unknown, unknown>[][]);
  };
}

function decrossInPlace(
  highs: HighsInstance,
  layers: SugiNode<unknown, unknown>[][],
): void {
  if (layers.length < 2) return;
  if (!layers.some((layer) => layer.length >= 2)) return;

  const idx = new Map<SugiNode<unknown, unknown>, number>();
  for (const layer of layers) layer.forEach((node, i) => idx.set(node, i));

  const lp = buildLp(layers, idx);
  if (lp === null) return;

  const result = highs.solve(lp.text);
  if (result.Status !== "Optimal") {
    throw new Error(`HiGHS solve returned ${result.Status}`);
  }

  applyOrdering(result, layers);
}

interface BuiltLp {
  text: string;
}

function buildLp(
  layers: SugiNode<unknown, unknown>[][],
  idx: Map<SugiNode<unknown, unknown>, number>,
): BuiltLp | null {
  const constraints: string[] = [];
  const slackNames: string[] = [];
  const orderVarNames: string[] = [];
  let consCount = 0;

  layers.forEach((layer, L) => {
    const n = layer.length;
    if (n < 2) return;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        orderVarNames.push(`x_${L}_${i}_${j}`);
      }
    }
    // Transitivity for each i<j<k.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        for (let k = j + 1; k < n; k++) {
          const xij = `x_${L}_${i}_${j}`;
          const xjk = `x_${L}_${j}_${k}`;
          const xik = `x_${L}_${i}_${k}`;
          constraints.push(` t${consCount++}: ${xij} + ${xjk} - ${xik} >= 0`);
          constraints.push(` t${consCount++}: ${xij} + ${xjk} - ${xik} <= 1`);
        }
      }
    }
  });

  // Crossing-candidate pairs between each consecutive layer pair.
  for (let L = 0; L < layers.length - 1; L++) {
    const layerA = layers[L];
    const edges: Array<[number, number]> = [];
    for (let aIdx = 0; aIdx < layerA.length; aIdx++) {
      const node = layerA[aIdx];
      for (const child of node.children()) {
        const bIdx = idx.get(child);
        if (bIdx === undefined) continue;
        edges.push([aIdx, bIdx]);
      }
    }
    for (let p = 0; p < edges.length; p++) {
      for (let q = p + 1; q < edges.length; q++) {
        let [a, c] = edges[p];
        let [b, d] = edges[q];
        if (a === b || c === d) continue;
        if (a > b) { [a, b] = [b, a]; [c, d] = [d, c]; }
        const xab = `x_${L}_${a}_${b}`;
        const sName = `s${slackNames.length}`;
        slackNames.push(sName);
        if (c < d) {
          // Edges cross iff x_ab XOR x_cd. Linearize with two slack bounds.
          const xcd = `x_${L + 1}_${c}_${d}`;
          constraints.push(` k${consCount++}: ${sName} - ${xab} + ${xcd} >= 0`);
          constraints.push(` k${consCount++}: ${sName} + ${xab} - ${xcd} >= 0`);
        } else {
          // c > d: relevant order var in next layer is x_dc.
          // Edges cross iff x_ab == x_dc (i.e. NOT(x_ab XOR x_dc)).
          const xdc = `x_${L + 1}_${d}_${c}`;
          constraints.push(` k${consCount++}: ${sName} + ${xab} + ${xdc} >= 1`);
          constraints.push(` k${consCount++}: ${sName} - ${xab} - ${xdc} >= -1`);
        }
      }
    }
  }

  if (orderVarNames.length === 0) return null;

  // Tiebreak: divide a unit weight across all order vars so the objective
  // gain from preferring natural order can never exceed 1 — i.e., always
  // dwarfed by a single avoided crossing. Matches d3-dag's coefficient style
  // (we observed ~1/n_orders in the captured production-tree IP).
  const tiebreak = 1 / orderVarNames.length;

  const lines: string[] = [];
  lines.push("Minimize");
  const objParts: string[] = [];
  for (const s of slackNames) objParts.push(`+ ${s}`);
  for (const v of orderVarNames) objParts.push(`+ ${tiebreak} ${v}`);
  // LP format requires at least one term; an empty IP is short-circuited above.
  lines.push(` obj: ${objParts.join(" ")}`);
  lines.push("Subject To");
  for (const c of constraints) lines.push(c);
  lines.push("Bounds");
  for (const v of orderVarNames) lines.push(` 0 <= ${v} <= 1`);
  for (const s of slackNames) lines.push(` ${s} >= 0`);
  if (orderVarNames.length > 0) {
    lines.push("Generals");
    // CPLEX LP allows a single line with all integer var names.
    lines.push(` ${orderVarNames.join(" ")}`);
  }
  lines.push("End");

  return { text: lines.join("\n") };
}

function applyOrdering(
  result: ReturnType<HighsInstance["solve"]>,
  layers: SugiNode<unknown, unknown>[][],
): void {
  if (result.Status !== "Optimal") return;
  const cols = result.Columns;
  // Build per-layer comparator using the binary order vars. x_L_i_j == 1
  // means j is before i (reversed); == 0 means i before j (natural).
  layers.forEach((layer, L) => {
    if (layer.length < 2) return;
    const originalIdx = new Map<SugiNode<unknown, unknown>, number>();
    layer.forEach((node, i) => originalIdx.set(node, i));
    layer.sort((a, b) => {
      const ia = originalIdx.get(a);
      const ib = originalIdx.get(b);
      if (ia === undefined || ib === undefined) return 0;
      if (ia === ib) return 0;
      const [lo, hi] = ia < ib ? [ia, ib] : [ib, ia];
      // The order var must exist: buildLp emits x_L_i_j for every i<j in
      // every layer of size >= 2, and we early-return above when length < 2.
      const col = cols[`x_${L}_${lo}_${hi}`];
      const reversed = Math.round(col.Primal) === 1;
      // ia < ib: natural is "a before b" (-1). Reversed flips that.
      // ia > ib: natural is "b before a" (+1). Reversed flips that.
      const naturalAFirst = ia < ib;
      const aFirst = reversed ? !naturalAFirst : naturalAFirst;
      return aFirst ? -1 : 1;
    });
  });
}
