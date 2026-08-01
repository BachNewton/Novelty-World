// ---------------------------------------------------------------------------
// The value type every kernel consumes and produces: a DENSE, ROW-MAJOR,
// C-contiguous buffer plus a shape. There is deliberately no stride field and
// no view/alias concept — `Transpose` and `Reshape` materialise, they do not
// re-stride.
//
// That is a real cost (a transpose copies) bought for a real property: every
// kernel can assume element `i` of the flat array is element `i` of the logical
// row-major traversal, so the inner loops are plain array indexing with no
// stride arithmetic and no aliasing hazard. In a graph whose largest tensor is
// 64x76 floats, the copy is noise; the class of bug where two tensors share a
// buffer and one kernel writes through the other is not.
//
// INT64 IS STORED IN A Float64Array, not a BigInt64Array. Every int64 in a real
// graph is a shape, an axis, or a `Gather` index — all exact as doubles, and all
// wanted as `number` the moment they reach a kernel. BigInt64Array would force
// a conversion at every use site and cannot be mixed into float arithmetic at
// all. The cost is silent truncation above 2^53, which no shape or index in a
// runnable graph reaches.
// ---------------------------------------------------------------------------

/** The element types this executor can hold. `float16` is stored UPCAST into a
 *  Float32Array — arithmetic happens in f32 and only an explicit `Cast` back to
 *  float16 re-rounds, which matches how every f16 CPU kernel actually behaves. */
export type DType =
  | "float32"
  | "float64"
  | "float16"
  | "int64"
  | "int32"
  | "int16"
  | "int8"
  | "uint64"
  | "uint32"
  | "uint16"
  | "uint8"
  | "bool";

export type TensorData =
  | Float32Array
  | Float64Array
  | Int32Array
  | Int16Array
  | Int8Array
  | Uint32Array
  | Uint16Array
  | Uint8Array;

/** ONNX `TensorProto.DataType` → our `DType`. Types we cannot represent (string,
 *  complex, bfloat16, the 4-bit and 8-bit float variants) are absent, so a model
 *  using one fails at load with the offending code rather than mid-graph. */
const DATA_TYPE_BY_CODE: ReadonlyMap<number, DType> = new Map([
  [1, "float32"],
  [2, "uint8"],
  [3, "int8"],
  [4, "uint16"],
  [5, "int16"],
  [6, "int32"],
  [7, "int64"],
  [9, "bool"],
  [10, "float16"],
  [11, "float64"],
  [12, "uint32"],
  [13, "uint64"],
]);

const CODE_BY_DATA_TYPE: ReadonlyMap<DType, number> = new Map(
  [...DATA_TYPE_BY_CODE].map(([code, name]) => [name, code] as const),
);

/** Names for the ONNX type codes we knowingly do not support, so the load-time
 *  error can say "bfloat16" instead of "17". */
const UNSUPPORTED_TYPE_NAMES: ReadonlyMap<number, string> = new Map([
  [0, "UNDEFINED"],
  [8, "STRING"],
  [14, "COMPLEX64"],
  [15, "COMPLEX128"],
  [16, "BFLOAT16"],
  [17, "FLOAT8E4M3FN"],
  [18, "FLOAT8E4M3FNUZ"],
  [19, "FLOAT8E5M2"],
  [20, "FLOAT8E5M2FNUZ"],
  [21, "UINT4"],
  [22, "INT4"],
  [23, "FLOAT4E2M1"],
]);

export function dtypeFromCode(code: number): DType {
  const dt = DATA_TYPE_BY_CODE.get(code);
  if (dt === undefined) {
    const name = UNSUPPORTED_TYPE_NAMES.get(code);
    throw new Error(
      `onnx: unsupported tensor element type ${name === undefined ? code : `${name} (${code})`}`,
    );
  }
  return dt;
}

export function codeFromDtype(dtype: DType): number {
  const code = CODE_BY_DATA_TYPE.get(dtype);
  if (code === undefined) throw new Error(`onnx: no ONNX type code for ${dtype}`);
  return code;
}

/** True for the types whose arithmetic is real-valued. Drives `Cast` rounding
 *  (float→int truncates toward zero) and the "did this reduce start at -inf or
 *  at the integer minimum" question in `ReduceMax`. */
export function isFloatDType(dtype: DType): boolean {
  return dtype === "float32" || dtype === "float64" || dtype === "float16";
}

/** Allocate the backing store for a dtype. `float16` deliberately lands in a
 *  Float32Array (see the header note); `bool` in a Uint8Array of 0/1. */
export function allocData(dtype: DType, size: number): TensorData {
  switch (dtype) {
    case "float32":
    case "float16":
      return new Float32Array(size);
    case "float64":
    // int64/uint64 ride in a Float64Array so they stay usable as `number`.
    case "int64":
    case "uint64":
      return new Float64Array(size);
    case "int32":
      return new Int32Array(size);
    case "int16":
      return new Int16Array(size);
    case "int8":
      return new Int8Array(size);
    case "uint32":
      return new Uint32Array(size);
    case "uint16":
      return new Uint16Array(size);
    case "uint8":
    case "bool":
      return new Uint8Array(size);
  }
}

export function numElements(dims: readonly number[]): number {
  let n = 1;
  for (let i = 0; i < dims.length; i++) n *= dims[i];
  return n;
}

/** Row-major strides. Kept as a free function rather than a Tensor field because
 *  only a handful of kernels (`Gather`, `Slice`, `Transpose`, broadcasting) need
 *  them, and a per-tensor array would be allocated on every intermediate. */
