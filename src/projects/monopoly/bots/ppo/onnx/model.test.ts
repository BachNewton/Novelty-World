// Unit tests for the `onnx.proto` decoder.
//
// Every model here is a serialized ModelProto assembled BY HAND from the field
// numbers in onnx.proto, using the tiny writer below. Writing the bytes rather
// than loading a fixture is what makes the awkward cases reachable at all: a
// tensor whose payload rides in `int32_data` because its type is narrower than
// 32 bits, an INTS attribute that is declared but empty, an initializer that
// points at a sidecar file.

import { describe, expect, it } from "vitest";
import { float16ToFloat32, parseModel } from "./model";

// --- a minimal protobuf WRITER, local to the tests ---------------------------
// The engine has no encoder and must not grow one; these ~30 lines exist only
// so the expectations can be stated as "this exact byte sequence decodes to X".

/** 2^32, the multiplier that splits a JS number into two 32-bit halves. The
 *  engine deliberately never uses BigInt (int64 rides in a double), so neither
 *  does this writer. */
const TWO_32 = 4294967296;

/** Split a signed value into unsigned 32-bit halves of its 64-bit two's
 *  complement form — the representation protobuf encodes. */
function halves(value: number): { lo: number; hi: number } {
  const hi = Math.floor(value / TWO_32);
  return { lo: value - hi * TWO_32, hi: hi < 0 ? hi + TWO_32 : hi };
}

/** Base-128 varint. Negatives are sign-extended to 64 bits first, exactly as
 *  protobuf specifies, which is what produces the ten-byte form. */
function encodeVarint(value: number): number[] {
  const out: number[] = [];
  let { lo, hi } = halves(value);
  for (let i = 0; i < 10; i++) {
    const byte = lo & 0x7f;
    // Shift the 64-bit pair right by 7: the low seven bits of `hi` become the
    // top seven bits of `lo`. Done with arithmetic rather than `<<` because
    // `(hi & 0x7f) << 25` overflows into the sign bit.
    lo = ((lo >>> 7) + (hi & 0x7f) * 33554432) >>> 0;
    hi = Math.floor(hi / 128);
    if (lo === 0 && hi === 0) {
      out.push(byte);
      return out;
    }
    out.push(byte | 0x80);
  }
  return out;
}

function tagBytes(field: number, wire: number): number[] {
  return encodeVarint(field * 8 + wire);
}

/** A wire-type-0 field. */
function varintField(field: number, value: number): number[] {
  return [...tagBytes(field, 0), ...encodeVarint(value)];
}

/** A wire-type-2 field wrapping an already-encoded payload. */
function lenField(field: number, payload: readonly number[]): number[] {
  return [...tagBytes(field, 2), ...encodeVarint(payload.length), ...payload];
}

function stringField(field: number, value: string): number[] {
  return lenField(field, Array.from(new TextEncoder().encode(value)));
}

/** A packed repeated varint field. */
function packedVarints(field: number, values: readonly number[]): number[] {
  const payload: number[] = [];
  for (const v of values) payload.push(...encodeVarint(v));
  return lenField(field, payload);
}

/** A packed repeated float field. */
function packedFloats(field: number, values: readonly number[]): number[] {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < values.length; i++) view.setFloat32(i * 4, values[i], true);
  return lenField(field, Array.from(bytes));
}

function rawFloat32(values: readonly number[]): number[] {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < values.length; i++) view.setFloat32(i * 4, values[i], true);
  return Array.from(bytes);
}

/** Little-endian 8-byte two's complement, written as two 32-bit halves. */
function rawInt64(values: readonly number[]): number[] {
  const bytes = new Uint8Array(values.length * 8);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < values.length; i++) {
    const { lo, hi } = halves(values[i]);
    view.setUint32(i * 8, lo, true);
    view.setUint32(i * 8 + 4, hi, true);
  }
  return Array.from(bytes);
}

