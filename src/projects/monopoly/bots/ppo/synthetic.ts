// ---------------------------------------------------------------------------
// A model for a game that does not exist.
//
// This is the control on model-agnosticism. Every other test in this suite drives
// the runner with bundles exported from one trainer for one game, so a runner
// that had quietly grown a dependency on that game's head names, head count, mask
// layout or `select` mode would pass all of them. "Reef Salvage" shares nothing
// with the real bundles: different entities, different head names, a different
// number of heads, a gaussian head the production nets do not have, and — the
// case no shipped bundle exercises — a `per_entity_categorical` with
// `select: "one"`, whose logits and mask must flatten to a single joint
// categorical before masking.
//
// The graph payload is opaque bytes rather than an ONNX protobuf, and the
// executor is injected. That is deliberate: the manifest is the contract, and
// what sits behind `output_tensors` is exactly the thing a manifest-driven
// consumer is not supposed to know about. The bytes still participate fully — the
// executor derives its weights from them, so a corrupted payload changes every
// output, which is what makes the checksum round-trip meaningful.
// ---------------------------------------------------------------------------

import { sha256Hex } from "./bundle";
import { type ExecTensor, type Observation, type SyncExecutor } from "./session";

/** Widths of the fictional game, in one place so the manifest and the packer
 *  cannot drift apart. */
export const REEF = {
  envFeat: 6,
  crewRows: 4,
  crewOps: 3,
  divers: 3,
  /** Static salvage-target rows the graph was traced with; the head is one wider,
   *  for the learned abort column. */
  wreckSlots: 6,
  wreckDim: 4,
  ballastSlots: 2,
  ballastWireDim: 4,
  moveTokens: ["DIVE", "SURFACE", "SALVAGE", "REPAIR", "ARM_CREW"],
  crewOpNames: ["IDLE", "WINCH", "PATCH"],
} as const;

const FLOAT_COUNT = REEF.envFeat + REEF.crewRows * REEF.crewOps;
const BOOL_COUNT = REEF.divers + REEF.moveTokens.length + REEF.crewRows * REEF.crewOps;

/** The manifest, as the JSON a bundle would ship. Returned as a fresh object each
 *  call so a test that mutates one field to prove a rejection path cannot leak
 *  that mutation into the next test. */
