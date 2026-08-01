// ---------------------------------------------------------------------------
// The four head primitives, and the masking semantics a consumer must reproduce
// bit-for-bit with the trainer.
//
// Everything here is driven by the manifest: head kinds, mask kinds, the `select`
// factorization, null columns and the collapse rule all come out of the JSON.
// Nothing in this file knows what game it is running.
//
// The arithmetic runs in float64 even though the graph emits float32, because
// that is what the reference consumer does — softmax over a masked row is where a
// dtype difference would show up as a probability difference, and the whole point
// of a parity fixture is that it does not.
// ---------------------------------------------------------------------------

import {
  type GaussianHead,
  type HeadSpec,
  type MaskingSpec,
  type MaskSpec,
  isDiscreteHead,
} from "./manifest";

/** Raised for a head/mask combination the manifest declares but that cannot be
 *  evaluated. Always names the head, because a net has several and the shapes
 *  alone rarely say which one went wrong. */
export class HeadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HeadError";
  }
}

// ---------------------------------------------------------------------------
// Geometry: how a head's declared shape becomes (rows, width)
// ---------------------------------------------------------------------------

/** The distribution geometry of one head, per batch item.
 *
 *  `rowsPerItem` is the number of INDEPENDENT distributions; `width` is the
 *  vocabulary each one covers. The two together are what `select` changes
 *  without changing any tensor shape. */
export interface HeadGeometry {
  readonly rowsPerItem: number;
  readonly width: number;
  /** True when logits and mask must be flattened to `[batch, rowsPerItem*width]`
   *  before masking — the whole grid is ONE categorical. */
  readonly flatten: boolean;
  /** The logical dims of the resulting probability array, batch axis excluded. */
  readonly itemDims: readonly number[];
}

/** Static (non-batch) trailing dims of a declared shape. The batch axis is the
 *  only dynamic one, so every remaining entry must be an integer; a string there
 *  would mean a width the consumer cannot allocate for. */
function staticTail(head: HeadSpec): number[] {
  const tail: number[] = [];
  for (let i = 1; i < head.shape.length; i++) {
    const dim = head.shape[i];
    if (typeof dim !== "number") {
      throw new HeadError(
        `head "${head.name}": shape axis ${i} is dynamic (${JSON.stringify(dim)}); only the batch axis may be`,
      );
    }
    tail.push(dim);
  }
  if (tail.length === 0) {
    throw new HeadError(`head "${head.name}": shape [${head.shape.join(",")}] has no vocabulary axis`);
  }
  return tail;
}

export function headGeometry(head: HeadSpec): HeadGeometry {
  const tail = staticTail(head);
  // `select: "one"` picks ONE cell out of the whole grid, so "no legal option" is
  // a property of the FLATTENED row: both logits and mask collapse to one axis
  // BEFORE masking, and the softmax runs over the whole grid. Softmaxing the last
  // axis instead emits `rows` distributions summing to `rows` rather than one
  // summing to 1 — a different policy, with no shape change to reveal it.
  const flatten = head.kind === "per_entity_categorical" && head.select === "one";
  if (flatten) {
    const width = tail.reduce((a, b) => a * b, 1);
    return { rowsPerItem: 1, width, flatten, itemDims: [width] };
  }
  const width = tail[tail.length - 1];
  const rowsPerItem = tail.slice(0, -1).reduce((a, b) => a * b, 1);
  return { rowsPerItem, width, flatten, itemDims: tail };
}

/** Resolve a possibly-negative column index against a row width. Negative counts
 *  from the end, which is how a learned null token declares "my last column". */
