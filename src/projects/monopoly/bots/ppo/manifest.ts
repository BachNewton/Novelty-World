// ---------------------------------------------------------------------------
// The bundle manifest: `unknown` in, a fully typed description of a MODEL out.
//
// Nothing in this file may name the game. The manifest's whole purpose is that a
// net with a different head set needs a different manifest, not different
// consumer code — so a parser that recognised one game's head names would defeat
// the format it is parsing. Every game-shaped word here is a value read out of
// the JSON, never a literal compared against.
//
// Errors are PATH-QUALIFIED (`heads[2].null_column: expected integer, got "x"`).
// A manifest is an artifact produced by another toolchain on another machine;
// when it is wrong, the only useful message is the one that says exactly which
// field, because the reader has the file in front of them and nothing else.
// ---------------------------------------------------------------------------

/** The manifest MEANING this consumer speaks. A bump means a v-N consumer would
 *  MIS-READ a later file rather than fail on it, so an unrecognised version is
 *  refused outright instead of parsed optimistically. */
export const SUPPORTED_CONTRACT_VERSION = 2;

/** Thrown for any structural defect in the manifest. Always carries the JSON
 *  path of the offending field as the message prefix. */
export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManifestError";
  }
}

/** Thrown when two artifacts describe DIFFERENT action spaces. Distinct from
 *  `ManifestError` because the manifest is well-formed — it is merely for a
 *  different model, which is a deployment fact rather than a parse failure. */
export class ActionSpaceMismatch extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionSpaceMismatch";
  }
}

// ---------------------------------------------------------------------------
// Primitive validators. Each takes the JSON path so every failure names itself.
// ---------------------------------------------------------------------------

/** How a rejected value is echoed back. `JSON.stringify` keeps strings quoted
 *  and numbers bare, which is what makes `got "x"` distinguishable from
 *  `got x` — the entire point of the message in the `"3"`-vs-`3` case. */
function show(value: unknown): string {
  if (value === undefined) return "undefined";
  // `JSON.stringify` yields nothing for these. They cannot appear in parsed JSON
  // but can in a hand-built object handed straight to `parseManifest`.
  if (typeof value === "function" || typeof value === "symbol") return String(value);
  const text = JSON.stringify(value);
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

function fail(path: string, message: string): never {
  throw new ManifestError(`${path}: ${message}`);
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(path, `expected object, got ${show(value)}`);
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, `expected array, got ${show(value)}`);
  return value as unknown[];
}

function asString(value: unknown, path: string): string {
  if (typeof value !== "string") fail(path, `expected string, got ${show(value)}`);
  return value;
}

function asNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(path, `expected finite number, got ${show(value)}`);
  }
  return value;
}

function asInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    fail(path, `expected integer, got ${show(value)}`);
  }
  return value;
}

function asNonNegativeInteger(value: unknown, path: string): number {
  const n = asInteger(value, path);
  if (n < 0) fail(path, `expected a non-negative integer, got ${show(value)}`);
  return n;
}

function asBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail(path, `expected boolean, got ${show(value)}`);
  return value;
}

function asEnum<T extends string>(value: unknown, path: string, allowed: readonly T[]): T {
  const text = asString(value, path);
  if (!(allowed as readonly string[]).includes(text)) {
    fail(path, `expected one of ${allowed.map((a) => JSON.stringify(a)).join(" | ")}, got ${show(value)}`);
  }
  return text as T;
}

function asStringArray(value: unknown, path: string): string[] {
  return asArray(value, path).map((entry, i) => asString(entry, `${path}[${i}]`));
}

/** A key that must be present. Distinguished from a key present-but-wrong so the
 *  message says "missing" rather than "expected object, got undefined" — the
 *  reader's next action differs (add the field vs fix the field). */
function required(obj: Record<string, unknown>, key: string, path: string): unknown {
  if (!(key in obj)) fail(`${path}.${key}`, "missing (required)");
  return obj[key];
}

// ---------------------------------------------------------------------------
// feat_layout — the byte layout of one decision's packed observation blob
// ---------------------------------------------------------------------------

/** One run of scalars in the blob. `rows`/`cols` mean the run is a MATRIX, and a
 *  consumer must reshape it row-major: element (r, c) sits at `r * cols + c`.
 *  A Fortran-order reshape has the same shape and the same element multiset, so
 *  nothing downstream can detect it — it just silently transposes the field. */
export interface FeatField {
  readonly name: string;
  readonly count: number;
  readonly rows: number | null;
  readonly cols: number | null;
}

export interface FeatLayout {
  readonly floatCount: number;
  readonly boolCount: number;
  readonly byteLength: number;
  readonly floatFields: readonly FeatField[];
  readonly boolFields: readonly FeatField[];
}

export type FeatSection = "float_fields" | "bool_fields";

