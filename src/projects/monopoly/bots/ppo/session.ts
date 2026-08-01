// ---------------------------------------------------------------------------
// Feed assembly and one forward pass.
//
// Two layers live here, and the split is the point:
//
//   * `PolicySession` is GENERIC. It builds every graph input from
//     `inputs[].source` and `feat_layout`, runs the graph once, and turns raw
//     logits into masked probabilities using only what the manifest declares. It
//     names no head and no game.
//
//   * `PolicyRunner` is the game-facing wrapper the bot consumes: it packs a
//     structured observation into the blob the manifest describes, derives the
//     encoder options from the bundle's `dims`, and hands back the three
//     distributions the bot draws from.
//
// The graph executor is injected. It arrives as a synchronous `run(feeds)`, which
// is what lets a bot be a pure function — an async policy could not be consulted
// from inside a turn resolution.
// ---------------------------------------------------------------------------

import {
  ASSET_FEATURES,
  type EncodeOptions,
  type RlObservation,
  globalWidth,
  packFeat,
  playerWidth,
} from "./core/encode-rl";
import {
  assertCountMaskSourced,
  countMask,
  headGeometry,
  headProbs,
  type HeadProbs,
  type MaskBits,
} from "./heads";
import {
  type Dim,
  type GaussianHead,
  type HeadSpec,
  type InputSpec,
  type Manifest,
  type MaskSpec,
  isDiscreteHead,
  locateFeatField,
} from "./manifest";

export class SessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionError";
  }
}

// ---------------------------------------------------------------------------
// The executor contract
// ---------------------------------------------------------------------------

/** A dense tensor as plain data. Deliberately structural and minimal: the runner
 *  should not depend on any one executor's tensor class, and everything it needs
 *  from a tensor is its shape, its element type, and its numbers. */
export interface ExecTensor {
  readonly dims: readonly number[];
  readonly dtype: string;
  readonly data: ArrayLike<number>;
}

/** A loaded graph that can be run SYNCHRONOUSLY. Synchronous is not a preference:
 *  a bot is consulted in the middle of resolving a turn, and the gauntlet
 *  resolves bots inside worker threads with no place to await anything. */
export interface SyncExecutor {
  readonly inputNames: readonly string[];
  readonly outputNames: readonly string[];
  run(feeds: Readonly<Record<string, ExecTensor>>): Readonly<Record<string, ExecTensor>>;
}

/** Builds an executor from graph bytes. Registered rather than imported so this
 *  module never hard-depends on one runtime — the browser build, the Node
 *  gauntlet and the test suite can each supply their own. */
export type ExecutorFactory = (graph: Uint8Array) => SyncExecutor;

let executorFactory: ExecutorFactory | null = null;

export function registerExecutorFactory(factory: ExecutorFactory): void {
  executorFactory = factory;
}

export function hasExecutorFactory(): boolean {
  return executorFactory !== null;
}

export function createExecutor(graph: Uint8Array): SyncExecutor {
  if (executorFactory === null) {
    throw new SessionError(
      "no ONNX executor is registered; call registerExecutorFactory(bytes => session) before loading a bundle",
    );
  }
  return executorFactory(graph);
}

/**
 * Bind a session whose `run` speaks its OWN tensor class to the plain-data
 * contract above.
 *
 * A structural interface alone is not enough: a tensor class with methods on its
 * prototype cannot be satisfied by an object literal, so the runner cannot
 * CONSTRUCT the feeds such a session expects. `makeTensor` closes that gap and is
 * the only thing an executor has to supply beyond `run`.
 */
export function adaptSyncSession<T extends ExecTensor>(
  session: {
    readonly inputNames: readonly string[];
    readonly outputNames: readonly string[];
    run(feeds: Record<string, T>): Record<string, T>;
  },
  makeTensor: (dims: readonly number[], dtype: string, data: ArrayLike<number>) => T,
): SyncExecutor {
  return {
    inputNames: session.inputNames,
    outputNames: session.outputNames,
    run(feeds) {
      const native: Record<string, T> = {};
      for (const name of Object.keys(feeds)) {
        const t = feeds[name];
        native[name] = makeTensor(t.dims, t.dtype, t.data);
      }
      return session.run(native);
    },
  };
}

// ---------------------------------------------------------------------------
// Observations
// ---------------------------------------------------------------------------

/** A value that arrives on the wire rather than inside the packed blob: a scalar
 *  (a cardinality), a vector, or a row-major matrix whose rows may be FEWER than
 *  the graph's static row count — the remainder is zero-padded, exactly as the
 *  wire does. */
export type WireValue = number | readonly number[] | readonly (readonly number[])[];

