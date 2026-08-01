// ---------------------------------------------------------------------------
// `onnx.proto` → typed structures, transcribed field number by field number.
// Only the subset a forward pass needs is decoded; docs, metadata, training
// info, functions and sparse tensors are skipped by number.
//
// The two places this is easy to get wrong, and where the comments are dense:
//
//   1. TENSOR PAYLOAD. A TensorProto can carry its numbers in `raw_data` (a
//      little-endian byte blob) OR in one of the typed repeated fields
//      (`float_data`, `int32_data`, `int64_data`, `double_data`, `uint64_data`).
//      Exporters pick either. Worse, `int32_data` is an OVERLOAD: it also
//      carries int16, int8, uint16, uint8, bool and the raw bit patterns of
//      float16 — so its meaning depends on `data_type`, not on its own name.
//
//   2. EXTERNAL DATA. `data_location == EXTERNAL` means the weights live in a
//      sidecar file next to the .onnx. We cannot follow that from a browser
//      bundle, and a model whose initializers are all empty would otherwise run
//      and emit confident garbage. So it is a hard load-time error naming the
//      file it wanted.
// ---------------------------------------------------------------------------

import { ProtoReader } from "./protobuf";
import { Tensor, allocData, dtypeFromCode, numElements, type DType } from "./tensor";

/** The attribute kinds a forward pass can act on. `GRAPH`/`SPARSE_TENSOR` are
 *  decoded far enough to be recognised and then rejected by the ops that would
 *  need them, which is only the control-flow ops we do not support anyway. */
export type AttributeValue =
  | { kind: "float"; value: number }
  | { kind: "int"; value: number }
  | { kind: "string"; value: string }
  | { kind: "tensor"; value: Tensor }
  | { kind: "floats"; value: number[] }
  | { kind: "ints"; value: number[] }
  | { kind: "strings"; value: string[] }
  | { kind: "tensors"; value: Tensor[] }
  | { kind: "unsupported"; typeCode: number };

export interface Attribute {
  name: string;
  value: AttributeValue;
}

export interface OnnxNode {
  name: string;
  opType: string;
  domain: string;
  /** Input names. An EMPTY STRING is meaningful: it marks an omitted OPTIONAL
   *  input in a positional list, e.g. `Clip(x, "", max)` for a max-only clip.
   *  Collapsing it to a missing entry silently shifts every later input. */
  inputs: string[];
  outputs: string[];
  attributes: Map<string, AttributeValue>;
}

export interface ValueInfo {
  name: string;
  dtype: DType | undefined;
  /** `undefined` entries are symbolic dims (`batch`, `sequence`), which is why
   *  this cannot be a plain number[]. */
  dims: (number | undefined)[];
}

export interface OnnxGraph {
  name: string;
  nodes: OnnxNode[];
  initializers: Tensor[];
  initializerNames: string[];
  inputs: ValueInfo[];
  outputs: ValueInfo[];
}

export interface OnnxModel {
  irVersion: number;
  producerName: string;
  graph: OnnxGraph;
  /** Domain → opset version. The empty-string key is the default ONNX domain,
   *  and the version there is what every kernel branches on. */
  opsetImports: Map<string, number>;
}

// --- float16 -----------------------------------------------------------------

/** Decode an IEEE-754 binary16 bit pattern to a double. Written out rather than
 *  routed through a one-element Float16Array because that type is too new to
 *  rely on, and the arithmetic is four lines. */
export function float16ToFloat32(h: number): number {
  const sign = (h & 0x8000) !== 0 ? -1 : 1;
  const exponent = (h >> 10) & 0x1f;
  const mantissa = h & 0x03ff;
  if (exponent === 0) return sign * mantissa * 2 ** -24; // subnormal (and zero)
  if (exponent === 31) return mantissa === 0 ? sign * Infinity : NaN;
  return sign * (1 + mantissa / 1024) * 2 ** (exponent - 15);
}

// --- TensorProto -------------------------------------------------------------

/** Raw payload alternatives, kept separate until `data_type` says which one to
 *  believe. */
