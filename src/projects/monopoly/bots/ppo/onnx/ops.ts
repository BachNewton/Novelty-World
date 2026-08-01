// ---------------------------------------------------------------------------
// The kernel library: opset-18 semantics, one function per op, registered by
// name. Everything here is pure — inputs in, freshly-allocated outputs out — so
// a kernel can be unit-tested with hand-computed numbers and the executor can
// constant-fold any node by simply calling it early.
//
// THE DOMINANT HAZARD IS THE INPUT-VS-ATTRIBUTE MIGRATION. ONNX repeatedly moved
// parameters that used to be compile-time attributes into runtime INPUTS:
//
//   opset 10  Slice        axes/starts/ends/steps: attributes → inputs
//   opset 11  Clip         min/max: attributes → inputs
//   opset 13  Squeeze      axes: attribute → input
//             Unsqueeze    axes: attribute → input
//             Split        split: attribute → input
//   opset 18  Reduce*      axes: attribute → input (+ `noop_with_empty_axes`)
//
// A kernel that reads only one form silently mis-executes a graph exported by
// the other era — usually not by crashing but by reducing the wrong axis. Every
// affected kernel below therefore reads the INPUT form first and falls back to
// the ATTRIBUTE form, so one binary runs both eras.
//
// The subtlest instance is `Reduce*` axes in opset 18, where THREE states must
// stay distinct: axes ABSENT (reduce all axes, or — if `noop_with_empty_axes` —
// reduce none), axes present but EMPTY, and axes present and non-empty. Encoding
// "absent" as `[]` collapses the first two, and the empty case is exactly the
// one `noop_with_empty_axes` exists to disambiguate. That is why the resolver
// returns `number[] | undefined` and never `[]` for absent.
// ---------------------------------------------------------------------------

import type { AttributeValue } from "./model";
import {
  Tensor,
  allocData,
  broadcastShapes,
  broadcastStrides,
  codeFromDtype,
  computeStrides,
  dtypeFromCode,
  isFloatDType,
  normalizeAxis,
  normalizeAxisInclusive,
  numElements,
  type DType,
  type TensorData,
} from "./tensor";

/** Buffer source. The executor passes a pooled allocator so a steady-state
 *  `run()` performs no allocation; tests pass a trivial one. */
export interface Allocator {
  alloc(dtype: DType, size: number): TensorData;
}

/** The plain allocator — a fresh typed array every time. */
export const DIRECT_ALLOCATOR: Allocator = {
  alloc: (dtype, size) => allocData(dtype, size),
};

export interface OpContext {
  /** Positional inputs. `undefined` marks an OPTIONAL input the node omitted —
   *  either by trailing off the list or by naming it with the empty string. */
  inputs: (Tensor | undefined)[];
  attrs: Map<string, AttributeValue>;
  /** Version of the default ONNX domain this model imported. Kernels branch on
   *  it only where the SEMANTICS changed, not merely the signature. */
  opset: number;
  /** How many outputs the node declared. `Split` and `TopK` need this. */
  outputCount: number;
  alloc: Allocator;
  /** For error messages: `"<opType>[<name>]"`. */
  label: string;
}

export type Kernel = (ctx: OpContext) => Tensor[];

// --- attribute / input access ------------------------------------------------

function attrInt(ctx: OpContext, name: string, fallback: number): number {
  const a = ctx.attrs.get(name);
  if (a === undefined) return fallback;
  if (a.kind !== "int") throw new Error(`onnx: ${ctx.label} attribute "${name}" is not an int`);
  return a.value;
}

function attrFloat(ctx: OpContext, name: string, fallback: number): number {
  const a = ctx.attrs.get(name);
  if (a === undefined) return fallback;
  if (a.kind === "float") return a.value;
  if (a.kind === "int") return a.value;
  throw new Error(`onnx: ${ctx.label} attribute "${name}" is not a float`);
}

function attrInts(ctx: OpContext, name: string): number[] | undefined {
  const a = ctx.attrs.get(name);
  if (a === undefined) return undefined;
  if (a.kind !== "ints") throw new Error(`onnx: ${ctx.label} attribute "${name}" is not an int list`);
  return a.value;
}

function attrString(ctx: OpContext, name: string, fallback: string): string {
  const a = ctx.attrs.get(name);
  if (a === undefined) return fallback;
  if (a.kind !== "string") throw new Error(`onnx: ${ctx.label} attribute "${name}" is not a string`);
  return a.value;
}

/** A required positional input. */
function need(ctx: OpContext, i: number): Tensor {
  const t = ctx.inputs[i];
  if (t === undefined) throw new Error(`onnx: ${ctx.label} is missing required input ${i}`);
  return t;
}

/**
 * Resolve a parameter that migrated from attribute to input.
 *
 * Order matters: the INPUT is checked first because a graph that supplies both
 * (some graph-surgery tools leave the stale attribute behind) means the input.
 * `undefined` means genuinely absent in both forms — which, for `Reduce*`, is
 * a distinct third state from an empty list.
 */
function intsFromInputOrAttr(ctx: OpContext, index: number, attrName: string): number[] | undefined {
  const t = ctx.inputs[index];
  if (t !== undefined) return t.toNumbers();
  return attrInts(ctx, attrName);
}

// --- output construction -----------------------------------------------------

function make(ctx: OpContext, dims: readonly number[], dtype: DType): Tensor {
  return new Tensor(dims, dtype, ctx.alloc.alloc(dtype, numElements(dims)));
}

// --- elementwise -------------------------------------------------------------

/**
 * Binary elementwise with multidirectional broadcasting.
 *
 * Two paths, and the fast one is not an optimisation detail: the vast majority
 * of binary nodes in a real graph have IDENTICAL shapes (residual adds) or a
 * trailing bias vector, and the general path's per-element index decomposition
 * costs more than the arithmetic it feeds. The general path walks the output in
 * row-major order while carrying one counter per axis and stepping each input
 * by its own (possibly zero) stride, so a stretched axis simply never advances.
 */
function binary(
  ctx: OpContext,
  op: (a: number, b: number) => number,
  outDType?: DType,
): Tensor[] {
  const a = need(ctx, 0);
  const b = need(ctx, 1);
  const dims = broadcastShapes(a.dims, b.dims);
  const dtype = outDType ?? resultDType(ctx, a.dtype, b.dtype);
  const out = make(ctx, dims, dtype);
  const od = out.data;
  const ad = a.data;
  const bd = b.data;

  if (a.size === out.size && b.size === out.size) {
    for (let i = 0; i < od.length; i++) od[i] = op(ad[i], bd[i]);
    return [out];
  }
  if (b.size === 1) {
    const s = bd[0];
    for (let i = 0; i < od.length; i++) od[i] = op(ad[i], s);
    return [out];
  }
  if (a.size === 1) {
    const s = ad[0];
    for (let i = 0; i < od.length; i++) od[i] = op(s, bd[i]);
    return [out];
  }
  // The bias-add shape: one operand is the whole output and the other
  // right-aligns onto its trailing axes with no interior stretching, so it just
  // repeats every `size` elements. Worth special-casing because EVERY linear
  // layer's bias lands here, and the general odometer below costs a per-axis
  // carry loop for what is a wrapping counter.
  if (a.size === out.size && isTrailingBlock(b.dims, dims)) {
    const period = b.size;
    for (let i = 0, j = 0; i < od.length; i++) {
      od[i] = op(ad[i], bd[j]);
      if (++j === period) j = 0;
    }
    return [out];
  }
  if (b.size === out.size && isTrailingBlock(a.dims, dims)) {
    const period = a.size;
    for (let i = 0, j = 0; i < od.length; i++) {
      od[i] = op(ad[j], bd[i]);
      if (++j === period) j = 0;
    }
    return [out];
  }

  const rank = dims.length;
  const sa = broadcastStrides(a.dims, dims);
  const sb = broadcastStrides(b.dims, dims);
  const counter = new Int32Array(rank);
  let ia = 0;
  let ib = 0;
  for (let i = 0; i < od.length; i++) {
    od[i] = op(ad[ia], bd[ib]);
    // Ripple-carry the odometer from the fastest axis, adjusting each input's
    // cursor by the axis stride on step and by the whole span on carry.
    for (let ax = rank - 1; ax >= 0; ax--) {
      counter[ax]++;
      ia += sa[ax];
      ib += sb[ax];
      if (counter[ax] < dims[ax]) break;
      ia -= sa[ax] * dims[ax];
      ib -= sb[ax] * dims[ax];
      counter[ax] = 0;
    }
  }
  return [out];
}

