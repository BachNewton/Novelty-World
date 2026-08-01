// Unit tests for the kernel library.
//
// Every numeric expectation here is hand-computed or written as the literal
// arithmetic that defines the op — never as "whatever the engine produced".
// The areas that get the most attention are the ones where ONNX has a rule that
// a from-memory implementation reliably gets wrong: the opset-13/18 migration
// of parameters from attributes to inputs (and the three-state `Reduce*` axes
// table it created), `Slice`'s step-sign-dependent clamping, `Gemm`'s
// alpha/beta composition, `LayerNormalization`'s biased variance, and `Cast`'s
// truncation toward zero.

import { describe, expect, it } from "vitest";
import { DIRECT_ALLOCATOR, KERNELS } from "./ops";
import { Tensor, tensorOf } from "./tensor";
import type { AttributeValue } from "./model";

function run(
  opType: string,
  inputs: (Tensor | undefined)[],
  attrs: Record<string, AttributeValue> = {},
  opts: { opset?: number; outputCount?: number } = {},
): Tensor[] {
  const kernel = KERNELS.get(opType);
  if (kernel === undefined) throw new Error(`no kernel ${opType}`);
  return kernel({
    inputs,
    attrs: new Map(Object.entries(attrs)),
    opset: opts.opset ?? 18,
    outputCount: opts.outputCount ?? 1,
    alloc: DIRECT_ALLOCATOR,
    label: opType,
  });
}

/** The single output of a single-output op. */
function one(
  opType: string,
  inputs: (Tensor | undefined)[],
  attrs: Record<string, AttributeValue> = {},
  opts: { opset?: number; outputCount?: number } = {},
): Tensor {
  return run(opType, inputs, attrs, opts)[0];
}

function vals(t: Tensor): number[] {
  return Array.from(t.data);
}

/** Int64 tensor, the form opset 13+ uses for axes/starts/ends/steps/shape. */
function i64(dims: readonly number[], values: readonly number[]): Tensor {
  return tensorOf(dims, values, "int64");
}

const ints = (value: number[]): AttributeValue => ({ kind: "ints", value });
const int = (value: number): AttributeValue => ({ kind: "int", value });
const flt = (value: number): AttributeValue => ({ kind: "float", value });
const str = (value: string): AttributeValue => ({ kind: "string", value });

/** Largest absolute difference, for float comparisons over a whole tensor. */
function maxAbsDiff(actual: readonly number[], expected: readonly number[]): number {
  expect(actual.length).toBe(expected.length);
  let worst = 0;
  for (let i = 0; i < actual.length; i++) worst = Math.max(worst, Math.abs(actual[i] - expected[i]));
  return worst;
}