interface TensorPayload {
  raw?: Uint8Array;
  floats?: number[];
  int32s?: number[];
  int64s?: number[];
  doubles?: number[];
  uint64s?: number[];
}

function readTensorProto(r: ProtoReader): { name: string; tensor: Tensor } {
  const dims: number[] = [];
  let dataTypeCode = 0;
  let name = "";
  let dataLocation = 0;
  const externalKeys: string[] = [];
  const payload: TensorPayload = {};

  while (r.hasMore()) {
    const { field, wire } = r.tag();
    switch (field) {
      case 1:
        r.repeatedVarint(wire, dims);
        break;
      case 2:
        dataTypeCode = r.int32();
        break;
      case 4:
        payload.floats ??= [];
        r.repeatedFloat(wire, payload.floats);
        break;
      case 5:
        payload.int32s ??= [];
        r.repeatedVarint(wire, payload.int32s);
        break;
      case 7:
        payload.int64s ??= [];
        r.repeatedVarint(wire, payload.int64s);
        break;
      case 8:
        name = r.string();
        break;
      case 9:
        payload.raw = r.bytesField();
        break;
      case 10:
        payload.doubles ??= [];
        r.repeatedDouble(wire, payload.doubles);
        break;
      case 11:
        payload.uint64s ??= [];
        r.repeatedVarint(wire, payload.uint64s);
        break;
      case 13: {
        // StringStringEntryProto: 1 = key, 2 = value. We keep the `location`
        // value so the error can name the sidecar the model expected.
        const entry = r.message();
        let key = "";
        let value = "";
        while (entry.hasMore()) {
          const t = entry.tag();
          if (t.field === 1) key = entry.string();
          else if (t.field === 2) value = entry.string();
          else entry.skip(t.wire);
        }
        if (key === "location") externalKeys.push(value);
        break;
      }
      case 14:
        dataLocation = r.int32();
        break;
      default:
        r.skip(wire);
    }
  }

  if (dataLocation === 1) {
    const where = externalKeys.length > 0 ? `"${externalKeys.join('", "')}"` : "an unnamed sidecar file";
    throw new Error(
      `onnx: initializer "${name}" stores its weights externally (data_location=EXTERNAL, location=${where}). ` +
        `This loader reads a single self-contained .onnx; re-export with external data inlined ` +
        `(onnx.save with save_as_external_data=False, or onnx.load_external_data_for_model then re-save).`,
    );
  }

  const dtype = dtypeFromCode(dataTypeCode);
  const size = numElements(dims);
  const data = materialise(dtype, size, payload, name);
  return { name, tensor: new Tensor(dims, dtype, data) };
}

/**
 * Turn whichever payload the exporter chose into the tensor's typed array.
 *
 * `raw_data` wins when present: it is the only representation for which the
 * spec pins byte order (little-endian), so it can be memcpy'd. The typed
 * repeated fields are the fallback, and the awkward one is `int32_data`, which
 * the spec explicitly overloads to carry every type NARROWER than 32 bits —
 * int16, int8, uint16, uint8, bool, and float16/bfloat16 as raw bit patterns.
 * A reader that assumes `int32_data` means int32 silently produces float16
 * weights that are actually small integers.
 */
function materialise(dtype: DType, size: number, payload: TensorPayload, name: string): ReturnType<typeof allocData> {
  const out = allocData(dtype, size);

  if (payload.raw !== undefined) {
    readRaw(dtype, payload.raw, out, size, name);
    return out;
  }

  const src = pickTypedField(dtype, payload);
  if (src === undefined) {
    if (size === 0) return out;
    throw new Error(`onnx: initializer "${name}" (${dtype}) carries no data in any known field`);
  }
  if (src.length !== size) {
    throw new Error(
      `onnx: initializer "${name}" declares ${size} elements but its data field holds ${src.length}`,
    );
  }
  if (dtype === "float16") {
    // The int32_data overload: these are binary16 BIT PATTERNS, not numbers.
    for (let i = 0; i < size; i++) out[i] = float16ToFloat32(src[i] & 0xffff);
  } else {
    for (let i = 0; i < size; i++) out[i] = src[i];
  }
  return out;
}