/** True when `dims` right-aligns onto `target` with every shared axis EQUAL —
 *  i.e. the only broadcasting is the prepended axes. Under that condition (and
 *  only that one) the smaller operand tiles the larger one contiguously. A
 *  size-1 axis anywhere in the overlap breaks it, because that axis stretches
 *  and the repeat is no longer a simple wrap. */
function isTrailingBlock(dims: readonly number[], target: readonly number[]): boolean {
  const offset = target.length - dims.length;
  if (offset < 0) return false;
  for (let i = 0; i < dims.length; i++) if (dims[i] !== target[offset + i]) return false;
  return true;
}

/** Result type of a numeric binary op. ONNX requires both operands to already
 *  share a type, so this is a consistency check with one deliberate leniency:
 *  bool and uint8 share a representation and exporters mix the labels. */
function resultDType(ctx: OpContext, a: DType, b: DType): DType {
  if (a === b) return a;
  if ((a === "bool" && b === "uint8") || (a === "uint8" && b === "bool")) return "uint8";
  throw new Error(`onnx: ${ctx.label} operands have mismatched types ${a} and ${b}`);
}

function unary(ctx: OpContext, op: (x: number) => number, outDType?: DType): Tensor[] {
  const x = need(ctx, 0);
  const dtype = outDType ?? x.dtype;
  const out = make(ctx, x.dims, dtype);
  const xd = x.data;
  const od = out.data;
  for (let i = 0; i < od.length; i++) od[i] = op(xd[i]);
  return [out];
}

/** Variadic elementwise (`Min`, `Max`, `Sum`, `Mean`), which broadcast across
 *  ALL inputs, not just two. Folding pairwise gives the same shape and the same
 *  values for these associative reductions. */
function variadic(ctx: OpContext, op: (a: number, b: number) => number): Tensor[] {
  let acc = need(ctx, 0);
  for (let i = 1; i < ctx.inputs.length; i++) {
    const rhs = ctx.inputs[i];
    if (rhs === undefined) continue;
    const sub: OpContext = { ...ctx, inputs: [acc, rhs] };
    acc = binary(sub, op)[0];
  }
  // A single-input variadic must still produce a fresh tensor: the executor may
  // recycle buffers, and handing back the input would alias it.
  if (ctx.inputs.length === 1) {
    const out = make(ctx, acc.dims, acc.dtype);
    out.data.set(acc.data);
    return [out];
  }
  return [acc];
}

// Error-function approximation used by `Erf` and the exact form of `Gelu`.
// Abramowitz & Stegun 7.1.26: |error| < 1.5e-7, comfortably inside f32.
const ERF_A1 = 0.254829592;
const ERF_A2 = -0.284496736;
const ERF_A3 = 1.421413741;
const ERF_A4 = -1.453152027;
const ERF_A5 = 1.061405429;
const ERF_P = 0.3275911;

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + ERF_P * ax);
  const y = 1 - ((((ERF_A5 * t + ERF_A4) * t + ERF_A3) * t + ERF_A2) * t + ERF_A1) * t * Math.exp(-ax * ax);
  return sign * y;
}

// --- matmul / gemm -----------------------------------------------------------

/**
 * `MatMul` — NumPy `matmul` semantics, which is more than "multiply two
 * matrices":
 *   - a 1-D LHS is promoted to a row vector and the prepended axis removed after;
 *   - a 1-D RHS is promoted to a column vector and the appended axis removed;
 *   - anything above rank 2 broadcasts over the LEADING (batch) axes.
 * A kernel that handles only the rank-2 case is fine until the first attention
 * block, so the general path is here from the start.
 */
function matmul(ctx: OpContext): Tensor[] {
  const a = need(ctx, 0);
  const b = need(ctx, 1);
  const aVec = a.rank === 1;
  const bVec = b.rank === 1;
  const aDims = aVec ? [1, a.dims[0]] : a.dims;
  const bDims = bVec ? [b.dims[0], 1] : b.dims;

  const m = aDims[aDims.length - 2];
  const k = aDims[aDims.length - 1];
  const k2 = bDims[bDims.length - 2];
  const n = bDims[bDims.length - 1];
  if (k !== k2) {
    throw new Error(
      `onnx: ${ctx.label} inner dimensions disagree — [${a.dims.join(",")}] x [${b.dims.join(",")}]`,
    );
  }

  const aBatch = aDims.slice(0, aDims.length - 2);
  const bBatch = bDims.slice(0, bDims.length - 2);
  const batch = broadcastShapes(aBatch, bBatch);
  const batchCount = numElements(batch);
  const dtype = resultDType(ctx, a.dtype, b.dtype);

  // Batch strides in units of MATRICES, so the per-matrix offset is a multiply.
  const aBatchStrides = broadcastStrides(aBatch, batch);
  const bBatchStrides = broadcastStrides(bBatch, batch);
  const batchStrides = computeStrides(batch);

  const outDims = [...batch, m, n];
  const out = make(ctx, outDims, dtype);
  const ad = a.data;
  const bd = b.data;
  const od = out.data;
  const aMat = m * k;
  const bMat = k * n;

  for (let bi = 0; bi < batchCount; bi++) {
    let aOff = 0;
    let bOff = 0;
    let rem = bi;
    for (let ax = 0; ax < batch.length; ax++) {
      const idx = Math.floor(rem / batchStrides[ax]);
      rem -= idx * batchStrides[ax];
      aOff += idx * aBatchStrides[ax];
      bOff += idx * bBatchStrides[ax];
    }
    gemmInner(ad, aOff * aMat, bd, bOff * bMat, od, bi * m * n, m, k, n);
  }

  // Undo the rank promotions. Expressed as "delete these two axis POSITIONS"
  // rather than as successive slices, because the slicing form collapses when
  // both operands were vectors: the dot product's shape is [] and a
  // remove-the-last-then-remove-the-second-to-last sequence leaves [1] behind.
  const dropM = aVec ? outDims.length - 2 : -1;
  const dropN = bVec ? outDims.length - 1 : -1;
  const finalDims = outDims.filter((_, i) => i !== dropM && i !== dropN);
  return [out.reshape(finalDims)];
}

/**
 * The one hot loop: C[m,n] = sum_k A[m,k] * B[k,n], both operands row-major,
 * ACCUMULATING into `out` (which the caller has pre-seeded with the bias, or
 * zeroed).
 *
 * Ordered i-k-j rather than the textbook i-j-k so the inner loop strides
 * CONTIGUOUSLY through both `b` and `out`. The i-j-k form makes `b` jump by `n`
 * on every step, which on the 384-wide trunk here misses cache on every access.
 *
 * The k loop is unrolled by four because the i-k-j order's weakness is that the
 * inner statement is a read-modify-WRITE of `out`: one useful multiply-add per
 * round trip to memory. Consuming four `k` at a time amortises that store over
 * four multiplies. The grouped `a0*b0 + a1*b1 + a2*b2 + a3*b3` changes the
 * summation ORDER versus a sequential accumulate — that reassociation, not any
 * error, is the source of the ~1e-5 fp32 disagreement with onnxruntime, which
 * does its own (different) blocking for exactly the same reason.
 *
 * Two ROWS of `a` are also driven at once, which is the larger win: both rows
 * read the SAME four `b` values, so the four loads that dominate the inner loop
 * are shared across twice the arithmetic. Row blocking does not touch the
 * summation order of any individual output element — it only interleaves two
 * independent accumulations — so it is numerically invisible.
 *
 * The single-row tail keeps the k-unrolled form rather than falling back to a
 * scalar loop. That matters more than it looks: a batch-1 forward pass has
 * m === 1 for every dense layer, so the "tail" IS the whole trunk.
 */
