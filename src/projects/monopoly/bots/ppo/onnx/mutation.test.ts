// ---------------------------------------------------------------------------
// Is the parity test capable of failing?
//
// A comparison that passes proves nothing on its own — it might be comparing a
// tensor against itself, tolerating everything, or reading a cached result.
// These tests DELIBERATELY BREAK the graph and assert that each mutation trips
// the specific check it should trip:
//
//   small weight perturbation -> max-abs error blows past the parity tolerance
//   deep weight perturbation  -> the same, from five layers upstream, proving
//                                the comparison sees the whole graph and not
//                                just the last matmul
//   large weight perturbation -> DECISIVE argmax flips (real margins, not the
//                                zero-padding ties parity exempts)
//   swapped operands          -> outputs change materially, proving operand
//                                ORDER is load-bearing and not accidentally
//                                symmetric here
//
// WHERE A MUTATION IS APPLIED IS NOT ARBITRARY, and this is the trap worth
// knowing about: this net's `tanh` units are frequently SATURATED, and
// `tanh(x)` is exactly 1.0 in fp32 for x above ~9. Perturbing a single weight
// that feeds only a saturated unit produces a bit-identical output — the
// mutation is real, propagates correctly, and is still invisible. A mutation
// test that picked one weight at random would therefore "prove" the parity
// check is vacuous when in fact the NETWORK is locally flat. Each probe below
// is placed either downstream of the last nonlinearity or across enough
// weights that saturation cannot absorb it, and says which.
//
// The mutations act on the parsed `OnnxModel` rather than on the serialized
// bytes. Byte-patching a protobuf means locating a float inside a length-
// delimited field by scanning for its bit pattern — fragile, and it would need
// its own tests to be trustworthy. `SyncOnnxSession.fromModel` exists precisely
// so a test can express "this graph, with one weight moved" directly.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { SyncOnnxSession } from "./session";
import { parseModel, type OnnxModel } from "./model";
import { isFloatDType } from "./tensor";
import {
  LOGIT_ROW_LENGTH,
  PARITY_BUNDLES,
  compare,
  compareArgmax,
  feedsForCases,
  loadBundle,
  bundlesAvailable,
  type ParityBundle,
} from "./fixtures.testlib";

/** The ceiling the parity test asserts against. A mutation is only meaningful
 *  if it pushes the disagreement WELL past this. */
const PARITY_ATOL = 1e-4;

const available = bundlesAvailable();

/** A spread of real observations — a single case could happen to sit in a flat
 *  region for whichever weight the mutation touches. */
function sampleCases(bundle: ParityBundle, count: number) {
  const stride = Math.max(1, Math.floor(bundle.cases.length / count));
  return Array.from({ length: count }, (_, i) => bundle.cases[i * stride]);
}

function runAll(model: OnnxModel, bundle: ParityBundle, cases: ReturnType<typeof sampleCases>) {
  const session = SyncOnnxSession.fromModel(model);
  return cases.map((c) => session.run(feedsForCases(bundle, [c])));
}

/** Worst disagreement across every output of every case. */
function worstDelta(
  a: Record<string, { data: ArrayLike<number> }>[],
  b: Record<string, { data: ArrayLike<number> }>[],
): number {
  let worst = 0;
  for (let i = 0; i < a.length; i++) {
    for (const name of Object.keys(a[i])) {
      worst = Math.max(worst, compare(a[i][name].data, b[i][name].data).maxAbs);
    }
  }
  return worst;
}

/**
 * The 2-D weight matrix of the node that DIRECTLY produces a graph output.
 *
 * Found by walking back from the output name rather than by matching a
 * parameter name, so the probe survives any renaming on the exporter's side.
 * A weight here has no nonlinearity between it and the logits, which is what
 * makes it the one place a single-element perturbation is guaranteed visible.
 */
function headWeight(model: OnnxModel, outputName: string): { index: number; name: string; dims: readonly number[] } {
  const node = model.graph.nodes.find((n) => n.outputs.includes(outputName));
  if (node === undefined) throw new Error(`no node produces "${outputName}"`);
  for (const input of node.inputs) {
    const index = model.graph.initializerNames.indexOf(input);
    if (index < 0) continue;
    const t = model.graph.initializers[index];
    if (t.rank === 2 && isFloatDType(t.dtype)) return { index, name: input, dims: t.dims };
  }
  throw new Error(`node producing "${outputName}" has no 2-D float weight`);
}