function pickTypedField(dtype: DType, p: TensorPayload): number[] | undefined {
  switch (dtype) {
    case "float32":
      return p.floats;
    case "float64":
      return p.doubles;
    case "int64":
      return p.int64s;
    case "uint64":
      return p.uint64s;
    case "int32":
    case "uint32":
      // uint32 is spec'd into uint64_data, but exporters have used int32_data;
      // accept whichever showed up rather than fail on a legal-enough file.
      return p.int32s ?? p.uint64s ?? p.int64s;
    // Everything narrower than 32 bits rides in int32_data, float16 included.
    case "int16":
    case "int8":
    case "uint16":
    case "uint8":
    case "bool":
    case "float16":
      return p.int32s;
  }
}

/** Copy a little-endian `raw_data` blob into the typed array. Cannot use the
 *  typed-array constructor directly: `raw` is a `subarray` view whose byteOffset
 *  is rarely a multiple of the element size, which `new Float32Array(buffer,
 *  offset)` rejects. A DataView reads at any alignment. */
function readRaw(dtype: DType, raw: Uint8Array, out: ReturnType<typeof allocData>, size: number, name: string): void {
  const bytesPer = dtype === "bool" || dtype === "uint8" || dtype === "int8" ? 1
    : dtype === "float16" || dtype === "int16" || dtype === "uint16" ? 2
    : dtype === "float64" || dtype === "int64" || dtype === "uint64" ? 8
    : 4;
  if (raw.length !== size * bytesPer) {
    throw new Error(
      `onnx: initializer "${name}" raw_data is ${raw.length} bytes, expected ${size * bytesPer} for ${size} x ${dtype}`,
    );
  }
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  switch (dtype) {
    case "float32":
      for (let i = 0; i < size; i++) out[i] = view.getFloat32(i * 4, true);
      return;
    case "float64":
      for (let i = 0; i < size; i++) out[i] = view.getFloat64(i * 8, true);
      return;
    case "float16":
      for (let i = 0; i < size; i++) out[i] = float16ToFloat32(view.getUint16(i * 2, true));
      return;
    case "int64":
      // Recombined from halves — see the note in protobuf.ts on why not BigInt.
      for (let i = 0; i < size; i++) {
        const lo = view.getUint32(i * 8, true);
        const hi = view.getInt32(i * 8 + 4, true);
        out[i] = hi * 4294967296 + lo;
      }
      return;
    case "uint64":
      for (let i = 0; i < size; i++) {
        const lo = view.getUint32(i * 8, true);
        const hi = view.getUint32(i * 8 + 4, true);
        out[i] = hi * 4294967296 + lo;
      }
      return;
    case "int32":
      for (let i = 0; i < size; i++) out[i] = view.getInt32(i * 4, true);
      return;
    case "uint32":
      for (let i = 0; i < size; i++) out[i] = view.getUint32(i * 4, true);
      return;
    case "int16":
      for (let i = 0; i < size; i++) out[i] = view.getInt16(i * 2, true);
      return;
    case "uint16":
      for (let i = 0; i < size; i++) out[i] = view.getUint16(i * 2, true);
      return;
    case "int8":
      for (let i = 0; i < size; i++) out[i] = view.getInt8(i);
      return;
    case "uint8":
    case "bool":
      out.set(raw);
      return;
  }
}

// --- AttributeProto ----------------------------------------------------------

/** AttributeProto.AttributeType. Present so the decoder can honour the DECLARED
 *  type even when the corresponding value field is absent — which is how an
 *  empty list survives the wire. */
const ATTR_FLOAT = 1;
const ATTR_INT = 2;
const ATTR_STRING = 3;
const ATTR_TENSOR = 4;
const ATTR_FLOATS = 6;
const ATTR_INTS = 7;
const ATTR_STRINGS = 8;
const ATTR_TENSORS = 9;