/** One decision's observation: the packed feature blob plus any wire fields the
 *  manifest's inputs or masks name. */
export interface Observation {
  readonly feat: Uint8Array;
  readonly wire?: Readonly<Record<string, WireValue>>;
}

function wireValue(obs: Observation, field: string, what: string): WireValue {
  const wire = obs.wire;
  if (wire === undefined || !(field in wire)) {
    throw new SessionError(`${what}: observation carries no wire field "${field}"`);
  }
  return wire[field];
}

function wireCount(obs: Observation, field: string, what: string): number {
  const value = wireValue(obs, field, what);
  if (typeof value !== "number") {
    throw new SessionError(`${what}: wire field "${field}" must be a scalar count, got an array`);
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new SessionError(`${what}: wire field "${field}" must be a non-negative integer, got ${String(value)}`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/** The static trailing dims of a declared shape, with the batch axis dropped.
 *  Only the batch axis may be dynamic — `K` and every width are baked into the
 *  graph at trace time, so a consumer must feed exactly what is declared. */
function staticShape(shape: readonly Dim[], what: string): number[] {
  const out: number[] = [];
  for (let i = 1; i < shape.length; i++) {
    const dim = shape[i];
    if (typeof dim !== "number") {
      throw new SessionError(`${what}: axis ${String(i)} is dynamic (${JSON.stringify(dim)}); only the batch axis may be`);
    }
    out.push(dim);
  }
  return out;
}

function product(dims: readonly number[]): number {
  return dims.reduce((a, b) => a * b, 1);
}

/** Flatten a wire value into `slot`, row-major, zero-padding any rows the value
 *  does not supply. Zero padding is the wire's own convention: legality comes
 *  from the declared count, never from whether a row happens to be all zeros. */
function fillWire(slot: Float32Array, value: WireValue, dims: readonly number[], what: string): void {
  if (typeof value === "number") {
    if (product(dims) !== 1) {
      throw new SessionError(`${what}: got a scalar for a tensor of shape [${dims.join(",")}]`);
    }
    slot[0] = value;
    return;
  }
  if (value.length === 0) return;
  const first = value[0];
  if (typeof first === "number") {
    const flat = value as readonly number[];
    if (flat.length > slot.length) {
      throw new SessionError(`${what}: got ${flat.length} values for a tensor of ${slot.length}`);
    }
    for (let i = 0; i < flat.length; i++) slot[i] = flat[i];
    return;
  }
  const rows = value as readonly (readonly number[])[];
  const rowWidth = dims[dims.length - 1];
  const maxRows = product(dims) / rowWidth;
  if (rows.length > maxRows) {
    throw new SessionError(`${what}: got ${rows.length} rows for a tensor of ${maxRows}`);
  }
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (row.length !== rowWidth) {
      throw new SessionError(`${what}: row ${String(r)} has ${row.length} values, expected ${rowWidth}`);
    }
    for (let c = 0; c < rowWidth; c++) slot[r * rowWidth + c] = row[c];
  }
}

// ---------------------------------------------------------------------------
// PolicySession
// ---------------------------------------------------------------------------

export interface GaussianOutput {
  readonly head: GaussianHead;
  /** `[batch, nSlots]` row-major. */
  readonly mean: Float64Array;
  /** `[batch, nSlots]`, or a single shared value broadcast over the slots. */
  readonly logStd: Float64Array;
}

export interface PolicyOutput {
  readonly batch: number;
  /** Masked, collapsed, normalized probabilities for every DISCRETE head, keyed
   *  by the head's own name in the manifest. */
  readonly heads: Readonly<Record<string, HeadProbs>>;
  readonly gaussians: Readonly<Record<string, GaussianOutput>>;
  /** Raw scalar outputs, keyed by the `values[]` entry's name. */
  readonly values: Readonly<Record<string, Float64Array>>;
  readonly raw: Readonly<Record<string, ExecTensor>>;
}

/** One loaded model, ready to run. Holds no per-decision state, so a session can
 *  be shared across seats and reused for the life of the process. */
export class PolicySession {
  readonly manifest: Manifest;
  private readonly executor: SyncExecutor;

  constructor(manifest: Manifest, executor: SyncExecutor) {
    this.manifest = manifest;
    this.executor = executor;
    // Validate the manifest against the graph ONCE, at construction. A missing
    // tensor discovered on the first decision would surface as a crash halfway
    // through a game rather than as a load failure.
    const declaredInputs = new Set(executor.inputNames);
    for (const input of manifest.inputs) {
      if (declaredInputs.size > 0 && !declaredInputs.has(input.name)) {
        throw new SessionError(
          `manifest declares input "${input.name}" but the graph's inputs are [${executor.inputNames.join(", ")}]`,
        );
      }
    }
    for (const head of manifest.heads) {
      if (head.mask !== null) assertCountMaskSourced(head.name, head.mask);
      this.assertMaskReadable(head);
    }
  }

  /** A mask whose source cannot be resolved is a manifest the session must
   *  refuse, not a run-time surprise. The `count`-from-blob case is the sharp
   *  one and is rejected in `assertCountMaskSourced`; this covers the rest. */
  private assertMaskReadable(head: HeadSpec): void {
    const mask = head.mask;
    if (mask === null) return;
    if (mask.source.kind !== "feat_layout") return;
    const located = locateFeatField(this.manifest.featLayout, mask.source.section, mask.source.field);
    if (located === null) {
      throw new SessionError(
        `head "${head.name}": mask reads ${mask.source.section}."${mask.source.field}", which feat_layout does not declare`,
      );
    }
    const geom = headGeometry(head);
    const needed = geom.rowsPerItem * geom.width;
    if (located.count !== needed) {
      throw new SessionError(
        `head "${head.name}": mask field "${mask.source.field}" holds ${located.count} entries but the head needs ${needed}`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Feeds
  // -------------------------------------------------------------------------

  /** Build one graph input for a batch of observations. */
  private buildFeed(input: InputSpec, batch: readonly Observation[]): ExecTensor {
    const tail = staticShape(input.shape, `input "${input.name}"`);
    const per = product(tail);
    const dims = [batch.length, ...tail];
    const what = `input "${input.name}"`;

    if (input.source.kind === "feat_layout") {
      const located = locateFeatField(this.manifest.featLayout, input.source.section, input.source.field);
      if (located === null) {
        throw new SessionError(`${what}: feat_layout declares no ${input.source.section} field "${input.source.field}"`);
      }
      if (located.count !== per) {
        throw new SessionError(
          `${what}: shape [${input.shape.join(",")}] needs ${per} values but field "${input.source.field}" holds ${located.count}`,
        );
      }
      if (input.dtype === "float32") {
        const data = new Float32Array(batch.length * per);
        for (let b = 0; b < batch.length; b++) {
          const feat = batch[b].feat;
          // Explicit little-endian: the blob is written LE on whatever host packs
          // it, so a native-endian typed-array view would decode garbage on a BE
          // host rather than fail.
          const view = new DataView(feat.buffer, feat.byteOffset, feat.byteLength);
          for (let i = 0; i < per; i++) data[b * per + i] = view.getFloat32(located.byteOffset + i * 4, true);
        }
        return { dims, dtype: "float32", data };
      }
      const data = new Uint8Array(batch.length * per);
      for (let b = 0; b < batch.length; b++) {
        data.set(batch[b].feat.subarray(located.byteOffset, located.byteOffset + per), b * per);
      }
      return { dims, dtype: "uint8", data };
    }

    const data = new Float32Array(batch.length * per);
    for (let b = 0; b < batch.length; b++) {
      fillWire(data.subarray(b * per, (b + 1) * per), wireValue(batch[b], input.source.field, what), tail, what);
    }
    return { dims, dtype: input.dtype === "uint8" ? "uint8" : "float32", data };
  }

  /** Legality bits for one head over a batch, `batch * rowsPerItem * width`
   *  bytes. `null` when the head declares no mask. */
  private buildMask(head: HeadSpec, batch: readonly Observation[]): MaskBits | null {
    const mask: MaskSpec | null = head.mask;
    if (mask === null) return null;
    const geom = headGeometry(head);
    const per = geom.rowsPerItem * geom.width;
    const what = `head "${head.name}"`;

    if (mask.kind === "count") {
      // Guarded at construction too; repeated here because `countMask` is the one
      // path where a clamped count would be indistinguishable from a real one.
      assertCountMaskSourced(head.name, mask);
      const counts = new Int32Array(batch.length);
      for (let b = 0; b < batch.length; b++) counts[b] = wireCount(batch[b], mask.source.field, what);
      const bits = countMask(geom.width, counts, head.kind === "gaussian" ? 0 : head.nullColumn, head.kind !== "gaussian" && head.nullAlwaysLegal);
      return bits;
    }

    const bits = new Uint8Array(batch.length * per);
    if (mask.source.kind === "feat_layout") {
      const located = locateFeatField(this.manifest.featLayout, mask.source.section, mask.source.field);
      if (located === null) throw new SessionError(`${what}: feat_layout declares no field "${mask.source.field}"`);
      for (let b = 0; b < batch.length; b++) {
        bits.set(batch[b].feat.subarray(located.byteOffset, located.byteOffset + per), b * per);
      }
      return bits;
    }
    for (let b = 0; b < batch.length; b++) {
      const value = wireValue(batch[b], mask.source.field, what);
      const slot = new Float32Array(per);
      fillWire(slot, value, geom.flatten ? [per] : [geom.rowsPerItem, geom.width], what);
      for (let i = 0; i < per; i++) bits[b * per + i] = slot[i] !== 0 ? 1 : 0;
    }
    return bits;
  }

  private tensor(outputs: Readonly<Record<string, ExecTensor>>, name: string, what: string): ExecTensor {
    if (!(name in outputs)) {
      throw new SessionError(`${what}: the graph produced no output named "${name}"`);
    }
    return outputs[name];
  }

  /** One forward pass over a batch of observations. */
  run(batch: readonly Observation[]): PolicyOutput {
    if (batch.length === 0) throw new SessionError("run: empty batch");
    const expectedBytes = this.manifest.featLayout.byteLength;
    for (const [i, obs] of batch.entries()) {
      if (obs.feat.length !== expectedBytes) {
        throw new SessionError(
          `run: observation ${String(i)} carries a ${obs.feat.length}-byte blob but feat_layout declares ${expectedBytes}`,
        );
      }
    }

    const feeds: Record<string, ExecTensor> = {};
    for (const input of this.manifest.inputs) feeds[input.name] = this.buildFeed(input, batch);
    const outputs = this.executor.run(feeds);

    const heads: Record<string, HeadProbs> = {};
    const gaussians: Record<string, GaussianOutput> = {};
    for (const head of this.manifest.heads) {
      const what = `head "${head.name}"`;
      if (!isDiscreteHead(head)) {
        // `output_tensors` is the AUTHORITATIVE role -> tensor map; a gaussian's
        // `output_tensor` is null, so there is nothing else to fall back on.
        if (!("mean" in head.outputTensors) || !("log_std" in head.outputTensors)) {
          throw new SessionError(`${what}: a gaussian head must declare mean and log_std output tensors`);
        }
        gaussians[head.name] = {
          head,
          mean: toFloat64(this.tensor(outputs, head.outputTensors.mean, what).data),
          logStd: toFloat64(this.tensor(outputs, head.outputTensors.log_std, what).data),
        };
        continue;
      }
      if (!("logits" in head.outputTensors)) {
        throw new SessionError(`${what}: a discrete head must declare a "logits" output tensor`);
      }
      const logits = this.tensor(outputs, head.outputTensors.logits, what).data;
      heads[head.name] = headProbs(head, this.manifest.masking, logits, batch.length, this.buildMask(head, batch));
    }

    const values: Record<string, Float64Array> = {};
    for (const value of this.manifest.values) {
      values[value.name] = toFloat64(this.tensor(outputs, value.outputTensor, `value "${value.name}"`).data);
    }
    return { batch: batch.length, heads, gaussians, values, raw: outputs };
  }
}

function toFloat64(data: ArrayLike<number>): Float64Array {
  const out = new Float64Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i];
  return out;
}

// ---------------------------------------------------------------------------
// PolicyRunner — the game-facing surface
// ---------------------------------------------------------------------------

/**
 * The encoder options a bundle's `dims` imply.
 *
 * The manifest does NOT record them: they are an encoder-side choice, and the
 * only trace they leave is the observation WIDTHS the net was built for. So they
 * are recovered by searching the option space for the combination whose widths
 * match, using the encoder's own width functions rather than a hand-copied table
 * — a table would silently go stale the first time a new option is added.
 *
 * The search must land on EXACTLY ONE combination. Zero means the bundle was
 * built by an encoder this revision no longer speaks; more than one means the
 * options stopped being recoverable from the widths, and a coin flip between them
 * would produce a bot that runs clean and plays nonsense — the failure no
 * numerical test catches, because every tensor still has the right shape.
 */
export function encodeOptionsFromDims(dims: Readonly<Record<string, unknown>>): EncodeOptions {
  const globalFeat = dims.global_feat;
  const playerFeat = dims.player_feat;
  const assetFeat = dims.asset_feat;
  if (typeof globalFeat !== "number" || typeof playerFeat !== "number" || typeof assetFeat !== "number") {
    throw new SessionError("dims must declare numeric global_feat, player_feat and asset_feat to recover the encoder options");
  }
  if (assetFeat !== ASSET_FEATURES) {
    throw new SessionError(`dims.asset_feat is ${assetFeat} but this encoder emits ${ASSET_FEATURES}; the bundle is for a different observation`);
  }
  const flags = [false, true];
  const matches: EncodeOptions[] = [];
  for (const obsGlobalV2 of flags) {
    for (const obsNwShare of flags) {
      for (const obsRentCapacity of flags) {
        const opts: EncodeOptions = { obsGlobalV2, obsNwShare, obsRentCapacity };
        if (globalWidth(opts) === globalFeat && playerWidth(opts) === playerFeat) matches.push(opts);
      }
    }
  }
  if (matches.length !== 1) {
    throw new SessionError(
      `no unique encoder options give global_feat=${globalFeat}, player_feat=${playerFeat} ` +
        `(${matches.length} candidate combinations); the bundle was built by a different encoder`,
    );
  }
  return matches[0];
}

/** The distributions the bot draws from, one entry per head it acts through.
 *  Float32 because that is the width the caller stores and compares at; the
 *  masking itself runs in float64. */
export interface PolicyDistributions {
  readonly global: Float32Array;
  readonly manage: Float32Array;
  readonly tradeCand: Float32Array;
}

/** Which manifest head backs each field of `PolicyDistributions`. Overridable so
 *  a bundle that names its heads differently needs configuration, not a code
 *  change. */
export interface HeadNames {
  readonly global: string;
  readonly manage: string;
  readonly tradeCand: string;
}

const DEFAULT_HEAD_NAMES: HeadNames = { global: "global", manage: "manage", tradeCand: "trade_cand" };

export interface PolicyRunner {
  readonly globalFeat: number;
  readonly playerFeat: number;
  /** `K`, the static candidate-row count the graph was traced with. */
  readonly tradeCandidates: number;
  readonly encodeOptions: EncodeOptions;
  readonly session: PolicySession;
  /** Masked, collapsed, NORMALIZED probabilities — never logits. Masking, the
   *  all-illegal collapse and the `select` factorization all come out of the
   *  manifest, so changing any of them is a bundle change, not a bot change. */
  run(obs: RlObservation, candidates: readonly (readonly number[])[]): PolicyDistributions;
  /** The manifest-driven form: every head and value the bundle declares, keyed by
   *  its own name. `run` is a three-field view of this. */
  runAll(obs: RlObservation, candidates: readonly (readonly number[])[]): PolicyOutput;
}

function toFloat32(data: Float64Array): Float32Array {
  const out = new Float32Array(data.length);
  out.set(data);
  return out;
}

export function createPolicyRunner(
  manifest: Manifest,
  executor: SyncExecutor,
  headNames: HeadNames = DEFAULT_HEAD_NAMES,
): PolicyRunner {
  const session = new PolicySession(manifest, executor);
  const encodeOptions = encodeOptionsFromDims(manifest.dims);
  const globalFeat = globalWidth(encodeOptions);
  const playerFeat = playerWidth(encodeOptions);

  for (const name of [headNames.global, headNames.manage, headNames.tradeCand]) {
    if (!manifest.heads.some((h) => h.name === name)) {
      throw new SessionError(`manifest declares no head named "${name}"; heads are [${manifest.heads.map((h) => h.name).join(", ")}]`);
    }
  }

  // K comes from the candidate head's own row count rather than from provenance:
  // the graph concatenated a learned null row and expanded the context to K+1
  // using an integer baked at trace time, so the head is the authority on it.
  const candHead = manifest.heads.find((h) => h.name === headNames.tradeCand);
  if (candHead === undefined || candHead.kind !== "entity_pointer") {
    throw new SessionError(`head "${headNames.tradeCand}" must be an entity_pointer to supply the candidate count`);
  }
  const tradeCandidates = candHead.entityRows;
  const countField = candHead.mask !== null && candHead.mask.kind === "count" ? candHead.mask.source.field : null;

  const observe = (obs: RlObservation, candidates: readonly (readonly number[])[]): Observation => {
    const wire: Record<string, WireValue> = { trade_candidates: candidates };
    if (countField !== null) wire[countField] = candidates.length;
    // The candidate matrix is fed at its full static width with the unused rows
    // zeroed; legality comes from the COUNT, never from the padding.
    return { feat: packFeat(obs, encodeOptions), wire };
  };

  return {
    globalFeat,
    playerFeat,
    tradeCandidates,
    encodeOptions,
    session,
    runAll(obs, candidates) {
      return session.run([observe(obs, candidates)]);
    },
    run(obs, candidates) {
      const out = session.run([observe(obs, candidates)]);
      return {
        global: toFloat32(out.heads[headNames.global].probs),
        manage: toFloat32(out.heads[headNames.manage].probs),
        tradeCand: toFloat32(out.heads[headNames.tradeCand].probs),
      };
    },
  };
}