const FEAT_SECTIONS: readonly FeatSection[] = ["float_fields", "bool_fields"];

function parseFeatField(value: unknown, path: string): FeatField {
  const obj = asRecord(value, path);
  const name = asString(required(obj, "name", path), `${path}.name`);
  const count = asNonNegativeInteger(required(obj, "count", path), `${path}.count`);
  const hasRows = "rows" in obj;
  const hasCols = "cols" in obj;
  if (hasRows !== hasCols) {
    fail(path, `rows and cols must be declared together (rows ${hasRows ? "present" : "absent"}, cols ${hasCols ? "present" : "absent"})`);
  }
  if (!hasRows) return { name, count, rows: null, cols: null };
  const rows = asNonNegativeInteger(obj.rows, `${path}.rows`);
  const cols = asNonNegativeInteger(obj.cols, `${path}.cols`);
  // A count that disagrees with rows*cols is the one defect that would produce a
  // correctly-shaped but wrongly-sliced read of every field AFTER this one.
  if (rows * cols !== count) {
    fail(path, `count ${count} does not equal rows * cols (${rows} * ${cols} = ${rows * cols})`);
  }
  return { name, count, rows, cols };
}

function parseFeatLayout(value: unknown, path: string): FeatLayout {
  const obj = asRecord(value, path);
  const floatFields = asArray(required(obj, "float_fields", path), `${path}.float_fields`).map(
    (f, i) => parseFeatField(f, `${path}.float_fields[${i}]`),
  );
  const boolFields = asArray(required(obj, "bool_fields", path), `${path}.bool_fields`).map(
    (f, i) => parseFeatField(f, `${path}.bool_fields[${i}]`),
  );
  const floatCount = asNonNegativeInteger(required(obj, "float_count", path), `${path}.float_count`);
  const boolCount = asNonNegativeInteger(required(obj, "bool_count", path), `${path}.bool_count`);
  const byteLength = asNonNegativeInteger(required(obj, "byte_length", path), `${path}.byte_length`);

  const floatSum = floatFields.reduce((a, f) => a + f.count, 0);
  const boolSum = boolFields.reduce((a, f) => a + f.count, 0);
  if (floatSum !== floatCount) {
    fail(`${path}.float_count`, `declares ${floatCount} but float_fields sum to ${floatSum}`);
  }
  if (boolSum !== boolCount) {
    fail(`${path}.bool_count`, `declares ${boolCount} but bool_fields sum to ${boolSum}`);
  }
  // The blob is float32 LE * float_count then uint8 * bool_count. A byte_length
  // that disagrees means one side of the wire is packing a different blob.
  const derived = floatCount * 4 + boolCount;
  if (byteLength !== derived) {
    fail(`${path}.byte_length`, `declares ${byteLength} but float_count * 4 + bool_count is ${derived}`);
  }

  const seen = new Set<string>();
  for (const section of [floatFields, boolFields]) {
    for (const field of section) {
      // Fields are addressed by (section, name), but a name reused ACROSS the two
      // sections would still make `heads[].mask.source.field` ambiguous to read.
      if (seen.has(field.name)) fail(path, `duplicate field name ${JSON.stringify(field.name)}`);
      seen.add(field.name);
    }
  }
  return { floatCount, boolCount, byteLength, floatFields, boolFields };
}

/** Byte offset and element count of one field within the packed blob. Returns
 *  `null` when the field is not declared, so callers can produce their own
 *  domain-appropriate error. */
export function locateFeatField(
  layout: FeatLayout,
  section: FeatSection,
  field: string,
): { readonly byteOffset: number; readonly count: number; readonly field: FeatField } | null {
  const fields = section === "float_fields" ? layout.floatFields : layout.boolFields;
  let offset = section === "float_fields" ? 0 : layout.floatCount * 4;
  const elementBytes = section === "float_fields" ? 4 : 1;
  for (const candidate of fields) {
    if (candidate.name === field) {
      return { byteOffset: offset, count: candidate.count, field: candidate };
    }
    offset += candidate.count * elementBytes;
  }
  return null;
}

// ---------------------------------------------------------------------------
// inputs[]
// ---------------------------------------------------------------------------

/** A graph axis. Strings are DYNAMIC (only the batch axis ever is); integers are
 *  static and mandatory — the graph baked them in at trace time, so a consumer
 *  that feeds a different width is feeding a different model. */
export type Dim = number | string;

function parseDims(value: unknown, path: string): Dim[] {
  return asArray(value, path).map((d, i) => {
    if (typeof d === "string") return d;
    return asNonNegativeInteger(d, `${path}[${i}]`);
  });
}

export type SourceSpec =
  | { readonly kind: "feat_layout"; readonly section: FeatSection; readonly field: string }
  | { readonly kind: "wire"; readonly field: string; readonly dtype: string | null; readonly shape: readonly Dim[] | null };

