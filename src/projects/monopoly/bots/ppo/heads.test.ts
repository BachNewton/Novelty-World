import { describe, expect, it } from "vitest";

import {
  HeadError,
  assertCountMaskSourced,
  countMask,
  gaussianSlotsFromWire,
  gaussianStd,
  gaussianWireVector,
  headEntropy,
  headGeometry,
  headLogProb,
  headProbs,
  itemProbs,
  maskedSoftmax,
  resolveColumn,
} from "./heads";
import { type HeadSpec, type MaskingSpec, type PerEntityCategoricalHead, headByName, parseManifest } from "./manifest";
import { greedyIndex } from "./greedy";
import { syntheticManifestJson } from "./synthetic";

const MASKING: MaskingSpec = {
  negInf: -1e9,
  apply: null,
  collapseAllIllegal: { enabled: true, rule: null, reference: null },
};

const NO_COLLAPSE: MaskingSpec = { ...MASKING, collapseAllIllegal: { enabled: false, rule: null, reference: null } };

function sum(values: ArrayLike<number>, from = 0, to = values.length): number {
  let total = 0;
  for (let i = from; i < to; i++) total += values[i];
  return total;
}

describe("masked softmax", () => {
  it("suppresses illegal lanes without producing NaN", () => {
    // neg_inf is a large FINITE negative for exactly this reason: -Infinity minus
    // the row max is NaN when the max is also -Infinity.
    const { probs } = maskedSoftmax([1, 2, 3, 4], new Uint8Array([1, 0, 1, 0]), 1, 1, 4, MASKING, 0);
    expect([...probs].every(Number.isFinite)).toBe(true);
    expect(probs[1]).toBe(0);
    expect(probs[3]).toBe(0);
    expect(sum(probs)).toBeCloseTo(1, 12);
    // Only the legal lanes' relative odds survive.
    expect(probs[2] / probs[0]).toBeCloseTo(Math.exp(2), 9);
  });

  it("collapses an all-illegal row onto the null column as a point mass", () => {
    // Left alone, every logit is equal at neg_inf and softmax makes the row
    // UNIFORM — a uniformly random action from an inactive head, with a log-prob
    // and entropy that are artifacts of float width.
    const mask = new Uint8Array([0, 0, 0, 0]);
    const { probs, legalCount } = maskedSoftmax([5, 1, 9, 2], mask, 1, 1, 4, MASKING, 2);
    expect(legalCount[0]).toBe(0);
    expect(probs[2]).toBeCloseTo(1, 12);
    expect(sum(probs) - probs[2]).toBeLessThan(1e-12);
    expect(headEntropyOfRow(probs)).toBeCloseTo(0, 12);
  });

  it("leaves an all-illegal row uniform when the collapse is disabled", () => {
    const { probs } = maskedSoftmax([5, 1, 9, 2], new Uint8Array([0, 0, 0, 0]), 1, 1, 4, NO_COLLAPSE, 0);
    for (const p of probs) expect(p).toBeCloseTo(0.25, 12);
  });

  it("resolves a NEGATIVE null column from the end", () => {
    const { probs } = maskedSoftmax([1, 2, 3, 4], new Uint8Array([0, 0, 0, 0]), 1, 1, 4, MASKING, -1);
    expect(probs[3]).toBeCloseTo(1, 12);
    expect(resolveColumn(-1, 4)).toBe(3);
    expect(resolveColumn(-4, 4)).toBe(0);
    expect(() => resolveColumn(-5, 4)).toThrow(HeadError);
    expect(() => resolveColumn(4, 4)).toThrow(HeadError);
  });

  it("collapses PER ROW, leaving the other rows alone", () => {
    const logits = [1, 2, 3, 4, 5, 6];
    const mask = new Uint8Array([1, 1, 0, 0, 0, 0]);
    const { probs, legalCount } = maskedSoftmax(logits, mask, 1, 2, 3, MASKING, 0);
    expect(legalCount[0]).toBe(2);
    expect(legalCount[1]).toBe(0);
    expect(sum(probs, 0, 3)).toBeCloseTo(1, 12);
    expect(probs[3]).toBeCloseTo(1, 12);
  });

  it("treats a maskless head as fully legal and never collapses it", () => {
    const { probs, legalCount } = maskedSoftmax([1, 1, 1, 1], null, 1, 1, 4, MASKING, 0);
    expect(legalCount[0]).toBe(4);
    for (const p of probs) expect(p).toBeCloseTo(0.25, 12);
  });

  it("refuses a mask whose length does not match the logits", () => {
    expect(() => maskedSoftmax([1, 2, 3], new Uint8Array([1, 1]), 1, 1, 3, MASKING, 0)).toThrow(
      /mask has 2 entries, expected 3/,
    );
  });
});

function headEntropyOfRow(probs: ArrayLike<number>): number {
  let h = 0;
  for (let i = 0; i < probs.length; i++) if (probs[i] > 0) h -= probs[i] * Math.log(probs[i]);
  return h;
}