// --- ONNX proto builders -----------------------------------------------------
// Field numbers transcribed from onnx.proto; TensorProto: 1 dims, 2 data_type,
// 4 float_data, 5 int32_data, 7 int64_data, 8 name, 9 raw_data,
// 13 external_data, 14 data_location.

interface TensorSpec {
  name: string;
  dims: readonly number[];
  dataType: number;
  raw?: readonly number[];
  floats?: readonly number[];
  int32s?: readonly number[];
  int64s?: readonly number[];
  dataLocation?: number;
  externalLocation?: string;
}

function tensorProto(spec: TensorSpec): number[] {
  const out: number[] = [];
  for (const d of spec.dims) out.push(...varintField(1, d)); // unpacked dims
  out.push(...varintField(2, spec.dataType));
  if (spec.floats !== undefined) out.push(...packedFloats(4, spec.floats));
  if (spec.int32s !== undefined) out.push(...packedVarints(5, spec.int32s));
  if (spec.int64s !== undefined) out.push(...packedVarints(7, spec.int64s));
  out.push(...stringField(8, spec.name));
  if (spec.raw !== undefined) out.push(...lenField(9, spec.raw));
  if (spec.externalLocation !== undefined) {
    // StringStringEntryProto { 1: key, 2: value }
    out.push(...lenField(13, [...stringField(1, "location"), ...stringField(2, spec.externalLocation)]));
  }
  if (spec.dataLocation !== undefined) out.push(...varintField(14, spec.dataLocation));
  return out;
}

/** ModelProto: 1 ir_version, 2 producer_name, 7 graph, 8 opset_import. */
function modelProto(graph: readonly number[], opsets: readonly number[][] = [[...varintField(2, 18)]]): Uint8Array {
  const out: number[] = [...varintField(1, 8), ...stringField(2, "test-writer")];
  for (const o of opsets) out.push(...lenField(8, o));
  out.push(...lenField(7, graph));
  return new Uint8Array(out);
}

/** GraphProto: 1 node, 2 name, 5 initializer, 11 input, 12 output. */
function graphProto(parts: {
  name?: string;
  nodes?: readonly number[][];
  initializers?: readonly number[][];
  inputs?: readonly number[][];
  outputs?: readonly number[][];
}): number[] {
  const out: number[] = [];
  for (const n of parts.nodes ?? []) out.push(...lenField(1, n));
  out.push(...stringField(2, parts.name ?? "g"));
  for (const t of parts.initializers ?? []) out.push(...lenField(5, t));
  for (const v of parts.inputs ?? []) out.push(...lenField(11, v));
  for (const v of parts.outputs ?? []) out.push(...lenField(12, v));
  return out;
}

/** NodeProto: 1 input, 2 output, 3 name, 4 op_type, 5 attribute, 7 domain. */
function nodeProto(parts: {
  inputs?: readonly string[];
  outputs?: readonly string[];
  name?: string;
  opType: string;
  attributes?: readonly number[][];
  domain?: string;
  extra?: readonly number[];
}): number[] {
  const out: number[] = [];
  for (const i of parts.inputs ?? []) out.push(...stringField(1, i));
  for (const o of parts.outputs ?? []) out.push(...stringField(2, o));
  out.push(...stringField(3, parts.name ?? ""));
  out.push(...stringField(4, parts.opType));
  for (const a of parts.attributes ?? []) out.push(...lenField(5, a));
  if (parts.domain !== undefined) out.push(...stringField(7, parts.domain));
  if (parts.extra !== undefined) out.push(...parts.extra);
  return out;
}