const SOURCE_KINDS = ["feat_layout", "wire"] as const;

function parseSource(value: unknown, path: string): SourceSpec {
  const obj = asRecord(value, path);
  const kind = asEnum(required(obj, "kind", path), `${path}.kind`, SOURCE_KINDS);
  const field = asString(required(obj, "field", path), `${path}.field`);
  if (kind === "feat_layout") {
    return {
      kind,
      section: asEnum(required(obj, "section", path), `${path}.section`, FEAT_SECTIONS),
      field,
    };
  }
  return {
    kind,
    field,
    dtype: "dtype" in obj ? asString(obj.dtype, `${path}.dtype`) : null,
    shape: "shape" in obj ? parseDims(obj.shape, `${path}.shape`) : null,
  };
}

export type InputDType = "float32" | "uint8";

const INPUT_DTYPES: readonly InputDType[] = ["float32", "uint8"];

export interface InputSpec {
  readonly name: string;
  readonly shape: readonly Dim[];
  readonly dtype: InputDType;
  /** Present when the graph converts the input on the way in. A `bool` graph
   *  input is a portability hazard across runtimes and language bindings, so
   *  such inputs ship as uint8 and cast inside the graph; any nonzero is true. */
  readonly castInGraph: string | null;
  readonly source: SourceSpec;
}

function parseInput(value: unknown, path: string): InputSpec {
  const obj = asRecord(value, path);
  return {
    name: asString(required(obj, "name", path), `${path}.name`),
    shape: parseDims(required(obj, "shape", path), `${path}.shape`),
    dtype: asEnum(required(obj, "dtype", path), `${path}.dtype`, INPUT_DTYPES),
    castInGraph: "cast_in_graph" in obj ? asString(obj.cast_in_graph, `${path}.cast_in_graph`) : null,
    source: parseSource(required(obj, "source", path), `${path}.source`),
  };
}

// ---------------------------------------------------------------------------
// heads[].mask
// ---------------------------------------------------------------------------

export type MaskSpec =
  | {
      readonly kind: "bool_array";
      readonly source: SourceSpec;
      readonly shape: readonly Dim[];
    }
  | {
      readonly kind: "count";
      /** Must be `wire`. A count is a CARDINALITY, and the packed blob's boolean
       *  section holds 0/1 bytes — a blob-backed count of 17 reads back as 1 and
       *  the head sees one legal row instead of seventeen. `parseManifest`
       *  rejects any other source, but the field stays widely typed so a
       *  hand-built manifest that never went through the parser still meets a
       *  live guard downstream rather than a type-erased assumption. */
      readonly source: SourceSpec;
      readonly shape: readonly Dim[];
    };

const MASK_KINDS = ["bool_array", "count"] as const;

function parseMask(value: unknown, path: string): MaskSpec | null {
  if (value === null) return null;
  const obj = asRecord(value, path);
  const kind = asEnum(required(obj, "kind", path), `${path}.kind`, MASK_KINDS);
  const source = parseSource(required(obj, "source", path), `${path}.source`);
  const shape = parseDims(required(obj, "shape", path), `${path}.shape`);
  if (kind === "count") {
    if (source.kind !== "wire") {
      fail(
        `${path}.source.kind`,
        `a count mask's source must be "wire", got ${show(source.kind)} for field ` +
          `${JSON.stringify(source.field)} — the packed blob's boolean section stores 0/1 bytes ` +
          `and cannot carry a cardinality`,
      );
    }
    return { kind, source, shape };
  }
  return { kind, source, shape };
}

// ---------------------------------------------------------------------------
// heads[]
// ---------------------------------------------------------------------------

/** The CLOSED set of distribution primitives. A consumer that meets a kind it
 *  does not recognise MUST FAIL: skipping the head drops a whole factor of the
 *  joint, and nothing downstream reports it — the remaining heads still sample,
 *  still normalize, and still look right. */
export const HEAD_KINDS = ["categorical", "entity_pointer", "per_entity_categorical", "gaussian"] as const;

export type HeadKind = (typeof HEAD_KINDS)[number];

export type SelectMode = "one" | "independent";

const SELECT_MODES: readonly SelectMode[] = ["one", "independent"];

export interface StorageSpec {
  readonly dtype: string;
  readonly shape: readonly number[];
  /** Present when the stored index is a FLATTENED grid coordinate. Normative:
   *  decode row-major (`row = flat / nOps`, `op = flat % nOps`). The transposed
   *  decode produces an in-range index for a different cell — a legal-looking,
   *  wrong action. */
  readonly flat: string | null;
}

function parseStorage(value: unknown, path: string): StorageSpec {
  const obj = asRecord(value, path);
  return {
    dtype: asString(required(obj, "dtype", path), `${path}.dtype`),
    shape: asArray(required(obj, "shape", path), `${path}.shape`).map((d, i) =>
      asNonNegativeInteger(d, `${path}.shape[${i}]`),
    ),
    flat: "flat" in obj ? asString(obj.flat, `${path}.flat`) : null,
  };
}

