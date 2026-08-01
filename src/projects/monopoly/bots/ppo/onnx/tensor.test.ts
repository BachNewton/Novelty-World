// Unit tests for the tensor value type and the shape algebra every kernel
// leans on. These are the primitives whose bugs are invisible at the op level:
// a wrong broadcast stride shows up as plausible-looking numbers, not a crash.

import { describe, expect, it } from "vitest";
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
  sameShape,
  tensorOf,
  type DType,
} from "./tensor";

describe("broadcastShapes", () => {
  it("returns the shape unchanged when both operands agree", () => {
    expect(broadcastShapes([2, 3], [2, 3])).toEqual([2, 3]);
  });

  it("treats a rank-0 operand as broadcasting to anything", () => {
    expect(broadcastShapes([], [2, 3])).toEqual([2, 3]);
    expect(broadcastShapes([2, 3], [])).toEqual([2, 3]);
  });

  it("right-aligns a lower-rank operand", () => {
    expect(broadcastShapes([2, 3], [3])).toEqual([2, 3]);
    expect(broadcastShapes([3], [2, 3])).toEqual([2, 3]);
  });

  it("stretches size-1 axes on either side simultaneously", () => {
    expect(broadcastShapes([2, 1, 3], [1, 4, 1])).toEqual([2, 4, 3]);
    expect(broadcastShapes([3, 1], [1, 4])).toEqual([3, 4]);
  });

  // A size-1 axis stretches to WHATEVER the other operand says, including zero.
  // Answering [1] here would invent an element with no source.
  it("broadcasts [0] against [1] to [0], not [1]", () => {
    expect(broadcastShapes([0], [1])).toEqual([0]);
    expect(broadcastShapes([1], [0])).toEqual([0]);
  });

  it("rejects shapes that disagree on an axis where neither side is 1", () => {
    expect(() => broadcastShapes([2, 3], [4])).toThrow(/not broadcast-compatible/);
    expect(() => broadcastShapes([2, 3], [3, 3])).toThrow(/axis 0/);
  });
});

describe("broadcastStrides", () => {
  it("gives a stretched axis stride 0 so advancing re-reads the same element", () => {
    // [3,1] into [3,4]: axis 0 keeps its own stride (1), axis 1 is stretched.
    expect(broadcastStrides([3, 1], [3, 4])).toEqual([1, 0]);
  });

  it("gives prepended (missing) axes stride 0", () => {
    // [4] right-aligns onto [2,3,4]; the two leading axes do not exist in the
    // source, so walking them must not move the source cursor.
    expect(broadcastStrides([4], [2, 3, 4])).toEqual([0, 0, 1]);
  });

  it("keeps the natural strides when nothing is stretched", () => {
    expect(broadcastStrides([2, 3, 4], [2, 3, 4])).toEqual([12, 4, 1]);
  });

  it("does not zero a size-1 axis whose target is also 1", () => {
    // Nothing is being stretched, so the stride stays the real one. Zeroing it
    // is harmless for reads but would be wrong bookkeeping.
    expect(broadcastStrides([2, 1], [2, 1])).toEqual([1, 1]);
  });
});

describe("computeStrides", () => {
  it("is row-major: the last axis has stride 1", () => {
    expect(computeStrides([2, 3, 4])).toEqual([12, 4, 1]);
    expect(computeStrides([5])).toEqual([1]);
    expect(computeStrides([])).toEqual([]);
  });
});

describe("numElements", () => {
  it("is the product of the dims, with the empty shape meaning one scalar", () => {
    expect(numElements([])).toBe(1);
    expect(numElements([2, 3])).toBe(6);
    expect(numElements([0, 3])).toBe(0);
  });
});

describe("normalizeAxis", () => {
  it("resolves negative axes from the end", () => {
    expect(normalizeAxis(-1, 3, "T")).toBe(2);
    expect(normalizeAxis(-3, 3, "T")).toBe(0);
    expect(normalizeAxis(0, 3, "T")).toBe(0);
  });

  it("rejects an axis at or past the rank", () => {
    expect(() => normalizeAxis(3, 3, "T")).toThrow(/axis 3 out of range for rank 3/);
    expect(() => normalizeAxis(-4, 3, "T")).toThrow(/out of range/);
  });
});