/** AttributeProto: 1 name, 2 f, 3 i, 4 s, 5 t, 7 floats, 8 ints, 20 type. */
function attributeProto(parts: {
  name: string;
  type?: number;
  f?: number;
  i?: number;
  s?: string;
  t?: readonly number[];
  floats?: readonly number[];
  ints?: readonly number[];
}): number[] {
  const out: number[] = [...stringField(1, parts.name)];
  if (parts.f !== undefined) {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setFloat32(0, parts.f, true);
    out.push(...tagBytes(2, 5), ...bytes);
  }
  if (parts.i !== undefined) out.push(...varintField(3, parts.i));
  if (parts.s !== undefined) out.push(...stringField(4, parts.s));
  if (parts.t !== undefined) out.push(...lenField(5, parts.t));
  if (parts.floats !== undefined) out.push(...packedFloats(7, parts.floats));
  if (parts.ints !== undefined) out.push(...packedVarints(8, parts.ints));
  if (parts.type !== undefined) out.push(...varintField(20, parts.type));
  return out;
}

/**
 * ValueInfoProto: 1 name, 2 type.
 * TypeProto { 1: tensor_type }, TypeProto.Tensor { 1: elem_type, 2: shape },
 * TensorShapeProto { 1: dim }, Dimension { 1: dim_value, 2: dim_param }.
 * A string entry becomes a SYMBOLIC dim.
 */
function valueInfoProto(name: string, elemType: number, dims: readonly (number | string)[]): number[] {
  const shape: number[] = [];
  for (const d of dims) {
    shape.push(...lenField(1, typeof d === "number" ? varintField(1, d) : stringField(2, d)));
  }
  const tensorType = [...varintField(1, elemType), ...lenField(2, shape)];
  return [...stringField(1, name), ...lenField(2, lenField(1, tensorType))];
}

/** Parse a model holding exactly one initializer and hand back that tensor. */
function loadInitializer(spec: TensorSpec) {
  const model = parseModel(modelProto(graphProto({ initializers: [tensorProto(spec)] })));
  return { tensor: model.graph.initializers[0], name: model.graph.initializerNames[0] };
}

// --- tests -------------------------------------------------------------------

describe("parseModel: model-level fields", () => {
  it("decodes ir_version, producer_name and the graph name", () => {
    const model = parseModel(modelProto(graphProto({ name: "main_graph" })));
    expect(model.irVersion).toBe(8);
    expect(model.producerName).toBe("test-writer");
    expect(model.graph.name).toBe("main_graph");
  });

  // An ABSENT domain field on OperatorSetIdProto means the DEFAULT ONNX domain,
  // whose name is the empty string — so "" is the spec's own key, not a
  // fallback. Every kernel's opset branch reads that key.
  it("files an opset_import with no domain field under the \"\" key", () => {
    const model = parseModel(modelProto(graphProto({})));
    expect(model.opsetImports.get("")).toBe(18);
  });

  it("keeps a non-default domain separate from the default one", () => {
    const model = parseModel(
      modelProto(graphProto({}), [
        [...varintField(2, 18)],
        [...stringField(1, "com.microsoft"), ...varintField(2, 1)],
      ]),
    );
    expect(model.opsetImports.get("")).toBe(18);
    expect(model.opsetImports.get("com.microsoft")).toBe(1);
    expect(model.opsetImports.size).toBe(2);
  });

  it("rejects a model with no graph", () => {
    const bytes = new Uint8Array([...varintField(1, 8)]);
    expect(() => parseModel(bytes)).toThrow(/contains no graph/);
  });

  it("rejects sparse initializers by name rather than mis-parsing them", () => {
    const graph = [...stringField(2, "g"), ...lenField(15, [])];
    expect(() => parseModel(modelProto(graph))).toThrow(/sparse initializers are not supported/);
  });

  it("skips unknown model-level fields", () => {
    const bytes = new Uint8Array([
      ...varintField(1, 8),
      ...varintField(99, 12345), // never assigned in ModelProto
      ...lenField(7, graphProto({ name: "g" })),
    ]);
    expect(parseModel(bytes).graph.name).toBe("g");
  });
});