interface HeadCommon {
  readonly name: string;
  readonly distClass: string;
  readonly group: string;
  /** The logits tensor. `null` for a continuous head, which has no logits. */
  readonly outputTensor: string | null;
  /** role -> tensor name. The AUTHORITATIVE map; always populated. */
  readonly outputTensors: Readonly<Record<string, string>>;
  readonly shape: readonly Dim[];
  readonly axes: readonly string[];
  readonly mask: MaskSpec | null;
  readonly storage: StorageSpec;
}

/** Fields carried by DISCRETE heads only. A continuous head has no discrete
 *  vocabulary to collapse onto, so it carries none of the three and a parser
 *  must treat them as absent-and-fine there rather than as required keys. */
interface DiscreteHeadCommon extends HeadCommon {
  /** The column an all-illegal row collapses onto. MAY BE NEGATIVE — counts from
   *  the end, which is how a learned null token declares "my last column". */
  readonly nullColumn: number;
  readonly nullToken: boolean;
  /** Scoped to `mask.kind: "count"`, where it forces `nullColumn` legal on every
   *  row. On a `bool_array` head it is NOT applicable: that head's legality is
   *  EXACTLY the array, and a consumer must not force any column legal whatever
   *  the flag says. */
  readonly nullAlwaysLegal: boolean;
}

export interface CategoricalHead extends DiscreteHeadCommon {
  readonly kind: "categorical";
  readonly tokens: readonly string[];
}

export interface EntityPointerHead extends DiscreteHeadCommon {
  readonly kind: "entity_pointer";
  readonly entity: string;
  readonly entityRows: number;
  readonly nullName: string | null;
}

export interface PerEntityCategoricalHead extends DiscreteHeadCommon {
  readonly kind: "per_entity_categorical";
  readonly entity: string;
  readonly rows: number;
  /** Decides the JOINT, not the shape.
   *
   *  `"independent"` — `rows` independent categoricals, one per row, softmaxed
   *  over the last axis; log-prob and entropy SUM over rows; the all-illegal
   *  collapse is evaluated PER ROW.
   *
   *  `"one"` — ONE categorical over the whole grid. Logits AND mask reshape to
   *  `[batch, rows * nOps]` row-major BEFORE masking, so the collapse is a
   *  property of the flattened row and the distribution sums to 1 per item.
   *
   *  Softmaxing the last axis under `"one"` yields `rows` distributions summing
   *  to `rows` instead of one summing to 1 — a different policy, with no shape
   *  change anywhere to reveal it. */
  readonly select: SelectMode;
  /** Exactly one of `ops` / `destEntity` is non-null. Read the non-null one; do
   *  not test for the key's presence, since both keys are always emitted. */
  readonly ops: readonly string[] | null;
  readonly destEntity: string | null;
  readonly nullName: string | null;
}

export interface GaussianHead extends HeadCommon {
  readonly kind: "gaussian";
  readonly conditioning: string | null;
  readonly entity: string | null;
  readonly excludeSelfRow: boolean;
  readonly nSlots: number;
  /** `"zero_sum_derived_slot"` — the self slot is NOT in the tensors at all, so
   *  it can never leak into density, entropy or gradients; the consumer derives
   *  it. `"none"` — no derived slot. See `gaussianWireVector` in `heads.ts`. */
  readonly constraint: string;
  readonly wireDim: number;
  readonly logStd: string | null;
}

export type HeadSpec = CategoricalHead | EntityPointerHead | PerEntityCategoricalHead | GaussianHead;

function parseOutputTensors(value: unknown, path: string): Record<string, string> {
  const obj = asRecord(value, path);
  const out: Record<string, string> = {};
  for (const key of Object.keys(obj)) out[key] = asString(obj[key], `${path}.${key}`);
  if (Object.keys(out).length === 0) fail(path, "expected at least one role -> tensor entry");
  return out;
}

function parseHeadCommon(obj: Record<string, unknown>, path: string): HeadCommon {
  const outputTensorRaw = required(obj, "output_tensor", path);
  return {
    name: asString(required(obj, "name", path), `${path}.name`),
    distClass: asString(required(obj, "dist_class", path), `${path}.dist_class`),
    group: asString(required(obj, "group", path), `${path}.group`),
    outputTensor: outputTensorRaw === null ? null : asString(outputTensorRaw, `${path}.output_tensor`),
    outputTensors: parseOutputTensors(required(obj, "output_tensors", path), `${path}.output_tensors`),
    shape: parseDims(required(obj, "shape", path), `${path}.shape`),
    axes: asStringArray(required(obj, "axes", path), `${path}.axes`),
    mask: parseMask(required(obj, "mask", path), `${path}.mask`),
    storage: parseStorage(required(obj, "storage", path), `${path}.storage`),
  };
}