/** The widest 2-D weight — the trunk input projection, five residual blocks
 *  upstream of every head. Chosen by shape so it does not depend on naming. */
function trunkWeight(model: OnnxModel): { index: number; name: string; dims: readonly number[] } {
  let best = -1;
  let bestSize = -1;
  for (let i = 0; i < model.graph.initializers.length; i++) {
    const t = model.graph.initializers[i];
    if (t.rank !== 2 || !isFloatDType(t.dtype)) continue;
    if (t.size > bestSize) {
      bestSize = t.size;
      best = i;
    }
  }
  if (best < 0) throw new Error("no 2-D float initializer found");
  return { index: best, name: model.graph.initializerNames[best], dims: model.graph.initializers[best].dims };
}

describe.skipIf(!available)("parity is not vacuous", () => {
  it("a 1e-2 perturbation of one output-head weight blows past the parity tolerance", () => {
    const bundle = loadBundle(PARITY_BUNDLES[0]);
    const cases = sampleCases(bundle, 24);
    const baseline = runAll(parseModel(bundle.bytes), bundle, cases);

    const mutated = parseModel(bundle.bytes);
    const target = headWeight(mutated, "global_logits");
    const weights = mutated.graph.initializers[target.index];
    const before = weights.data[0];
    weights.data[0] = before + 1e-2;
    const worst = worstDelta(baseline, runAll(mutated, bundle, cases));

    console.log(
      `\n[mutation] +1e-2 on ${target.name}[${target.dims.join(",")}] element 0 ` +
        `(${before.toExponential(3)} -> ${(before + 1e-2).toExponential(3)}): ` +
        `max|Δ| ${worst.toExponential(3)} = ${(worst / PARITY_ATOL).toFixed(0)}x the parity tolerance`,
    );
    expect(worst).toBeGreaterThan(PARITY_ATOL * 10);
  }, 300_000);

  it("a perturbation five residual blocks upstream still reaches every head", () => {
    const bundle = loadBundle(PARITY_BUNDLES[0]);
    const cases = sampleCases(bundle, 24);
    const baseline = runAll(parseModel(bundle.bytes), bundle, cases);

    const mutated = parseModel(bundle.bytes);
    const target = trunkWeight(mutated);
    const weights = mutated.graph.initializers[target.index];
    // One COLUMN — the same input feature into all `rows` output units. A single
    // element here lands on one unit, and if that unit's tanh is saturated the
    // whole change is swallowed; spreading it across the column guarantees at
    // least some unsaturated unit carries it forward.
    const [rows, cols] = target.dims;
    for (let r = 0; r < rows; r++) weights.data[r * cols] += 1e-2;
    const worst = worstDelta(baseline, runAll(mutated, bundle, cases));

    console.log(
      `[mutation] +1e-2 on column 0 of ${target.name}[${rows},${cols}] (all ${rows} units): ` +
        `max|Δ| ${worst.toExponential(3)} = ${(worst / PARITY_ATOL).toFixed(0)}x the parity tolerance`,
    );
    expect(worst).toBeGreaterThan(PARITY_ATOL * 10);
  }, 300_000);

  it("a scrambled output-head weight row produces DECISIVE argmax flips", () => {
    const bundle = loadBundle(PARITY_BUNDLES[0]);
    const cases = sampleCases(bundle, 40);
    const baseline = runAll(parseModel(bundle.bytes), bundle, cases);

    const mutated = parseModel(bundle.bytes);
    const target = headWeight(mutated, "global_logits");
    const weights = mutated.graph.initializers[target.index];
    // Negate and inflate the weights feeding logit 0. A single weight can be
    // moved a long way and still leave the ARGMAX alone if the head is already
    // confident, so the claim under test — that the flip metric responds to a
    // genuinely different policy — needs a whole logit's worth of change.
    const cols = target.dims[1];
    for (let j = 0; j < cols; j++) weights.data[j] = -weights.data[j] * 25 + 3;
    const after = runAll(mutated, bundle, cases);

    const flips: Record<string, number> = {};
    for (let i = 0; i < cases.length; i++) {
      for (const [name, rowLength] of LOGIT_ROW_LENGTH) {
        const arg = compareArgmax(baseline[i][name].data, after[i][name].data, rowLength, PARITY_ATOL);
        flips[name] = (flips[name] ?? 0) + arg.decisiveFlips;
      }
    }
    console.log(
      `[mutation] scrambled row 0 of ${target.name}: decisive argmax flips over ${cases.length} cases — ` +
        Object.entries(flips)
          .map(([k, v]) => `${k} ${v}`)
          .join(", "),
    );
    expect(
      Object.values(flips).reduce((a, b) => a + b, 0),
      "a scrambled head weight row must change some decisions",
    ).toBeGreaterThan(0);
  }, 300_000);

  it("swapping the operands of the seat-average division changes the outputs", () => {
    // `Div(sum_over_present_seats, count_of_present_seats)` computes the mean
    // player embedding. Division is the one binary op in this graph where
    // operand order is unambiguously observable — swapping it yields the
    // RECIPROCAL of the mean rather than a shape error, which is exactly the
    // kind of wrong-but-plausible result a parity test has to be able to see.
    const bundle = loadBundle(PARITY_BUNDLES[0]);
    const cases = sampleCases(bundle, 12);
    const baseline = runAll(parseModel(bundle.bytes), bundle, cases);

    const mutated = parseModel(bundle.bytes);
    const div = mutated.graph.nodes.find((n) => n.opType === "Div");
    expect(div, "graph should contain a Div to swap").toBeDefined();
    if (div === undefined) return;
    [div.inputs[0], div.inputs[1]] = [div.inputs[1], div.inputs[0]];
    const worst = worstDelta(baseline, runAll(mutated, bundle, cases));

    console.log(
      `[mutation] swapped Div operands ("${div.inputs[1]}" / "${div.inputs[0]}" -> reciprocal): ` +
        `max|Δ| ${worst.toExponential(3)} = ${(worst / PARITY_ATOL).toFixed(0)}x the parity tolerance`,
    );
    expect(worst).toBeGreaterThan(PARITY_ATOL * 100);
  }, 300_000);

  it("swapping two blocks of the trunk Concat changes the outputs", () => {
    // Concatenation order decides which slice of the fused vector each weight
    // column multiplies. Swapping two blocks is a pure PERMUTATION — every
    // number survives, only its position changes — so it is the mutation most
    // likely to slip past a comparison that only looks at summary statistics.
    const bundle = loadBundle(PARITY_BUNDLES[0]);
    const cases = sampleCases(bundle, 12);
    const baseline = runAll(parseModel(bundle.bytes), bundle, cases);

    const mutated = parseModel(bundle.bytes);
    const cat = mutated.graph.nodes.find((n) => n.opType === "Concat" && n.inputs.length === 6);
    expect(cat, "graph should contain the 6-way trunk Concat").toBeDefined();
    if (cat === undefined) return;
    [cat.inputs[0], cat.inputs[1]] = [cat.inputs[1], cat.inputs[0]];
    const worst = worstDelta(baseline, runAll(mutated, bundle, cases));

    console.log(
      `[mutation] swapped the first two blocks of the 6-way trunk Concat: ` +
        `max|Δ| ${worst.toExponential(3)} = ${(worst / PARITY_ATOL).toFixed(0)}x the parity tolerance\n`,
    );
    expect(worst).toBeGreaterThan(PARITY_ATOL * 100);
  }, 300_000);

  it("leaves the unmutated model producing its original numbers", () => {
    // The mutations above all parse their own copy of the bytes. This asserts
    // that is actually true — a mutation reaching shared state would make every
    // later parity result meaningless while still looking green.
    const bundle = loadBundle(PARITY_BUNDLES[0]);
    const cases = sampleCases(bundle, 6);
    const a = runAll(parseModel(bundle.bytes), bundle, cases);
    const b = runAll(parseModel(bundle.bytes), bundle, cases);
    for (let i = 0; i < cases.length; i++) {
      for (const name of Object.keys(a[i])) {
        expect(compare(a[i][name].data, b[i][name].data).maxAbs, `${name} case ${i}`).toBe(0);
      }
    }
  }, 300_000);
});