describe("normalizeAxisInclusive", () => {
  // `Unsqueeze` names the position "just past the end", so rank itself is legal.
  it("permits axis === rank", () => {
    expect(normalizeAxisInclusive(3, 3, "T")).toBe(3);
    expect(normalizeAxisInclusive(0, 0, "T")).toBe(0);
  });

  it("still resolves negatives and still rejects past-inclusive-end", () => {
    expect(normalizeAxisInclusive(-1, 3, "T")).toBe(2);
    expect(() => normalizeAxisInclusive(4, 3, "T")).toThrow(/out of range/);
    expect(() => normalizeAxisInclusive(-4, 3, "T")).toThrow(/out of range/);
  });
});

describe("dtypeFromCode", () => {
  it("maps every ONNX code this executor supports", () => {
    const expected: [number, DType][] = [
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
    ];
    for (const [code, dtype] of expected) expect(dtypeFromCode(code)).toBe(dtype);
  });

  // Naming the type in the error is the point: "unsupported element type 16"
  // gives an operator no idea that the fix is to re-export without bfloat16.
  it("names the type it knowingly does not support", () => {
    expect(() => dtypeFromCode(16)).toThrow(/BFLOAT16/);
    expect(() => dtypeFromCode(8)).toThrow(/STRING/);
    expect(() => dtypeFromCode(14)).toThrow(/COMPLEX64/);
  });

  it("falls back to the bare code for a type it has never heard of", () => {
    expect(() => dtypeFromCode(99)).toThrow(/99/);
  });
});

describe("codeFromDtype", () => {
  it("round-trips every dtype through its ONNX code", () => {
    const all: DType[] = [
      "float32",
      "float64",
      "float16",
      "int64",
      "int32",
      "int16",
      "int8",
      "uint64",
      "uint32",
      "uint16",
      "uint8",
      "bool",
    ];
    for (const dtype of all) expect(dtypeFromCode(codeFromDtype(dtype))).toBe(dtype);
  });
});

describe("allocData", () => {
  it("picks the storage class for each dtype", () => {
    expect(allocData("float32", 2)).toBeInstanceOf(Float32Array);
    expect(allocData("float64", 2)).toBeInstanceOf(Float64Array);
    expect(allocData("int32", 2)).toBeInstanceOf(Int32Array);
    expect(allocData("int16", 2)).toBeInstanceOf(Int16Array);
    expect(allocData("int8", 2)).toBeInstanceOf(Int8Array);
    expect(allocData("uint32", 2)).toBeInstanceOf(Uint32Array);
    expect(allocData("uint16", 2)).toBeInstanceOf(Uint16Array);
  });

  // The three deliberate storage choices, each documented in the module header:
  // int64/uint64 ride in doubles so they stay usable as `number`, float16 is
  // upcast so arithmetic happens in f32, and bool shares uint8's byte array.
  it("stores int64 and uint64 in a Float64Array", () => {
    expect(allocData("int64", 2)).toBeInstanceOf(Float64Array);
    expect(allocData("uint64", 2)).toBeInstanceOf(Float64Array);
  });

  it("stores float16 upcast into a Float32Array", () => {
    expect(allocData("float16", 2)).toBeInstanceOf(Float32Array);
  });

  it("stores bool and uint8 in the same Uint8Array class", () => {
    expect(allocData("bool", 2)).toBeInstanceOf(Uint8Array);
    expect(allocData("uint8", 2)).toBeInstanceOf(Uint8Array);
  });

  it("allocates zeroed storage of the requested length", () => {
    const d = allocData("float32", 3);
    expect(d.length).toBe(3);
    expect(Array.from(d)).toEqual([0, 0, 0]);
  });
});