function gemmInner(
  a: TensorData,
  aOff: number,
  b: TensorData,
  bOff: number,
  out: TensorData,
  outOff: number,
  m: number,
  k: number,
  n: number,
): void {
  let i = 0;
  for (; i + 2 <= m; i += 2) {
    const out0 = outOff + i * n;
    const out1 = out0 + n;
    const rowA0 = aOff + i * k;
    const rowA1 = rowA0 + k;
    let kk = 0;
    for (; kk + 4 <= k; kk += 4) {
      const x0 = a[rowA0 + kk];
      const x1 = a[rowA0 + kk + 1];
      const x2 = a[rowA0 + kk + 2];
      const x3 = a[rowA0 + kk + 3];
      const y0 = a[rowA1 + kk];
      const y1 = a[rowA1 + kk + 1];
      const y2 = a[rowA1 + kk + 2];
      const y3 = a[rowA1 + kk + 3];
      const b0 = bOff + kk * n;
      const b1 = b0 + n;
      const b2 = b1 + n;
      const b3 = b2 + n;
      for (let j = 0; j < n; j++) {
        const q0 = b[b0 + j];
        const q1 = b[b1 + j];
        const q2 = b[b2 + j];
        const q3 = b[b3 + j];
        out[out0 + j] += x0 * q0 + x1 * q1 + x2 * q2 + x3 * q3;
        out[out1 + j] += y0 * q0 + y1 * q1 + y2 * q2 + y3 * q3;
      }
    }
    for (; kk < k; kk++) {
      const x = a[rowA0 + kk];
      const y = a[rowA1 + kk];
      const rowB = bOff + kk * n;
      for (let j = 0; j < n; j++) {
        const q = b[rowB + j];
        out[out0 + j] += x * q;
        out[out1 + j] += y * q;
      }
    }
  }
  for (; i < m; i++) {
    const rowOut = outOff + i * n;
    const rowA = aOff + i * k;
    let kk = 0;
    for (; kk + 4 <= k; kk += 4) {
      const a0 = a[rowA + kk];
      const a1 = a[rowA + kk + 1];
      const a2 = a[rowA + kk + 2];
      const a3 = a[rowA + kk + 3];
      const b0 = bOff + kk * n;
      const b1 = b0 + n;
      const b2 = b1 + n;
      const b3 = b2 + n;
      for (let j = 0; j < n; j++) {
        out[rowOut + j] += a0 * b[b0 + j] + a1 * b[b1 + j] + a2 * b[b2 + j] + a3 * b[b3 + j];
      }
    }
    for (; kk < k; kk++) {
      const av = a[rowA + kk];
      const rowB = bOff + kk * n;
      for (let j = 0; j < n; j++) out[rowOut + j] += av * b[rowB + j];
    }
  }
}

/**
 * `Gemm` — Y = alpha * (A' x B') + beta * C, where A'/B' are optionally
 * transposed and C broadcasts to the output shape.
 *
 * `transA`/`transB` are handled by materialising the transpose rather than by
 * a strided inner loop. That costs a copy of a weight matrix per call, which is
 * why the executor's constant folding matters: a `Gemm` whose B is an
 * initializer has its transpose hoisted out of `run()` entirely.
 */
function gemm(ctx: OpContext): Tensor[] {
  const a = need(ctx, 0);
  const b = need(ctx, 1);
  const c = ctx.inputs[2];
  const alpha = attrFloat(ctx, "alpha", 1);
  const beta = attrFloat(ctx, "beta", 1);
  const transA = attrInt(ctx, "transA", 0) !== 0;
  const transB = attrInt(ctx, "transB", 0) !== 0;
  if (a.rank !== 2 || b.rank !== 2) {
    throw new Error(`onnx: ${ctx.label} requires 2-D A and B, got ranks ${a.rank} and ${b.rank}`);
  }

  const aT = transA ? transpose2d(ctx, a) : a;
  const bT = transB ? transpose2d(ctx, b) : b;
  const m = aT.dims[0];
  const k = aT.dims[1];
  const n = bT.dims[1];
  if (bT.dims[0] !== k) {
    throw new Error(
      `onnx: ${ctx.label} inner dimensions disagree — A${transA ? "'" : ""}[${aT.dims.join(",")}] x B${transB ? "'" : ""}[${bT.dims.join(",")}]`,
    );
  }

  const out = make(ctx, [m, n], resultDType(ctx, a.dtype, b.dtype));
  const od = out.data;

  /** `beta * C`, broadcast to [m, n], written or added into `od`. */
  const applyC = (add: boolean): void => {
    if (c === undefined || beta === 0) return;
    const cs = broadcastStrides(c.dims, [m, n]);
    const cd = c.data;
    for (let i = 0; i < m; i++) {
      const base = i * cs[0];
      for (let j = 0; j < n; j++) {
        const v = beta * cd[base + j * cs[1]];
        if (add) od[i * n + j] += v;
        else od[i * n + j] = v;
      }
    }
  };

  // ALPHA SCALES THE MATRIX PRODUCT ONLY: `Y = alpha * A'B' + beta * C`. With
  // alpha === 1 (which every torch-exported Linear uses) the bias can be seeded
  // first and the matmul can accumulate straight into it — one pass. With any
  // other alpha that shortcut is wrong, because the final `*= alpha` would scale
  // C as well; the product has to be finished and scaled before C is added.
  if (alpha === 1) {
    applyC(false);
    gemmInner(aT.data, 0, bT.data, 0, od, 0, m, k, n);
  } else {
    gemmInner(aT.data, 0, bT.data, 0, od, 0, m, k, n);
    for (let i = 0; i < od.length; i++) od[i] *= alpha;
    applyC(true);
  }
  return [out];
}

function transpose2d(ctx: OpContext, t: Tensor): Tensor {
  const [r, c] = t.dims;
  const out = make(ctx, [c, r], t.dtype);
  const src = t.data;
  const dst = out.data;
  for (let i = 0; i < r; i++) {
    for (let j = 0; j < c; j++) dst[j * r + i] = src[i * c + j];
  }
  return out;
}

// --- shape manipulation ------------------------------------------------------

function transpose(ctx: OpContext): Tensor[] {
  const x = need(ctx, 0);
  const rank = x.rank;
  // Default permutation is the full REVERSE, not the identity.
  const perm = attrInts(ctx, "perm") ?? Array.from({ length: rank }, (_, i) => rank - 1 - i);
  if (perm.length !== rank) {
    throw new Error(`onnx: ${ctx.label} perm has ${perm.length} entries for a rank-${rank} input`);
  }
  const outDims = perm.map((p) => x.dims[normalizeAxis(p, rank, ctx.label)]);
  const out = make(ctx, outDims, x.dtype);
  const inStrides = computeStrides(x.dims);
  // Stride of each OUTPUT axis expressed in the INPUT's flat index space; then
  // one odometer over the output covers any permutation without a rank switch.
  const permStrides = perm.map((p) => inStrides[normalizeAxis(p, rank, ctx.label)]);
  const src = x.data;
  const dst = out.data;
  const counter = new Int32Array(rank);
  let si = 0;
  for (let i = 0; i < dst.length; i++) {
    dst[i] = src[si];
    for (let ax = rank - 1; ax >= 0; ax--) {
      counter[ax]++;
      si += permStrides[ax];
      if (counter[ax] < outDims[ax]) break;
      si -= permStrides[ax] * outDims[ax];
      counter[ax] = 0;
    }
  }
  return [out];
}

/**
 * `Reshape`. Two escapes in the target shape, and they are not the same:
 *   `0` — copy the input's dimension at THIS POSITION (suppressed by
 *         `allowzero=1`, opset 14+, where 0 means a genuinely empty axis);
 *   `-1` — infer from the total element count; at most one may appear.
 */
function reshape(ctx: OpContext): Tensor[] {
  const x = need(ctx, 0);
  const target = need(ctx, 1).toNumbers();
  const allowZero = attrInt(ctx, "allowzero", 0) !== 0;
  const dims = target.slice();
  let inferAt = -1;
  let known = 1;
  for (let i = 0; i < dims.length; i++) {
    if (dims[i] === -1) {
      if (inferAt >= 0) throw new Error(`onnx: ${ctx.label} target shape has more than one -1`);
      inferAt = i;
    } else if (dims[i] === 0 && !allowZero) {
      if (i >= x.rank) throw new Error(`onnx: ${ctx.label} target shape uses 0 at axis ${i}, past the input rank`);
      dims[i] = x.dims[i];
      known *= dims[i];
    } else {
      known *= dims[i];
    }
  }
  if (inferAt >= 0) {
    if (known === 0) throw new Error(`onnx: ${ctx.label} cannot infer -1 against a zero-sized shape`);
    dims[inferAt] = x.size / known;
  }
  if (numElements(dims) !== x.size) {
    throw new Error(
      `onnx: ${ctx.label} cannot reshape ${x.size} elements into [${dims.join(",")}]`,
    );
  }
  // Copy rather than alias: the executor recycles buffers, so a reshape sharing
  // storage with its input would come back to life as somebody else's scratch.
  const out = make(ctx, dims, x.dtype);
  out.data.set(x.data);
  return [out];
}