// ---------------------------------------------------------------------------
// select: the factorization no tensor shape reveals
// ---------------------------------------------------------------------------

describe("select decides the joint, not the shape", () => {
  const manifest = parseManifest(syntheticManifestJson());
  const grid = headByName(manifest, "crew_orders") as PerEntityCategoricalHead;
  const rows = grid.rows;
  const ops = grid.ops?.length ?? 0;
  const logits = Array.from({ length: rows * ops }, (_v, i) => Math.sin(i * 1.7) * 2);
  const mask = new Uint8Array(rows * ops).fill(1);

  it("select:\"one\" is ONE distribution over the flattened grid", () => {
    const geom = headGeometry(grid);
    expect(geom.flatten).toBe(true);
    expect(geom.rowsPerItem).toBe(1);
    expect(geom.width).toBe(rows * ops);

    const out = headProbs(grid, manifest.masking, logits, 1, mask);
    // The whole grid sums to 1. Softmaxing the last axis instead would give
    // `rows` distributions summing to `rows` — a different policy, and the shapes
    // would be identical.
    expect(sum(out.probs)).toBeCloseTo(1, 12);
    expect(out.dims).toEqual([1, rows * ops]);
  });

  it("select:\"independent\" is one distribution PER ROW", () => {
    const asIndependent: HeadSpec = { ...grid, select: "independent" };
    const geom = headGeometry(asIndependent);
    expect(geom.flatten).toBe(false);
    expect(geom.rowsPerItem).toBe(rows);
    expect(geom.width).toBe(ops);

    const out = headProbs(asIndependent, manifest.masking, logits, 1, mask);
    expect(sum(out.probs)).toBeCloseTo(rows, 10);
    for (let r = 0; r < rows; r++) expect(sum(out.probs, r * ops, (r + 1) * ops)).toBeCloseTo(1, 12);
    expect(out.dims).toEqual([1, rows, ops]);
  });

  it("collapses on the FLATTENED row under select:\"one\"", () => {
    // Under "one" there is a single decision, so "no legal option" is a property
    // of the whole grid and the point mass lands on one flat cell — not on one
    // cell per row.
    const empty = new Uint8Array(rows * ops);
    const one = headProbs(grid, manifest.masking, logits, 1, empty);
    expect(one.probs[0]).toBeCloseTo(1, 12);
    expect(sum(one.probs)).toBeCloseTo(1, 12);

    const independent = headProbs({ ...grid, select: "independent" }, manifest.masking, logits, 1, empty);
    expect(sum(independent.probs)).toBeCloseTo(rows, 10);
    for (let r = 0; r < rows; r++) expect(independent.probs[r * ops]).toBeCloseTo(1, 12);
  });
});

// ---------------------------------------------------------------------------
// count masks
// ---------------------------------------------------------------------------

describe("count masks", () => {
  it("derives legality from the cardinality, with the null column always legal", () => {
    const bits = countMask(7, [3, 0], -1, true);
    expect([...bits.subarray(0, 7)]).toEqual([1, 1, 1, 0, 0, 0, 1]);
    // Zero real entries still leaves the null legal, so the row is a forced
    // choice rather than an all-illegal collapse.
    expect([...bits.subarray(7)]).toEqual([0, 0, 0, 0, 0, 0, 1]);
  });

  it("leaves the null column illegal when the head does not force it", () => {
    expect([...countMask(4, [2], -1, false)]).toEqual([1, 1, 0, 0]);
  });

  it("refuses a count sourced from the packed blob, naming the head and field", () => {
    // This is the failure that would otherwise be invisible: a boolean field
    // stores 0/1 bytes, so a count of 17 reads back as 1.
    expect(() =>
      assertCountMaskSourced("wreck_pick", {
        kind: "count",
        source: { kind: "feat_layout", section: "bool_fields", field: "alive" },
        shape: ["batch", 7],
      }),
    ).toThrow(/head "wreck_pick": count mask reads field "alive" from feat_layout/);
  });

  it("rejects a non-integer or negative count", () => {
    expect(() => countMask(4, [2.5], 0, false)).toThrow(/expected a non-negative integer/);
    expect(() => countMask(4, [-1], 0, false)).toThrow(/expected a non-negative integer/);
  });
});

// ---------------------------------------------------------------------------
// gaussian wire vectors
// ---------------------------------------------------------------------------