describe("Tensor", () => {
  it("rejects a data length that does not match the shape", () => {
    expect(() => new Tensor([2, 3], "float32", new Float32Array(5))).toThrow(
      /data length 5 does not match shape \[2,3\] \(6\)/,
    );
  });

  it("accepts a zero-element shape with an empty buffer", () => {
    const t = new Tensor([2, 0], "float32", new Float32Array(0));
    expect(t.size).toBe(0);
    expect(t.rank).toBe(2);
  });

  it("exposes size and rank from the buffer and the dims", () => {
    const t = tensorOf([2, 3], [1, 2, 3, 4, 5, 6]);
    expect(t.size).toBe(6);
    expect(t.rank).toBe(2);
  });

  // A reshape is a relabel, which is only safe because the layout is always
  // dense row-major. Sharing the buffer is the observable proof of that.
  it("reshape shares the backing buffer", () => {
    const t = tensorOf([2, 3], [1, 2, 3, 4, 5, 6]);
    const r = t.reshape([3, 2]);
    expect(r.data).toBe(t.data);
    expect(r.dims).toEqual([3, 2]);
    expect(r.dtype).toBe("float32");
  });

  it("clone does NOT share the buffer", () => {
    const t = tensorOf([2], [1, 2]);
    const c = t.clone();
    expect(c.data).not.toBe(t.data);
    expect(Array.from(c.data)).toEqual([1, 2]);
    c.data[0] = 99;
    expect(Array.from(t.data)).toEqual([1, 2]);
  });

  it("clone copies the dims array too, so a later mutation cannot reach back", () => {
    const t = tensorOf([2], [1, 2]);
    expect(t.clone().dims).not.toBe(t.dims);
  });

  it("asDType relabels without converting", () => {
    const t = tensorOf([2], [1, 0], "uint8");
    const b = t.asDType("bool");
    expect(b.dtype).toBe("bool");
    expect(b.data).toBe(t.data);
  });

  it("scalar() returns the single element of a rank-0 or one-element tensor", () => {
    expect(tensorOf([], [7]).scalar()).toBe(7);
    expect(tensorOf([1], [7]).scalar()).toBe(7);
    expect(tensorOf([1, 1], [7]).scalar()).toBe(7);
  });

  it("scalar() throws on anything with more than one element", () => {
    expect(() => tensorOf([2], [1, 2]).scalar()).toThrow(/expected a scalar tensor, got shape \[2\]/);
    expect(() => tensorOf([0], []).scalar()).toThrow(/expected a scalar tensor/);
  });

  it("toNumbers() materialises the buffer as a plain array", () => {
    const t = tensorOf([3], [4, 5, 6], "int64");
    expect(t.toNumbers()).toEqual([4, 5, 6]);
  });
});

describe("tensorOf", () => {
  it("defaults to float32 and honours an explicit dtype", () => {
    expect(tensorOf([2], [1, 2]).dtype).toBe("float32");
    const i = tensorOf([2], [1, 2], "int64");
    expect(i.dtype).toBe("int64");
    expect(i.data).toBeInstanceOf(Float64Array);
  });

  it("stores the values in row-major order under the given dims", () => {
    const t = tensorOf([2, 3], [1, 2, 3, 4, 5, 6]);
    expect(t.dims).toEqual([2, 3]);
    expect(Array.from(t.data)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("sameShape", () => {
  it("compares rank and every dim", () => {
    expect(sameShape([2, 3], [2, 3])).toBe(true);
    expect(sameShape([2, 3], [3, 2])).toBe(false);
    expect(sameShape([2, 3], [2, 3, 1])).toBe(false);
    expect(sameShape([], [])).toBe(true);
  });
});

describe("isFloatDType", () => {
  // Drives `Cast`'s truncate-toward-zero branch and `ReduceMax`'s choice of
  // -Infinity vs the integer minimum, so the float16 answer matters: its
  // arithmetic really is real-valued even though storage is f32.
  it("is true exactly for the real-valued types", () => {
    expect(isFloatDType("float32")).toBe(true);
    expect(isFloatDType("float64")).toBe(true);
    expect(isFloatDType("float16")).toBe(true);
    for (const d of ["int64", "int32", "int16", "int8", "uint64", "uint32", "uint16", "uint8", "bool"] as const) {
      expect(isFloatDType(d)).toBe(false);
    }
  });
});