export function syntheticManifestJson(): Record<string, unknown> {
  return {
    contract_version: 2,
    created_utc: "1970-01-01T00:00:00Z",
    producer: { tool: "synthetic.ts", exporter: "hand-built" },
    graph: "policy.onnx",
    dims: {
      env_feat: REEF.envFeat,
      crew_feat: REEF.crewOps,
      move_tokens: [...REEF.moveTokens],
      crew_rows: REEF.crewRows,
      crew_ops: REEF.crewOps,
      wreck_slots: REEF.wreckSlots,
      divers: REEF.divers,
      crew_select: "one",
      crew_gated: true,
    },
    // Every entry is either the dims field of the same name, or that field's
    // LENGTH when it is a list — the same derivation the guard re-checks.
    action_geometry: {
      move_tokens: REEF.moveTokens.length,
      crew_rows: REEF.crewRows,
      crew_ops: REEF.crewOps,
      wreck_slots: REEF.wreckSlots,
      divers: REEF.divers,
      crew_select: "one",
      crew_gated: true,
    },
    feat_layout: {
      float_count: FLOAT_COUNT,
      bool_count: BOOL_COUNT,
      byte_length: FLOAT_COUNT * 4 + BOOL_COUNT,
      float_fields: [
        { name: "env", count: REEF.envFeat },
        { name: "crew", rows: REEF.crewRows, cols: REEF.crewOps, count: REEF.crewRows * REEF.crewOps },
      ],
      bool_fields: [
        { name: "alive", count: REEF.divers },
        { name: "move_mask", count: REEF.moveTokens.length },
        { name: "crew_mask", rows: REEF.crewRows, cols: REEF.crewOps, count: REEF.crewRows * REEF.crewOps },
      ],
    },
    inputs: [
      {
        name: "env_feat",
        shape: ["batch", REEF.envFeat],
        dtype: "float32",
        source: { kind: "feat_layout", section: "float_fields", field: "env" },
      },
      {
        name: "crew_feat",
        shape: ["batch", REEF.crewRows, REEF.crewOps],
        dtype: "float32",
        source: { kind: "feat_layout", section: "float_fields", field: "crew" },
      },
      {
        name: "alive",
        shape: ["batch", REEF.divers],
        dtype: "uint8",
        cast_in_graph: "bool",
        source: { kind: "feat_layout", section: "bool_fields", field: "alive" },
      },
      {
        name: "wrecks",
        shape: ["batch", REEF.wreckSlots, REEF.wreckDim],
        dtype: "float32",
        source: {
          kind: "wire",
          field: "wrecks",
          pad: "zero-pad rows [n, wreck_slots) — legality comes from n, not the padding",
        },
      },
    ],
    heads: [
      {
        name: "move",
        kind: "categorical",
        dist_class: "head_dist.CategoricalHeadDist",
        group: "dive",
        output_tensor: "move_logits",
        output_tensors: { logits: "move_logits" },
        shape: ["batch", REEF.moveTokens.length],
        axes: ["batch", "tokens"],
        tokens: [...REEF.moveTokens],
        mask: {
          kind: "bool_array",
          source: { kind: "feat_layout", section: "bool_fields", field: "move_mask" },
          shape: ["batch", REEF.moveTokens.length],
          semantics: "true == legal",
        },
        null_column: 0,
        null_token: false,
        null_always_legal: false,
        storage: { dtype: "int64", shape: [] },
      },
      {
        name: "crew_orders",
        kind: "per_entity_categorical",
        dist_class: "head_dist.PerEntityCategoricalHeadDist",
        group: "crew",
        output_tensor: "crew_logits",
        output_tensors: { logits: "crew_logits" },
        shape: ["batch", REEF.crewRows, REEF.crewOps],
        axes: ["batch", "rows", "ops"],
        entity: "crew",
        rows: REEF.crewRows,
        // ONE categorical over the whole grid: one order for one crew member per
        // decision, not an order per crew member.
        select: "one",
        ops: [...REEF.crewOpNames],
        dest_entity: null,
        mask: {
          kind: "bool_array",
          source: { kind: "feat_layout", section: "bool_fields", field: "crew_mask" },
          shape: ["batch", REEF.crewRows, REEF.crewOps],
          semantics: "true == legal",
        },
        null_column: 0,
        null_token: false,
        null_always_legal: false,
        storage: { dtype: "int64", shape: [], flat: "row_major row*n_ops+op" },
      },
      {
        name: "wreck_pick",
        kind: "entity_pointer",
        dist_class: "head_dist.EntityPointerHeadDist",
        group: "salvage",
        output_tensor: "wreck_logits",
        output_tensors: { logits: "wreck_logits" },
        shape: ["batch", REEF.wreckSlots + 1],
        axes: ["batch", "wrecks_plus_null"],
        entity: "wreck",
        entity_rows: REEF.wreckSlots,
        null_token: true,
        null_column: -1,
        null_always_legal: true,
        null_name: "abort",
        // The mask that is not a mask: legality is a COUNT, and there is no
        // legality array anywhere in the blob to read instead.
        mask: {
          kind: "count",
          source: { kind: "wire", field: "wreck_n", dtype: "int64", shape: ["batch"] },
          shape: ["batch", REEF.wreckSlots + 1],
          rule: "legal[i] = (i < n); legal[wreck_slots] = true always",
        },
        storage: { dtype: "int64", shape: [] },
      },
      {
        name: "ballast",
        kind: "gaussian",
        dist_class: "head_dist.GaussianHeadDist",
        group: "salvage",
        output_tensor: null,
        output_tensors: { mean: "ballast_mean", log_std: "ballast_log_std" },
        shape: ["batch", REEF.ballastSlots],
        axes: ["batch", "slots"],
        conditioning: "per_entity",
        entity: "diver",
        exclude_self_row: true,
        n_slots: REEF.ballastSlots,
        constraint: "zero_sum_derived_slot",
        wire_dim: REEF.ballastWireDim,
        log_std: "global_param",
        mask: null,
        storage: { dtype: "float32", shape: [REEF.ballastWireDim] },
      },
    ],
    values: [
      {
        name: "value_haul",
        output_tensor: "haul_per_diver",
        shape: ["batch", REEF.divers],
        acting_row: 0,
        semantics: "raw expected salvage value per diver; row 0 is the acting diver.",
      },
    ],
    composition: {
      groups: [
        { name: "dive", id: 0, heads: ["move"], gate: null },
        {
          name: "crew",
          id: 1,
          heads: ["crew_orders"],
          gate: { head: "move", token: "ARM_CREW", token_index: 4 },
        },
        { name: "salvage", id: 2, heads: ["wreck_pick", "ballast"], gate: null },
      ],
      routed: ["dive", "salvage"],
      gated: [{ head: "crew_orders", by: { head: "move", token: "ARM_CREW", token_index: 4 } }],
      log_prob: "sum over the heads of the ROUTED group, plus the SAMPLED gate indicator times the gated group.",
      entropy: "H(routed) + P(gate token under the MASKED gate distribution) * H(gated).",
    },
    masking: {
      neg_inf: -1000000000.0,
      apply: "masked = where(mask, logits, neg_inf), applied BEFORE softmax.",
      collapse_all_illegal: {
        enabled: true,
        rule: "For any row whose mask has NO legal entry, overwrite masked[..., null_column] = 0.",
        reference: "distribution.collapse_all_illegal",
        per_head_column: "heads[].null_column (negative indices count from the end)",
      },
    },
    provenance: { checkpoint: "(synthetic)", divers: REEF.divers },
    sha256: syntheticGraphSha256(),
    files: [{ name: "policy.onnx", bytes: SYNTHETIC_GRAPH.length, sha256: syntheticGraphSha256() }],
  };
}