describe("TensorProto payloads", () => {
  // `raw_data` and the typed repeated fields are ALTERNATIVES; exporters pick
  // either, so both must land on identical numbers.
  it("decodes float32 identically from raw_data and from float_data", () => {
    const values = [1.5, -2.5, 0.5, 3.25];
    const viaRaw = loadInitializer({ name: "w", dims: [2, 2], dataType: 1, raw: rawFloat32(values) });
    const viaTyped = loadInitializer({ name: "w", dims: [2, 2], dataType: 1, floats: values });

    expect(viaRaw.name).toBe("w");
    expect(viaRaw.tensor.dtype).toBe("float32");
    expect(viaRaw.tensor.dims).toEqual([2, 2]);
    expect(Array.from(viaRaw.tensor.data)).toEqual(values);
    expect(Array.from(viaTyped.tensor.data)).toEqual(values);
  });

  it("decodes int64 identically from raw_data and from int64_data", () => {
    // 3000000000 exceeds 2^31, so it exercises the two-half recombination in
    // both the byte reader and the varint reader.
    const values = [1, -2, 3000000000];
    const viaRaw = loadInitializer({ name: "shape", dims: [3], dataType: 7, raw: rawInt64(values) });
    const viaTyped = loadInitializer({ name: "shape", dims: [3], dataType: 7, int64s: values });

    expect(viaRaw.tensor.dtype).toBe("int64");
    expect(viaRaw.tensor.data).toBeInstanceOf(Float64Array);
    expect(Array.from(viaRaw.tensor.data)).toEqual(values);
    expect(Array.from(viaTyped.tensor.data)).toEqual(values);
  });

  it("rejects a raw_data blob whose length disagrees with the declared shape", () => {
    expect(() => loadInitializer({ name: "w", dims: [4], dataType: 1, raw: rawFloat32([1, 2]) })).toThrow(
      /raw_data is 8 bytes, expected 16/,
    );
  });

  it("rejects a typed field whose element count disagrees with the shape", () => {
    expect(() => loadInitializer({ name: "w", dims: [4], dataType: 1, floats: [1, 2] })).toThrow(
      /declares 4 elements but its data field holds 2/,
    );
  });

  it("rejects an initializer carrying no payload at all", () => {
    expect(() => loadInitializer({ name: "w", dims: [2], dataType: 1 })).toThrow(/carries no data in any known field/);
  });
});

// `int32_data` is an OVERLOAD: the spec routes every type NARROWER than 32 bits
// through it, so its meaning depends on `data_type` and not on its own name. A
// reader that trusts the name produces int32 weights where the graph wanted
// bools — or float16 weights that are actually small integers.
describe("TensorProto int32_data narrow-integer overload", () => {
  it("carries int8", () => {
    const { tensor } = loadInitializer({ name: "q", dims: [2], dataType: 3, int32s: [-3, 5] });
    expect(tensor.dtype).toBe("int8");
    expect(tensor.data).toBeInstanceOf(Int8Array);
    expect(Array.from(tensor.data)).toEqual([-3, 5]);
  });

  it("carries uint8", () => {
    const { tensor } = loadInitializer({ name: "q", dims: [2], dataType: 2, int32s: [200, 0] });
    expect(tensor.dtype).toBe("uint8");
    expect(Array.from(tensor.data)).toEqual([200, 0]);
  });

  it("carries bool", () => {
    const { tensor } = loadInitializer({ name: "mask", dims: [3], dataType: 9, int32s: [0, 1, 1] });
    expect(tensor.dtype).toBe("bool");
    expect(tensor.data).toBeInstanceOf(Uint8Array);
    expect(Array.from(tensor.data)).toEqual([0, 1, 1]);
  });

  it("carries int16", () => {
    const { tensor } = loadInitializer({ name: "q", dims: [2], dataType: 5, int32s: [-300, 1000] });
    expect(tensor.dtype).toBe("int16");
    expect(tensor.data).toBeInstanceOf(Int16Array);
    expect(Array.from(tensor.data)).toEqual([-300, 1000]);
  });

  // float16 rides in int32_data as raw BIT PATTERNS, not as numbers — reading
  // them as integers would give 15360 where the model meant 1.0.
  it("carries float16 as binary16 bit patterns", () => {
    // 0x3C00 = 1.0, 0xC000 = -2.0, 0x3800 = 0.5 — all exact in binary16.
    const { tensor } = loadInitializer({ name: "h", dims: [3], dataType: 10, int32s: [0x3c00, 0xc000, 0x3800] });
    expect(tensor.dtype).toBe("float16");
    expect(tensor.data).toBeInstanceOf(Float32Array);
    expect(Array.from(tensor.data)).toEqual([1, -2, 0.5]);
  });

  it("decodes float16 from raw_data too", () => {
    const raw = [0x00, 0x3c, 0x00, 0xc0]; // little-endian 0x3C00, 0xC000
    const { tensor } = loadInitializer({ name: "h", dims: [2], dataType: 10, raw });
    expect(Array.from(tensor.data)).toEqual([1, -2]);
  });
});

