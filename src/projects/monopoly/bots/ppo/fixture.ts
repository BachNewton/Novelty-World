// ---------------------------------------------------------------------------
// Parity fixtures: raw observations paired with the reference masked
// distributions the trainer's own code produced for them.
//
// The recorder's two dump files are not usable directly. The observation archive
// carries no expected outputs, and the decision log carries a probability vector
// only for the head each decision was ROUTED to — but the heads a decision did
// NOT use are exactly where a masking bug hides, because they are the ones whose
// masks are all-false and whose collapse therefore fires. A fixture pairs EVERY
// head's full distribution with every case for that reason.
// ---------------------------------------------------------------------------

import { type ActionGeometry, type Manifest } from "./manifest";

export const FIXTURE_FORMAT = "landon-onnx-parity-fixture";
export const FIXTURE_FORMAT_VERSION = 1;

export class FixtureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FixtureError";
  }
}

function fail(path: string, message: string): never {
  throw new FixtureError(`${path}: ${message}`);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(path, `expected object, got ${typeof value}`);
  }
  return value as Record<string, unknown>;
}

function str(value: unknown, path: string): string {
  if (typeof value !== "string") fail(path, `expected string, got ${typeof value}`);
  return value;
}

function num(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(path, `expected number, got ${typeof value}`);
  return value;
}

// ---------------------------------------------------------------------------
// Arrays
// ---------------------------------------------------------------------------

/** Every array in a fixture is `{shape, dtype, b64}` where `b64` is the raw
 *  ROW-MAJOR little-endian buffer. Decoded eagerly: a fixture is read once and
 *  iterated many times, so keeping the base64 around would cost more than the
 *  decoded bytes. */
export interface FixtureArray {
  readonly shape: readonly number[];
  readonly dtype: "float32" | "uint8";
  readonly data: Float32Array | Uint8Array;
}

/** Base64 to bytes, portable across the runtime the runner may find itself in.
 *  `atob` exists in browsers and in modern Node; `Buffer` is the fallback for a
 *  runtime that has only the Node globals. */
function base64ToBytes(b64: string): Uint8Array {
  if (typeof atob === "function") {
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }
  const buf = Buffer.from(b64, "base64");
  return new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

export function decodeArray(value: unknown, path: string): FixtureArray {
  const obj = record(value, path);
  const dtypeText = str(obj.dtype, `${path}.dtype`);
  if (dtypeText !== "float32" && dtypeText !== "uint8") {
    fail(`${path}.dtype`, `expected "float32" or "uint8", got ${JSON.stringify(dtypeText)}`);
  }
  const shapeRaw = obj.shape;
  if (!Array.isArray(shapeRaw)) fail(`${path}.shape`, "expected array");
  const shape = (shapeRaw as unknown[]).map((d, i) => num(d, `${path}.shape[${i}]`));
  const bytes = base64ToBytes(str(obj.b64, `${path}.b64`));
  const count = shape.reduce((a, b) => a * b, 1);
  const width = dtypeText === "float32" ? 4 : 1;
  if (bytes.length !== count * width) {
    fail(path, `buffer holds ${bytes.length} bytes but shape [${shape.join(",")}] of ${dtypeText} needs ${count * width}`);
  }
  if (dtypeText === "uint8") return { shape, dtype: dtypeText, data: bytes };
  // A fresh ArrayBuffer view: the decoded bytes are already their own buffer at
  // offset 0, so this is a relabel and not a copy.
  return { shape, dtype: dtypeText, data: new Float32Array(bytes.buffer, bytes.byteOffset, count) };
}

/** Decoded float data whatever the declared dtype, for the comparison paths that
 *  do not care (a 0/1 mask and a probability both compare as numbers). */
export function asFloats(array: FixtureArray): Float64Array {
  const out = new Float64Array(array.data.length);
  for (let i = 0; i < array.data.length; i++) out[i] = array.data[i];
  return out;
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

/** One recorded decision. `inputs` holds graph inputs (arrays, plus any scalar
 *  wire counts); `masks` holds the legality arrays, uint8 0/1, true == legal;
 *  `expect` holds the reference outputs, keyed `<head>_probs` and by value
 *  tensor name. */
export interface FixtureCase {
  readonly index: number;
  readonly env: number;
  readonly seat: number;
  /** The ROUTED group this decision named. The other heads still have expected
   *  distributions — that is the point. */
  readonly head: string;
  readonly phase: string | null;
  readonly armed: boolean | null;
  /** Whether the recorded distribution is reproduced to <1e-6 by this bundle's
   *  member. A recording seats several league members, so a fixture built for one
   *  can only be cross-checked on the decisions that member actually played. */
  readonly recorderMatch: boolean | null;
  /** Whether the row was ALREADY a point mass (one legal token, or the
   *  all-illegal collapse) and therefore agrees with every member trivially.
   *  Counting these as agreement would flatter the cross-check. */
  readonly recorderForced: boolean | null;
  readonly inputs: Readonly<Record<string, FixtureArray>>;
  /** Scalar wire fields — counts, which are cardinalities and cannot live in an
   *  array of 0/1 bytes. */
  readonly counts: Readonly<Record<string, number>>;
  readonly masks: Readonly<Record<string, FixtureArray>>;
  readonly expect: Readonly<Record<string, FixtureArray>>;
}

export interface FixtureTolerance {
  readonly probAtol: number;
  readonly valueAtol: number;
  readonly note: string | null;
}

export interface Fixture {
  readonly format: string;
  readonly formatVersion: number;
  /** `sha256` PINS the fixture to one graph: verifying against a different bundle
   *  is an error, not a failure. */
  readonly bundle: { readonly dir: string; readonly graph: string; readonly sha256: string; readonly contractVersion: number };
  readonly dims: Readonly<Record<string, unknown>>;
  readonly actionGeometry: ActionGeometry;
  readonly tolerance: FixtureTolerance;
  readonly cases: readonly FixtureCase[];
  /** Everything else the fixture records about how it was built, kept opaque. */
  readonly source: Readonly<Record<string, unknown>>;
}

function decodeArrayMap(value: unknown, path: string): {
  arrays: Record<string, FixtureArray>;
  scalars: Record<string, number>;
} {
  const obj = record(value, path);
  const arrays: Record<string, FixtureArray> = {};
  const scalars: Record<string, number> = {};
  for (const key of Object.keys(obj)) {
    const entry = obj[key];
    // A bare number is a scalar wire field (a count). Everything else must be an
    // encoded array; anything that is neither is a fixture this consumer cannot
    // read, and guessing would be worse than stopping.
    if (typeof entry === "number") scalars[key] = entry;
    else arrays[key] = decodeArray(entry, `${path}.${key}`);
  }
  return { arrays, scalars };
}

function optionalBool(value: unknown, path: string): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "boolean") fail(path, `expected boolean or null, got ${typeof value}`);
  return value;
}