// ---------------------------------------------------------------------------
// The "graph"
// ---------------------------------------------------------------------------

/** The payload the bundle ships and checksums. Deterministic bytes standing in
 *  for a traced graph; the executor below reads its weights out of them, so a
 *  single flipped byte changes every distribution the runner produces. */
export const SYNTHETIC_GRAPH: Uint8Array = (() => {
  const bytes = new Uint8Array(256);
  // A simple full-period generator: reproducible across runtimes without pulling
  // the sampling module into an artifact that is meant to stand alone.
  let x = 0x9e3779b9;
  for (let i = 0; i < bytes.length; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    bytes[i] = x >>> 24;
  }
  return bytes;
})();

let graphDigest: string | null = null;

export function syntheticGraphSha256(): string {
  graphDigest ??= sha256Hex(SYNTHETIC_GRAPH);
  return graphDigest;
}

function tensor(dims: number[], fill: (flat: number, item: number, index: number) => number): ExecTensor {
  const per = dims.slice(1).reduce((a, b) => a * b, 1);
  const data = new Float32Array(dims[0] * per);
  for (let b = 0; b < dims[0]; b++) {
    for (let i = 0; i < per; i++) data[b * per + i] = fill(b * per + i, b, i);
  }
  return { dims, dtype: "float32", data };
}

/**
 * A synthetic executor for the synthetic manifest.
 *
 * Every output is a smooth, well-spread function of the whole feed and of the
 * payload bytes, which matters for two reasons: no two logits in a row tie (so an
 * argmax assertion is meaningful), and no output ignores an input (so a feed
 * assembled from the wrong `feat_layout` offset produces different numbers rather
 * than the same ones).
 */