describe("float16ToFloat32", () => {
  it("decodes exactly-representable normals", () => {
    expect(float16ToFloat32(0x3c00)).toBe(1);
    expect(float16ToFloat32(0xc000)).toBe(-2);
    expect(float16ToFloat32(0x3800)).toBe(0.5);
  });

  it("decodes zero and the infinities", () => {
    expect(float16ToFloat32(0x0000)).toBe(0);
    expect(float16ToFloat32(0x7c00)).toBe(Infinity);
    expect(float16ToFloat32(0xfc00)).toBe(-Infinity);
  });

  it("decodes NaN", () => {
    expect(float16ToFloat32(0x7e00)).toBeNaN();
  });

  // The subnormal branch is the one an exponent-shift-only implementation gets
  // wrong: with exponent 0 there is no implicit leading 1, and the quantum is
  // fixed at 2^-24 across the whole subnormal range.
  it("decodes the smallest subnormal as 2 ** -24", () => {
    expect(float16ToFloat32(0x0001)).toBe(2 ** -24);
    expect(float16ToFloat32(0x0001)).toBeCloseTo(5.960464477539063e-8, 12);
  });
});

describe("external data", () => {
  // Following a sidecar file is impossible from a bundle, and initializers left
  // empty would run and emit confident garbage — so this is a hard load error,
  // and it has to name BOTH the tensor and the file so the fix is obvious.
  it("throws naming the initializer and the sidecar location", () => {
    const spec: TensorSpec = {
      name: "trunk.0.weight",
      dims: [2],
      dataType: 1,
      dataLocation: 1,
      externalLocation: "model.onnx.data",
    };
    expect(() => loadInitializer(spec)).toThrow(/trunk\.0\.weight/);
    expect(() => loadInitializer(spec)).toThrow(/model\.onnx\.data/);
    expect(() => loadInitializer(spec)).toThrow(/data_location=EXTERNAL/);
  });

  it("still errors, less specifically, when no location entry is present", () => {
    expect(() => loadInitializer({ name: "w", dims: [2], dataType: 1, dataLocation: 1 })).toThrow(
      /an unnamed sidecar file/,
    );
  });

  it("does not trip on data_location = 0 (the in-file default)", () => {
    const { tensor } = loadInitializer({ name: "w", dims: [2], dataType: 1, floats: [1, 2], dataLocation: 0 });
    expect(Array.from(tensor.data)).toEqual([1, 2]);
  });
});

describe("unsupported element types", () => {
  it("names BFLOAT16 rather than reporting the bare code 16", () => {
    expect(() => loadInitializer({ name: "w", dims: [1], dataType: 16, raw: [0, 0] })).toThrow(/BFLOAT16/);
  });
});