/** Sequential test data: 0,1,2,... */
function iota(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

// =============================================================================
// Broadcasting
// =============================================================================

describe("broadcasting (Add / Sub / Mul / Div)", () => {
  it("adds equal shapes elementwise", () => {
    const y = one("Add", [tensorOf([2, 2], [1, 2, 3, 4]), tensorOf([2, 2], [10, 20, 30, 40])]);
    expect(y.dims).toEqual([2, 2]);
    expect(vals(y)).toEqual([11, 22, 33, 44]);
  });

  it("broadcasts a scalar against a tensor from either side", () => {
    expect(vals(one("Mul", [tensorOf([3], [1, 2, 3]), tensorOf([], [2])]))).toEqual([2, 4, 6]);
    expect(vals(one("Sub", [tensorOf([], [10]), tensorOf([3], [1, 2, 3])]))).toEqual([9, 8, 7]);
  });

  it("right-aligns a rank-1 operand: [2,3] + [3]", () => {
    const y = one("Add", [tensorOf([2, 3], [1, 2, 3, 4, 5, 6]), tensorOf([3], [10, 20, 30])]);
    expect(y.dims).toEqual([2, 3]);
    expect(vals(y)).toEqual([11, 22, 33, 14, 25, 36]);
  });

  // Both operands stretch, in different axes. Verified element by element:
  // out[i,j,k] = a[i,0,k] + b[0,j,0].
  it("stretches both operands: [2,1,3] + [1,4,1] -> [2,4,3]", () => {
    const a = tensorOf([2, 1, 3], [1, 2, 3, 4, 5, 6]);
    const b = tensorOf([1, 4, 1], [10, 20, 30, 40]);
    const y = one("Add", [a, b]);
    expect(y.dims).toEqual([2, 4, 3]);
    expect(vals(y)).toEqual([
      11, 12, 13, 21, 22, 23, 31, 32, 33, 41, 42, 43, // i = 0
      14, 15, 16, 24, 25, 26, 34, 35, 36, 44, 45, 46, // i = 1
    ]);
  });

  it("produces an outer sum from [3,1] and [1,4]", () => {
    const y = one("Add", [tensorOf([3, 1], [1, 2, 3]), tensorOf([1, 4], [10, 20, 30, 40])]);
    expect(y.dims).toEqual([3, 4]);
    expect(vals(y)).toEqual([11, 21, 31, 41, 12, 22, 32, 42, 13, 23, 33, 43]);
  });

  // [4] right-aligns onto [2,3,4] with every shared axis EQUAL, so the small
  // operand tiles contiguously — the "bias add" fast path.
  it("takes the trailing-block fast path for [2,3,4] + [4]", () => {
    const y = one("Add", [tensorOf([2, 3, 4], iota(24)), tensorOf([4], [100, 200, 300, 400])]);
    expect(y.dims).toEqual([2, 3, 4]);
    expect(vals(y)).toEqual([
      100, 201, 302, 403, 104, 205, 306, 407, 108, 209, 310, 411,
      112, 213, 314, 415, 116, 217, 318, 419, 120, 221, 322, 423,
    ]);
  });

  // [3,1] has a size-1 axis INSIDE the overlap, so the repeat is not a simple
  // wrap and the general per-axis odometer must handle it. out[i,j,k] = a + b[j].
  it("takes the general odometer path for [2,3,4] + [3,1]", () => {
    const y = one("Add", [tensorOf([2, 3, 4], iota(24)), tensorOf([3, 1], [10, 20, 30])]);
    expect(y.dims).toEqual([2, 3, 4]);
    expect(vals(y)).toEqual([
      10, 11, 12, 13, 24, 25, 26, 27, 38, 39, 40, 41,
      22, 23, 24, 25, 36, 37, 38, 39, 50, 51, 52, 53,
    ]);
  });

  it("divides floats exactly", () => {
    expect(vals(one("Div", [tensorOf([3], [1, 2, 3]), tensorOf([], [2])]))).toEqual([0.5, 1, 1.5]);
  });

  // Integer division TRUNCATES toward zero, which differs from floor for every
  // negative non-exact quotient.
  it("truncates integer division toward zero", () => {
    const y = one("Div", [tensorOf([3], [7, -7, 8], "int32"), tensorOf([3], [2, 2, 2], "int32")]);
    expect(y.dtype).toBe("int32");
    expect(vals(y)).toEqual([3, -3, 4]);
  });

  it("rejects shapes that cannot broadcast", () => {
    expect(() => one("Add", [tensorOf([2, 3], iota(6)), tensorOf([4], iota(4))])).toThrow(
      /not broadcast-compatible/,
    );
  });

  it("rejects mismatched operand types", () => {
    expect(() => one("Add", [tensorOf([2], [1, 2]), tensorOf([2], [1, 2], "int32")])).toThrow(
      /mismatched types float32 and int32/,
    );
  });

  it("tolerates the bool/uint8 label mix, which share a representation", () => {
    const y = one("Add", [tensorOf([2], [1, 2], "uint8"), tensorOf([2], [1, 1], "bool")]);
    expect(y.dtype).toBe("uint8");
    expect(vals(y)).toEqual([2, 3]);
  });

  it("Pow raises elementwise", () => {
    expect(vals(one("Pow", [tensorOf([3], [2, 3, 4]), tensorOf([], [2])]))).toEqual([4, 9, 16]);
  });
});

// =============================================================================
// Slice
// =============================================================================

describe("Slice", () => {
  const x10 = tensorOf([10], iota(10));

  it("slices forward on one axis", () => {
    const y = one("Slice", [x10, i64([1], [2]), i64([1], [5]), i64([1], [0]), i64([1], [1])]);
    expect(y.dims).toEqual([3]);
    expect(vals(y)).toEqual([2, 3, 4]);
  });

  it("counts negative starts and ends from the end of the axis", () => {
    const y = one("Slice", [x10, i64([1], [-3]), i64([1], [-1]), i64([1], [0]), i64([1], [1])]);
    expect(vals(y)).toEqual([7, 8]);
  });

  it("honours a step greater than one", () => {
    // indices 1,3,5,7 — count = ceil((8-1)/2) = 4
    const y = one("Slice", [x10, i64([1], [1]), i64([1], [8]), i64([1], [0]), i64([1], [2])]);
    expect(vals(y)).toEqual([1, 3, 5, 7]);
  });

  // A backward slice needs to name "one before index 0" as its exclusive end,
  // which is why the end clamps to -1 rather than to 0 when the step is
  // negative. Clamping to 0 silently drops the first element.
  it("reverses a 1-D tensor with a negative step", () => {
    const y = one("Slice", [tensorOf([4], [1, 2, 3, 4]), i64([1], [-1]), i64([1], [-5]), i64([1], [0]), i64([1], [-1])]);
    expect(y.dims).toEqual([4]);
    expect(vals(y)).toEqual([4, 3, 2, 1]);
  });

  it("clamps a far-negative end to -1 under a negative step", () => {
    const y = one("Slice", [
      tensorOf([4], [1, 2, 3, 4]),
      i64([1], [-1]),
      i64([1], [-100]),
      i64([1], [0]),
      i64([1], [-1]),
    ]);
    expect(vals(y)).toEqual([4, 3, 2, 1]);
  });

  it("treats INT64_MIN as 'all the way back' under a negative step", () => {
    const y = one("Slice", [
      tensorOf([4], [1, 2, 3, 4]),
      i64([1], [-1]),
      i64([1], [-9223372036854775808]),
      i64([1], [0]),
      i64([1], [-1]),
    ]);
    expect(vals(y)).toEqual([4, 3, 2, 1]);
  });

  // `x[..., 3:]` exports as an INT64_MAX end, which arrives here as a huge
  // double and must clamp to the axis length rather than overflow the count.
  it("treats INT64_MAX as 'to the end'", () => {
    const y = one("Slice", [x10, i64([1], [3]), i64([1], [9223372036854775807]), i64([1], [0]), i64([1], [1])]);
    expect(vals(y)).toEqual([3, 4, 5, 6, 7, 8, 9]);
  });

  it("defaults axes to 0..n and steps to 1 when both are omitted", () => {
    const y = one("Slice", [x10, i64([1], [1]), i64([1], [3])]);
    expect(vals(y)).toEqual([1, 2]);
  });

  it("slices multiple axes at once", () => {
    // [3,4] of 0..11; rows 1..2 and columns 1..2.
    const y = one("Slice", [tensorOf([3, 4], iota(12)), i64([2], [1, 1]), i64([2], [3, 3]), i64([2], [0, 1])]);
    expect(y.dims).toEqual([2, 2]);
    expect(vals(y)).toEqual([5, 6, 9, 10]);
  });

  it("takes an unlisted axis whole", () => {
    // [2,3] of 0..5, slicing only axis 1 to [1,2) leaves axis 0 intact.
    const y = one("Slice", [tensorOf([2, 3], iota(6)), i64([1], [1]), i64([1], [2]), i64([1], [1])]);
    expect(y.dims).toEqual([2, 1]);
    expect(vals(y)).toEqual([1, 4]);
  });

  it("produces an empty result when the range is empty", () => {
    const y = one("Slice", [x10, i64([1], [5]), i64([1], [5])]);
    expect(y.dims).toEqual([0]);
    expect(vals(y)).toEqual([]);
  });

  it("rejects a zero step", () => {
    expect(() => one("Slice", [x10, i64([1], [0]), i64([1], [4]), i64([1], [0]), i64([1], [0])])).toThrow(
      /step is zero/,
    );
  });

  it("rejects a repeated axis", () => {
    expect(() => one("Slice", [x10, i64([2], [0, 1]), i64([2], [4, 5]), i64([2], [0, 0])])).toThrow(
      /names axis 0 more than once/,
    );
  });

  // Pre-opset-10 graphs carry starts/ends/axes as ATTRIBUTES; one binary has to
  // run both eras, so the attribute form must give identical output.
  it("accepts the legacy attribute form", () => {
    const y = one("Slice", [x10], { starts: ints([2]), ends: ints([5]), axes: ints([0]) });
    expect(vals(y)).toEqual([2, 3, 4]);
  });

  it("accepts the legacy attribute form with no axes", () => {
    const y = one("Slice", [tensorOf([2, 3], iota(6))], { starts: ints([1]), ends: ints([2]) });
    expect(y.dims).toEqual([1, 3]);
    expect(vals(y)).toEqual([3, 4, 5]);
  });
});

// =============================================================================
// Gemm
// =============================================================================

describe("Gemm", () => {
  // A (2x3) x B (3x2):
  //   [1 2 3]   [ 7  8]   [1*7+2*9+3*11  1*8+2*10+3*12]   [ 58  64]
  //   [4 5 6] x [ 9 10] = [4*7+5*9+6*11  4*8+5*10+6*12] = [139 154]
  //             [11 12]
  const A = () => tensorOf([2, 3], [1, 2, 3, 4, 5, 6]);
  const B = () => tensorOf([3, 2], [7, 8, 9, 10, 11, 12]);
  const AT = () => tensorOf([3, 2], [1, 4, 2, 5, 3, 6]); // A transposed
  const BT = () => tensorOf([2, 3], [7, 9, 11, 8, 10, 12]); // B transposed
  const PRODUCT = [58, 64, 139, 154];

  it("multiplies with neither operand transposed", () => {
    const y = one("Gemm", [A(), B()]);
    expect(y.dims).toEqual([2, 2]);
    expect(vals(y)).toEqual(PRODUCT);
  });

  it("honours transA", () => {
    expect(vals(one("Gemm", [AT(), B()], { transA: int(1) }))).toEqual(PRODUCT);
  });

  it("honours transB", () => {
    expect(vals(one("Gemm", [A(), BT()], { transB: int(1) }))).toEqual(PRODUCT);
  });

  it("honours transA and transB together", () => {
    expect(vals(one("Gemm", [AT(), BT()], { transA: int(1), transB: int(1) }))).toEqual(PRODUCT);
  });

  it("scales the product by alpha when C is absent", () => {
    expect(vals(one("Gemm", [A(), B()], { alpha: flt(2) }))).toEqual([116, 128, 278, 308]);
  });

  it("adds beta * C broadcast from a row vector [n]", () => {
    // 58+3*1, 64+3*2, 139+3*1, 154+3*2
    const y = one("Gemm", [A(), B(), tensorOf([2], [1, 2])], { beta: flt(3) });
    expect(vals(y)).toEqual([61, 70, 142, 160]);
  });

  it("adds C given as [1,n]", () => {
    expect(vals(one("Gemm", [A(), B(), tensorOf([1, 2], [1, 2])]))).toEqual([59, 66, 140, 156]);
  });

  it("adds C given in full as [m,n]", () => {
    const y = one("Gemm", [A(), B(), tensorOf([2, 2], [1, 2, 3, 4])]);
    expect(vals(y)).toEqual([59, 66, 142, 158]);
  });

  it("adds C given as a scalar", () => {
    expect(vals(one("Gemm", [A(), B(), tensorOf([], [10])]))).toEqual([68, 74, 149, 164]);
  });

  it("ignores C entirely when beta is 0", () => {
    expect(vals(one("Gemm", [A(), B(), tensorOf([2], [1000, 1000])], { beta: flt(0) }))).toEqual(PRODUCT);
  });

  // ENGINE BUG. ONNX defines Gemm as Y = alpha * (A' x B') + beta * C — alpha
  // scales ONLY the product. The kernel seeds the output with beta*C, lets the
  // matmul accumulate on top, and THEN multiplies everything by alpha, so it
  // computes alpha*(A'xB') + alpha*beta*C. With alpha=2, beta=3, C=[1,2] the
  // correct first element is 2*58 + 3*1 = 119; the kernel returns 2*(58+3) = 122.
  it("applies alpha to the product only, not to beta * C", () => {
    const y = one("Gemm", [A(), B(), tensorOf([2], [1, 2])], { alpha: flt(2), beta: flt(3) });
    expect(vals(y)).toEqual([119, 134, 281, 314]);
  });

  it("rejects non-2-D operands", () => {
    expect(() => one("Gemm", [tensorOf([2, 2, 2], iota(8)), B()])).toThrow(/requires 2-D A and B/);
  });

  it("rejects a disagreeing inner dimension", () => {
    expect(() => one("Gemm", [A(), tensorOf([2, 2], iota(4))])).toThrow(/inner dimensions disagree/);
  });
});

// =============================================================================
// MatMul
// =============================================================================

describe("MatMul", () => {
  it("multiplies two matrices", () => {
    const y = one("MatMul", [tensorOf([2, 3], [1, 2, 3, 4, 5, 6]), tensorOf([3, 2], [7, 8, 9, 10, 11, 12])]);
    expect(y.dims).toEqual([2, 2]);
    expect(vals(y)).toEqual([58, 64, 139, 154]);
  });

  // A 1-D LHS is promoted to a row vector and the PREPENDED axis is removed
  // afterwards, so the result is rank 1, not rank 2.
  it("promotes a 1-D LHS and drops the prepended axis", () => {
    const y = one("MatMul", [tensorOf([3], [1, 2, 3]), tensorOf([3, 2], [7, 8, 9, 10, 11, 12])]);
    expect(y.dims).toEqual([2]);
    expect(vals(y)).toEqual([58, 64]);
  });

  it("promotes a 1-D RHS and drops the appended axis", () => {
    // [1 2 3; 4 5 6] x [1 2 3]^T = [1+4+9, 4+10+18]
    const y = one("MatMul", [tensorOf([2, 3], [1, 2, 3, 4, 5, 6]), tensorOf([3], [1, 2, 3])]);
    expect(y.dims).toEqual([2]);
    expect(vals(y)).toEqual([14, 32]);
  });

  // ENGINE BUG. numpy.matmul (which ONNX MatMul follows) says two 1-D operands
  // give the inner product as a SCALAR — shape []. The kernel removes the
  // appended axis, then tries to remove the prepended one with an index
  // expression that, on the now length-1 shape, re-appends it: the value is
  // right (32) but the shape comes back as [1].
  it("returns a rank-0 scalar for the dot product of two 1-D operands", () => {
    const y = one("MatMul", [tensorOf([3], [1, 2, 3]), tensorOf([3], [4, 5, 6])]);
    expect(vals(y)).toEqual([32]);
    expect(y.dims).toEqual([]);
  });

  it("multiplies batched 3-D operands independently per batch", () => {
    const a = tensorOf([2, 2, 3], [1, 2, 3, 4, 5, 6, 1, 0, 0, 0, 1, 0]);
    const b = tensorOf([2, 3, 2], [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6]);
    const y = one("MatMul", [a, b]);
    expect(y.dims).toEqual([2, 2, 2]);
    // batch 0 is the 2x3 by 3x2 above; batch 1 selects rows 0 and 1 of b[1].
    expect(vals(y)).toEqual([58, 64, 139, 154, 1, 2, 3, 4]);
  });

  it("broadcasts a 2-D RHS across the LHS batch: [2,3,4] x [4,5]", () => {
    // All-ones operands: every output element is the inner dimension, 4.
    const y = one("MatMul", [tensorOf([2, 3, 4], new Array<number>(24).fill(1)), tensorOf([4, 5], new Array<number>(20).fill(1))]);
    expect(y.dims).toEqual([2, 3, 5]);
    expect(vals(y)).toEqual(new Array<number>(30).fill(4));
  });

  it("broadcasts a size-1 batch axis: [1,3,4] x [2,4,5]", () => {
    const a = tensorOf([1, 3, 4], new Array<number>(12).fill(1));
    // batch 0 of b is all ones, batch 1 is all twos.
    const b = tensorOf([2, 4, 5], [...new Array<number>(20).fill(1), ...new Array<number>(20).fill(2)]);
    const y = one("MatMul", [a, b]);
    expect(y.dims).toEqual([2, 3, 5]);
    expect(vals(y)).toEqual([...new Array<number>(15).fill(4), ...new Array<number>(15).fill(8)]);
  });

  it("rejects a disagreeing inner dimension", () => {
    expect(() => one("MatMul", [tensorOf([2, 3], iota(6)), tensorOf([2, 2], iota(4))])).toThrow(
      /inner dimensions disagree/,
    );
  });
});

// =============================================================================
// LayerNormalization
// =============================================================================

describe("LayerNormalization", () => {
  it("normalises with the BIASED (population) variance", () => {
    // x = [1,2,3,4]: mean 2.5; population variance = (2.25+0.25+0.25+2.25)/4
    // = 1.25. The SAMPLE variance would be 5/3 = 1.6667, which is what an
    // implementation reaching for a stats helper gets — and it is wrong here.
    const y = one("LayerNormalization", [tensorOf([1, 4], [1, 2, 3, 4]), tensorOf([4], [1, 1, 1, 1])]);
    const inv = 1 / Math.sqrt(1.25 + 1e-5);
    const expected = [-1.5 * inv, -0.5 * inv, 0.5 * inv, 1.5 * inv];
    expect(y.dims).toEqual([1, 4]);
    expect(maxAbsDiff(vals(y), expected)).toBeLessThan(1e-5);

    // The same assertion stated as a falsifier: the sample-variance answer is
    // ~10% smaller in magnitude and must NOT be what came back.
    const sampleInv = 1 / Math.sqrt(5 / 3 + 1e-5);
    expect(Math.abs(vals(y)[0] - -1.5 * sampleInv)).toBeGreaterThan(1e-2);
  });

  it("puts epsilon INSIDE the square root", () => {
    // With eps = 3.75 and variance 1.25, inside gives 1/sqrt(5) = 0.4472136;
    // outside would give 1/(sqrt(1.25)+3.75) = 0.2054... — a 2x difference.
    const y = one(
      "LayerNormalization",
      [tensorOf([1, 4], [1, 2, 3, 4]), tensorOf([4], [1, 1, 1, 1])],
      { epsilon: flt(3.75) },
    );
    const inv = 1 / Math.sqrt(1.25 + 3.75);
    expect(maxAbsDiff(vals(y), [-1.5 * inv, -0.5 * inv, 0.5 * inv, 1.5 * inv])).toBeLessThan(1e-6);
    const outside = 1 / (Math.sqrt(1.25) + 3.75);
    expect(Math.abs(vals(y)[0] - -1.5 * outside)).toBeGreaterThan(0.1);
  });

  it("applies a non-trivial scale and bias per normalised element", () => {
    const y = one("LayerNormalization", [
      tensorOf([1, 4], [1, 2, 3, 4]),
      tensorOf([4], [1, 2, 3, 4]),
      tensorOf([4], [10, 20, 30, 40]),
    ]);
    const inv = 1 / Math.sqrt(1.25 + 1e-5);
    const normed = [-1.5 * inv, -0.5 * inv, 0.5 * inv, 1.5 * inv];
    const expected = [normed[0] * 1 + 10, normed[1] * 2 + 20, normed[2] * 3 + 30, normed[3] * 4 + 40];
    expect(maxAbsDiff(vals(y), expected)).toBeLessThan(1e-4);
  });

  // `axis` names the FIRST normalised axis; everything AFTER it is normalised
  // jointly. axis=1 on a rank-3 tensor therefore pools the last TWO axes, not
  // just axis 1.
  it("normalises over every axis from `axis` to the end", () => {
    // Row 0 = [1..6]: mean 3.5, population variance 17.5/6.
    // Row 1 = [0,0,0,0,0,6]: mean 1, population variance 30/6 = 5.
    const x = tensorOf([2, 2, 3], [1, 2, 3, 4, 5, 6, 0, 0, 0, 0, 0, 6]);
    const y = one("LayerNormalization", [x, tensorOf([1], [1])], { axis: int(1) });
    expect(y.dims).toEqual([2, 2, 3]);

    const inv0 = 1 / Math.sqrt(17.5 / 6 + 1e-5);
    const inv1 = 1 / Math.sqrt(5 + 1e-5);
    const expected = [
      (1 - 3.5) * inv0, (2 - 3.5) * inv0, (3 - 3.5) * inv0,
      (4 - 3.5) * inv0, (5 - 3.5) * inv0, (6 - 3.5) * inv0,
      (0 - 1) * inv1, (0 - 1) * inv1, (0 - 1) * inv1,
      (0 - 1) * inv1, (0 - 1) * inv1, (6 - 1) * inv1,
    ];
    expect(maxAbsDiff(vals(y), expected)).toBeLessThan(1e-5);
  });

  it("normalises each row independently under the default axis of -1", () => {
    const x = tensorOf([2, 4], [1, 2, 3, 4, 10, 20, 30, 40]);
    const y = one("LayerNormalization", [x, tensorOf([4], [1, 1, 1, 1])]);
    const inv0 = 1 / Math.sqrt(1.25 + 1e-5);
    // Row 1 is row 0 scaled by 10: mean 25, variance 125.
    const inv1 = 1 / Math.sqrt(125 + 1e-5);
    const expected = [
      -1.5 * inv0, -0.5 * inv0, 0.5 * inv0, 1.5 * inv0,
      -15 * inv1, -5 * inv1, 5 * inv1, 15 * inv1,
    ];
    expect(maxAbsDiff(vals(y), expected)).toBeLessThan(1e-5);
  });
});

// =============================================================================
// Gather
// =============================================================================

describe("Gather", () => {
  const data = () => tensorOf([3, 3], [1, 2, 3, 4, 5, 6, 7, 8, 9]);

  it("gathers rows on axis 0", () => {
    const y = one("Gather", [data(), i64([2], [2, 0])]);
    expect(y.dims).toEqual([2, 3]);
    expect(vals(y)).toEqual([7, 8, 9, 1, 2, 3]);
  });

  it("gathers columns on axis 1", () => {
    const y = one("Gather", [data(), i64([2], [2, 0])], { axis: int(1) });
    expect(y.dims).toEqual([3, 2]);
    expect(vals(y)).toEqual([3, 1, 6, 4, 9, 7]);
  });

  it("counts negative indices from the end of the gathered axis", () => {
    const y = one("Gather", [data(), i64([2], [-1, -3])]);
    expect(y.dims).toEqual([2, 3]);
    expect(vals(y)).toEqual([7, 8, 9, 1, 2, 3]);
  });

  // Output rank is data.rank - 1 + indices.rank, so a rank-0 index tensor DROPS
  // the gathered axis entirely rather than leaving a size-1 stub.
  it("drops the axis for a rank-0 index tensor", () => {
    const y = one("Gather", [data(), i64([], [1])]);
    expect(y.dims).toEqual([3]);
    expect(vals(y)).toEqual([4, 5, 6]);
  });

  it("grows the rank for a 2-D index tensor", () => {
    const y = one("Gather", [data(), i64([2, 2], [0, 1, 2, 0])]);
    expect(y.dims).toEqual([2, 2, 3]);
    expect(vals(y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 1, 2, 3]);
  });

  it("gathers from a rank-1 table", () => {
    const y = one("Gather", [tensorOf([4], [10, 20, 30, 40]), i64([2], [3, 1])]);
    expect(y.dims).toEqual([2]);
    expect(vals(y)).toEqual([40, 20]);
  });

  it("rejects an out-of-range index in either direction", () => {
    expect(() => one("Gather", [data(), i64([1], [3])])).toThrow(/index 3 out of range/);
    expect(() => one("Gather", [data(), i64([1], [-4])])).toThrow(/index -4 out of range/);
  });
});

// =============================================================================
// Where
// =============================================================================

describe("Where", () => {
  it("selects elementwise from a same-shaped bool condition", () => {
    const y = one("Where", [
      tensorOf([3], [1, 0, 1], "bool"),
      tensorOf([3], [1, 2, 3]),
      tensorOf([3], [10, 20, 30]),
    ]);
    expect(y.dims).toEqual([3]);
    expect(vals(y)).toEqual([1, 20, 3]);
  });

  // bool and uint8 share a Uint8Array, and exporters mix the labels; the mask
  // in a real graph arrives as uint8 and is Cast to bool, so both must work.
  it("accepts a uint8 condition as well as a bool one", () => {
    const y = one("Where", [
      tensorOf([3], [1, 0, 5], "uint8"),
      tensorOf([3], [1, 2, 3]),
      tensorOf([3], [10, 20, 30]),
    ]);
    expect(vals(y)).toEqual([1, 20, 3]);
  });

  it("treats any non-zero byte as true", () => {
    const y = one("Where", [tensorOf([2], [7, 0], "uint8"), tensorOf([2], [1, 1]), tensorOf([2], [9, 9])]);
    expect(vals(y)).toEqual([1, 9]);
  });

  // The condition broadcasts against BOTH branches at once — a three-way
  // multidirectional broadcast, not two pairwise ones.
  it("broadcasts the condition against both branches simultaneously", () => {
    const y = one("Where", [
      tensorOf([2, 1], [1, 0], "bool"),
      tensorOf([1, 3], [1, 2, 3]),
      tensorOf([3], [100, 200, 300]),
    ]);
    expect(y.dims).toEqual([2, 3]);
    expect(vals(y)).toEqual([1, 2, 3, 100, 200, 300]);
  });

  it("broadcasts a scalar condition", () => {
    const y = one("Where", [tensorOf([], [0], "bool"), tensorOf([2], [1, 2]), tensorOf([2], [3, 4])]);
    expect(vals(y)).toEqual([3, 4]);
  });
});

// =============================================================================
// Reductions
// =============================================================================

describe("Reduce* axes semantics", () => {
  // [[1,2,3],[4,5,6]]
  const x = () => tensorOf([2, 3], [1, 2, 3, 4, 5, 6]);

  it("reduces the last axis with axes as an INPUT", () => {
    const y = one("ReduceSum", [x(), i64([1], [1])]);
    expect(y.dims).toEqual([2, 1]);
    expect(vals(y)).toEqual([6, 15]);
  });

  it("reduces the last axis with axes as a legacy ATTRIBUTE", () => {
    const y = one("ReduceSum", [x()], { axes: ints([1]) });
    expect(y.dims).toEqual([2, 1]);
    expect(vals(y)).toEqual([6, 15]);
  });

  it("drops the reduced axis under keepdims=0", () => {
    const y = one("ReduceSum", [x(), i64([1], [1])], { keepdims: int(0) });
    expect(y.dims).toEqual([2]);
    expect(vals(y)).toEqual([6, 15]);
  });

  it("reduces the FIRST axis with keepdims=0", () => {
    const y = one("ReduceSum", [x(), i64([1], [0])], { keepdims: int(0) });
    expect(y.dims).toEqual([3]);
    expect(vals(y)).toEqual([5, 7, 9]);
  });

  // ENGINE BUG. With keepdims=1 the output keeps a size-1 entry for every
  // reduced axis, but the kernel's input-axis -> output-stride map advances its
  // cursor into `outStrides` only for the KEPT axes. Whenever a reduced axis
  // comes before a kept one, every later axis reads the wrong stride: here
  // axis 1 gets stride 3 instead of 1, so two of the three column sums are
  // written past the end of a 3-element buffer and silently dropped. Correct
  // output is [[5,7,9]]; the kernel returns [[5,0,0]].
  it("reduces the FIRST axis with keepdims=1", () => {
    const y = one("ReduceSum", [x(), i64([1], [0])]);
    expect(y.dims).toEqual([1, 3]);
    expect(vals(y)).toEqual([5, 7, 9]);
  });

  it("accepts negative axes", () => {
    const y = one("ReduceSum", [x(), i64([1], [-1])]);
    expect(y.dims).toEqual([2, 1]);
    expect(vals(y)).toEqual([6, 15]);
  });

  it("reduces several axes at once", () => {
    const y = one("ReduceSum", [x(), i64([2], [0, 1])]);
    expect(y.dims).toEqual([1, 1]);
    expect(vals(y)).toEqual([21]);
  });

  it("reduces every axis when axes are absent", () => {
    const y = one("ReduceSum", [x()]);
    expect(y.dims).toEqual([1, 1]);
    expect(vals(y)).toEqual([21]);
  });

  it("reduces to a true scalar when axes are absent and keepdims=0", () => {
    const y = one("ReduceSum", [x()], { keepdims: int(0) });
    expect(y.dims).toEqual([]);
    expect(vals(y)).toEqual([21]);
  });

  // The three-state table opset 18 created. Collapsing "absent" into "[]" makes
  // the last two rows indistinguishable, and they mean OPPOSITE things.
  it("state 1: axes ABSENT with noop_with_empty_axes=1 still reduces ALL", () => {
    const y = one("ReduceSum", [x()], { noop_with_empty_axes: int(1), keepdims: int(0) });
    expect(y.dims).toEqual([]);
    expect(vals(y)).toEqual([21]);
  });

  it("state 2: axes present but EMPTY with noop_with_empty_axes=0 reduces ALL", () => {
    const y = one("ReduceSum", [x(), i64([0], [])], { noop_with_empty_axes: int(0), keepdims: int(0) });
    expect(y.dims).toEqual([]);
    expect(vals(y)).toEqual([21]);
  });

  it("state 3: axes present but EMPTY with noop_with_empty_axes=1 is the IDENTITY", () => {
    const y = one("ReduceSum", [x(), i64([0], [])], { noop_with_empty_axes: int(1) });
    expect(y.dims).toEqual([2, 3]);
    expect(vals(y)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("state 3 holds for the empty ATTRIBUTE form too", () => {
    const y = one("ReduceSum", [x()], { axes: ints([]), noop_with_empty_axes: int(1) });
    expect(y.dims).toEqual([2, 3]);
    expect(vals(y)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("the identity copy does not alias the input buffer", () => {
    const input = x();
    const y = one("ReduceSum", [input, i64([0], [])], { noop_with_empty_axes: int(1) });
    expect(y.data).not.toBe(input.data);
  });
});

describe("Reduce* operators", () => {
  const x = () => tensorOf([2, 3], [1, 2, 3, 4, 5, 6]);

  it("ReduceSum", () => {
    expect(vals(one("ReduceSum", [x(), i64([1], [1])], { keepdims: int(0) }))).toEqual([6, 15]);
  });

  it("ReduceMean", () => {
    expect(vals(one("ReduceMean", [x(), i64([1], [1])], { keepdims: int(0) }))).toEqual([2, 5]);
  });

  it("ReduceMax", () => {
    expect(vals(one("ReduceMax", [x(), i64([1], [1])], { keepdims: int(0) }))).toEqual([3, 6]);
  });

  it("ReduceMin", () => {
    expect(vals(one("ReduceMin", [x(), i64([1], [1])], { keepdims: int(0) }))).toEqual([1, 4]);
  });

  it("ReduceProd", () => {
    expect(vals(one("ReduceProd", [x(), i64([1], [1])], { keepdims: int(0) }))).toEqual([6, 120]);
  });

  it("ReduceL1 sums magnitudes", () => {
    const y = one("ReduceL1", [tensorOf([2], [-3, 4]), i64([1], [0])], { keepdims: int(0) });
    expect(vals(y)).toEqual([7]);
  });

  it("ReduceL2 is the Euclidean norm", () => {
    const y = one("ReduceL2", [tensorOf([2], [-3, 4]), i64([1], [0])], { keepdims: int(0) });
    expect(vals(y)).toEqual([5]);
  });

  it("ReduceMax over negatives does not return the zero initialiser", () => {
    const y = one("ReduceMax", [tensorOf([3], [-5, -2, -9]), i64([1], [0])], { keepdims: int(0) });
    expect(vals(y)).toEqual([-2]);
  });
});

describe("ArgMax / ArgMin", () => {
  it("ArgMax keeps the FIRST index on a tie by default", () => {
    const y = one("ArgMax", [tensorOf([2, 3], [1, 3, 3, 5, 2, 5])], { axis: int(1) });
    expect(y.dtype).toBe("int64");
    expect(y.dims).toEqual([2, 1]);
    expect(vals(y)).toEqual([1, 0]);
  });

  it("ArgMax takes the LAST index on a tie under select_last_index", () => {
    const y = one("ArgMax", [tensorOf([2, 3], [1, 3, 3, 5, 2, 5])], { axis: int(1), select_last_index: int(1) });
    expect(vals(y)).toEqual([2, 2]);
  });

  it("ArgMax drops the axis under keepdims=0", () => {
    const y = one("ArgMax", [tensorOf([2, 3], [1, 3, 3, 5, 2, 5])], { axis: int(1), keepdims: int(0) });
    expect(y.dims).toEqual([2]);
    expect(vals(y)).toEqual([1, 0]);
  });

  it("ArgMin mirrors ArgMax", () => {
    const x = tensorOf([2, 3], [1, 3, 1, 5, 2, 5]);
    expect(vals(one("ArgMin", [x], { axis: int(1), keepdims: int(0) }))).toEqual([0, 1]);
    expect(vals(one("ArgMin", [x], { axis: int(1), keepdims: int(0), select_last_index: int(1) }))).toEqual([2, 1]);
  });

  it("ArgMax defaults to axis 0", () => {
    const y = one("ArgMax", [tensorOf([3, 2], [1, 9, 5, 2, 3, 4])], { keepdims: int(0) });
    expect(y.dims).toEqual([2]);
    expect(vals(y)).toEqual([1, 0]);
  });
});

// =============================================================================
// Squeeze / Unsqueeze
// =============================================================================

describe("Squeeze", () => {
  const x = () => tensorOf([1, 3, 1], [1, 2, 3]);

  it("drops EVERY size-1 axis when axes are absent", () => {
    const y = one("Squeeze", [x()]);
    expect(y.dims).toEqual([3]);
    expect(vals(y)).toEqual([1, 2, 3]);
  });

  it("drops exactly the listed axes given as an input", () => {
    expect(one("Squeeze", [x(), i64([1], [0])]).dims).toEqual([3, 1]);
    expect(one("Squeeze", [x(), i64([2], [0, 2])]).dims).toEqual([3]);
  });

  it("drops exactly the listed axes given as an attribute", () => {
    expect(one("Squeeze", [x()], { axes: ints([2]) }).dims).toEqual([1, 3]);
  });

  it("accepts negative axes", () => {
    expect(one("Squeeze", [x(), i64([1], [-1])]).dims).toEqual([1, 3]);
  });

  // A silent no-op here would leave the rank wrong for whatever consumes the
  // result, which surfaces much later as a broadcast that "mysteriously" works.
  it("rejects squeezing an axis whose size is not 1", () => {
    expect(() => one("Squeeze", [x(), i64([1], [1])])).toThrow(/cannot squeeze axis 1 of size 3/);
  });
});

describe("Unsqueeze", () => {
  it("inserts a single axis given as an input", () => {
    expect(one("Unsqueeze", [tensorOf([3], [1, 2, 3]), i64([1], [0])]).dims).toEqual([1, 3]);
    expect(one("Unsqueeze", [tensorOf([3], [1, 2, 3]), i64([1], [1])]).dims).toEqual([3, 1]);
  });

  it("inserts a single axis given as an attribute", () => {
    expect(one("Unsqueeze", [tensorOf([3], [1, 2, 3])], { axes: ints([0]) }).dims).toEqual([1, 3]);
  });

  // The axes are resolved against the OUTPUT rank (input rank + count) and
  // applied in ascending order — that is what makes a multi-axis unsqueeze land
  // where the spec says rather than shifting with each insertion.
  it("inserts multiple axes in ascending order", () => {
    const y = one("Unsqueeze", [tensorOf([3], [1, 2, 3]), i64([2], [0, 2])]);
    expect(y.dims).toEqual([1, 3, 1]);
    expect(vals(y)).toEqual([1, 2, 3]);
  });

  it("resolves the axes against the OUTPUT rank when they are negative", () => {
    // Output rank is 3, so -1 is axis 2 of the OUTPUT, giving [1,3,1].
    expect(one("Unsqueeze", [tensorOf([3], [1, 2, 3]), i64([2], [0, -1])]).dims).toEqual([1, 3, 1]);
  });

  it("unsqueezes a rank-0 tensor into a rank-1 one", () => {
    const y = one("Unsqueeze", [tensorOf([], [7]), i64([1], [0])]);
    expect(y.dims).toEqual([1]);
    expect(vals(y)).toEqual([7]);
  });

  it("requires axes in one form or the other", () => {
    expect(() => one("Unsqueeze", [tensorOf([3], [1, 2, 3])])).toThrow(/requires axes/);
  });
});

// =============================================================================
// Concat / Transpose / Reshape / Split / Expand
// =============================================================================

describe("Concat", () => {
  it("concatenates on axis 0", () => {
    const y = one("Concat", [tensorOf([2, 2], [1, 2, 3, 4]), tensorOf([1, 2], [5, 6])], { axis: int(0) });
    expect(y.dims).toEqual([3, 2]);
    expect(vals(y)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  // On a middle axis each input contributes one contiguous run PER outer block,
  // so the interleaving is the thing to check.
  it("concatenates on a middle axis, interleaving per outer block", () => {
    const a = tensorOf([2, 1, 2], [1, 2, 3, 4]);
    const b = tensorOf([2, 2, 2], [5, 6, 7, 8, 9, 10, 11, 12]);
    const y = one("Concat", [a, b], { axis: int(1) });
    expect(y.dims).toEqual([2, 3, 2]);
    expect(vals(y)).toEqual([1, 2, 5, 6, 7, 8, 3, 4, 9, 10, 11, 12]);
  });

  it("accepts a negative axis", () => {
    const y = one("Concat", [tensorOf([2, 2], [1, 2, 3, 4]), tensorOf([2, 2], [5, 6, 7, 8])], { axis: int(-1) });
    expect(y.dims).toEqual([2, 4]);
    expect(vals(y)).toEqual([1, 2, 5, 6, 3, 4, 7, 8]);
  });

  it("concatenates three inputs", () => {
    const y = one("Concat", [tensorOf([1], [1]), tensorOf([2], [2, 3]), tensorOf([3], [4, 5, 6])], { axis: int(0) });
    expect(y.dims).toEqual([6]);
    expect(vals(y)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("rejects a mismatched non-concatenated dimension", () => {
    expect(() =>
      one("Concat", [tensorOf([2, 2], iota(4)), tensorOf([1, 3], iota(3))], { axis: int(0) }),
    ).toThrow(/disagree on axis 1/);
  });

  it("rejects inputs of different ranks", () => {
    expect(() => one("Concat", [tensorOf([2, 2], iota(4)), tensorOf([2], iota(2))], { axis: int(0) })).toThrow(
      /different ranks/,
    );
  });
});

describe("Transpose", () => {
  it("defaults to the full REVERSE permutation, not the identity", () => {
    const y = one("Transpose", [tensorOf([2, 3], [1, 2, 3, 4, 5, 6])]);
    expect(y.dims).toEqual([3, 2]);
    expect(vals(y)).toEqual([1, 4, 2, 5, 3, 6]);
  });

  it("reverses a rank-3 shape by default and places every element", () => {
    const y = one("Transpose", [tensorOf([2, 3, 4], iota(24))]);
    expect(y.dims).toEqual([4, 3, 2]);
    // out[l,k,i] = x[i,k,l], and x is row-major iota so x[i,k,l] = i*12+k*4+l.
    const expected: number[] = [];
    for (let l = 0; l < 4; l++) for (let k = 0; k < 3; k++) for (let i = 0; i < 2; i++) expected.push(i * 12 + k * 4 + l);
    expect(vals(y)).toEqual(expected);
  });

  it("honours an explicit perm", () => {
    const y = one("Transpose", [tensorOf([2, 3, 4], iota(24))], { perm: ints([1, 0, 2]) });
    expect(y.dims).toEqual([3, 2, 4]);
    // out[k,i,l] = x[i,k,l] = i*12 + k*4 + l
    const expected: number[] = [];
    for (let k = 0; k < 3; k++) for (let i = 0; i < 2; i++) for (let l = 0; l < 4; l++) expected.push(i * 12 + k * 4 + l);
    expect(vals(y)).toEqual(expected);
  });

  it("treats the identity perm as a copy", () => {
    const x = tensorOf([2, 3], iota(6));
    const y = one("Transpose", [x], { perm: ints([0, 1]) });
    expect(vals(y)).toEqual(iota(6));
    expect(y.data).not.toBe(x.data);
  });

  it("rejects a perm of the wrong length", () => {
    expect(() => one("Transpose", [tensorOf([2, 3], iota(6))], { perm: ints([0]) })).toThrow(
      /perm has 1 entries for a rank-2 input/,
    );
  });
});

describe("Reshape", () => {
  const x = () => tensorOf([2, 3], iota(6));

  it("reshapes to an explicit shape", () => {
    const y = one("Reshape", [x(), i64([2], [3, 2])]);
    expect(y.dims).toEqual([3, 2]);
    expect(vals(y)).toEqual(iota(6));
  });

  it("infers a single -1 from the element count", () => {
    expect(one("Reshape", [x(), i64([1], [-1])]).dims).toEqual([6]);
    expect(one("Reshape", [x(), i64([2], [3, -1])]).dims).toEqual([3, 2]);
  });

  // `0` means "copy the input's dim at THIS POSITION" — positional, not a
  // wildcard, so it is only legal below the input rank.
  it("copies the input dim where the target says 0", () => {
    expect(one("Reshape", [tensorOf([2, 3, 4], iota(24)), i64([2], [0, -1])]).dims).toEqual([2, 12]);
    expect(one("Reshape", [tensorOf([2, 3, 4], iota(24)), i64([3], [0, 0, 4])]).dims).toEqual([2, 3, 4]);
  });

  it("rejects a 0 past the input rank", () => {
    expect(() => one("Reshape", [x(), i64([3], [2, 3, 0])])).toThrow(/uses 0 at axis 2, past the input rank/);
  });

  // allowzero=1 (opset 14+) SUPPRESSES the copy: 0 then means a genuinely empty
  // axis. The distinguishing case is an input whose dim at that position is not
  // itself 0 — here the copy would demand 6 elements from an empty tensor.
  it("makes 0 mean an empty axis under allowzero=1", () => {
    const y = one("Reshape", [tensorOf([2, 0], []), i64([2], [0, 3])], { allowzero: int(1) });
    expect(y.dims).toEqual([0, 3]);
    expect(vals(y)).toEqual([]);
  });

  it("still copies the dim for the same target without allowzero", () => {
    expect(() => one("Reshape", [tensorOf([2, 0], []), i64([2], [0, 3])])).toThrow(/cannot reshape 0 elements/);
  });

  it("rejects more than one -1", () => {
    expect(() => one("Reshape", [x(), i64([2], [-1, -1])])).toThrow(/more than one -1/);
  });

  it("rejects a target with the wrong element count", () => {
    expect(() => one("Reshape", [x(), i64([2], [4, 2])])).toThrow(/cannot reshape 6 elements into \[4,2\]/);
  });

  it("does not alias the input buffer", () => {
    const input = x();
    expect(one("Reshape", [input, i64([1], [6])]).data).not.toBe(input.data);
  });
});

describe("Split", () => {
  const x = () => tensorOf([6], [1, 2, 3, 4, 5, 6]);

  it("splits by explicit sizes given as an input", () => {
    const outs = run("Split", [x(), i64([2], [2, 4])], {}, { outputCount: 2 });
    expect(outs.length).toBe(2);
    expect(outs[0].dims).toEqual([2]);
    expect(vals(outs[0])).toEqual([1, 2]);
    expect(vals(outs[1])).toEqual([3, 4, 5, 6]);
  });

  it("splits by explicit sizes given as an attribute", () => {
    const outs = run("Split", [x()], { split: ints([2, 4]) }, { outputCount: 2 });
    expect(vals(outs[0])).toEqual([1, 2]);
    expect(vals(outs[1])).toEqual([3, 4, 5, 6]);
  });

  it("divides evenly across the declared output count", () => {
    const outs = run("Split", [x()], {}, { outputCount: 3 });
    expect(outs.length).toBe(3);
    expect(vals(outs[0])).toEqual([1, 2]);
    expect(vals(outs[1])).toEqual([3, 4]);
    expect(vals(outs[2])).toEqual([5, 6]);
  });

  it("divides evenly across an explicit num_outputs", () => {
    const outs = run("Split", [x()], { num_outputs: int(2) }, { outputCount: 2 });
    expect(vals(outs[0])).toEqual([1, 2, 3]);
    expect(vals(outs[1])).toEqual([4, 5, 6]);
  });

  // ONNX Split-18 spells the uneven case out: "If the tensor is not evenly
  // splittable into num_outputs, the LAST chunk will be SMALLER". So every
  // chunk but the last is ceil(dim / n) and the last takes what remains —
  // NOT floor everywhere with the remainder dumped on the end, which would put
  // the BIGGEST chunk last and mis-shape every downstream consumer.
  it("gives the LAST chunk the shortfall when the axis divides unevenly", () => {
    const two = run("Split", [tensorOf([5], [1, 2, 3, 4, 5])], {}, { outputCount: 2 });
    expect(vals(two[0])).toEqual([1, 2, 3]);
    expect(vals(two[1])).toEqual([4, 5]);

    // 5 into 3 is ceil(5/3) = 2 per chunk, leaving 1 for the last: [2,2,1].
    const three = run("Split", [tensorOf([5], [1, 2, 3, 4, 5])], {}, { outputCount: 3 });
    expect(three.length).toBe(3);
    expect(vals(three[0])).toEqual([1, 2]);
    expect(vals(three[1])).toEqual([3, 4]);
    expect(vals(three[2])).toEqual([5]);
  });

  it("allows the last chunk to be empty", () => {
    // 2 into 3: ceil(2/3) = 1, so the last chunk gets 2 - 1*2 = 0 elements.
    const outs = run("Split", [tensorOf([2], [1, 2])], {}, { outputCount: 3 });
    expect(vals(outs[0])).toEqual([1]);
    expect(vals(outs[1])).toEqual([2]);
    expect(outs[2].dims).toEqual([0]);
    expect(vals(outs[2])).toEqual([]);
  });

  it("rejects a split into more outputs than the ceil sizing can cover", () => {
    // 1 into 3 would need chunks of 1,1,-1.
    expect(() => run("Split", [tensorOf([1], [1])], {}, { outputCount: 3 })).toThrow(
      /cannot split an axis of size 1 into 3 outputs/,
    );
  });

  it("splits along a non-zero axis", () => {
    const outs = run("Split", [tensorOf([2, 4], iota(8)), i64([2], [1, 3])], { axis: int(1) }, { outputCount: 2 });
    expect(outs[0].dims).toEqual([2, 1]);
    expect(vals(outs[0])).toEqual([0, 4]);
    expect(outs[1].dims).toEqual([2, 3]);
    expect(vals(outs[1])).toEqual([1, 2, 3, 5, 6, 7]);
  });

  it("rejects sizes that do not sum to the axis length", () => {
    expect(() => run("Split", [x(), i64([2], [2, 2])], {}, { outputCount: 2 })).toThrow(
      /split sizes sum to 4 but axis 0 has size 6/,
    );
  });
});

describe("Expand", () => {
  // The target is a LOWER BOUND combined by the bidirectional broadcast rule,
  // not an assignment — which is the entire difference from Reshape.
  it("combines the target with the input shape bidirectionally", () => {
    const y = one("Expand", [tensorOf([3, 1], [1, 2, 3]), i64([2], [1, 4])]);
    expect(y.dims).toEqual([3, 4]);
    expect(vals(y)).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3]);
  });

  it("tiles a row across a new leading axis", () => {
    const y = one("Expand", [tensorOf([1, 3], [1, 2, 3]), i64([2], [2, 3])]);
    expect(y.dims).toEqual([2, 3]);
    expect(vals(y)).toEqual([1, 2, 3, 1, 2, 3]);
  });

  it("expands a rank-1 operand to a higher rank", () => {
    const y = one("Expand", [tensorOf([3], [1, 2, 3]), i64([2], [2, 3])]);
    expect(y.dims).toEqual([2, 3]);
    expect(vals(y)).toEqual([1, 2, 3, 1, 2, 3]);
  });

  it("expands a scalar", () => {
    const y = one("Expand", [tensorOf([], [7]), i64([2], [2, 2])]);
    expect(y.dims).toEqual([2, 2]);
    expect(vals(y)).toEqual([7, 7, 7, 7]);
  });
});

// =============================================================================
// Shape / Size / Cast / Clip / Softmax
// =============================================================================

describe("Shape", () => {
  const x = () => tensorOf([2, 3, 4], iota(24));

  it("returns the whole shape as int64", () => {
    const y = one("Shape", [x()]);
    expect(y.dtype).toBe("int64");
    expect(y.dims).toEqual([3]);
    expect(vals(y)).toEqual([2, 3, 4]);
  });

  it("honours start and end", () => {
    expect(vals(one("Shape", [x()], { start: int(1) }))).toEqual([3, 4]);
    expect(vals(one("Shape", [x()], { end: int(2) }))).toEqual([2, 3]);
    expect(vals(one("Shape", [x()], { start: int(1), end: int(2) }))).toEqual([3]);
  });

  it("honours negative start and end", () => {
    expect(vals(one("Shape", [x()], { start: int(-2) }))).toEqual([3, 4]);
    expect(vals(one("Shape", [x()], { end: int(-1) }))).toEqual([2, 3]);
    expect(vals(one("Shape", [x()], { start: int(-1) }))).toEqual([4]);
  });

  it("clamps an out-of-range slice to an empty result", () => {
    const y = one("Shape", [x()], { start: int(2), end: int(1) });
    expect(y.dims).toEqual([0]);
    expect(vals(y)).toEqual([]);
  });

  it("Size returns the element count as a rank-0 int64", () => {
    const y = one("Size", [x()]);
    expect(y.dtype).toBe("int64");
    expect(y.dims).toEqual([]);
    expect(vals(y)).toEqual([24]);
  });
});

describe("Cast", () => {
  // float -> integer TRUNCATES TOWARD ZERO. Math.floor would give -3 here, and
  // the two agree for every positive value, so a floor bug hides until the
  // first negative activation.
  it("truncates float to int toward zero, not down", () => {
    const y = one("Cast", [tensorOf([4], [-2.7, 2.7, -0.5, 0.5])], { to: int(6) });
    expect(y.dtype).toBe("int32");
    expect(vals(y)).toEqual([-2, 2, 0, 0]);
  });

  it("maps anything non-zero to exactly 1 when casting to bool", () => {
    const y = one("Cast", [tensorOf([5], [0, -0.5, 3.5, -1, 255])], { to: int(9) });
    expect(y.dtype).toBe("bool");
    expect(vals(y)).toEqual([0, 1, 1, 1, 1]);
  });

  it("casts int to float", () => {
    const y = one("Cast", [tensorOf([3], [1, -2, 3], "int32")], { to: int(1) });
    expect(y.dtype).toBe("float32");
    expect(vals(y)).toEqual([1, -2, 3]);
  });

  it("casts bool to float32", () => {
    const y = one("Cast", [tensorOf([3], [1, 0, 1], "bool")], { to: int(1) });
    expect(y.dtype).toBe("float32");
    expect(vals(y)).toEqual([1, 0, 1]);
  });

  it("casts int32 to int64", () => {
    const y = one("Cast", [tensorOf([2], [5, -7], "int32")], { to: int(7) });
    expect(y.dtype).toBe("int64");
    expect(vals(y)).toEqual([5, -7]);
  });

  // A float16 cast re-rounds through binary16 even though storage stays f32 —
  // otherwise the graph does not lose the precision it asked to lose.
  it("rounds through binary16 when casting to float16", () => {
    const y = one("Cast", [tensorOf([2], [1, 0.1])], { to: int(10) });
    expect(y.dtype).toBe("float16");
    // 0.1 has no exact binary16 form; the nearest is 1638 * 2^-14.
    expect(vals(y)).toEqual([1, 1638 * 2 ** -14]);
  });

  it("names the node when asked to cast to a type it cannot hold", () => {
    expect(() => one("Cast", [tensorOf([1], [1])], { to: int(16) })).toThrow(/Cast casts to an unsupported type/);
  });

  it("CastLike takes its target type from the second input", () => {
    const y = one("CastLike", [tensorOf([2], [1.9, -1.9]), tensorOf([1], [0], "int32")]);
    expect(y.dtype).toBe("int32");
    expect(vals(y)).toEqual([1, -1]);
  });
});

describe("Clip", () => {
  const x = () => tensorOf([5], [-5, -1, 0, 1, 5]);

  it("clamps with min and max as inputs", () => {
    expect(vals(one("Clip", [x(), tensorOf([], [-1]), tensorOf([], [1])]))).toEqual([-1, -1, 0, 1, 1]);
  });

  // An omitted optional input arrives as `undefined` — either from a short list
  // or from an empty-string name — and must fall back to the type's infinity.
  it("clamps only from above when min is omitted", () => {
    expect(vals(one("Clip", [x(), undefined, tensorOf([], [1])]))).toEqual([-5, -1, 0, 1, 1]);
  });

  it("clamps only from below when max is omitted", () => {
    expect(vals(one("Clip", [x(), tensorOf([], [-1])]))).toEqual([-1, -1, 0, 1, 5]);
  });

  it("is the identity when neither bound is given", () => {
    expect(vals(one("Clip", [x()]))).toEqual([-5, -1, 0, 1, 5]);
  });

  it("accepts the legacy min/max attributes", () => {
    expect(vals(one("Clip", [x()], { min: flt(-1), max: flt(1) }))).toEqual([-1, -1, 0, 1, 1]);
    expect(vals(one("Clip", [x()], { max: flt(0) }))).toEqual([-5, -1, 0, 0, 0]);
  });

  it("does not alias the input buffer", () => {
    const input = x();
    expect(one("Clip", [input]).data).not.toBe(input.data);
  });
});

describe("Softmax", () => {
  it("normalises the last axis by default", () => {
    const y = one("Softmax", [tensorOf([1, 3], [1, 2, 3])]);
    // exp(-2), exp(-1), exp(0) over their sum — the standard softmax(1,2,3).
    expect(maxAbsDiff(vals(y), [0.09003057, 0.24472847, 0.66524096])).toBeLessThan(1e-6);
  });

  it("normalises an explicit axis", () => {
    // axis 0 on [[1,2],[3,4]]: each COLUMN is a pair two apart, so both columns
    // give the same softmax([0,2]) = [1/(1+e^2), e^2/(1+e^2)].
    const y = one("Softmax", [tensorOf([2, 2], [1, 2, 3, 4])], { axis: int(0) });
    expect(maxAbsDiff(vals(y), [0.11920292, 0.11920292, 0.88079708, 0.88079708])).toBeLessThan(1e-6);
  });

  it("rows sum to 1", () => {
    const y = one("Softmax", [tensorOf([2, 4], [0.5, -1, 2, 3, -4, 0, 1, 0.25])]);
    const v = vals(y);
    expect(v[0] + v[1] + v[2] + v[3]).toBeCloseTo(1, 6);
    expect(v[4] + v[5] + v[6] + v[7]).toBeCloseTo(1, 6);
  });

  // Subtracting the row max before exponentiating is not an optimisation: a
  // logit above ~88 overflows f32 and turns the whole row into NaN.
  it("survives a logit far beyond the f32 exp range", () => {
    const y = one("Softmax", [tensorOf([1, 3], [1000, 1000, 1000])]);
    expect(maxAbsDiff(vals(y), [1 / 3, 1 / 3, 1 / 3])).toBeLessThan(1e-6);
    for (const v of vals(y)) expect(Number.isNaN(v)).toBe(false);
  });

  it("gives a saturated row the whole mass", () => {
    const y = one("Softmax", [tensorOf([1, 2], [1000, 0])]);
    expect(vals(y)).toEqual([1, 0]);
  });

  // Before opset 13 Softmax coerced its input to 2-D and normalised the whole
  // flattened tail — a different function, not just a different default axis.
  it("uses the pre-13 coerce-to-2-D semantics below opset 13", () => {
    const y = one("Softmax", [tensorOf([2, 2, 2], [0, 0, 0, 0, 1, 1, 1, 1])], {}, { opset: 11 });
    // Each outer block of four equal logits normalises to 0.25 each.
    expect(maxAbsDiff(vals(y), new Array<number>(8).fill(0.25))).toBeLessThan(1e-6);
  });

  it("LogSoftmax is the log of Softmax", () => {
    const y = one("LogSoftmax", [tensorOf([1, 3], [1, 2, 3])]);
    expect(maxAbsDiff(vals(y), [Math.log(0.09003057), Math.log(0.24472847), Math.log(0.66524096)])).toBeLessThan(1e-5);
  });
});

// =============================================================================
// Elementwise spot checks
// =============================================================================

describe("unary activations and arithmetic", () => {
  it("Relu clamps at zero", () => {
    expect(vals(one("Relu", [tensorOf([3], [-1, 0, 2])]))).toEqual([0, 0, 2]);
  });

  it("Sigmoid", () => {
    const y = one("Sigmoid", [tensorOf([3], [0, 1, -1])]);
    expect(maxAbsDiff(vals(y), [0.5, 0.7310585786, 0.2689414214])).toBeLessThan(1e-6);
  });

  it("Tanh", () => {
    const y = one("Tanh", [tensorOf([3], [0, 1, -1])]);
    expect(maxAbsDiff(vals(y), [0, 0.7615941560, -0.7615941560])).toBeLessThan(1e-6);
  });

  // The Abramowitz & Stegun 7.1.26 approximation the kernel uses is spec'd to
  // |error| < 1.5e-7, comfortably inside f32.
  it("Erf matches the true error function to 1e-6", () => {
    const y = one("Erf", [tensorOf([3], [0, 1, -1])]);
    expect(maxAbsDiff(vals(y), [0, 0.8427007929, -0.8427007929])).toBeLessThan(1e-6);
  });

  it("Gelu in exact (erf) mode", () => {
    // 0.5 * x * (1 + erf(x / sqrt(2))); at x = 1 that is 0.8413447.
    const y = one("Gelu", [tensorOf([3], [0, 1, -1])]);
    expect(maxAbsDiff(vals(y), [0, 0.8413447, -0.1586553])).toBeLessThan(1e-6);
  });

  it("Gelu in tanh-approximate mode", () => {
    // 0.5 * x * (1 + tanh(sqrt(2/pi) * (x + 0.044715 x^3)))
    const y = one("Gelu", [tensorOf([2], [0, 1])], { approximate: str("tanh") });
    expect(maxAbsDiff(vals(y), [0, 0.84119199])).toBeLessThan(1e-6);
  });

  it("the two Gelu modes are genuinely different functions", () => {
    const exact = vals(one("Gelu", [tensorOf([1], [1])]))[0];
    const approx = vals(one("Gelu", [tensorOf([1], [1])], { approximate: str("tanh") }))[0];
    expect(Math.abs(exact - approx)).toBeGreaterThan(1e-5);
  });

  it("Softplus", () => {
    const y = one("Softplus", [tensorOf([2], [0, 1])]);
    expect(maxAbsDiff(vals(y), [Math.LN2, Math.log(Math.E + 1)])).toBeLessThan(1e-6);
  });

  it("Sqrt / Exp / Log", () => {
    expect(vals(one("Sqrt", [tensorOf([3], [0, 4, 9])]))).toEqual([0, 2, 3]);
    expect(maxAbsDiff(vals(one("Exp", [tensorOf([2], [0, 1])])), [1, Math.E])).toBeLessThan(1e-6);
    expect(maxAbsDiff(vals(one("Log", [tensorOf([2], [1, Math.E])])), [0, 1])).toBeLessThan(1e-6);
  });

  it("Neg / Abs / Floor / Ceil / Reciprocal", () => {
    expect(vals(one("Neg", [tensorOf([3], [1, -2, 0])]))).toEqual([-1, 2, -0]);
    expect(vals(one("Abs", [tensorOf([3], [1, -2, 0])]))).toEqual([1, 2, 0]);
    expect(vals(one("Floor", [tensorOf([2], [-1.5, 1.5])]))).toEqual([-2, 1]);
    expect(vals(one("Ceil", [tensorOf([2], [-1.5, 1.5])]))).toEqual([-1, 2]);
    expect(vals(one("Reciprocal", [tensorOf([2], [2, -4])]))).toEqual([0.5, -0.25]);
  });

  it("LeakyRelu and Elu honour alpha", () => {
    expect(vals(one("LeakyRelu", [tensorOf([2], [-2, 3])], { alpha: flt(0.5) }))).toEqual([-1, 3]);
    const elu = one("Elu", [tensorOf([2], [-1, 3])], { alpha: flt(2) });
    expect(maxAbsDiff(vals(elu), [2 * (Math.exp(-1) - 1), 3])).toBeLessThan(1e-6);
  });

  it("Not inverts truthiness and produces bool", () => {
    const y = one("Not", [tensorOf([3], [1, 0, 5], "uint8")]);
    expect(y.dtype).toBe("bool");
    expect(vals(y)).toEqual([0, 1, 0]);
  });

  it("Identity copies the values", () => {
    expect(vals(one("Identity", [tensorOf([3], [1, 2, 3])]))).toEqual([1, 2, 3]);
  });
});

describe("comparisons and logic", () => {
  it("Equal / Greater / Less produce bool", () => {
    const a = tensorOf([3], [1, 2, 3]);
    const b = tensorOf([3], [1, 3, 2]);
    const eq = one("Equal", [a, b]);
    expect(eq.dtype).toBe("bool");
    expect(vals(eq)).toEqual([1, 0, 0]);
    expect(vals(one("Greater", [a, b]))).toEqual([0, 0, 1]);
    expect(vals(one("Less", [a, b]))).toEqual([0, 1, 0]);
    expect(vals(one("GreaterOrEqual", [a, b]))).toEqual([1, 0, 1]);
    expect(vals(one("LessOrEqual", [a, b]))).toEqual([1, 1, 0]);
  });

  it("And / Or / Xor treat any non-zero as true and produce bool", () => {
    const a = tensorOf([4], [1, 1, 0, 0], "bool");
    const b = tensorOf([4], [1, 0, 1, 0], "bool");
    const and = one("And", [a, b]);
    expect(and.dtype).toBe("bool");
    expect(vals(and)).toEqual([1, 0, 0, 0]);
    expect(vals(one("Or", [a, b]))).toEqual([1, 1, 1, 0]);
    expect(vals(one("Xor", [a, b]))).toEqual([0, 1, 1, 0]);
  });

  it("comparisons broadcast", () => {
    const y = one("Greater", [tensorOf([2, 2], [1, 5, 3, 0]), tensorOf([2], [2, 2])]);
    expect(y.dims).toEqual([2, 2]);
    expect(vals(y)).toEqual([0, 1, 1, 0]);
  });
});

describe("variadic Min / Max / Sum", () => {
  it("takes the elementwise extremum across three same-shaped inputs", () => {
    const a = tensorOf([2], [1, 5]);
    const b = tensorOf([2], [3, 3]);
    const c = tensorOf([2], [2, 9]);
    expect(vals(one("Max", [a, b, c]))).toEqual([3, 9]);
    expect(vals(one("Min", [a, b, c]))).toEqual([1, 3]);
    expect(vals(one("Sum", [a, b, c]))).toEqual([6, 17]);
  });

  it("broadcasts across all inputs, not just the first pair", () => {
    // [2] + [2,1] -> [2,2] with out[i,j] = a[j] + b[i]; then + the scalar 100.
    const y = one("Sum", [tensorOf([2], [1, 2]), tensorOf([2, 1], [10, 20]), tensorOf([], [100])]);
    expect(y.dims).toEqual([2, 2]);
    expect(vals(y)).toEqual([111, 112, 121, 122]);
  });

  it("broadcasts under Max too", () => {
    const y = one("Max", [tensorOf([2, 2], [1, 5, 7, 2]), tensorOf([2], [3, 3])]);
    expect(y.dims).toEqual([2, 2]);
    expect(vals(y)).toEqual([3, 5, 7, 3]);
  });
});

// =============================================================================
// ConstantOfShape / Range / Constant
// =============================================================================

describe("ConstantOfShape", () => {
  it("defaults to float32 zeros when no value attribute is present", () => {
    const y = one("ConstantOfShape", [i64([2], [2, 3])]);
    expect(y.dtype).toBe("float32");
    expect(y.dims).toEqual([2, 3]);
    expect(vals(y)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  // The `value` attribute supplies the DTYPE as well as the fill, which is how
  // an int64 shape-building chain stays integral.
  it("takes both the fill and the dtype from the value attribute", () => {
    const y = one("ConstantOfShape", [i64([2], [2, 2])], {
      value: { kind: "tensor", value: tensorOf([1], [7], "int64") },
    });
    expect(y.dtype).toBe("int64");
    expect(vals(y)).toEqual([7, 7, 7, 7]);
  });

  it("produces a rank-0 tensor for an empty shape input", () => {
    const y = one("ConstantOfShape", [i64([0], [])]);
    expect(y.dims).toEqual([]);
    expect(vals(y)).toEqual([0]);
  });
});

describe("Range", () => {
  it("counts up by delta", () => {
    const y = one("Range", [i64([], [0]), i64([], [5]), i64([], [1])]);
    expect(y.dtype).toBe("int64");
    expect(y.dims).toEqual([5]);
    expect(vals(y)).toEqual([0, 1, 2, 3, 4]);
  });

  // ceil((limit - start) / delta) clamped at zero is what makes an empty range
  // legal rather than an error or a negative allocation.
  it("produces an empty tensor when the range is empty", () => {
    const y = one("Range", [i64([], [5]), i64([], [5]), i64([], [1])]);
    expect(y.dims).toEqual([0]);
    expect(vals(y)).toEqual([]);
  });

  it("counts down under a negative delta", () => {
    // ceil((0 - 5) / -2) = ceil(2.5) = 3 -> 5, 3, 1
    const y = one("Range", [i64([], [5]), i64([], [0]), i64([], [-2])]);
    expect(vals(y)).toEqual([5, 3, 1]);
  });

  it("rejects a zero delta", () => {
    expect(() => one("Range", [i64([], [0]), i64([], [5]), i64([], [0])])).toThrow(/delta is zero/);
  });
});

describe("Constant", () => {
  it("returns a clone of the value tensor, never the attribute's own buffer", () => {
    const source = tensorOf([2], [1, 2]);
    const y = one("Constant", [], { value: { kind: "tensor", value: source } });
    expect(vals(y)).toEqual([1, 2]);
    expect(y.data).not.toBe(source.data);
  });

  it("builds scalars and lists from the typed value attributes", () => {
    expect(vals(one("Constant", [], { value_float: flt(1.5) }))).toEqual([1.5]);
    expect(one("Constant", [], { value_int: int(3) }).dtype).toBe("int64");
    expect(vals(one("Constant", [], { value_ints: ints([1, 2, 3]) }))).toEqual([1, 2, 3]);
    expect(vals(one("Constant", [], { value_floats: { kind: "floats", value: [0.5, 1.5] } }))).toEqual([0.5, 1.5]);
  });

  it("rejects a Constant with no recognised value attribute", () => {
    expect(() => one("Constant", [], {})).toThrow(/no recognised value attribute/);
  });
});

// =============================================================================
// Buffer aliasing
// =============================================================================

// The executor recycles buffers between nodes, so any kernel that hands back a
// tensor sharing storage with its input creates a value that a LATER node's
// scratch quietly overwrites — an intermittent, shape-dependent corruption.
describe("output buffers never alias input buffers", () => {
  it("Identity allocates a fresh buffer", () => {
    const input = tensorOf([3], [1, 2, 3]);
    const y = one("Identity", [input]);
    expect(y.data).not.toBe(input.data);
    input.data[0] = 99;
    expect(vals(y)).toEqual([1, 2, 3]);
  });

  it("a single-input variadic still copies", () => {
    for (const op of ["Sum", "Min", "Max"]) {
      const input = tensorOf([3], [1, 2, 3]);
      const y = one(op, [input]);
      expect(y.data).not.toBe(input.data);
      expect(vals(y)).toEqual([1, 2, 3]);
    }
  });

  it("Squeeze, Unsqueeze, Flatten and Concat copy too", () => {
    const a = tensorOf([1, 3], [1, 2, 3]);
    expect(one("Squeeze", [a]).data).not.toBe(a.data);
    expect(one("Unsqueeze", [a, i64([1], [0])]).data).not.toBe(a.data);
    expect(one("Flatten", [a]).data).not.toBe(a.data);
    expect(one("Concat", [a], { axis: int(0) }).data).not.toBe(a.data);
  });
});

describe("Flatten", () => {
  it("splits at axis 1 by default", () => {
    const y = one("Flatten", [tensorOf([2, 3, 4], iota(24))]);
    expect(y.dims).toEqual([2, 12]);
  });

  it("honours an explicit axis, including 0 and the rank itself", () => {
    expect(one("Flatten", [tensorOf([2, 3, 4], iota(24))], { axis: int(0) }).dims).toEqual([1, 24]);
    expect(one("Flatten", [tensorOf([2, 3, 4], iota(24))], { axis: int(2) }).dims).toEqual([6, 4]);
    expect(one("Flatten", [tensorOf([2, 3, 4], iota(24))], { axis: int(3) }).dims).toEqual([24, 1]);
  });
});

describe("missing required inputs", () => {
  it("names the position of the missing input", () => {
    expect(() => one("Add", [tensorOf([1], [1])])).toThrow(/missing required input 1/);
    expect(() => one("Relu", [])).toThrow(/missing required input 0/);
  });
});