function flatten(ctx: OpContext): Tensor[] {
  const x = need(ctx, 0);
  const axis = normalizeAxisInclusive(attrInt(ctx, "axis", 1), x.rank, ctx.label);
  let outer = 1;
  for (let i = 0; i < axis; i++) outer *= x.dims[i];
  const out = make(ctx, [outer, x.size / (outer === 0 ? 1 : outer)], x.dtype);
  out.data.set(x.data);
  return [out];
}

/** `Unsqueeze` — insert size-1 axes. The axes are resolved against the OUTPUT
 *  rank (input rank + count), and inserting in ascending order is what makes a
 *  multi-axis unsqueeze land where the spec says. */
function unsqueeze(ctx: OpContext): Tensor[] {
  const x = need(ctx, 0);
  const raw = intsFromInputOrAttr(ctx, 1, "axes");
  if (raw === undefined) throw new Error(`onnx: ${ctx.label} requires axes (as input or attribute)`);
  const outRank = x.rank + raw.length;
  const axes = raw.map((a) => normalizeAxis(a, outRank, ctx.label)).sort((p, q) => p - q);
  const dims: number[] = [];
  let src = 0;
  for (let i = 0; i < outRank; i++) {
    if (axes.includes(i)) dims.push(1);
    else dims.push(x.dims[src++]);
  }
  const out = make(ctx, dims, x.dtype);
  out.data.set(x.data);
  return [out];
}

/** `Squeeze` — drop size-1 axes. With axes ABSENT, drop EVERY size-1 axis; with
 *  axes given, drop exactly those and reject any that is not size 1 (a silent
 *  no-op there would leave the rank wrong for whatever consumes it). */
function squeeze(ctx: OpContext): Tensor[] {
  const x = need(ctx, 0);
  const raw = intsFromInputOrAttr(ctx, 1, "axes");
  const dims: number[] = [];
  if (raw === undefined) {
    for (const d of x.dims) if (d !== 1) dims.push(d);
  } else {
    const axes = new Set(raw.map((a) => normalizeAxis(a, x.rank, ctx.label)));
    for (let i = 0; i < x.rank; i++) {
      if (axes.has(i)) {
        if (x.dims[i] !== 1) {
          throw new Error(`onnx: ${ctx.label} cannot squeeze axis ${i} of size ${x.dims[i]}`);
        }
      } else {
        dims.push(x.dims[i]);
      }
    }
  }
  const out = make(ctx, dims, x.dtype);
  out.data.set(x.data);
  return [out];
}

function concat(ctx: OpContext): Tensor[] {
  const parts = ctx.inputs.filter((t): t is Tensor => t !== undefined);
  if (parts.length === 0) throw new Error(`onnx: ${ctx.label} has no inputs`);
  const rank = parts[0].rank;
  const axis = normalizeAxis(attrInt(ctx, "axis", 0), rank, ctx.label);
  const dims = parts[0].dims.slice();
  let total = 0;
  for (const p of parts) {
    if (p.rank !== rank) throw new Error(`onnx: ${ctx.label} inputs have different ranks`);
    for (let i = 0; i < rank; i++) {
      if (i !== axis && p.dims[i] !== dims[i]) {
        throw new Error(`onnx: ${ctx.label} inputs disagree on axis ${i} (${p.dims[i]} vs ${dims[i]})`);
      }
    }
    total += p.dims[axis];
  }
  dims[axis] = total;
  const out = make(ctx, dims, parts[0].dtype);
  const dst = out.data;

  // Everything before `axis` is an independent block; within a block each input
  // contributes one contiguous run. So the copy is `outer` x `parts` memcpys.
  let outer = 1;
  for (let i = 0; i < axis; i++) outer *= dims[i];
  let inner = 1;
  for (let i = axis + 1; i < rank; i++) inner *= dims[i];

  let cursor = 0;
  for (let o = 0; o < outer; o++) {
    for (const p of parts) {
      const run = p.dims[axis] * inner;
      dst.set(p.data.subarray(o * run, o * run + run), cursor);
      cursor += run;
    }
  }
  return [out];
}

/**
 * `Slice`, opset 10+: starts/ends/axes/steps are INPUTS. This is the op the
 * spec spends the most words on, and each clause below exists because omitting
 * it produces plausible-looking wrong output:
 *
 *   - a negative `start`/`end` counts from the end of that axis;
 *   - after that adjustment they are CLAMPED, and the clamp RANGE DEPENDS ON
 *     THE STEP SIGN: forward slices clamp to [0, dim], backward slices to
 *     [-1, dim-1], because a backward slice must be able to name "one before
 *     index 0" as its exclusive end;
 *   - INT64_MAX / INT64_MIN are the idiomatic "to the end" sentinels emitted by
 *     `x[..., 1:]` and `x[..., ::-1]`, and they arrive as huge doubles;
 *   - an axis may be listed at most once, and unlisted axes are taken whole;
 *   - `step` may be negative but never zero.
 */
function slice(ctx: OpContext): Tensor[] {
  const x = need(ctx, 0);
  const rank = x.rank;
  const starts = intsFromInputOrAttr(ctx, 1, "starts");
  const ends = intsFromInputOrAttr(ctx, 2, "ends");
  if (starts === undefined || ends === undefined) {
    throw new Error(`onnx: ${ctx.label} requires starts and ends`);
  }
  const axesRaw = intsFromInputOrAttr(ctx, 3, "axes") ?? starts.map((_, i) => i);
  const stepsRaw = intsFromInputOrAttr(ctx, 4, "steps") ?? starts.map(() => 1);

  const start = new Array<number>(rank).fill(0);
  const step = new Array<number>(rank).fill(1);
  const count = x.dims.slice();
  const seen = new Set<number>();

  for (let i = 0; i < axesRaw.length; i++) {
    const ax = normalizeAxis(axesRaw[i], rank, ctx.label);
    if (seen.has(ax)) throw new Error(`onnx: ${ctx.label} names axis ${ax} more than once`);
    seen.add(ax);
    const dim = x.dims[ax];
    const st = stepsRaw[i];
    if (st === 0) throw new Error(`onnx: ${ctx.label} step is zero on axis ${ax}`);

    let s = starts[i];
    let e = ends[i];
    if (s < 0) s += dim;
    if (e < 0) e += dim;
    if (st > 0) {
      s = Math.min(Math.max(s, 0), dim);
      e = Math.min(Math.max(e, 0), dim);
    } else {
      // The lower bound is -1, the position "just past" index 0 going backwards.
      s = Math.min(Math.max(s, 0), dim - 1);
      e = Math.min(Math.max(e, -1), dim - 1);
    }
    start[ax] = s;
    step[ax] = st;
    count[ax] = Math.max(0, Math.ceil((e - s) / st));
  }

  const inStrides = computeStrides(x.dims);
  const out = make(ctx, count, x.dtype);
  const dst = out.data;
  const src = x.data;
  if (dst.length > 0) {
    let base = 0;
    for (let ax = 0; ax < rank; ax++) base += start[ax] * inStrides[ax];
    const axStride = inStrides.map((s, ax) => s * step[ax]);
    const counter = new Int32Array(rank);
    let si = base;
    for (let i = 0; i < dst.length; i++) {
      dst[i] = src[si];
      for (let ax = rank - 1; ax >= 0; ax--) {
        counter[ax]++;
        si += axStride[ax];
        if (counter[ax] < count[ax]) break;
        si -= axStride[ax] * count[ax];
        counter[ax] = 0;
      }
    }
  }
  return [out];
}