describe("attribute decoding", () => {
  /** Parse a one-node graph and hand back that node. */
  function loadNode(parts: Parameters<typeof nodeProto>[0]) {
    return parseModel(modelProto(graphProto({ nodes: [nodeProto(parts)] }))).graph.nodes[0];
  }

  it("decodes FLOAT, INT, STRING and INTS", () => {
    const node = loadNode({
      opType: "Gemm",
      attributes: [
        attributeProto({ name: "alpha", type: 1, f: 0.5 }),
        attributeProto({ name: "axis", type: 2, i: -1 }),
        attributeProto({ name: "approximate", type: 3, s: "tanh" }),
        attributeProto({ name: "perm", type: 7, ints: [1, 0, 2] }),
      ],
    });
    expect(node.attributes.get("alpha")).toEqual({ kind: "float", value: 0.5 });
    expect(node.attributes.get("axis")).toEqual({ kind: "int", value: -1 });
    expect(node.attributes.get("approximate")).toEqual({ kind: "string", value: "tanh" });
    expect(node.attributes.get("perm")).toEqual({ kind: "ints", value: [1, 0, 2] });
  });

  // THE case that keeps `Reduce*` correct. An INTS attribute DECLARED (type=7)
  // but carrying no `ints` entries means "axes = []", which opset 18 gives a
  // meaning OPPOSITE to an absent axes attribute once `noop_with_empty_axes=1`
  // is in play. Decoding it as absent collapses the two.
  it("decodes a DECLARED but EMPTY INTS attribute as an empty list, not as absent", () => {
    const node = loadNode({
      opType: "ReduceSum",
      attributes: [attributeProto({ name: "axes", type: 7 })],
    });
    expect(node.attributes.has("axes")).toBe(true);
    expect(node.attributes.get("axes")).toEqual({ kind: "ints", value: [] });
  });

  it("decodes a FLOATS attribute", () => {
    const node = loadNode({
      opType: "Constant",
      attributes: [attributeProto({ name: "value_floats", type: 6, floats: [1.5, -2.5] })],
    });
    expect(node.attributes.get("value_floats")).toEqual({ kind: "floats", value: [1.5, -2.5] });
  });

  it("decodes a TENSOR attribute", () => {
    const node = loadNode({
      opType: "ConstantOfShape",
      attributes: [
        attributeProto({
          name: "value",
          type: 4,
          t: tensorProto({ name: "", dims: [1], dataType: 7, int64s: [7] }),
        }),
      ],
    });
    const attr = node.attributes.get("value");
    expect(attr?.kind).toBe("tensor");
    if (attr?.kind === "tensor") {
      expect(attr.value.dtype).toBe("int64");
      expect(Array.from(attr.value.data)).toEqual([7]);
    }
  });

  it("rejects a TENSOR attribute that declares its type but carries no tensor", () => {
    expect(() => loadNode({ opType: "Constant", attributes: [attributeProto({ name: "value", type: 4 })] })).toThrow(
      /declares TENSOR but carries none/,
    );
  });

  // Very old exporters omit field 20 entirely, so the decoder falls back to
  // whichever value field actually arrived.
  it("infers the kind when no type is declared", () => {
    const node = loadNode({
      opType: "Old",
      attributes: [
        attributeProto({ name: "ints_only", ints: [4, 5] }),
        attributeProto({ name: "int_only", i: 3 }),
        attributeProto({ name: "string_only", s: "x" }),
      ],
    });
    expect(node.attributes.get("ints_only")).toEqual({ kind: "ints", value: [4, 5] });
    expect(node.attributes.get("int_only")).toEqual({ kind: "int", value: 3 });
    expect(node.attributes.get("string_only")).toEqual({ kind: "string", value: "x" });
  });
});