function parseDiscreteCommon(obj: Record<string, unknown>, path: string): DiscreteHeadCommon {
  return {
    ...parseHeadCommon(obj, path),
    nullColumn: asInteger(required(obj, "null_column", path), `${path}.null_column`),
    nullToken: asBoolean(required(obj, "null_token", path), `${path}.null_token`),
    nullAlwaysLegal: asBoolean(required(obj, "null_always_legal", path), `${path}.null_always_legal`),
  };
}

function optionalString(obj: Record<string, unknown>, key: string, path: string): string | null {
  if (!(key in obj)) return null;
  const value = obj[key];
  return value === null ? null : asString(value, `${path}.${key}`);
}

function parseHead(value: unknown, path: string): HeadSpec {
  const obj = asRecord(value, path);
  const kind = asEnum(required(obj, "kind", path), `${path}.kind`, HEAD_KINDS);
  switch (kind) {
    case "categorical":
      return {
        ...parseDiscreteCommon(obj, path),
        kind,
        tokens: asStringArray(required(obj, "tokens", path), `${path}.tokens`),
      };
    case "entity_pointer":
      return {
        ...parseDiscreteCommon(obj, path),
        kind,
        entity: asString(required(obj, "entity", path), `${path}.entity`),
        entityRows: asNonNegativeInteger(required(obj, "entity_rows", path), `${path}.entity_rows`),
        nullName: optionalString(obj, "null_name", path),
      };
    case "per_entity_categorical": {
      const opsRaw = required(obj, "ops", path);
      const destRaw = required(obj, "dest_entity", path);
      const ops = opsRaw === null ? null : asStringArray(opsRaw, `${path}.ops`);
      const destEntity = destRaw === null ? null : asString(destRaw, `${path}.dest_entity`);
      // Both keys are always emitted and exactly one is non-null; the column axis
      // is either a fixed op vocabulary or another entity's rows, and a head with
      // neither (or both) has no defined column width.
      if ((ops === null) === (destEntity === null)) {
        fail(path, `exactly one of ops / dest_entity must be non-null (ops ${ops === null ? "null" : "set"}, dest_entity ${destEntity === null ? "null" : "set"})`);
      }
      return {
        ...parseDiscreteCommon(obj, path),
        kind,
        entity: asString(required(obj, "entity", path), `${path}.entity`),
        rows: asNonNegativeInteger(required(obj, "rows", path), `${path}.rows`),
        select: asEnum(required(obj, "select", path), `${path}.select`, SELECT_MODES),
        ops,
        destEntity,
        nullName: optionalString(obj, "null_name", path),
      };
    }
    case "gaussian":
      return {
        ...parseHeadCommon(obj, path),
        kind,
        conditioning: optionalString(obj, "conditioning", path),
        entity: optionalString(obj, "entity", path),
        excludeSelfRow: "exclude_self_row" in obj ? asBoolean(obj.exclude_self_row, `${path}.exclude_self_row`) : false,
        nSlots: asNonNegativeInteger(required(obj, "n_slots", path), `${path}.n_slots`),
        constraint: asString(required(obj, "constraint", path), `${path}.constraint`),
        wireDim: asNonNegativeInteger(required(obj, "wire_dim", path), `${path}.wire_dim`),
        logStd: optionalString(obj, "log_std", path),
      };
  }
}

/** Narrowing helper: the discrete heads share every field the masking path uses,
 *  and the continuous one shares none of them. */
export function isDiscreteHead(head: HeadSpec): head is CategoricalHead | EntityPointerHead | PerEntityCategoricalHead {
  return head.kind !== "gaussian";
}

// ---------------------------------------------------------------------------
// values[] — non-policy scalar outputs
// ---------------------------------------------------------------------------

export interface ValueSpec {
  readonly name: string;
  readonly outputTensor: string;
  readonly shape: readonly Dim[];
  /** Which row of the output belongs to the acting entity. */
  readonly actingRow: number | null;
  readonly semantics: string | null;
}

function parseValue(value: unknown, path: string): ValueSpec {
  const obj = asRecord(value, path);
  return {
    name: asString(required(obj, "name", path), `${path}.name`),
    outputTensor: asString(required(obj, "output_tensor", path), `${path}.output_tensor`),
    shape: parseDims(required(obj, "shape", path), `${path}.shape`),
    actingRow: "acting_row" in obj && obj.acting_row !== null ? asInteger(obj.acting_row, `${path}.acting_row`) : null,
    semantics: optionalString(obj, "semantics", path),
  };
}

// ---------------------------------------------------------------------------
// composition — the joint, as data
// ---------------------------------------------------------------------------