/**
 * `Expand` — broadcast to a shape. Distinct from a reshape in the one way that
 * matters: the target is combined with the input shape by the BIDIRECTIONAL
 * broadcast rule, so `Expand([3,1], [1,4])` is `[3,4]`. The target is a lower
 * bound on each axis, not an assignment.
 */
function expand(ctx: OpContext): Tensor[] {
  const x = need(ctx, 0);
  const target = need(ctx, 1).toNumbers();
  const dims = broadcastShapes(x.dims, target);
  const out = make(ctx, dims, x.dtype);
  const strides = broadcastStrides(x.dims, dims);
  const src = x.data;
  const dst = out.data;
  const rank = dims.length;
  const counter = new Int32Array(rank);
  let si = 0;
  for (let i = 0; i < dst.length; i++) {
    dst[i] = src[si];
    for (let ax = rank - 1; ax >= 0; ax--) {
      counter[ax]++;
      si += strides[ax];
      if (counter[ax] < dims[ax]) break;
      si -= strides[ax] * dims[ax];
      counter[ax] = 0;
    }
  }
  return [out];
}

/** `Shape` — the shape as an int64 tensor, optionally a `[start, end)` slice of
 *  it (opset 15+). Both bounds may be negative and both are clamped. */
function shapeOp(ctx: OpContext): Tensor[] {
  const x = need(ctx, 0);
  const rank = x.rank;
  let start = attrInt(ctx, "start", 0);
  let end = attrInt(ctx, "end", rank);
  if (start < 0) start += rank;
  if (end < 0) end += rank;
  start = Math.min(Math.max(start, 0), rank);
  end = Math.min(Math.max(end, 0), rank);
  const n = Math.max(0, end - start);
  const out = make(ctx, [n], "int64");
  for (let i = 0; i < n; i++) out.data[i] = x.dims[start + i];
  return [out];
}

function sizeOp(ctx: OpContext): Tensor[] {
  const x = need(ctx, 0);
  const out = make(ctx, [], "int64");
  out.data[0] = x.size;
  return [out];
}

/** `Gather` — take along one axis with an arbitrarily-shaped index tensor. The
 *  output rank is `data.rank - 1 + indices.rank`, and NEGATIVE INDICES count
 *  from the end of the gathered axis (opset 11+). */
function gather(ctx: OpContext): Tensor[] {
  const data = need(ctx, 0);
  const indices = need(ctx, 1);
  const axis = normalizeAxis(attrInt(ctx, "axis", 0), data.rank, ctx.label);
  const dim = data.dims[axis];

  let outer = 1;
  for (let i = 0; i < axis; i++) outer *= data.dims[i];
  let inner = 1;
  for (let i = axis + 1; i < data.rank; i++) inner *= data.dims[i];

  const dims = [...data.dims.slice(0, axis), ...indices.dims, ...data.dims.slice(axis + 1)];
  const out = make(ctx, dims, data.dtype);
  const idxCount = indices.size;
  const src = data.data;
  const dst = out.data;

  for (let o = 0; o < outer; o++) {
    for (let g = 0; g < idxCount; g++) {
      let idx = indices.data[g];
      if (idx < 0) idx += dim;
      if (idx < 0 || idx >= dim) {
        throw new Error(`onnx: ${ctx.label} index ${indices.data[g]} out of range for axis ${axis} of size ${dim}`);
      }
      const from = (o * dim + idx) * inner;
      dst.set(src.subarray(from, from + inner), (o * idxCount + g) * inner);
    }
  }
  return [out];
}

/**
 * `Split` — opset 13+ takes the split sizes as an INPUT; opset 18 additionally
 * allows `num_outputs`. With neither, the axis is divided across the declared
 * outputs.
 *
 * The uneven case has a direction, and it is the counter-intuitive one: the
 * spec says "if the tensor is not evenly splittable into `num_outputs`, the
 * LAST CHUNK WILL BE SMALLER". So the size is `ceil(dim / n)` for every chunk
 * but the last, which takes what is left — NOT `floor` with the remainder
 * appended to the end, which is the natural way to write it and produces a
 * final chunk that is too big and n-1 chunks that are too small.
 */
function split(ctx: OpContext): Tensor[] {
  const x = need(ctx, 0);
  const axis = normalizeAxis(attrInt(ctx, "axis", 0), x.rank, ctx.label);
  const dim = x.dims[axis];
  const numOutputs = attrInt(ctx, "num_outputs", ctx.outputCount);
  let sizes = intsFromInputOrAttr(ctx, 1, "split");
  if (sizes === undefined) {
    const n = numOutputs > 0 ? numOutputs : ctx.outputCount;
    if (n <= 0) throw new Error(`onnx: ${ctx.label} cannot infer the number of splits`);
    const each = Math.ceil(dim / n);
    sizes = new Array<number>(n).fill(each);
    sizes[n - 1] = dim - each * (n - 1);
    if (sizes[n - 1] < 0) {
      throw new Error(`onnx: ${ctx.label} cannot split an axis of size ${dim} into ${n} outputs`);
    }
  }
  const total = sizes.reduce((a, b) => a + b, 0);
  if (total !== dim) {
    throw new Error(`onnx: ${ctx.label} split sizes sum to ${total} but axis ${axis} has size ${dim}`);
  }

  let outer = 1;
  for (let i = 0; i < axis; i++) outer *= x.dims[i];
  let inner = 1;
  for (let i = axis + 1; i < x.rank; i++) inner *= x.dims[i];

  const outs: Tensor[] = [];
  let offset = 0;
  for (const size of sizes) {
    const dims = x.dims.slice();
    dims[axis] = size;
    const out = make(ctx, dims, x.dtype);
    const run = size * inner;
    for (let o = 0; o < outer; o++) {
      const from = o * dim * inner + offset * inner;
      out.data.set(x.data.subarray(from, from + run), o * run);
    }
    outs.push(out);
    offset += size;
  }
  return outs;
}

/** `ConstantOfShape` — a tensor of the given shape filled from the `value`
 *  attribute (a one-element tensor that also supplies the DTYPE). Absent, the
 *  default is float32 zero. */
function constantOfShape(ctx: OpContext): Tensor[] {
  const shape = need(ctx, 0).toNumbers();
  const attr = ctx.attrs.get("value");
  let dtype: DType = "float32";
  let fill = 0;
  if (attr !== undefined) {
    if (attr.kind !== "tensor") throw new Error(`onnx: ${ctx.label} value attribute must be a tensor`);
    dtype = attr.value.dtype;
    fill = attr.value.size > 0 ? attr.value.data[0] : 0;
  }
  const out = make(ctx, shape, dtype);
  if (fill !== 0) out.data.fill(fill);
  return [out];
}

/** `Range` — start, limit, delta as three SCALAR INPUTS (never attributes). The
 *  element count is `ceil((limit - start) / delta)` clamped at zero, which is
 *  what makes an empty range legal rather than an error. */
function range(ctx: OpContext): Tensor[] {
  const start = need(ctx, 0);
  const limit = need(ctx, 1).scalar();
  const delta = need(ctx, 2).scalar();
  const s = start.scalar();
  if (delta === 0) throw new Error(`onnx: ${ctx.label} delta is zero`);
  const n = Math.max(0, Math.ceil((limit - s) / delta));
  const out = make(ctx, [n], start.dtype);
  for (let i = 0; i < n; i++) out.data[i] = s + i * delta;
  return [out];
}

/** `Constant` — the value is an attribute; which one names the dtype. */
function constant(ctx: OpContext): Tensor[] {
  const asTensor = ctx.attrs.get("value");
  if (asTensor !== undefined && asTensor.kind === "tensor") return [asTensor.value.clone()];
  const f = ctx.attrs.get("value_float");
  if (f !== undefined && f.kind === "float") return [scalarTensor(ctx, f.value, "float32")];
  const i = ctx.attrs.get("value_int");
  if (i !== undefined && i.kind === "int") return [scalarTensor(ctx, i.value, "int64")];
  const fs = ctx.attrs.get("value_floats");
  if (fs !== undefined && fs.kind === "floats") return [listTensor(ctx, fs.value, "float32")];
  const is = ctx.attrs.get("value_ints");
  if (is !== undefined && is.kind === "ints") return [listTensor(ctx, is.value, "int64")];
  throw new Error(`onnx: ${ctx.label} has no recognised value attribute`);
}