describe("NodeProto decoding", () => {
  function loadNode(parts: Parameters<typeof nodeProto>[0]) {
    return parseModel(modelProto(graphProto({ nodes: [nodeProto(parts)] }))).graph.nodes[0];
  }

  it("decodes name, op_type, domain, inputs and outputs", () => {
    const node = loadNode({
      name: "/head/Gemm",
      opType: "Gemm",
      domain: "com.microsoft",
      inputs: ["x", "w", "b"],
      outputs: ["y"],
    });
    expect(node.name).toBe("/head/Gemm");
    expect(node.opType).toBe("Gemm");
    expect(node.domain).toBe("com.microsoft");
    expect(node.inputs).toEqual(["x", "w", "b"]);
    expect(node.outputs).toEqual(["y"]);
  });

  // An empty input NAME is the positional marker for an omitted OPTIONAL input
  // — `Clip(x, "", max)` is a max-only clip. Dropping the entry instead of
  // keeping the empty string shifts `max` into `min`'s slot.
  it("preserves an empty-string input as a positional placeholder", () => {
    const node = loadNode({ opType: "Clip", inputs: ["x", "", "max"], outputs: ["y"] });
    expect(node.inputs).toEqual(["x", "", "max"]);
    expect(node.inputs.length).toBe(3);
  });

  // Forward compatibility: a model exported by a newer ONNX release carries
  // fields this decoder has never heard of, and they must cost one skip().
  it("skips an unknown field number inside NodeProto", () => {
    const node = loadNode({
      opType: "Relu",
      inputs: ["x"],
      outputs: ["y"],
      extra: [...varintField(42, 999), ...stringField(43, "future")],
    });
    expect(node.opType).toBe("Relu");
    expect(node.inputs).toEqual(["x"]);
    expect(node.outputs).toEqual(["y"]);
  });
});

describe("ValueInfo decoding", () => {
  it("decodes a concrete dim_value as a number and a symbolic dim_param as undefined", () => {
    const model = parseModel(
      modelProto(
        graphProto({
          inputs: [valueInfoProto("obs", 1, ["batch", 76])],
          outputs: [valueInfoProto("logits", 1, [1, 64])],
        }),
      ),
    );
    const input = model.graph.inputs[0];
    expect(input.name).toBe("obs");
    expect(input.dtype).toBe("float32");
    // The symbolic axis must NOT decode as a number — the session has to know
    // it does not know the batch size.
    expect(input.dims).toEqual([undefined, 76]);

    const output = model.graph.outputs[0];
    expect(output.name).toBe("logits");
    expect(output.dims).toEqual([1, 64]);
  });

  it("decodes int64 and bool element types", () => {
    const model = parseModel(modelProto(graphProto({ inputs: [valueInfoProto("mask", 9, [4])] })));
    expect(model.graph.inputs[0].dtype).toBe("bool");
  });

  // A ValueInfo of a type this executor cannot hold is only fatal if the graph
  // actually feeds it, so the load must survive with a blank dtype.
  it("leaves the dtype undefined for an unsupported element type instead of throwing", () => {
    const model = parseModel(modelProto(graphProto({ inputs: [valueInfoProto("bf", 16, [4])] })));
    expect(model.graph.inputs[0].dtype).toBeUndefined();
    expect(model.graph.inputs[0].dims).toEqual([4]);
  });

  it("decodes a scalar (rank-0) value info as an empty dim list", () => {
    const model = parseModel(modelProto(graphProto({ inputs: [valueInfoProto("s", 1, [])] })));
    expect(model.graph.inputs[0].dims).toEqual([]);
  });
});

describe("initializer bookkeeping", () => {
  it("keeps initializers and their names in matching order", () => {
    const model = parseModel(
      modelProto(
        graphProto({
          initializers: [
            tensorProto({ name: "a", dims: [1], dataType: 1, floats: [1] }),
            tensorProto({ name: "b", dims: [2], dataType: 7, int64s: [2, 3] }),
          ],
        }),
      ),
    );
    expect(model.graph.initializerNames).toEqual(["a", "b"]);
    expect(Array.from(model.graph.initializers[0].data)).toEqual([1]);
    expect(Array.from(model.graph.initializers[1].data)).toEqual([2, 3]);
  });

  it("accepts a rank-0 initializer", () => {
    const { tensor } = loadInitializer({ name: "eps", dims: [], dataType: 1, floats: [0.5] });
    expect(tensor.dims).toEqual([]);
    expect(tensor.scalar()).toBe(0.5);
  });
});