function decodeCase(value: unknown, path: string): FixtureCase {
  const obj = record(value, path);
  const { arrays: inputs, scalars: counts } = decodeArrayMap(obj.inputs, `${path}.inputs`);
  const { arrays: masks } = decodeArrayMap(obj.masks, `${path}.masks`);
  const { arrays: expect } = decodeArrayMap(obj.expect, `${path}.expect`);
  const phase = obj.phase;
  return {
    index: num(obj.index, `${path}.index`),
    env: num(obj.env, `${path}.env`),
    seat: num(obj.seat, `${path}.seat`),
    head: str(obj.head, `${path}.head`),
    phase: typeof phase === "string" ? phase : null,
    armed: optionalBool(obj.armed, `${path}.armed`),
    recorderMatch: optionalBool(obj.recorder_match, `${path}.recorder_match`),
    recorderForced: optionalBool(obj.recorder_forced, `${path}.recorder_forced`),
    inputs,
    counts,
    masks,
    expect,
  };
}

export function parseFixture(value: unknown, path = "fixture"): Fixture {
  const obj = record(value, path);
  const format = str(obj.format, `${path}.format`);
  if (format !== FIXTURE_FORMAT) {
    fail(`${path}.format`, `expected ${JSON.stringify(FIXTURE_FORMAT)}, got ${JSON.stringify(format)}`);
  }
  const formatVersion = num(obj.format_version, `${path}.format_version`);
  if (formatVersion !== FIXTURE_FORMAT_VERSION) {
    fail(`${path}.format_version`, `expected ${FIXTURE_FORMAT_VERSION}, got ${formatVersion}`);
  }
  const bundle = record(obj.bundle, `${path}.bundle`);
  const tol = record(obj.tolerance, `${path}.tolerance`);
  const note = tol.note;
  const casesRaw = obj.cases;
  if (!Array.isArray(casesRaw)) fail(`${path}.cases`, "expected array");

  const geometryRaw = record(obj.action_geometry, `${path}.action_geometry`);
  const actionGeometry: Record<string, number | string | boolean> = {};
  for (const key of Object.keys(geometryRaw)) {
    const entry = geometryRaw[key];
    if (typeof entry === "number" || typeof entry === "string" || typeof entry === "boolean") {
      actionGeometry[key] = entry;
    } else {
      fail(`${path}.action_geometry.${key}`, `expected number, string or boolean, got ${typeof entry}`);
    }
  }

  return {
    format,
    formatVersion,
    bundle: {
      dir: str(bundle.dir, `${path}.bundle.dir`),
      graph: str(bundle.graph, `${path}.bundle.graph`),
      sha256: str(bundle.sha256, `${path}.bundle.sha256`),
      contractVersion: num(bundle.contract_version, `${path}.bundle.contract_version`),
    },
    dims: record(obj.dims, `${path}.dims`),
    actionGeometry,
    tolerance: {
      probAtol: num(tol.prob_atol, `${path}.tolerance.prob_atol`),
      valueAtol: num(tol.value_atol, `${path}.tolerance.value_atol`),
      note: typeof note === "string" ? note : null,
    },
    cases: (casesRaw as unknown[]).map((c, i) => decodeCase(c, `${path}.cases[${i}]`)),
    source: record(obj.source, `${path}.source`),
  };
}

export function parseFixtureJson(text: string, path = "fixture"): Fixture {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (err) {
    fail(path, `not valid JSON (${err instanceof Error ? err.message : String(err)})`);
  }
  return parseFixture(value, path);
}

/**
 * Refuse a fixture built against a different graph. The expected distributions
 * are that graph's outputs; running them past another one measures nothing, and
 * a near-miss would look like a tolerance problem rather than the wrong file.
 *
 * Digest equality, with no derived-graph escape hatch. The bundle that ships IS
 * the graph the trainer exported and the fixture was recorded from, so anything
 * whose digest differs is a different policy — including a re-encoding of this
 * one, which is not a re-encoding as far as the arithmetic is concerned.
 */
export function assertFixtureBundle(fixture: Fixture, manifest: Manifest, what: string): void {
  if (fixture.bundle.sha256 === manifest.sha256) return;
  throw new FixtureError(
    `${what}: fixture was built against a different graph (${fixture.bundle.sha256.slice(0, 12)}, ` +
      `expected ${manifest.sha256.slice(0, 12)})`,
  );
}