export function resolveColumn(column: number, width: number): number {
  const resolved = column < 0 ? width + column : column;
  if (resolved < 0 || resolved >= width) {
    throw new HeadError(`null column ${column} resolves to ${resolved}, outside a row of width ${width}`);
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Masks
// ---------------------------------------------------------------------------

/** Legality for one head over a batch: `batch * rowsPerItem * width` bytes,
 *  nonzero == legal. Flat and row-major, matching the blob it usually comes from. */
export type MaskBits = Uint8Array;

/**
 * The mask a `count` spec implies, derived rather than read out of prose.
 *
 *     legal[b, i] = i < counts[b]                for i in [0, width)
 *     if nullAlwaysLegal: legal[b, resolve(nullColumn, width)] = true
 *
 * A count is a CARDINALITY. This is the mask kind that exists because some heads
 * have no legality array anywhere in the observation — a consumer that assumed
 * every mask is an array would find nothing and silently mask everything out.
 */
export function countMask(width: number, counts: ArrayLike<number>, nullColumn: number, nullAlwaysLegal: boolean): MaskBits {
  const batch = counts.length;
  const bits = new Uint8Array(batch * width);
  for (let b = 0; b < batch; b++) {
    const n = counts[b];
    if (!Number.isInteger(n) || n < 0) {
      throw new HeadError(`count mask: counts[${b}] is ${String(n)}; expected a non-negative integer`);
    }
    const limit = Math.min(n, width);
    bits.fill(1, b * width, b * width + limit);
  }
  if (nullAlwaysLegal) {
    const col = resolveColumn(nullColumn, width);
    for (let b = 0; b < batch; b++) bits[b * width + col] = 1;
  }
  return bits;
}

/** Reject a `count` mask that claims to read from the packed observation blob.
 *
 *  The blob's boolean section is a run of 0/1 bytes whose only defined reading is
 *  boolean, so a blob-backed count of 17 comes back as 1 and the head sees one
 *  legal row instead of seventeen. That is silent: every probability still sums
 *  to 1, every shape still matches, and the policy is simply wrong. Refuse the
 *  manifest instead of reading it. */
export function assertCountMaskSourced(headName: string, mask: MaskSpec): void {
  if (mask.kind !== "count") return;
  if (mask.source.kind !== "wire") {
    throw new HeadError(
      `head "${headName}": count mask reads field "${mask.source.field}" from ${mask.source.kind}, but a ` +
        `count mask's source must be "wire" — a packed boolean field stores 0/1 bytes and would clamp a ` +
        `count of 17 to 1`,
    );
  }
}

// ---------------------------------------------------------------------------
// Masked softmax
// ---------------------------------------------------------------------------

/** The masked distribution of one head over a batch. */
export interface HeadProbs {
  readonly name: string;
  /** Row-major, `batch * rowsPerItem * width` entries. */
  readonly probs: Float64Array;
  readonly batch: number;
  readonly rowsPerItem: number;
  readonly width: number;
  /** Logical dims including the batch axis, e.g. `[B, 17]`, `[B, 28, 5]`, `[B, 140]`. */
  readonly dims: readonly number[];
  /** Legal entries per distribution row: `batch * rowsPerItem` entries. Zero means
   *  the row was all-illegal and (with the collapse on) is now a point mass. */
  readonly legalCount: Int32Array;
}

/**
 * Masked softmax with the all-illegal collapse — the normative masking path.
 *
 *   masked = where(mask, logits, negInf)     applied BEFORE softmax
 *   if collapse and a row has NO legal entry: masked[..., nullColumn] = 0
 *
 * `negInf` is a large FINITE negative rather than `-Infinity` so discarded lanes
 * cannot produce NaN. The collapse turns a would-be UNIFORM row — every logit
 * equal at `negInf` — into a deterministic point mass with log-prob and entropy
 * exactly 0. Skipping it makes an inactive head sample uniformly at random, which
 * looks like a working distribution from every angle except the game.
 */
export function maskedSoftmax(
  logits: ArrayLike<number>,
  mask: MaskBits | null,
  batch: number,
  rowsPerItem: number,
  width: number,
  masking: MaskingSpec,
  nullColumn: number,
): { readonly probs: Float64Array; readonly legalCount: Int32Array } {
  const rows = batch * rowsPerItem;
  const expected = rows * width;
  if (logits.length !== expected) {
    throw new HeadError(`masked softmax: got ${logits.length} logits, expected ${expected} (${rows} rows of ${width})`);
  }
  if (mask !== null && mask.length !== expected) {
    throw new HeadError(`masked softmax: mask has ${mask.length} entries, expected ${expected} to match the logits`);
  }
  const collapse = masking.collapseAllIllegal.enabled;
  // Resolved once: a per-row resolve would repeat the bounds check `rows` times
  // for a value that cannot vary within a head.
  const nullCol = collapse && mask !== null ? resolveColumn(nullColumn, width) : -1;

  const probs = new Float64Array(expected);
  const legalCount = new Int32Array(rows);
  const row = new Float64Array(width);

  for (let r = 0; r < rows; r++) {
    const base = r * width;
    let legal = 0;
    if (mask === null) {
      // A maskless head cannot be all-illegal, so its whole vocabulary is legal
      // and the collapse never applies.
      for (let i = 0; i < width; i++) row[i] = logits[base + i];
      legal = width;
    } else {
      for (let i = 0; i < width; i++) {
        if (mask[base + i] !== 0) {
          row[i] = logits[base + i];
          legal++;
        } else {
          row[i] = masking.negInf;
        }
      }
      if (legal === 0 && collapse) row[nullCol] = 0;
    }
    legalCount[r] = legal;

    let max = row[0];
    for (let i = 1; i < width; i++) if (row[i] > max) max = row[i];
    let sum = 0;
    for (let i = 0; i < width; i++) {
      const e = Math.exp(row[i] - max);
      probs[base + i] = e;
      sum += e;
    }
    for (let i = 0; i < width; i++) probs[base + i] /= sum;
  }
  return { probs, legalCount };
}

/**
 * The masked distribution for ONE discrete head.
 *
 * `mask` is already flat and row-major over `batch * rowsPerItem * width`; under
 * `select: "one"` that is the same buffer as the unflattened grid, since a
 * row-major flatten is a relabel, not a copy. Passing `null` means the head
 * declares no legality mask.
 */
export function headProbs(
  head: HeadSpec,
  masking: MaskingSpec,
  logits: ArrayLike<number>,
  batch: number,
  mask: MaskBits | null,
): HeadProbs {
  if (!isDiscreteHead(head)) {
    throw new HeadError(`head "${head.name}": kind "${head.kind}" is continuous and has no masked distribution`);
  }
  const geom = headGeometry(head);
  const { probs, legalCount } = maskedSoftmax(
    logits,
    mask,
    batch,
    geom.rowsPerItem,
    geom.width,
    masking,
    head.nullColumn,
  );
  return {
    name: head.name,
    probs,
    batch,
    rowsPerItem: geom.rowsPerItem,
    width: geom.width,
    dims: [batch, ...geom.itemDims],
    legalCount,
  };
}

/** One batch item's rows as a subarray view. Cheap: `probs` is dense row-major,
 *  so an item is a contiguous slice. */
export function itemProbs(head: HeadProbs, item: number): Float64Array {
  const stride = head.rowsPerItem * head.width;
  return head.probs.subarray(item * stride, (item + 1) * stride);
}

// ---------------------------------------------------------------------------
// Log-prob and entropy — the pieces `composition` sums
// ---------------------------------------------------------------------------

/** Natural log of a probability, floored at the smallest positive double so a
 *  zero-probability action yields a very negative finite number rather than
 *  `-Infinity` propagating NaN through a sum. */
function safeLog(p: number): number {
  return Math.log(p > 0 ? p : Number.MIN_VALUE);
}

/** Log-probability of a drawn action under one head.
 *
 *  `actions` holds one index per distribution ROW, so it is `rowsPerItem` long
 *  for the per-row-independent factorization and length 1 otherwise. The
 *  independent factorization SUMS over rows: the rows are one joint decision, not
 *  `rows` separate ones. */
export function headLogProb(head: HeadProbs, item: number, actions: ArrayLike<number>): number {
  if (actions.length !== head.rowsPerItem) {
    throw new HeadError(
      `head "${head.name}": expected ${head.rowsPerItem} action index(es), got ${actions.length}`,
    );
  }
  const stride = head.rowsPerItem * head.width;
  let total = 0;
  for (let r = 0; r < head.rowsPerItem; r++) {
    const a = actions[r];
    if (!Number.isInteger(a) || a < 0 || a >= head.width) {
      throw new HeadError(`head "${head.name}": action ${String(a)} is outside [0, ${head.width})`);
    }
    total += safeLog(head.probs[item * stride + r * head.width + a]);
  }
  return total;
}

/** Shannon entropy of one head for one batch item, summed over rows for the same
 *  reason `headLogProb` sums: the rows are one decision. */
export function headEntropy(head: HeadProbs, item: number): number {
  const stride = head.rowsPerItem * head.width;
  let total = 0;
  for (let r = 0; r < head.rowsPerItem; r++) {
    const base = item * stride + r * head.width;
    for (let i = 0; i < head.width; i++) {
      const p = head.probs[base + i];
      if (p > 0) total -= p * Math.log(p);
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Gaussian heads — `constraint` and `wireDim` are the consumer's obligation
// ---------------------------------------------------------------------------

/**
 * The WIRE vector for a gaussian head's draw.
 *
 * A gaussian head's tensors are `[batch, nSlots]`. Its wire vector is neither
 * that width nor that content, and the difference is not optional:
 *
 *   * `zero_sum_derived_slot` — the self slot is NOT in the tensors at all, so it
 *     can never leak into density, entropy or gradients. The consumer derives it:
 *     wire index 0 is `-Σ(sampled slots)`, and sampled slot `i` goes to wire
 *     index `i + 1`.
 *   * `none` — no derived slot; sampled slot `i` goes to wire index `i`.
 *
 * The vector is always `wireDim` wide, zero-padded at the tail. A consumer that
 * sends the raw `nSlots` draw sends a vector of the wrong width whose entries are
 * each off by one position — a well-formed, completely different action.
 */
export function gaussianWireVector(spec: GaussianHead, values: ArrayLike<number>): number[] {
  if (values.length !== spec.nSlots) {
    throw new HeadError(`head "${spec.name}": expected ${spec.nSlots} sampled slot(s), got ${values.length}`);
  }
  const wire: number[] = [];
  if (spec.constraint === "zero_sum_derived_slot") {
    // Summed left-to-right in float64, matching the reference, so the derived
    // slot is bit-identical to the one the trainer would have written.
    let sum = 0;
    for (let i = 0; i < values.length; i++) sum += values[i];
    wire.push(-sum);
  }
  for (let i = 0; i < values.length; i++) wire.push(values[i]);
  if (wire.length > spec.wireDim) {
    throw new HeadError(
      `head "${spec.name}": constraint "${spec.constraint}" over ${spec.nSlots} slot(s) needs ${wire.length} wire ` +
        `entries but wire_dim is ${spec.wireDim}`,
    );
  }
  while (wire.length < spec.wireDim) wire.push(0);
  return wire;
}

/** Invert `gaussianWireVector`: the sampled slots a wire vector carries, dropping
 *  the derived self slot and the zero padding. */
export function gaussianSlotsFromWire(spec: GaussianHead, wire: ArrayLike<number>): number[] {
  const start = spec.constraint === "zero_sum_derived_slot" ? 1 : 0;
  if (wire.length < start + spec.nSlots) {
    throw new HeadError(
      `head "${spec.name}": wire vector of ${wire.length} entries is too short for ${spec.nSlots} slot(s)`,
    );
  }
  const out = new Array<number>(spec.nSlots);
  for (let i = 0; i < spec.nSlots; i++) out[i] = wire[start + i];
  return out;
}

/** Per-slot standard deviations from a gaussian head's `log_std` tensor. */
export function gaussianStd(logStd: ArrayLike<number>): Float64Array {
  const out = new Float64Array(logStd.length);
  for (let i = 0; i < logStd.length; i++) out[i] = Math.exp(logStd[i]);
  return out;
}