export function syntheticExecutor(graph: Uint8Array = SYNTHETIC_GRAPH): SyncExecutor {
  if (graph.length === 0) throw new Error("syntheticExecutor: empty graph payload");
  /** Weight `i`, in roughly [-1, 1), read out of THIS executor's payload — a
   *  flipped byte therefore moves every output, which is what makes the bundle's
   *  checksum round-trip a claim about the numbers and not just about storage. */
  const weight = (i: number): number => graph[i % graph.length] / 128 - 1;
  // Every byte of the payload folds into one bias term, so no byte of the
  // "weights" is dead. Without it a corrupted byte that happened to sit at an
  // index no logit indexes would leave every output identical, and the bundle's
  // checksum round-trip would be a claim about storage rather than about the
  // numbers the model produces.
  let mix = 0x811c9dc5;
  for (const byte of graph) mix = Math.imul(mix ^ byte, 16777619) >>> 0;
  const bias = (mix % 8192) / 8192;
  const inputNames = ["env_feat", "crew_feat", "alive", "wrecks"];
  const outputNames = ["move_logits", "crew_logits", "wreck_logits", "ballast_mean", "ballast_log_std", "haul_per_diver"];
  return {
    inputNames,
    outputNames,
    run(feeds) {
      for (const name of inputNames) {
        if (!(name in feeds)) throw new Error(`syntheticExecutor: missing feed "${name}"`);
      }
      const env = feeds.env_feat;
      const batch = env.dims[0];
      // One scalar summary per batch item, touching every input so nothing can be
      // mis-assembled without moving the outputs.
      const base = new Float64Array(batch);
      for (const name of inputNames) {
        const t = feeds[name];
        const per = t.data.length / batch;
        for (let b = 0; b < batch; b++) {
          for (let i = 0; i < per; i++) base[b] += t.data[b * per + i] * (1 + (i % 7)) * 0.125;
        }
      }
      const logit = (item: number, index: number, salt: number): number =>
        Math.sin(base[item] * (0.37 + 0.11 * index) + weight(index * 13 + salt) * 3.1 + bias * (1 + index)) * 2.5 +
        weight(index * 7 + salt);
      return {
        move_logits: tensor([batch, REEF.moveTokens.length], (_f, b, i) => logit(b, i, 1)),
        crew_logits: tensor([batch, REEF.crewRows, REEF.crewOps], (_f, b, i) => logit(b, i, 23)),
        wreck_logits: tensor([batch, REEF.wreckSlots + 1], (_f, b, i) => logit(b, i, 41)),
        ballast_mean: tensor([batch, REEF.ballastSlots], (_f, b, i) => logit(b, i, 67) * 0.4),
        ballast_log_std: tensor([batch, REEF.ballastSlots], (_f, _b, i) => weight(i * 5 + 89) - 1),
        haul_per_diver: tensor([batch, REEF.divers], (_f, b, i) => logit(b, i, 101) * 10),
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Observations
// ---------------------------------------------------------------------------

export interface SyntheticObservationOptions {
  /** Legal move tokens. An empty set exercises the all-illegal collapse. */
  readonly moveMask?: readonly boolean[];
  /** Legal crew (row, op) cells, row-major. Empty exercises the collapse on the
   *  FLATTENED grid, which is where `select: "one"` differs. */
  readonly crewMask?: readonly boolean[];
  /** How many salvage targets really exist. Drives the `count` mask. */
  readonly wreckCount?: number;
}

/** Pack one fictional observation into the blob its own `feat_layout` describes:
 *  float32 LE section, then the uint8 boolean section, fields in declared order. */
export function syntheticObservation(seed: number, options: SyntheticObservationOptions = {}): Observation {
  const feat = new Uint8Array(FLOAT_COUNT * 4 + BOOL_COUNT);
  const view = new DataView(feat.buffer);
  for (let i = 0; i < FLOAT_COUNT; i++) {
    view.setFloat32(i * 4, Math.sin(seed * 0.7 + i * 1.3), true);
  }
  let off = FLOAT_COUNT * 4;
  const alive = [true, true, seed % 3 !== 0];
  for (const v of alive) feat[off++] = v ? 1 : 0;
  const moveMask = options.moveMask ?? REEF.moveTokens.map((_t, i) => (seed + i) % 3 !== 0);
  for (const v of moveMask) feat[off++] = v ? 1 : 0;
  const crewCells = REEF.crewRows * REEF.crewOps;
  const crewMask = options.crewMask ?? Array.from({ length: crewCells }, (_v, i) => (seed + i) % 4 !== 0);
  for (const v of crewMask) feat[off++] = v ? 1 : 0;

  const wreckCount = options.wreckCount ?? seed % (REEF.wreckSlots + 1);
  const wrecks: number[][] = [];
  for (let r = 0; r < wreckCount; r++) {
    wrecks.push(Array.from({ length: REEF.wreckDim }, (_v, c) => Math.cos(seed + r * 3 + c)));
  }
  // Only the real rows are supplied; the feed builder zero-pads to the static
  // width, which is exactly what the wire does.
  return { feat, wire: { wrecks, wreck_n: wreckCount } };
}

/** The whole bundle as named byte entries, ready for an in-memory fetcher. */
export function syntheticBundleFiles(): Record<string, Uint8Array> {
  const json = JSON.stringify(syntheticManifestJson());
  return {
    "manifest.json": new TextEncoder().encode(json),
    "policy.onnx": SYNTHETIC_GRAPH,
  };
}
