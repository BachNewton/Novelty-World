// ---------------------------------------------------------------------------
// The parity measurement itself, separated from the runtime that hosts it.
//
// Parity is the test the whole runner exists to pass, and it has to be run in
// two places: under Node by `parity.test.ts`, and INSIDE A REAL BROWSER by the
// Playwright harness — because the executor is hand-written numerics
// (`Math.fround`, `Math.imul`, typed-array coercion) and the browser is where it
// actually ships. Two implementations of "measure parity" would be two things to
// keep in step, and the one that drifted would be the one nobody reads. So the
// measurement lives here and both callers get the same numbers by construction.
//
// Nothing in this module touches the filesystem, `process`, or a test framework:
// it is handed a manifest, an executor and decoded cases. Where those came from
// is the caller's problem — which is exactly what lets the browser supply them
// over HTTP.
// ---------------------------------------------------------------------------

import type { FixtureCase, FixtureTolerance } from "./fixture";
import { itemProbs } from "./heads";
import { type Manifest, locateFeatField } from "./manifest";
import { type Observation, PolicySession, type SyncExecutor, type WireValue } from "./session";

/**
 * Re-pack a fixture case into the packed observation blob the manifest declares.
 *
 * The fixture stores the graph's inputs and the legality arrays as separate named
 * arrays; the runner reads everything out of ONE blob at the byte offsets
 * `feat_layout` gives. Re-packing rather than feeding the arrays directly is
 * deliberate — it puts the layout arithmetic itself under test, so a field read
 * at the wrong offset (or reshaped Fortran-order) shows up as a parity failure
 * instead of passing unnoticed because the test bypassed the packer.
 *
 * The name mapping is derived, never hardcoded: a layout field that some input
 * claims as its `source.field` takes that INPUT's name in the fixture; every
 * other field is a mask and appears under its own name.
 */
export function packCase(manifest: Manifest, testCase: FixtureCase): Observation {
  const layout = manifest.featLayout;
  const feat = new Uint8Array(layout.byteLength);
  const view = new DataView(feat.buffer);

  const inputForField = new Map<string, string>();
  for (const input of manifest.inputs) {
    if (input.source.kind === "feat_layout") inputForField.set(input.source.field, input.name);
  }

  const sourceFor = (fieldName: string): { readonly data: Float32Array | Uint8Array } => {
    const inputName = inputForField.get(fieldName);
    if (inputName !== undefined) {
      if (!(inputName in testCase.inputs)) throw new Error(`fixture case has no input "${inputName}"`);
      return testCase.inputs[inputName];
    }
    if (!(fieldName in testCase.masks)) throw new Error(`fixture case has no mask "${fieldName}"`);
    return testCase.masks[fieldName];
  };

  const expectCount = (name: string, got: number, want: number): void => {
    if (got !== want) throw new Error(`fixture field "${name}" holds ${got} values, layout declares ${want}`);
  };

  for (const field of layout.floatFields) {
    const located = locateFeatField(layout, "float_fields", field.name);
    if (located === null) throw new Error(`unreachable: ${field.name} is not in its own layout`);
    const src = sourceFor(field.name).data;
    expectCount(field.name, src.length, field.count);
    for (let i = 0; i < field.count; i++) view.setFloat32(located.byteOffset + i * 4, src[i], true);
  }
  for (const field of layout.boolFields) {
    const located = locateFeatField(layout, "bool_fields", field.name);
    if (located === null) throw new Error(`unreachable: ${field.name} is not in its own layout`);
    const src = sourceFor(field.name).data;
    expectCount(field.name, src.length, field.count);
    for (let i = 0; i < field.count; i++) feat[located.byteOffset + i] = src[i] !== 0 ? 1 : 0;
  }

  // Wire fields are keyed by `source.field`, which is the name the manifest uses
  // internally — not the graph input name the fixture stores them under.
  const wire: Record<string, WireValue> = {};
  for (const input of manifest.inputs) {
    if (input.source.kind !== "wire") continue;
    if (!(input.name in testCase.inputs)) continue;
    const array = testCase.inputs[input.name];
    const rowWidth = array.shape[array.shape.length - 1];
    const rows: number[][] = [];
    for (let r = 0; r < array.data.length / rowWidth; r++) {
      rows.push(Array.from(array.data.subarray(r * rowWidth, (r + 1) * rowWidth)));
    }
    wire[input.source.field] = rows;
  }
  for (const key of Object.keys(testCase.counts)) wire[key] = testCase.counts[key];
  return { feat, wire };
}