function readAttribute(r: ProtoReader): Attribute {
  let name = "";
  let typeCode = 0;
  let f = 0;
  let i = 0;
  let s: string | undefined;
  let t: Tensor | undefined;
  const floats: number[] = [];
  const ints: number[] = [];
  const strings: string[] = [];
  const tensors: Tensor[] = [];
  let sawF = false;
  let sawI = false;

  while (r.hasMore()) {
    const { field, wire } = r.tag();
    switch (field) {
      case 1:
        name = r.string();
        break;
      case 2:
        f = r.float();
        sawF = true;
        break;
      case 3:
        i = r.varint();
        sawI = true;
        break;
      case 4:
        s = r.string();
        break;
      case 5:
        t = readTensorProto(r.message()).tensor;
        break;
      case 7:
        r.repeatedFloat(wire, floats);
        break;
      case 8:
        r.repeatedVarint(wire, ints);
        break;
      case 9:
        strings.push(r.string());
        break;
      case 10:
        tensors.push(readTensorProto(r.message()).tensor);
        break;
      case 20:
        typeCode = r.int32();
        break;
      default:
        r.skip(wire);
    }
  }

  // Dispatch on the DECLARED type first. This is what makes an explicitly-empty
  // list distinguishable from an absent attribute: `axes = []` arrives as
  // type=INTS with no `ints` entries, and `Reduce*` in opset 18 gives those two
  // cases opposite meanings (reduce nothing vs reduce everything).
  switch (typeCode) {
    case ATTR_FLOAT:
      return { name, value: { kind: "float", value: f } };
    case ATTR_INT:
      return { name, value: { kind: "int", value: i } };
    case ATTR_STRING:
      return { name, value: { kind: "string", value: s ?? "" } };
    case ATTR_TENSOR:
      if (t === undefined) throw new Error(`onnx: attribute "${name}" declares TENSOR but carries none`);
      return { name, value: { kind: "tensor", value: t } };
    case ATTR_FLOATS:
      return { name, value: { kind: "floats", value: floats } };
    case ATTR_INTS:
      return { name, value: { kind: "ints", value: ints } };
    case ATTR_STRINGS:
      return { name, value: { kind: "strings", value: strings } };
    case ATTR_TENSORS:
      return { name, value: { kind: "tensors", value: tensors } };
    default:
      break;
  }

  // No declared type (very old exporters omit field 20) — infer from whichever
  // value field actually arrived.
  if (tensors.length > 0) return { name, value: { kind: "tensors", value: tensors } };
  if (t !== undefined) return { name, value: { kind: "tensor", value: t } };
  if (strings.length > 0) return { name, value: { kind: "strings", value: strings } };
  if (ints.length > 0) return { name, value: { kind: "ints", value: ints } };
  if (floats.length > 0) return { name, value: { kind: "floats", value: floats } };
  if (s !== undefined) return { name, value: { kind: "string", value: s } };
  if (sawI) return { name, value: { kind: "int", value: i } };
  if (sawF) return { name, value: { kind: "float", value: f } };
  return { name, value: { kind: "unsupported", typeCode } };
}

// --- NodeProto / GraphProto / ModelProto -------------------------------------

function readNode(r: ProtoReader): OnnxNode {
  const node: OnnxNode = {
    name: "",
    opType: "",
    domain: "",
    inputs: [],
    outputs: [],
    attributes: new Map(),
  };
  while (r.hasMore()) {
    const { field, wire } = r.tag();
    switch (field) {
      case 1:
        node.inputs.push(r.string());
        break;
      case 2:
        node.outputs.push(r.string());
        break;
      case 3:
        node.name = r.string();
        break;
      case 4:
        node.opType = r.string();
        break;
      case 5: {
        const attr = readAttribute(r.message());
        node.attributes.set(attr.name, attr.value);
        break;
      }
      case 7:
        node.domain = r.string();
        break;
      default:
        r.skip(wire);
    }
  }
  return node;
}

