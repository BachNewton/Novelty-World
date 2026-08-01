// ---------------------------------------------------------------------------
// Test-only support for the parity and mutation suites: locate the shipped
// bundles, decode the recorded-observation fixtures, and drive `onnxruntime-node`
// as the reference implementation.
//
// This file is NOT part of the engine (which is model-agnostic and has no
// dependencies). It is deliberately quarantined here so nothing in the shipped
// path can reach onnxruntime or the filesystem.
//
// THE BUNDLES AND FIXTURES ARE IN THE REPO, so the only input that may genuinely
// be absent is `onnxruntime-node` — a dev-only reference this package does not
// depend on. A developer without it still gets a green suite from the op-level
// tests, which need neither it nor any asset.
//
// The two availability checks are SEPARATE on purpose. `bundlesAvailable()` asks
// whether the committed assets are readable; `ortAvailable()` asks whether the
// reference implementation is installed. Folding them together is how a suite
// starts lying: a comparison against a reference that isn't there has nothing to
// compare, so it must report as SKIPPED, never as passed.
// ---------------------------------------------------------------------------

import { createRequire } from "node:module";
import { SHIPPED_BUNDLES, assetExists, bundlePath, readAsset, readFixtureText } from "../assets";
import { parseModel } from "./model";
import { Tensor, allocData, type DType } from "./tensor";

/** One recorded array in a fixture: raw little-endian row-major bytes. */
interface FixtureArray {
  shape: number[];
  dtype: "float32" | "uint8";
  b64: string;
}

interface FixtureCase {
  index: number;
  env: number;
  seat: number;
  head: string;
  inputs: {
    global_feat: FixtureArray;
    players: FixtureArray;
    assets: FixtureArray;
    present: FixtureArray;
    /** How many of the `trade_cands` rows are real; the rest of the graph's
     *  fixed K rows are zero padding. */
    trade_candidates_n: number;
    trade_cands: FixtureArray;
  };
}

interface FixtureFile {
  format: string;
  format_version: number;
  bundle: { dir: string; graph: string; sha256: string };
  trade_candidates: number;
  trade_cand_dim: number;
  cases: FixtureCase[];
}

export interface ParityBundle {
  name: string;
  /** Raw `policy.onnx` bytes — what `SyncOnnxSession.load` consumes. */
  bytes: Uint8Array;
  path: string;
  cases: FixtureCase[];
  /** Fixed candidate-row count the graph expects (`trade_cands` axis 1). */
  tradeCandidates: number;
  tradeCandDim: number;
}

/** The two bundles parity runs over: the league main policy and an exploiter,
 *  which share an architecture but not a single weight. */
export const PARITY_BUNDLES = SHIPPED_BUNDLES;

/** True when every bundle and its fixture is readable. Committed, so this is
 *  normally just "yes" — it exists so a corrupted checkout says so here rather
 *  than as a mystery inside a 400-case loop. */
export function bundlesAvailable(): boolean {
  return PARITY_BUNDLES.every((name) => assetExists(bundlePath(name, "policy.onnx")));
}

/**
 * True when `onnxruntime-node` — the dev-only reference implementation — can be
 * resolved. It is deliberately NOT a dependency: it is a large native package,
 * and the shipped path never touches it.
 *
 * Resolution rather than import, because this has to answer synchronously for
 * `describe.skipIf`, and because resolving does not pay to load a native addon.
 *
 * Gating on this is what keeps the comparison honest. The bundles are committed,
 * so a check that only looked at them would now be permanently true, and on a
 * clone without onnxruntime every "matches onnxruntime" test would return early
 * and report as PASSED while comparing against nothing.
 */
export function ortAvailable(): boolean {
  try {
    createRequire(import.meta.url).resolve("onnxruntime-node");
    return true;
  } catch {
    return false;
  }
}

export function loadBundle(name: string): ParityBundle {
  const path = bundlePath(name, "policy.onnx");
  const bytes = readAsset(path);
  const fixture = JSON.parse(readFixtureText(`parity-${name}`)) as FixtureFile;
  if (fixture.format !== "landon-onnx-parity-fixture") {
    throw new Error(`unexpected fixture format "${fixture.format}" for ${name}`);
  }
  return {
    name,
    bytes,
    path,
    cases: fixture.cases,
    tradeCandidates: fixture.trade_candidates,
    tradeCandDim: fixture.trade_cand_dim,
  };
}

/** What a graph's float initializers are stored as. Only the two a policy graph
 *  could plausibly carry; anything else is a graph this repo does not ship. */
export type WeightDType = "float32" | "float16";

/**
 * The dtype a graph's float weights are stored in.
 *
 * Read off the initializers, never taken from the bundle's NAME or from the
 * manifest's word for it. The shipped bundles are fp32 — the exported artifact
 * itself — and the parity suites assert that here rather than assuming it, so a
 * narrowed graph slipped into `public/bundles/` fails loudly instead of quietly
 * being measured against a reference it no longer reproduces. `int64`/`bool`
 * initializers are shapes and indices, not weights, and say nothing about the
 * precision of the arithmetic.
 */