export interface HeadDeviation {
  worstProb: number;
  argmaxRows: number;
  argmaxFlips: number;
  compared: number;
}

export interface ParityResult {
  readonly heads: Readonly<Record<string, HeadDeviation>>;
  readonly worstValue: number;
  readonly cases: number;
}

/** Batched because a forward pass has fixed per-call overhead and 400 separate
 *  ones would dominate the run; small enough that a failure names a handful of
 *  cases rather than the whole file. */
export const PARITY_BATCH = 50;

/**
 * Run every case through the manifest-driven path and collect the worst
 * deviation and argmax disagreement per head.
 *
 * Every head on every case, not just the head each decision was routed to — the
 * heads a decision did NOT use are the ones whose masks are entirely false, so
 * they are exactly where a missing all-illegal collapse hides. A measurement that
 * looked only at the routed head would be green with the collapse deleted.
 */
export function measureParity(
  manifest: Manifest,
  executor: SyncExecutor,
  cases: readonly FixtureCase[],
  batch: number = PARITY_BATCH,
): ParityResult {
  const session = new PolicySession(manifest, executor);
  const heads: Record<string, HeadDeviation> = {};
  let worstValue = 0;

  for (let start = 0; start < cases.length; start += batch) {
    const chunk = cases.slice(start, start + batch);
    const out = session.run(chunk.map((c) => packCase(manifest, c)));

    for (const head of manifest.heads) {
      const key = `${head.name}_probs`;
      if (!(head.name in out.heads) || !(key in chunk[0].expect)) continue;
      const got = out.heads[head.name];
      const stat: HeadDeviation =
        head.name in heads ? heads[head.name] : { worstProb: 0, argmaxRows: 0, argmaxFlips: 0, compared: 0 };
      for (const [item, testCase] of chunk.entries()) {
        const want = testCase.expect[key].data;
        const mine = itemProbs(got, item);
        if (mine.length !== want.length) {
          throw new Error(`head "${head.name}": produced ${mine.length} probabilities, fixture holds ${want.length}`);
        }
        for (let i = 0; i < want.length; i++) {
          const dev = Math.abs(mine[i] - want[i]);
          if (dev > stat.worstProb) stat.worstProb = dev;
        }
        // Argmax is compared PER DISTRIBUTION ROW, which under the per-row
        // factorization is one comparison per entity row, not one per case.
        for (let row = 0; row < got.rowsPerItem; row++) {
          const base = row * got.width;
          let bestMine = 0;
          let bestWant = 0;
          for (let i = 1; i < got.width; i++) {
            if (mine[base + i] > mine[base + bestMine]) bestMine = i;
            if (want[base + i] > want[base + bestWant]) bestWant = i;
          }
          stat.argmaxRows++;
          // A tie in the reference is not a flip: two columns within fp32 noise
          // of each other can order either way without the policy differing.
          if (bestMine !== bestWant && Math.abs(want[base + bestMine] - want[base + bestWant]) > 1e-9) {
            stat.argmaxFlips++;
          }
        }
        stat.compared++;
      }
      heads[head.name] = stat;
    }

    for (const value of manifest.values) {
      if (!(value.outputTensor in chunk[0].expect)) continue;
      const got = out.values[value.name];
      const per = got.length / chunk.length;
      for (const [item, testCase] of chunk.entries()) {
        const want = testCase.expect[value.outputTensor].data;
        for (let i = 0; i < per; i++) {
          const dev = Math.abs(got[item * per + i] - want[i]);
          if (dev > worstValue) worstValue = dev;
        }
      }
    }
  }
  return { heads, worstValue, cases: cases.length };
}

/** The one-block human summary, shared so a browser run and a Node run are read
 *  off the same shape of report rather than compared across two formats. */
export function formatParityReport(label: string, result: ParityResult, tolerance: FixtureTolerance): string {
  const lines = Object.keys(result.heads)
    .sort()
    .map((name) => {
      const s = result.heads[name];
      return (
        `    ${name.padEnd(12)} worst |got-want| ${s.worstProb.toExponential(3)}` +
        `  argmax ${(s.argmaxRows - s.argmaxFlips).toString()}/${s.argmaxRows.toString()} agree` +
        `  (${s.compared.toString()} cases)`
      );
    });
  return (
    `\n  ${label}: ${result.cases.toString()} cases\n${lines.join("\n")}` +
    `\n    values       worst |got-want| ${result.worstValue.toExponential(3)}` +
    `\n    tolerance    prob ${tolerance.probAtol.toExponential(1)}  value ${tolerance.valueAtol.toExponential(1)}`
  );
}