function readValueInfo(r: ProtoReader): ValueInfo {
  let name = "";
  let dtype: DType | undefined;
  let dims: (number | undefined)[] = [];
  while (r.hasMore()) {
    const { field, wire } = r.tag();
    if (field === 1) {
      name = r.string();
    } else if (field === 2) {
      // TypeProto { 1: tensor_type }
      const type = r.message();
      while (type.hasMore()) {
        const tt = type.tag();
        if (tt.field === 1) {
          // TypeProto.Tensor { 1: elem_type, 2: shape }
          const tensorType = type.message();
          while (tensorType.hasMore()) {
            const ft = tensorType.tag();
            if (ft.field === 1) {
              const code = tensorType.int32();
              // A ValueInfo of an unsupported type is only fatal if the graph
              // actually feeds it, which the session decides. Leave it blank.
              dtype = DATA_TYPE_CODES.has(code) ? dtypeFromCode(code) : undefined;
            } else if (ft.field === 2) {
              dims = readShape(tensorType.message());
            } else {
              tensorType.skip(ft.wire);
            }
          }
        } else {
          type.skip(tt.wire);
        }
      }
    } else {
      r.skip(wire);
    }
  }
  return { name, dtype, dims };
}

/** Codes `dtypeFromCode` accepts. Kept next to `readValueInfo` so a declared-but-
 *  unused exotic type in the graph's value_info does not abort the load. */
const DATA_TYPE_CODES: ReadonlySet<number> = new Set([1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13]);

function readShape(r: ProtoReader): (number | undefined)[] {
  const dims: (number | undefined)[] = [];
  while (r.hasMore()) {
    const { field, wire } = r.tag();
    if (field === 1) {
      // Dimension { 1: dim_value, 2: dim_param }. A dim_param (`batch`) is a
      // SYMBOLIC dim; recording it as `undefined` is what keeps the session from
      // pretending it knows the batch size.
      const dim = r.message();
      let value: number | undefined;
      while (dim.hasMore()) {
        const dt = dim.tag();
        if (dt.field === 1) value = dim.varint();
        else if (dt.field === 2) {
          dim.string();
          value = undefined;
        } else dim.skip(dt.wire);
      }
      dims.push(value);
    } else {
      r.skip(wire);
    }
  }
  return dims;
}

function readGraph(r: ProtoReader): OnnxGraph {
  const graph: OnnxGraph = {
    name: "",
    nodes: [],
    initializers: [],
    initializerNames: [],
    inputs: [],
    outputs: [],
  };
  while (r.hasMore()) {
    const { field, wire } = r.tag();
    switch (field) {
      case 1:
        graph.nodes.push(readNode(r.message()));
        break;
      case 2:
        graph.name = r.string();
        break;
      case 5: {
        const init = readTensorProto(r.message());
        graph.initializers.push(init.tensor);
        graph.initializerNames.push(init.name);
        break;
      }
      case 11:
        graph.inputs.push(readValueInfo(r.message()));
        break;
      case 12:
        graph.outputs.push(readValueInfo(r.message()));
        break;
      case 15:
        throw new Error("onnx: sparse initializers are not supported by this loader");
      default:
        r.skip(wire);
    }
  }
  return graph;
}

/** Parse a serialized ModelProto. `bytes` is not retained: every tensor is
 *  copied out into its own typed array, so the caller may free the file buffer. */
export function parseModel(bytes: Uint8Array): OnnxModel {
  const r = new ProtoReader(bytes);
  let irVersion = 0;
  let producerName = "";
  let graph: OnnxGraph | undefined;
  const opsetImports = new Map<string, number>();

  while (r.hasMore()) {
    const { field, wire } = r.tag();
    switch (field) {
      case 1:
        irVersion = r.varint();
        break;
      case 2:
        producerName = r.string();
        break;
      case 7:
        graph = readGraph(r.message());
        break;
      case 8: {
        // OperatorSetIdProto { 1: domain, 2: version }. An ABSENT domain field
        // means the default ONNX domain, which is also the empty string — so
        // initialising to "" is not a fallback, it is the spec.
        const opset = r.message();
        let domain = "";
        let version = 0;
        while (opset.hasMore()) {
          const t = opset.tag();
          if (t.field === 1) domain = opset.string();
          else if (t.field === 2) version = opset.varint();
          else opset.skip(t.wire);
        }
        opsetImports.set(domain, version);
        break;
      }
      default:
        r.skip(wire);
    }
  }

  if (graph === undefined) throw new Error("onnx: model contains no graph");
  return { irVersion, producerName, graph, opsetImports };
}