export function weightDTypeOf(graph: Uint8Array): WeightDType {
  const model = parseModel(graph);
  let sawFloat32 = false;
  for (const tensor of model.graph.initializers) {
    if (tensor.dtype === "float16") return "float16";
    if (tensor.dtype === "float32") sawFloat32 = true;
  }
  if (!sawFloat32) throw new Error("graph has no float initializers; nothing to set a tolerance from");
  return "float32";
}

/** Decode a `{shape, dtype, b64}` array into a flat typed array. */
function decodeArray(a: FixtureArray): { data: Float32Array | Uint8Array; shape: number[] } {
  const binary = Buffer.from(a.b64, "base64");
  if (a.dtype === "uint8") {
    return { data: new Uint8Array(binary), shape: a.shape };
  }
  // `Buffer.from(base64)` may land at any byte offset inside a pooled
  // allocation, and `new Float32Array(buffer, offset)` requires 4-byte
  // alignment — so read through a DataView rather than aliasing.
  const view = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  const out = new Float32Array(binary.byteLength / 4);
  for (let i = 0; i < out.length; i++) out[i] = view.getFloat32(i * 4, true);
  return { data: out, shape: a.shape };
}

/**
 * Assemble one case's feeds as a batch of `rows` identical-shaped entries.
 *
 * `trade_cands` is the reason this is not a straight decode: a fixture stores
 * only the n REAL candidate rows, while the graph's input is a fixed [K, dim]
 * block. Zero-padding rows [n, K) is what the wire format does, and legality
 * comes from n rather than from the padding — so the padded rows still produce
 * logits, which the layer above masks off.
 */
export function feedsForCases(bundle: ParityBundle, cases: FixtureCase[]): Record<string, Tensor> {
  const batch = cases.length;
  const build = (
    name: "global_feat" | "players" | "assets" | "present",
    dims: number[],
    dtype: DType,
  ): Tensor => {
    const per = dims.reduce((a, b) => a * b, 1);
    const data = allocData(dtype, batch * per);
    for (let b = 0; b < batch; b++) {
      const { data: src } = decodeArray(cases[b].inputs[name]);
      if (src.length !== per) {
        throw new Error(`fixture ${name} has ${src.length} elements, expected ${per}`);
      }
      data.set(src, b * per);
    }
    return new Tensor([batch, ...dims], dtype, data);
  };

  const k = bundle.tradeCandidates;
  const dim = bundle.tradeCandDim;
  const cands = new Float32Array(batch * k * dim);
  for (let b = 0; b < batch; b++) {
    const { data: src } = decodeArray(cases[b].inputs.trade_cands);
    const n = cases[b].inputs.trade_candidates_n;
    if (src.length !== n * dim) {
      throw new Error(`fixture trade_cands has ${src.length} floats, expected ${n * dim}`);
    }
    cands.set(src, b * k * dim);
  }

  return {
    global_feat: build("global_feat", [40], "float32"),
    players: build("players", [8, 8], "float32"),
    assets: build("assets", [30, 11], "float32"),
    present: build("present", [8], "uint8"),
    trade_cands: new Tensor([batch, k, dim], "float32", cands),
  };
}

// --- onnxruntime-node reference ----------------------------------------------

/** The slice of onnxruntime's surface this file uses. Declared structurally so
 *  the engine's own build never depends on onnxruntime's types being installed. */
interface OrtTensorLike {
  dims: readonly number[];
  data: Float32Array | Uint8Array | BigInt64Array;
}
interface OrtSessionLike {
  run(feeds: Record<string, OrtTensorLike>): Promise<Record<string, OrtTensorLike>>;
}
interface OrtModule {
  InferenceSession: { create(bytes: Uint8Array, options?: unknown): Promise<OrtSessionLike> };
  Tensor: new (type: string, data: Float32Array | Uint8Array, dims: readonly number[]) => OrtTensorLike;
}

let ortModule: OrtModule | undefined;
let ortMissing = false;

/** Load onnxruntime-node if it is installed. It is a DEV-ONLY reference
 *  implementation, deliberately not a dependency of the engine. */
export async function loadOrt(): Promise<OrtModule | undefined> {
  if (ortModule !== undefined) return ortModule;
  if (ortMissing) return undefined;
  try {
    ortModule = (await import("onnxruntime-node")) as unknown as OrtModule;
    return ortModule;
  } catch {
    ortMissing = true;
    return undefined;
  }
}

/**
 * Run the reference implementation on the same feeds.
 *
 * `intraOpNumThreads: 1` is not about speed: onnxruntime partitions a matmul
 * across threads and sums the partial results, so the SUMMATION ORDER — and
 * therefore the last bits of every fp32 output — depends on how many threads it
 * chose. Pinning to one thread makes the reference reproducible run to run,
 * which is what lets a max-abs error be attributed to our kernels rather than
 * to the reference's scheduler.
 */