describe("gaussian wire vectors", () => {
  const manifest = parseManifest(syntheticManifestJson());
  const head = headByName(manifest, "ballast");
  if (head.kind !== "gaussian") throw new Error("expected a gaussian head");

  it("derives the self slot and zero-pads to wire_dim", () => {
    // The self slot is not in the tensors at all, so it can never leak into
    // density or gradients; it exists only on the wire, as -sum(slots).
    const wire = gaussianWireVector(head, [0.25, -0.75]);
    expect(wire).toHaveLength(head.wireDim);
    expect(wire[0]).toBeCloseTo(0.5, 12);
    expect(wire.slice(1, 3)).toEqual([0.25, -0.75]);
    expect(wire.slice(3)).toEqual([0]);
    // The whole vector nets to zero, which is what the constraint names.
    expect(wire.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 12);
  });

  it("shifts nothing when the constraint is none", () => {
    // Sending the raw draw under a derived-slot constraint would put every entry
    // one position off — a well-formed, completely different action.
    const wire = gaussianWireVector({ ...head, constraint: "none" }, [0.25, -0.75]);
    expect(wire).toEqual([0.25, -0.75, 0, 0]);
  });

  it("round-trips through the wire", () => {
    const slots = [1.5, -2.25];
    expect(gaussianSlotsFromWire(head, gaussianWireVector(head, slots))).toEqual(slots);
    const plain = { ...head, constraint: "none" };
    expect(gaussianSlotsFromWire(plain, gaussianWireVector(plain, slots))).toEqual(slots);
  });

  it("refuses a draw of the wrong width", () => {
    expect(() => gaussianWireVector(head, [1])).toThrow(/expected 2 sampled slot\(s\), got 1/);
    expect(() => gaussianWireVector({ ...head, wireDim: 2 }, [1, 2])).toThrow(/needs 3 wire entries but wire_dim is 2/);
  });

  it("exponentiates log_std", () => {
    expect([...gaussianStd([0, Math.LN2])]).toEqual([1, 2]);
  });
});

// ---------------------------------------------------------------------------
// log-prob and entropy
// ---------------------------------------------------------------------------

describe("log-prob and entropy", () => {
  const manifest = parseManifest(syntheticManifestJson());
  const grid = headByName(manifest, "crew_orders") as PerEntityCategoricalHead;
  const independent: HeadSpec = { ...grid, select: "independent" };
  const ops = grid.ops?.length ?? 0;
  const logits = Array.from({ length: grid.rows * ops }, (_v, i) => Math.cos(i * 0.9));
  const mask = new Uint8Array(grid.rows * ops).fill(1);

  it("SUMS over rows under the per-row factorization", () => {
    // The rows are one joint decision, not `rows` separate ones, so their
    // log-probs add.
    const out = headProbs(independent, manifest.masking, logits, 1, mask);
    const actions = new Int32Array(grid.rows).fill(1);
    let expected = 0;
    for (let r = 0; r < grid.rows; r++) expected += Math.log(out.probs[r * ops + 1]);
    expect(headLogProb(out, 0, actions)).toBeCloseTo(expected, 12);
    expect(headEntropy(out, 0)).toBeGreaterThan(0);
  });

  it("takes exactly one index under the joint factorization", () => {
    const out = headProbs(grid, manifest.masking, logits, 1, mask);
    expect(headLogProb(out, 0, [5])).toBeCloseTo(Math.log(out.probs[5]), 12);
    expect(() => headLogProb(out, 0, [1, 2])).toThrow(/expected 1 action index\(es\), got 2/);
  });

  it("gives a collapsed row log-prob and entropy of exactly zero", () => {
    // That is the whole point of the collapse: a deterministic action, and no
    // gradient path through a row that had no legal choice.
    const out = headProbs(grid, manifest.masking, logits, 1, new Uint8Array(grid.rows * ops));
    expect(headLogProb(out, 0, [0])).toBeCloseTo(0, 12);
    expect(headEntropy(out, 0)).toBeCloseTo(0, 12);
  });

  it("rejects an out-of-range action", () => {
    const out = headProbs(grid, manifest.masking, logits, 1, mask);
    expect(() => headLogProb(out, 0, [999])).toThrow(/outside \[0, 12\)/);
  });

  it("views one batch item without copying", () => {
    const batch = 3;
    const wide = Array.from({ length: batch * grid.rows * ops }, (_v, i) => Math.sin(i));
    const maskWide = new Uint8Array(batch * grid.rows * ops).fill(1);
    const out = headProbs(grid, manifest.masking, wide, batch, maskWide);
    expect(itemProbs(out, 1)).toHaveLength(grid.rows * ops);
    expect(sum(itemProbs(out, 2))).toBeCloseTo(1, 12);
  });
});

// ---------------------------------------------------------------------------
// decode
// ---------------------------------------------------------------------------

describe("argmax decode", () => {
  it("reads a row out of a flat grid at an offset", () => {
    const grid = new Float32Array([1, 0, 0, 0, 0, 1]);
    expect(greedyIndex(grid, 0, 3)).toBe(0);
    expect(greedyIndex(grid, 3, 3)).toBe(2);
  });

  it("breaks argmax ties toward the lowest index", () => {
    expect(greedyIndex([0.3, 0.3, 0.4, 0.4], 0, 4)).toBe(2);
    expect(greedyIndex([0.5, 0.5], 0, 2)).toBe(0);
  });

  it("refuses an empty row rather than returning a bogus index", () => {
    expect(() => greedyIndex([0.5, 0.5], 0, 0)).toThrow(/empty row/);
  });
});