function scalarTensor(ctx: OpContext, v: number, dtype: DType): Tensor {
  const t = make(ctx, [], dtype);
  t.data[0] = v;
  return t;
}

function listTensor(ctx: OpContext, values: readonly number[], dtype: DType): Tensor {
  const t = make(ctx, [values.length], dtype);
  for (let i = 0; i < values.length; i++) t.data[i] = values[i];
  return t;
}

// --- reductions --------------------------------------------------------------

/**
 * Resolve the axes of an opset-18 `Reduce*` into a concrete list, honouring the
 * three-state distinction the spec created.
 *
 * | axes        | noop_with_empty_axes | meaning              |
 * |-------------|----------------------|----------------------|
 * | absent      | 0 (default)          | reduce ALL axes      |
 * | absent      | 1                    | reduce ALL axes      |
 * | present []  | 0                    | reduce ALL axes      |
 * | present []  | 1                    | reduce NOTHING (copy)|
 *
 * The bottom two rows are why `intsFromInputOrAttr` must not fold "absent" into
 * `[]`: an exporter that emits an empty axes input alongside
 * `noop_with_empty_axes=1` is asking for the identity, and reducing everything
 * instead collapses the tensor to a scalar.
 */
function resolveReduceAxes(ctx: OpContext, rank: number): number[] | "identity" {
  const raw = intsFromInputOrAttr(ctx, 1, "axes");
  const noopEmpty = attrInt(ctx, "noop_with_empty_axes", 0) !== 0;
  if (raw === undefined || raw.length === 0) {
    if (raw !== undefined && noopEmpty) return "identity";
    return Array.from({ length: rank }, (_, i) => i);
  }
  return raw.map((a) => normalizeAxis(a, rank, ctx.label));
}

type ReduceSpec = {
  init: (dtype: DType) => number;
  step: (acc: number, v: number) => number;
  /** Applied once per output element, with the count of contributions. */
  finish?: (acc: number, count: number) => number;
};

function reduce(ctx: OpContext, spec: ReduceSpec): Tensor[] {
  const x = need(ctx, 0);
  const keepDims = attrInt(ctx, "keepdims", 1) !== 0;
  const axes = resolveReduceAxes(ctx, x.rank);
  if (axes === "identity") {
    const copy = make(ctx, x.dims, x.dtype);
    copy.data.set(x.data);
    return [copy];
  }

  const reduced = new Set(axes);
  const outDims: number[] = [];
  for (let i = 0; i < x.rank; i++) {
    if (reduced.has(i)) {
      if (keepDims) outDims.push(1);
    } else {
      outDims.push(x.dims[i]);
    }
  }

  const out = make(ctx, outDims, x.dtype);
  const od = out.data;
  const init = spec.init(x.dtype);
  od.fill(init);

  // Map each input element to its output slot by zeroing the reduced axes'
  // contribution to the flat index. Cheaper than gathering per output slot and
  // it visits the input CONTIGUOUSLY, which matters for the 64x76 candidates.
  //
  // `oi` walks the OUTPUT's axes, and whether a reduced axis consumes one
  // depends on `keepdims`: with keepdims the output keeps a size-1 axis in that
  // position, without it the axis is gone entirely. Advancing `oi` only for
  // kept axes is right in the second case and off-by-one-per-reduced-axis in
  // the first, which silently hands every later axis an earlier axis's stride —
  // wrong sums written to wrong slots, no error.
  const outStrides = computeStrides(outDims);
  const map = new Array<number>(x.rank);
  let oi = 0;
  for (let i = 0; i < x.rank; i++) {
    if (reduced.has(i)) {
      map[i] = 0;
      if (keepDims) oi++;
    } else {
      map[i] = outStrides[oi];
      oi++;
    }
  }

  const rank = x.rank;
  const counter = new Int32Array(rank);
  const src = x.data;
  let outIndex = 0;
  for (let i = 0; i < src.length; i++) {
    od[outIndex] = spec.step(od[outIndex], src[i]);
    for (let ax = rank - 1; ax >= 0; ax--) {
      counter[ax]++;
      outIndex += map[ax];
      if (counter[ax] < x.dims[ax]) break;
      outIndex -= map[ax] * x.dims[ax];
      counter[ax] = 0;
    }
  }

  if (spec.finish !== undefined) {
    const count = od.length === 0 ? 0 : x.size / od.length;
    for (let i = 0; i < od.length; i++) od[i] = spec.finish(od[i], count);
  }
  return [out];
}

/** `ArgMax`/`ArgMin` reduce one axis to the INDEX of the extremum.
 *  `select_last_index` (opset 12+) decides ties; the default keeps the first. */
function argReduce(ctx: OpContext, better: (candidate: number, best: number) => boolean): Tensor[] {
  const x = need(ctx, 0);
  const axis = normalizeAxis(attrInt(ctx, "axis", 0), x.rank, ctx.label);
  const keepDims = attrInt(ctx, "keepdims", 1) !== 0;
  const selectLast = attrInt(ctx, "select_last_index", 0) !== 0;
  const dim = x.dims[axis];

  let outer = 1;
  for (let i = 0; i < axis; i++) outer *= x.dims[i];
  let inner = 1;
  for (let i = axis + 1; i < x.rank; i++) inner *= x.dims[i];

  const dims: number[] = [];
  for (let i = 0; i < x.rank; i++) {
    if (i === axis) {
      if (keepDims) dims.push(1);
    } else {
      dims.push(x.dims[i]);
    }
  }
  const out = make(ctx, dims, "int64");
  const src = x.data;
  for (let o = 0; o < outer; o++) {
    for (let n = 0; n < inner; n++) {
      let bestIdx = 0;
      let best = src[o * dim * inner + n];
      for (let k = 1; k < dim; k++) {
        const v = src[(o * dim + k) * inner + n];
        if (better(v, best) || (selectLast && v === best)) {
          best = v;
          bestIdx = k;
        }
      }
      out.data[o * inner + n] = bestIdx;
    }
  }
  return [out];
}

// --- normalisation / activation ----------------------------------------------

/**
 * `LayerNormalization` (opset 17+): normalise over the axes from `axis` to the
 * END, then scale by a broadcast `Scale` and shift by an optional `B`.
 *
 * Two details the spec pins that a from-memory implementation usually gets
 * wrong. First `axis` names the FIRST normalised axis and everything after it
 * is included — it is not a single-axis normalisation. Second the variance is
 * the BIASED (population, /N) estimate, not the sample (/(N-1)) one; using the
 * unbiased form shifts every activation by a factor of sqrt(N/(N-1)), which on
 * a 384-wide trunk is a 0.13% error that compounds through five blocks.
 *
 * Epsilon goes INSIDE the square root — `x / sqrt(var + eps)`, not
 * `x / (sqrt(var) + eps)`.
 */
function layerNormalization(ctx: OpContext): Tensor[] {
  const x = need(ctx, 0);
  const scale = need(ctx, 1);
  const bias = ctx.inputs[2];
  const axis = normalizeAxis(attrInt(ctx, "axis", -1), x.rank, ctx.label);
  const epsilon = attrFloat(ctx, "epsilon", 1e-5);

  let outer = 1;
  for (let i = 0; i < axis; i++) outer *= x.dims[i];
  const norm = x.size / (outer === 0 ? 1 : outer);

  const out = make(ctx, x.dims, x.dtype);
  const src = x.data;
  const dst = out.data;
  const sd = scale.data;
  const bd = bias?.data;
  // Scale/bias are spec'd to have the normalised shape, but broadcasting them
  // costs nothing and tolerates the rank-1 form exporters emit.
  const scaleStride = scale.size === norm ? 1 : 0;
  const biasStride = bd !== undefined && bd.length === norm ? 1 : 0;

  for (let o = 0; o < outer; o++) {
    const base = o * norm;
    let sum = 0;
    for (let i = 0; i < norm; i++) sum += src[base + i];
    const mean = sum / norm;
    let sq = 0;
    for (let i = 0; i < norm; i++) {
      const d = src[base + i] - mean;
      sq += d * d;
    }
    const inv = 1 / Math.sqrt(sq / norm + epsilon);
    for (let i = 0; i < norm; i++) {
      const normed = (src[base + i] - mean) * inv;
      const s = sd[i * scaleStride];
      dst[base + i] = bd === undefined ? normed * s : normed * s + bd[i * biasStride];
    }
  }
  return [out];
}