export function computeStrides(dims: readonly number[]): number[] {
  const strides = new Array<number>(dims.length);
  let acc = 1;
  for (let i = dims.length - 1; i >= 0; i--) {
    strides[i] = acc;
    acc *= dims[i];
  }
  return strides;
}

/** A dense tensor. Immutable in shape; `data` is mutable because kernels write
 *  their output in place into a pooled buffer. */
export class Tensor {
  readonly dims: readonly number[];
  readonly dtype: DType;
  readonly data: TensorData;

  constructor(dims: readonly number[], dtype: DType, data: TensorData) {
    const expected = numElements(dims);
    if (data.length !== expected) {
      throw new Error(
        `onnx: tensor data length ${data.length} does not match shape [${dims.join(",")}] (${expected})`,
      );
    }
    this.dims = dims;
    this.dtype = dtype;
    this.data = data;
  }

  get size(): number {
    return this.data.length;
  }

  get rank(): number {
    return this.dims.length;
  }

  /** The single element of a rank-0 (or 1-element) tensor. Attribute-shaped
   *  inputs like `Clip`'s min/max arrive this way. */
  scalar(): number {
    if (this.data.length !== 1) {
      throw new Error(`onnx: expected a scalar tensor, got shape [${this.dims.join(",")}]`);
    }
    return this.data[0];
  }

  /** Contents as a plain number array. Used for the small integer tensors that
   *  opset 13+ turned from attributes into inputs (axes, starts, ends, steps,
   *  the target shape of `Reshape`). */
  toNumbers(): number[] {
    const out = new Array<number>(this.data.length);
    for (let i = 0; i < this.data.length; i++) out[i] = this.data[i];
    return out;
  }

  /** A tensor over the SAME buffer with a different shape. Safe precisely
   *  because the layout is always dense row-major, so a reshape is a relabel. */
  reshape(dims: readonly number[]): Tensor {
    return new Tensor(dims, this.dtype, this.data);
  }

  /** A tensor over the same buffer reinterpreted as another dtype. Only legal
   *  when the storage arrays coincide (bool↔uint8, float16↔float32); it is a
   *  relabel, never a conversion — `Cast` does conversions. */
  asDType(dtype: DType): Tensor {
    return new Tensor(this.dims, dtype, this.data);
  }

  clone(): Tensor {
    const copy = allocData(this.dtype, this.data.length);
    copy.set(this.data);
    return new Tensor(this.dims.slice(), this.dtype, copy);
  }
}

/** Build a tensor from a nested-free flat list. Test-facing convenience. */
export function tensorOf(dims: readonly number[], values: readonly number[], dtype: DType = "float32"): Tensor {
  const data = allocData(dtype, values.length);
  for (let i = 0; i < values.length; i++) data[i] = values[i];
  return new Tensor(dims, dtype, data);
}

/**
 * Multidirectional broadcasting (ONNX's rule, which is NumPy's): right-align
 * the shapes, then each axis must be equal or one of them must be 1, and the
 * result takes the max.
 *
 * The zero-length dimension is the case worth spelling out: `[0]` and `[1]`
 * broadcast to `[0]`, not `[1]`, because a size-1 axis stretches to whatever
 * the other operand says — including nothing. Getting that backwards produces a
 * tensor with elements that have no source.
 */
export function broadcastShapes(a: readonly number[], b: readonly number[]): number[] {
  const rank = Math.max(a.length, b.length);
  const out = new Array<number>(rank);
  for (let i = 0; i < rank; i++) {
    const da = i < rank - a.length ? 1 : a[i - (rank - a.length)];
    const db = i < rank - b.length ? 1 : b[i - (rank - b.length)];
    if (da === db) {
      out[i] = da;
    } else if (da === 1) {
      out[i] = db;
    } else if (db === 1) {
      out[i] = da;
    } else {
      throw new Error(
        `onnx: shapes [${a.join(",")}] and [${b.join(",")}] are not broadcast-compatible on axis ${i}`,
      );
    }
  }
  return out;
}

/**
 * Strides for reading `dims` as if it had already been broadcast to `target`.
 *
 * The trick that makes broadcasting free: a stretched axis gets stride 0, so
 * advancing along it re-reads the same element. The caller then walks the
 * OUTPUT shape with ordinary nested counters and indexes each input through its
 * own stride vector — one code path whether or not any stretching happens.
 */
export function broadcastStrides(dims: readonly number[], target: readonly number[]): number[] {
  const rank = target.length;
  const own = computeStrides(dims);
  const offset = rank - dims.length;
  const out = new Array<number>(rank);
  for (let i = 0; i < rank; i++) {
    if (i < offset) {
      out[i] = 0;
    } else {
      const d = dims[i - offset];
      out[i] = d === 1 && target[i] !== 1 ? 0 : own[i - offset];
    }
  }
  return out;
}

/** Resolve a possibly-negative axis against a rank, ONNX-style: `-1` is the last
 *  axis. Every op that takes an `axis` attribute accepts the negative form. */
export function normalizeAxis(axis: number, rank: number, opName: string): number {
  const a = axis < 0 ? axis + rank : axis;
  if (a < 0 || a >= rank) {
    throw new Error(`onnx: ${opName} axis ${axis} out of range for rank ${rank}`);
  }
  return a;
}

/** As `normalizeAxis`, but permits `axis === rank` — the position "just past the
 *  end", which `Unsqueeze` and `Concat`-of-new-axis legitimately name. */
export function normalizeAxisInclusive(axis: number, rank: number, opName: string): number {
  const a = axis < 0 ? axis + rank : axis;
  if (a < 0 || a > rank) {
    throw new Error(`onnx: ${opName} axis ${axis} out of range for rank ${rank}`);
  }
  return a;
}

export function sameShape(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