export async function createOrtSession(bytes: Uint8Array): Promise<OrtSessionLike> {
  const ort = await loadOrt();
  if (ort === undefined) throw new Error("onnxruntime-node is not installed");
  return ort.InferenceSession.create(bytes, {
    intraOpNumThreads: 1,
    interOpNumThreads: 1,
    executionMode: "sequential",
    graphOptimizationLevel: "all",
  });
}

export async function runOrt(
  session: OrtSessionLike,
  feeds: Record<string, Tensor>,
): Promise<Record<string, Float32Array>> {
  const ort = await loadOrt();
  if (ort === undefined) throw new Error("onnxruntime-node is not installed");
  const ortFeeds: Record<string, OrtTensorLike> = {};
  for (const [name, t] of Object.entries(feeds)) {
    const type = t.dtype === "uint8" ? "uint8" : "float32";
    const data = t.dtype === "uint8" ? new Uint8Array(t.data) : new Float32Array(t.data);
    ortFeeds[name] = new ort.Tensor(type, data, t.dims);
  }
  const result = await session.run(ortFeeds);
  const out: Record<string, Float32Array> = {};
  for (const [name, t] of Object.entries(result)) out[name] = Float32Array.from(t.data as Float32Array);
  return out;
}

// --- comparison --------------------------------------------------------------

export interface Deviation {
  maxAbs: number;
  /** Where the worst element was, for a failure message that can be acted on. */
  atIndex: number;
  count: number;
}

export function compare(a: ArrayLike<number>, b: ArrayLike<number>): Deviation {
  if (a.length !== b.length) throw new Error(`length mismatch ${a.length} vs ${b.length}`);
  let maxAbs = 0;
  let atIndex = -1;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > maxAbs) {
      maxAbs = d;
      atIndex = i;
    }
  }
  return { maxAbs, atIndex, count: a.length };
}

export interface ArgmaxComparison {
  rows: number;
  /** Rows where the two implementations picked a different index at all. */
  flips: number;
  /**
   * Flips where at least one implementation ordered the two candidates by a
   * margin LARGER than `atol` — i.e. where the disagreement is a genuine
   * difference of opinion rather than a coin toss between values that are
   * equal to within the comparison's own resolution.
   *
   * The distinction is load-bearing on this graph. `trade_cands` is a fixed
   * 64-row block that the wire ZERO-PADS beyond the real candidate count, so a
   * position with no available trades feeds 64 identical all-zero rows through
   * the same head and gets 64 bit-identical logits back. The argmax of 64 equal
   * numbers is whichever index the tie-break happens to reach first; that one
   * implementation lands on 0 and the other on 64 says nothing about either.
   * Counting those as flips would make the metric report noise, and the layer
   * above masks every padded row off before sampling anyway.
   */
  decisiveFlips: number;
  /** The largest margin behind any decisive flip — zero when there are none. */
  worstDecisiveMargin: number;
}

/**
 * Compare argmax choices row by row.
 *
 * This, not the max-abs error, is the metric that decides whether the bot plays
 * the same game: a 1e-5 disagreement on a logit is invisible unless it lands
 * between the top two candidates, and then it changes the MOVE.
 */
export function compareArgmax(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  rowLength: number,
  atol: number,
): ArgmaxComparison {
  let rows = 0;
  let flips = 0;
  let decisiveFlips = 0;
  let worstDecisiveMargin = 0;
  for (let start = 0; start < a.length; start += rowLength) {
    rows++;
    let bestA = 0;
    let bestB = 0;
    for (let i = 1; i < rowLength; i++) {
      if (a[start + i] > a[start + bestA]) bestA = i;
      if (b[start + i] > b[start + bestB]) bestB = i;
    }
    if (bestA === bestB) continue;
    flips++;
    // Each side's confidence in ITS OWN ordering of the two disputed indices.
    const marginA = a[start + bestA] - a[start + bestB];
    const marginB = b[start + bestB] - b[start + bestA];
    const margin = Math.max(marginA, marginB);
    if (margin > atol) {
      decisiveFlips++;
      if (margin > worstDecisiveMargin) worstDecisiveMargin = margin;
    }
  }
  return { rows, flips, decisiveFlips, worstDecisiveMargin };
}

/** Row length of each logits head, for the argmax comparison. `manage_logits`
 *  is [batch, 28, 5] and the head chooses independently per property row, so the
 *  argmax unit is 5 — not the whole 140-element grid. A Map rather than a
 *  Record because callers legitimately ask about the VALUE heads too, and a
 *  Map's `get` is honest that the answer may be absent. */
export const LOGIT_ROW_LENGTH: ReadonlyMap<string, number> = new Map([
  ["global_logits", 17],
  ["manage_logits", 5],
  ["trade_cand_logits", 65],
]);

export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}