/** `Softmax`, opset 13+: over a SINGLE axis (`axis` default -1). Before opset 13
 *  it coerced the input to 2-D and normalised over the whole flattened tail,
 *  which is a different function — hence the version branch. */
function softmax(ctx: OpContext): Tensor[] {
  const x = need(ctx, 0);
  const rank = x.rank;
  const axisAttr = attrInt(ctx, "axis", ctx.opset >= 13 ? -1 : 1);
  const axis = normalizeAxis(axisAttr, rank, ctx.label);

  let outer: number;
  let dim: number;
  let inner: number;
  if (ctx.opset >= 13) {
    outer = 1;
    for (let i = 0; i < axis; i++) outer *= x.dims[i];
    dim = x.dims[axis];
    inner = 1;
    for (let i = axis + 1; i < rank; i++) inner *= x.dims[i];
  } else {
    // Legacy: [d0..d(axis-1)] x [d(axis)..dN] coerced to 2-D, normalise rows.
    outer = 1;
    for (let i = 0; i < axis; i++) outer *= x.dims[i];
    dim = x.size / (outer === 0 ? 1 : outer);
    inner = 1;
  }

  const out = make(ctx, x.dims, x.dtype);
  const src = x.data;
  const dst = out.data;
  for (let o = 0; o < outer; o++) {
    for (let n = 0; n < inner; n++) {
      // Subtract the max before exponentiating: without it a logit above ~88
      // overflows f32 and the whole row becomes NaN.
      let max = -Infinity;
      for (let k = 0; k < dim; k++) {
        const v = src[(o * dim + k) * inner + n];
        if (v > max) max = v;
      }
      let sum = 0;
      for (let k = 0; k < dim; k++) {
        const e = Math.exp(src[(o * dim + k) * inner + n] - max);
        dst[(o * dim + k) * inner + n] = e;
        sum += e;
      }
      const invSum = 1 / sum;
      for (let k = 0; k < dim; k++) dst[(o * dim + k) * inner + n] *= invSum;
    }
  }
  return [out];
}

/** `Clip` — min/max are optional INPUTS from opset 11 (attributes before). An
 *  omitted bound is the type's infinity, and an omitted input can show up as a
 *  short input list OR as an empty-string name, both of which arrive here as
 *  `undefined`. */
function clip(ctx: OpContext): Tensor[] {
  const x = need(ctx, 0);
  const minT = ctx.inputs[1];
  const maxT = ctx.inputs[2];
  const lo = minT !== undefined ? minT.scalar() : attrFloat(ctx, "min", -Infinity);
  const hi = maxT !== undefined ? maxT.scalar() : attrFloat(ctx, "max", Infinity);
  const out = make(ctx, x.dims, x.dtype);
  const src = x.data;
  const dst = out.data;
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    dst[i] = v < lo ? lo : v > hi ? hi : v;
  }
  return [out];
}

/**
 * `Where` — elementwise select, with the condition broadcasting against BOTH
 * branches simultaneously (a three-way multidirectional broadcast, not two
 * pairwise ones).
 *
 * The condition arrives as `bool`, which shares a Uint8Array with `uint8`; any
 * non-zero byte is true. That is the path the `present` seat mask takes in this
 * graph — fed as uint8, `Cast`ed to bool, then used to select between a real
 * per-seat value and a large negative fill.
 */
function where(ctx: OpContext): Tensor[] {
  const cond = need(ctx, 0);
  const a = need(ctx, 1);
  const b = need(ctx, 2);
  const dims = broadcastShapes(broadcastShapes(cond.dims, a.dims), b.dims);
  const dtype = resultDType(ctx, a.dtype, b.dtype);
  const out = make(ctx, dims, dtype);
  const sc = broadcastStrides(cond.dims, dims);
  const sa = broadcastStrides(a.dims, dims);
  const sb = broadcastStrides(b.dims, dims);
  const cd = cond.data;
  const ad = a.data;
  const bd = b.data;
  const od = out.data;
  const rank = dims.length;
  const counter = new Int32Array(rank);
  let ic = 0;
  let ia = 0;
  let ib = 0;
  for (let i = 0; i < od.length; i++) {
    od[i] = cd[ic] !== 0 ? ad[ia] : bd[ib];
    for (let ax = rank - 1; ax >= 0; ax--) {
      counter[ax]++;
      ic += sc[ax];
      ia += sa[ax];
      ib += sb[ax];
      if (counter[ax] < dims[ax]) break;
      ic -= sc[ax] * dims[ax];
      ia -= sa[ax] * dims[ax];
      ib -= sb[ax] * dims[ax];
      counter[ax] = 0;
    }
  }
  return [out];
}

/**
 * `Cast`. Two conversions are not the identity and are easy to skip:
 * float→integer TRUNCATES TOWARD ZERO (JS `Math.trunc`, not `Math.floor` —
 * they differ for every negative non-integer), and anything→bool maps non-zero
 * to exactly 1 rather than preserving the byte.
 */
function cast(ctx: OpContext): Tensor[] {
  const x = need(ctx, 0);
  const to = attrInt(ctx, "to", 0);
  const dtype = dtypeFromCodeChecked(ctx, to);
  const out = make(ctx, x.dims, dtype);
  const src = x.data;
  const dst = out.data;
  if (dtype === "bool") {
    for (let i = 0; i < src.length; i++) dst[i] = src[i] !== 0 ? 1 : 0;
  } else if (!isFloatDType(dtype) && isFloatDType(x.dtype)) {
    for (let i = 0; i < src.length; i++) dst[i] = Math.trunc(src[i]);
  } else if (dtype === "float16") {
    for (let i = 0; i < src.length; i++) dst[i] = roundToFloat16(src[i]);
  } else {
    // Element-by-element rather than `set`, because the two arrays are often
    // different typed-array classes; the assignment's own coercion is what
    // implements the spec's integer wraparound.
    for (let i = 0; i < src.length; i++) dst[i] = src[i];
  }
  return [out];
}

/** `dtypeFromCode`, re-thrown with the node label attached — a bare "unsupported
 *  element type 16" gives no clue which `Cast` in a 114-node graph produced it. */
function dtypeFromCodeChecked(ctx: OpContext, code: number): DType {
  try {
    return dtypeFromCode(code);
  } catch (e) {
    throw new Error(`onnx: ${ctx.label} casts to an unsupported type — ${(e as Error).message}`);
  }
}

/** Round a double through binary16 and back, so a `Cast` to float16 loses the
 *  precision the graph asked it to lose even though storage stays f32. */
function roundToFloat16(v: number): number {
  if (!Number.isFinite(v)) return v;
  const a = Math.abs(v);
  if (a < 6.103515625e-5) {
    // Subnormal: the quantum is fixed at 2^-24 across the whole range.
    return Math.sign(v) * Math.round(a / 2 ** -24) * 2 ** -24;
  }
  if (a > 65504) return Math.sign(v) * Infinity;
  const exp = Math.floor(Math.log2(a));
  const quantum = 2 ** (exp - 10);
  return Math.sign(v) * Math.round(a / quantum) * quantum;
}

// --- registry ----------------------------------------------------------------

const RELU = (x: number): number => (x > 0 ? x : 0);
const SIGMOID = (x: number): number => 1 / (1 + Math.exp(-x));
/** exp(x) - 1 style guard: `log1p`/`expm1` are not used because ONNX defines
 *  Softplus as the plain formula and matching the reference matters more than
 *  the extra accuracy near zero. */
const SOFTPLUS = (x: number): number => Math.log(Math.exp(x) + 1);