export interface GateSpec {
  readonly head: string;
  readonly token: string;
  /** `null` when the gate token is absent from the vocabulary; the gate then
   *  NEVER fires, which is the reference implementation's degradation rather
   *  than an error. */
  readonly tokenIndex: number | null;
}

export interface GroupSpec {
  readonly name: string;
  readonly id: number;
  readonly heads: readonly string[];
  /** `null` makes the group ROUTED — one of the groups an observation may NAME,
   *  exactly one active per transition. Non-null makes it GATED: never named,
   *  sampled on every row, and entering the joint only when the gating head
   *  selected `tokenIndex`. */
  readonly gate: GateSpec | null;
}

export interface Composition {
  readonly groups: readonly GroupSpec[];
  readonly routed: readonly string[];
  readonly gated: readonly { readonly head: string; readonly by: GateSpec }[];
  readonly logProb: string | null;
  readonly entropy: string | null;
}

function parseGate(value: unknown, path: string): GateSpec | null {
  if (value === null) return null;
  const obj = asRecord(value, path);
  const indexRaw = required(obj, "token_index", path);
  return {
    head: asString(required(obj, "head", path), `${path}.head`),
    token: asString(required(obj, "token", path), `${path}.token`),
    tokenIndex: indexRaw === null ? null : asInteger(indexRaw, `${path}.token_index`),
  };
}

function parseComposition(value: unknown, path: string): Composition {
  const obj = asRecord(value, path);
  const groups = asArray(required(obj, "groups", path), `${path}.groups`).map((g, i) => {
    const gp = `${path}.groups[${i}]`;
    const go = asRecord(g, gp);
    return {
      name: asString(required(go, "name", gp), `${gp}.name`),
      id: asInteger(required(go, "id", gp), `${gp}.id`),
      heads: asStringArray(required(go, "heads", gp), `${gp}.heads`),
      gate: parseGate(required(go, "gate", gp), `${gp}.gate`),
    };
  });
  const gated = asArray(required(obj, "gated", path), `${path}.gated`).map((g, i) => {
    const gp = `${path}.gated[${i}]`;
    const go = asRecord(g, gp);
    const by = parseGate(required(go, "by", gp), `${gp}.by`);
    if (by === null) fail(`${gp}.by`, "a gated entry must declare its gate, got null");
    return { head: asString(required(go, "head", gp), `${gp}.head`), by };
  });
  return {
    groups,
    routed: asStringArray(required(obj, "routed", path), `${path}.routed`),
    gated,
    logProb: optionalString(obj, "log_prob", path),
    entropy: optionalString(obj, "entropy", path),
  };
}

// ---------------------------------------------------------------------------
// masking
// ---------------------------------------------------------------------------

export interface CollapseSpec {
  readonly enabled: boolean;
  readonly rule: string | null;
  readonly reference: string | null;
}

export interface MaskingSpec {
  /** A large FINITE negative, never `-Infinity`: a discarded lane must not be
   *  able to produce NaN. */
  readonly negInf: number;
  readonly apply: string | null;
  readonly collapseAllIllegal: CollapseSpec;
}

function parseMasking(value: unknown, path: string): MaskingSpec {
  const obj = asRecord(value, path);
  const negInf = asNumber(required(obj, "neg_inf", path), `${path}.neg_inf`);
  if (negInf >= 0) fail(`${path}.neg_inf`, `expected a negative number, got ${show(negInf)}`);
  const cp = `${path}.collapse_all_illegal`;
  const collapse = asRecord(required(obj, "collapse_all_illegal", path), cp);
  return {
    negInf,
    apply: optionalString(obj, "apply", path),
    collapseAllIllegal: {
      enabled: asBoolean(required(collapse, "enabled", cp), `${cp}.enabled`),
      rule: optionalString(collapse, "rule", cp),
      reference: optionalString(collapse, "reference", cp),
    },
  };
}

// ---------------------------------------------------------------------------
// action_geometry — the load-compatibility guard
// ---------------------------------------------------------------------------

/** A geometry entry. Deliberately narrow: the guard compares by value, so a
 *  nested object would silently compare by identity and never mismatch. */
export type GeometryValue = number | string | boolean;

export type ActionGeometry = Readonly<Record<string, GeometryValue>>;

function parseGeometry(value: unknown, path: string): ActionGeometry {
  const obj = asRecord(value, path);
  const out: Record<string, GeometryValue> = {};
  for (const key of Object.keys(obj)) {
    const entry = obj[key];
    if (typeof entry === "number") {
      out[key] = asInteger(entry, `${path}.${key}`);
    } else if (typeof entry === "string" || typeof entry === "boolean") {
      out[key] = entry;
    } else {
      fail(`${path}.${key}`, `expected integer, string or boolean, got ${show(entry)}`);
    }
  }
  if (Object.keys(out).length === 0) fail(path, "expected at least one geometry key");
  return out;
}