export const KERNELS: ReadonlyMap<string, Kernel> = new Map<string, Kernel>([
  // Elementwise binary.
  ["Add", (c) => binary(c, (a, b) => a + b)],
  ["Sub", (c) => binary(c, (a, b) => a - b)],
  ["Mul", (c) => binary(c, (a, b) => a * b)],
  ["Div", (c) => binary(c, divide(c))],
  ["Pow", (c) => binary(c, (a, b) => a ** b)],
  // Comparisons and logic all produce `bool` regardless of operand type.
  ["Equal", (c) => binary(c, (a, b) => (a === b ? 1 : 0), "bool")],
  ["Greater", (c) => binary(c, (a, b) => (a > b ? 1 : 0), "bool")],
  ["GreaterOrEqual", (c) => binary(c, (a, b) => (a >= b ? 1 : 0), "bool")],
  ["Less", (c) => binary(c, (a, b) => (a < b ? 1 : 0), "bool")],
  ["LessOrEqual", (c) => binary(c, (a, b) => (a <= b ? 1 : 0), "bool")],
  ["And", (c) => binary(c, (a, b) => (a !== 0 && b !== 0 ? 1 : 0), "bool")],
  ["Or", (c) => binary(c, (a, b) => (a !== 0 || b !== 0 ? 1 : 0), "bool")],
  ["Xor", (c) => binary(c, (a, b) => ((a !== 0) !== (b !== 0) ? 1 : 0), "bool")],

  // Elementwise unary.
  ["Neg", (c) => unary(c, (x) => -x)],
  ["Abs", (c) => unary(c, Math.abs)],
  ["Sqrt", (c) => unary(c, Math.sqrt)],
  ["Exp", (c) => unary(c, Math.exp)],
  ["Log", (c) => unary(c, Math.log)],
  ["Tanh", (c) => unary(c, Math.tanh)],
  ["Relu", (c) => unary(c, RELU)],
  ["Sigmoid", (c) => unary(c, SIGMOID)],
  ["Softplus", (c) => unary(c, SOFTPLUS)],
  ["Erf", (c) => unary(c, erf)],
  ["Not", (c) => unary(c, (x) => (x === 0 ? 1 : 0), "bool")],
  ["Floor", (c) => unary(c, Math.floor)],
  ["Ceil", (c) => unary(c, Math.ceil)],
  ["Reciprocal", (c) => unary(c, (x) => 1 / x)],
  // `Identity` still copies: the executor recycles buffers, so returning the
  // input tensor object would let a later node's scratch overwrite this value.
  ["Identity", (c) => unary(c, (x) => x)],

  // `Gelu` (opset 20 as an op, but ubiquitous in exported graphs). `tanh` is the
  // approximate mode; `none` is the exact erf form.
  [
    "Gelu",
    (c) => {
      const mode = attrString(c, "approximate", "none");
      return mode === "tanh"
        ? unary(c, (x) => 0.5 * x * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (x + 0.044715 * x * x * x))))
        : unary(c, (x) => 0.5 * x * (1 + erf(x / Math.SQRT2)));
    },
  ],
  ["LeakyRelu", (c) => {
    const alpha = attrFloat(c, "alpha", 0.01);
    return unary(c, (x) => (x >= 0 ? x : alpha * x));
  }],
  ["Elu", (c) => {
    const alpha = attrFloat(c, "alpha", 1);
    return unary(c, (x) => (x >= 0 ? x : alpha * (Math.exp(x) - 1)));
  }],

  // Variadic.
  ["Min", (c) => variadic(c, Math.min)],
  ["Max", (c) => variadic(c, Math.max)],
  ["Sum", (c) => variadic(c, (a, b) => a + b)],

  // Linear algebra.
  ["MatMul", matmul],
  ["Gemm", gemm],

  // Shape.
  ["Transpose", transpose],
  ["Reshape", reshape],
  ["Flatten", flatten],
  ["Squeeze", squeeze],
  ["Unsqueeze", unsqueeze],
  ["Concat", concat],
  ["Slice", slice],
  ["Expand", expand],
  ["Shape", shapeOp],
  ["Size", sizeOp],
  ["Gather", gather],
  ["Split", split],
  ["ConstantOfShape", constantOfShape],
  ["Range", range],
  ["Constant", constant],

  // Reductions. `init` for max/min must be the neutral element of the TYPE, not
  // a universal sentinel: the accumulator IS the output's typed array, so
  // -Infinity written into a Uint8Array lands as 0 and an int8 reduction over
  // all-negative values would then return 0 instead of the real maximum.
  ["ReduceSum", (c) => reduce(c, { init: () => 0, step: (a, v) => a + v })],
  [
    "ReduceMean",
    (c) => reduce(c, { init: () => 0, step: (a, v) => a + v, finish: (a, n) => (n === 0 ? NaN : a / n) }),
  ],
  ["ReduceProd", (c) => reduce(c, { init: () => 1, step: (a, v) => a * v })],
  ["ReduceMax", (c) => reduce(c, { init: lowestValue, step: (a, v) => (v > a ? v : a) })],
  ["ReduceMin", (c) => reduce(c, { init: highestValue, step: (a, v) => (v < a ? v : a) })],
  ["ReduceL1", (c) => reduce(c, { init: () => 0, step: (a, v) => a + Math.abs(v) })],
  ["ReduceL2", (c) => reduce(c, { init: () => 0, step: (a, v) => a + v * v, finish: (a) => Math.sqrt(a) })],
  ["ArgMax", (c) => argReduce(c, (v, best) => v > best)],
  ["ArgMin", (c) => argReduce(c, (v, best) => v < best)],

  // Normalisation, selection, conversion.
  ["LayerNormalization", layerNormalization],
  ["Softmax", softmax],
  ["LogSoftmax", (c) => {
    const probs = softmax(c)[0];
    for (let i = 0; i < probs.data.length; i++) probs.data[i] = Math.log(probs.data[i]);
    return [probs];
  }],
  ["Clip", clip],
  ["Where", where],
  ["Cast", cast],
  ["CastLike", (c) => {
    const target = need(c, 1);
    const sub: OpContext = { ...c, inputs: [need(c, 0)], attrs: new Map(c.attrs) };
    sub.attrs.set("to", { kind: "int", value: codeFromDtype(target.dtype) });
    return cast(sub);
  }],
]);

/** The smallest value a dtype can hold — the identity for `max`. int64/uint64
 *  ride in a Float64Array, so -Infinity survives there as it does for floats. */
function lowestValue(dtype: DType): number {
  switch (dtype) {
    case "float32":
    case "float64":
    case "float16":
    case "int64":
      return -Infinity;
    case "int32":
      return -2147483648;
    case "int16":
      return -32768;
    case "int8":
      return -128;
    default:
      // Every remaining type is unsigned (uint8/16/32/64) or bool.
      return 0;
  }
}

/** The largest value a dtype can hold — the identity for `min`. */
function highestValue(dtype: DType): number {
  switch (dtype) {
    case "float32":
    case "float64":
    case "float16":
    case "int64":
    case "uint64":
      return Infinity;
    case "int32":
      return 2147483647;
    case "int16":
      return 32767;
    case "int8":
      return 127;
    case "uint32":
      return 4294967295;
    case "uint16":
      return 65535;
    case "uint8":
      return 255;
    case "bool":
      return 1;
  }
}

/** Integer division must TRUNCATE for integer tensors and stay real for float
 *  ones. Deciding per-node rather than per-element keeps it out of the loop. */
function divide(ctx: OpContext): (a: number, b: number) => number {
  const a = ctx.inputs[0];
  const isFloat = a === undefined || isFloatDType(a.dtype);
  return isFloat ? (x, y) => x / y : (x, y) => Math.trunc(x / y);
}

/** Ops we deliberately do not implement, mapped to why — so the load-time error
 *  can say what the model needs instead of just "unsupported". */
export const KNOWN_UNIMPLEMENTED: ReadonlyMap<string, string> = new Map([
  ["Conv", "convolution"],
  ["ConvTranspose", "convolution"],
  ["LSTM", "recurrent layer"],
  ["GRU", "recurrent layer"],
  ["RNN", "recurrent layer"],
  ["Loop", "control flow (subgraph)"],
  ["If", "control flow (subgraph)"],
  ["Scan", "control flow (subgraph)"],
  ["SequenceMap", "control flow (subgraph)"],
  ["MaxPool", "pooling"],
  ["AveragePool", "pooling"],
  ["BatchNormalization", "batch normalisation (fold it into the weights first)"],
  ["NonMaxSuppression", "detection post-processing"],
  ["TopK", "sorted selection"],
  ["ScatterND", "scatter"],
  ["ScatterElements", "scatter"],
  ["GatherND", "gather-nd"],
  ["Einsum", "einsum"],
  ["Resize", "resampling"],
  ["Trilu", "triangular masking"],
  ["CumSum", "prefix sum"],
]);