/** The value `dims` implies for one geometry key, generically.
 *
 *  Every geometry entry is either the dims field of the same name verbatim, or —
 *  when that field is a LIST — its length. That is the whole mapping, and stating
 *  it as a rule rather than a per-key table is what keeps the guard game-agnostic:
 *  a vocabulary lives in `dims` as its ordered names and in the geometry as its
 *  width, because two nets with the same-sized vocabulary are load-compatible and
 *  two with different SPELLINGS of it are not. */
function geometryFromDims(dims: Readonly<Record<string, unknown>>, key: string, path: string): GeometryValue {
  if (!(key in dims)) {
    // The reference implementation reconstructs a dataclass here, so a missing
    // key silently takes that dataclass's default. A game-agnostic consumer has
    // no defaults to fall back on, and inventing one is exactly how a stale
    // artifact talks its way past the guard — so demand the key instead.
    fail(path, `action_geometry declares ${JSON.stringify(key)} but dims does not, so the manifest cannot be checked against itself`);
  }
  const value = dims[key];
  if (Array.isArray(value)) return value.length;
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") return value;
  fail(path, `dims.${key} is ${show(value)}, which implies no geometry value`);
}

/** Refuse a manifest that disagrees with ITSELF: an `action_geometry` edited away
 *  from what its own `dims` imply. Without this, a hand-patched geometry block
 *  could talk a consumer straight past its own compatibility guard. */
function assertGeometrySelfConsistent(geometry: ActionGeometry, dims: Readonly<Record<string, unknown>>): void {
  const diffs: string[] = [];
  for (const key of Object.keys(geometry)) {
    const derived = geometryFromDims(dims, key, `action_geometry.${key}`);
    if (geometry[key] !== derived) {
      diffs.push(`${key}: action_geometry=${show(geometry[key])} vs dims-derived=${show(derived)}`);
    }
  }
  if (diffs.length > 0) {
    throw new ActionSpaceMismatch(
      `manifest is internally inconsistent: its recorded action_geometry does not match the ` +
        `geometry its own dims imply (${diffs.join(", ")}). The artifact cannot be trusted; re-export it.`,
    );
  }
}

/**
 * Refuse `other` unless it describes the same action space as `live`.
 *
 * This exists so a consumer can REFUSE an incompatible graph. Head widths alone
 * are not enough: the factorization fields change how identical logits factor
 * into a joint distribution WITHOUT changing any tensor shape, so a consumer
 * built for the other factorization would run the graph happily and sample a
 * different policy. Two artifacts that agree here are load-compatible; two that
 * disagree are not, whatever else matches.
 */
export function assertActionGeometry(live: ActionGeometry, other: ActionGeometry, what: string): void {
  const keys = new Set([...Object.keys(live), ...Object.keys(other)]);
  const diffs: string[] = [];
  for (const key of [...keys].sort()) {
    const a = key in live ? live[key] : undefined;
    const b = key in other ? other[key] : undefined;
    if (a !== b) diffs.push(`${key}: ${what}=${show(b)} vs live=${show(a)}`);
  }
  if (diffs.length === 0) return;
  throw new ActionSpaceMismatch(
    `${what} was built for a different action space (${diffs.join(", ")}); its weights and stored ` +
      `actions cannot be reused.`,
  );
}

// ---------------------------------------------------------------------------
// files[]
// ---------------------------------------------------------------------------

export interface BundleFile {
  readonly name: string;
  readonly bytes: number;
  readonly sha256: string;
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

function parseFile(value: unknown, path: string): BundleFile {
  const obj = asRecord(value, path);
  const sha = asString(required(obj, "sha256", path), `${path}.sha256`);
  if (!SHA256_HEX.test(sha)) {
    fail(`${path}.sha256`, `expected 64 lowercase hex characters, got ${show(sha)}`);
  }
  return {
    name: asString(required(obj, "name", path), `${path}.name`),
    bytes: asNonNegativeInteger(required(obj, "bytes", path), `${path}.bytes`),
    sha256: sha,
  };
}

// ---------------------------------------------------------------------------
// The manifest
// ---------------------------------------------------------------------------

export interface Manifest {
  readonly contractVersion: number;
  readonly createdUtc: string | null;
  /** `{tool, torch, opset, requested_opset, exporter}` — informational; kept
   *  opaque because a different producer emits different keys. */
  readonly producer: Readonly<Record<string, unknown>>;
  readonly graph: string;
  /** Opaque on purpose: `dims` is the model's own shape vocabulary and naming any
   *  of its keys here would tie this parser to one game. */
  readonly dims: Readonly<Record<string, unknown>>;
  readonly actionGeometry: ActionGeometry;
  readonly featLayout: FeatLayout;
  readonly inputs: readonly InputSpec[];
  readonly heads: readonly HeadSpec[];
  readonly values: readonly ValueSpec[];
  readonly composition: Composition;
  readonly masking: MaskingSpec;
  /** Where the weights came from. Opaque for the same reason as `dims`. */
  readonly provenance: Readonly<Record<string, unknown>>;
  readonly sha256: string;
  readonly files: readonly BundleFile[];
}

/** Parse and validate an unknown value as a bundle manifest.
 *
 *  Every failure is a `ManifestError` naming the JSON path, except an action
 *  space that contradicts itself, which is an `ActionSpaceMismatch` — the
 *  manifest is well-formed, it is merely untrustworthy. */
export function parseManifest(value: unknown, path = "manifest"): Manifest {
  const obj = asRecord(value, path);

  // Version FIRST. Every field below is interpreted under version-2 meanings, so
  // reading them out of a file that declares another version is exactly the
  // mis-read the version number exists to prevent.
  const contractVersion = asInteger(required(obj, "contract_version", path), `${path}.contract_version`);
  if (contractVersion !== SUPPORTED_CONTRACT_VERSION) {
    fail(
      `${path}.contract_version`,
      `unsupported contract version ${contractVersion}; this consumer speaks ${SUPPORTED_CONTRACT_VERSION} only`,
    );
  }

  const dims = asRecord(required(obj, "dims", path), `${path}.dims`);
  const actionGeometry = parseGeometry(required(obj, "action_geometry", path), `${path}.action_geometry`);
  assertGeometrySelfConsistent(actionGeometry, dims);

  const heads = asArray(required(obj, "heads", path), `${path}.heads`).map((h, i) =>
    parseHead(h, `${path}.heads[${i}]`),
  );
  const headNames = new Set<string>();
  for (const [i, head] of heads.entries()) {
    if (headNames.has(head.name)) fail(`${path}.heads[${i}].name`, `duplicate head name ${JSON.stringify(head.name)}`);
    headNames.add(head.name);
  }

  const composition = parseComposition(required(obj, "composition", path), `${path}.composition`);
  // A composition that names a head the manifest does not declare would drop a
  // factor of the joint at run time, in the one place nothing else checks.
  for (const [i, group] of composition.groups.entries()) {
    for (const [j, name] of group.heads.entries()) {
      if (!headNames.has(name)) {
        fail(`${path}.composition.groups[${i}].heads[${j}]`, `names head ${JSON.stringify(name)}, which heads[] does not declare`);
      }
    }
    if (group.gate !== null && !headNames.has(group.gate.head)) {
      fail(`${path}.composition.groups[${i}].gate.head`, `names head ${JSON.stringify(group.gate.head)}, which heads[] does not declare`);
    }
  }

  const files = asArray(required(obj, "files", path), `${path}.files`).map((f, i) =>
    parseFile(f, `${path}.files[${i}]`),
  );
  const graph = asString(required(obj, "graph", path), `${path}.graph`);
  if (!files.some((f) => f.name === graph)) {
    // `files[]` is what makes a bundle verifiable when the weights spill to a
    // sidecar; a graph missing from it is a bundle whose weights are unchecked.
    fail(`${path}.files`, `does not list the graph ${JSON.stringify(graph)}`);
  }

  return {
    contractVersion,
    createdUtc: optionalString(obj, "created_utc", path),
    producer: "producer" in obj ? asRecord(obj.producer, `${path}.producer`) : {},
    graph,
    dims,
    actionGeometry,
    featLayout: parseFeatLayout(required(obj, "feat_layout", path), `${path}.feat_layout`),
    inputs: asArray(required(obj, "inputs", path), `${path}.inputs`).map((inp, i) =>
      parseInput(inp, `${path}.inputs[${i}]`),
    ),
    heads,
    values: asArray(required(obj, "values", path), `${path}.values`).map((v, i) =>
      parseValue(v, `${path}.values[${i}]`),
    ),
    composition,
    masking: parseMasking(required(obj, "masking", path), `${path}.masking`),
    provenance: "provenance" in obj ? asRecord(obj.provenance, `${path}.provenance`) : {},
    sha256: asString(required(obj, "sha256", path), `${path}.sha256`),
    files,
  };
}

/** Parse manifest JSON text. Malformed JSON is reported as a manifest error so a
 *  caller has one error type to handle for "this artifact is not readable". */
export function parseManifestJson(text: string, path = "manifest"): Manifest {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (err) {
    fail(path, `not valid JSON (${err instanceof Error ? err.message : String(err)})`);
  }
  return parseManifest(value, path);
}

/** Look a head up by name, failing loudly rather than returning undefined — a
 *  missing head is a manifest/consumer disagreement, not a runtime condition. */
export function headByName(manifest: Manifest, name: string): HeadSpec {
  const head = manifest.heads.find((h) => h.name === name);
  if (head === undefined) {
    throw new ManifestError(`manifest declares no head named ${JSON.stringify(name)}`);
  }
  return head;
}
