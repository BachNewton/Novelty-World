// ---------------------------------------------------------------------------
// THE deliverable test: does the hand-written executor produce the same numbers
// as onnxruntime, on the real trained graphs, over real recorded observations?
//
// Two things are measured, and the second is the one that matters:
//
//   MAX-ABS ERROR per output tensor. Expected to be small but NOT zero. Both
//   implementations do the same arithmetic in a different ORDER — onnxruntime
//   blocks and vectorises its matmuls, this executor unrolls by four — and fp32
//   addition is not associative. The disagreement is reassociation noise that
//   grows with the reduction depth (1160-deep for the trade head), not error.
//
//   DECISIVE ARGMAX FLIPS per logits head. This must be ZERO. A logit
//   disagreement is invisible to the game unless it reorders the top
//   candidates, at which point the bot plays a different move. "Decisive"
//   excludes rows where the two disputed logits are closer together than the
//   comparison's own resolution — a position with no legal trades feeds 64
//   identical zero-padded candidate rows through the trade head and gets 64
//   bit-identical logits back, so which index wins is a tie-break, not an
//   opinion. See `compareArgmax` for why counting those would be measuring
//   nothing. Raw flips are reported alongside so the exemption is visible.
//
// The ceilings assume an fp32 graph, which is what ships. That is asserted below
// off the initializers rather than taken on trust — a narrowed graph would make
// the two implementations disagree about intermediate PRECISION as well as
// summation order, which is a larger effect and a different question, and these
// numbers would silently stop meaning what they say.
//
// The batch check is separate and catches a different bug class entirely: rows
// run together must equal the same rows run alone. Nothing about broadcasting
// or reduction is exercised on a batch of one, so a stride or an axis-ordering
// error can hide behind a fully green batch-1 parity run.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { SyncOnnxSession } from "./session";
import {
  LOGIT_ROW_LENGTH,
  PARITY_BUNDLES,
  type ParityBundle,
  compare,
  compareArgmax,
  createOrtSession,
  feedsForCases,
  loadBundle,
  loadOrt,
  bundlesAvailable,
  ortAvailable,
  percentile,
  runOrt,
  weightDTypeOf,
} from "./fixtures.testlib";

interface Tolerances {
  /** Ceiling on elementwise logit disagreement. */
  readonly logitAtol: number;
  /** Ceiling on value-output disagreement. */
  readonly valueAtol: number;
  /** Below this margin an argmax disagreement is a TIE, not an opinion — see
   *  `compareArgmax`. Kept separate from the ceilings above because it answers a
   *  different question: not "how far apart are the numbers" but "how confident
   *  was either side in the ordering it chose". */
  readonly flipMargin: number;
}

/**
 * Both implementations do the same arithmetic in a different ORDER, so the
 * disagreement is reassociation noise. onnxruntime and torch differ by ~3e-5 on
 * these same graphs, so agreeing with onnxruntime to 1e-4 is inside the noise
 * floor the reference itself lives in; tightening below the torch-vs-ort gap
 * would be measuring fp32 summation order, not correctness.
 *
 * There is ONE set of numbers here because there is one dtype that ships. A
 * float16 bundle was tried and rejected — see `bots/ppo/README.md` — and it would
 * have needed its own, much looser ceilings, because the two implementations make
 * different, both-legal choices about intermediate precision on a narrowed graph
 * (this executor upcasts f16 initializers into `Float32Array` and re-rounds only
 * at an explicit `Cast`; onnxruntime's f16 CPU kernels round every op's output
 * back to half). Rather than keep a relaxation nothing shipped can qualify for,
 * `tolerancesFor` refuses a graph that is not fp32.
 */
const FP32_TOLERANCES: Tolerances = { logitAtol: 1e-4, valueAtol: 1e-4, flipMargin: 1e-4 };

function tolerancesFor(bundle: ParityBundle): Tolerances {
  const dtype = weightDTypeOf(bundle.bytes);
  if (dtype !== "float32") {
    throw new Error(
      `${bundle.name}: graph weights are ${dtype}, but these tolerances describe an fp32 comparison. ` +
        `The shipped bundles are the fp32 export; a narrowed graph is a different player and needs its ` +
        `own measurement, not this one's ceilings.`,
    );
  }
  return FP32_TOLERANCES;
}

// Both conditions, and they fail differently. Missing bundles mean a broken
// checkout — `parity assets` below turns that red. A missing onnxruntime is
// normal (it is not a dependency), and must SKIP: a comparison with no reference
// to compare against has to say so, not report green.
const available = bundlesAvailable() && ortAvailable();

describe.skipIf(!available)("SyncOnnxSession parity with onnxruntime-node", () => {
  for (const bundleName of PARITY_BUNDLES) {
    describe(bundleName, () => {
      it("matches onnxruntime on every recorded observation, with no argmax flips", async () => {
        const ort = await loadOrt();
        // Unreachable: `describe.skipIf` above already gated on `ortAvailable()`.
        // Kept as a type narrowing, not as a runtime escape hatch.
        if (ort === undefined) throw new Error("onnxruntime-node resolved but failed to load");

        const bundle = loadBundle(bundleName);
        const tol = tolerancesFor(bundle);
        const session = SyncOnnxSession.load(bundle.bytes);
        const reference = await createOrtSession(bundle.bytes);

        const worst: Record<string, { maxAbs: number; case: number; index: number }> = {};
        const flips: Record<string, number> = {};
        const decisive: Record<string, number> = {};
        for (const name of session.outputNames) {
          worst[name] = { maxAbs: 0, case: -1, index: -1 };
          flips[name] = 0;
          decisive[name] = 0;
        }

        for (const testCase of bundle.cases) {
          const feeds = feedsForCases(bundle, [testCase]);
          const mine = session.run(feeds);
          const theirs = await runOrt(reference, feeds);

          for (const name of session.outputNames) {
            const a = mine[name].data;
            const b = theirs[name];
            const dev = compare(a, b);
            if (dev.maxAbs > worst[name].maxAbs) {
              worst[name] = { maxAbs: dev.maxAbs, case: testCase.index, index: dev.atIndex };
            }
            const rowLength = LOGIT_ROW_LENGTH.get(name);
            if (rowLength !== undefined) {
              const arg = compareArgmax(a, b, rowLength, tol.flipMargin);
              flips[name] += arg.flips;
              decisive[name] += arg.decisiveFlips;
            }
          }
        }

        const report = session.outputNames
          .map((name) => {
            const w = worst[name];
            const flip =
              LOGIT_ROW_LENGTH.get(name) === undefined
                ? "n/a"
                : `${decisive[name]} decisive / ${flips[name]} raw`;
            return `  ${name.padEnd(26)} max|Δ| ${w.maxAbs.toExponential(3)}  (case ${w.case}, elem ${w.index})  argmax ${flip}`;
          })
          .join("\n");
        // Reported, not asserted: the measured deviations ARE the deliverable,
        // and a silent pass would tell a reader nothing about the margin.
        console.log(
          `\n[parity] ${bundleName}: ${bundle.cases.length} cases, batch 1, ` +
            `${weightDTypeOf(bundle.bytes)} weights\n${report}`,
        );

        for (const name of session.outputNames) {
          const atol = name.startsWith("value") ? tol.valueAtol : tol.logitAtol;
          expect(worst[name].maxAbs, `${bundleName}/${name} max-abs vs onnxruntime`).toBeLessThan(atol);
        }
        for (const [name, count] of Object.entries(decisive)) {
          if (!LOGIT_ROW_LENGTH.has(name)) continue;
          expect(count, `${bundleName}/${name} DECISIVE argmax flips vs onnxruntime`).toBe(0);
        }
      }, 600_000);

      it("gives identical results for a batch of 50 and the same 50 rows run singly", async () => {
        const bundle = loadBundle(bundleName);
        const session = SyncOnnxSession.load(bundle.bytes);

        // Spread the sample across the fixture rather than taking a prefix: the
        // recording is ordered, so a prefix is one game phase and would leave
        // the trade head fed nothing but empty candidate blocks.
        const stride = Math.max(1, Math.floor(bundle.cases.length / 50));
        const rows = Array.from({ length: 50 }, (_, i) => bundle.cases[i * stride]);

        const batched = session.run(feedsForCases(bundle, rows));
        const singles = rows.map((row) => session.run(feedsForCases(bundle, [row])));

        for (const name of session.outputNames) {
          const perRow = batched[name].size / rows.length;
          for (let r = 0; r < rows.length; r++) {
            const slice = batched[name].data.subarray(r * perRow, (r + 1) * perRow);
            const dev = compare(slice, singles[r][name].data);
            // Batching changes NOTHING about the arithmetic per row — each row's
            // reduction is independent — so this is an EXACT equality, not a
            // tolerance. Any drift at all means a stride or offset bug.
            expect(dev.maxAbs, `${bundleName}/${name} row ${r} (case ${rows[r].index})`).toBe(0);
          }
        }
      }, 300_000);

      it("agrees with onnxruntime on a batch of 50 run as one call", async () => {
        const ort = await loadOrt();
        if (ort === undefined) throw new Error("onnxruntime-node resolved but failed to load");

        const bundle = loadBundle(bundleName);
        const tol = tolerancesFor(bundle);
        const session = SyncOnnxSession.load(bundle.bytes);
        const reference = await createOrtSession(bundle.bytes);

        const stride = Math.max(1, Math.floor(bundle.cases.length / 50));
        const rows = Array.from({ length: 50 }, (_, i) => bundle.cases[i * stride]);
        const feeds = feedsForCases(bundle, rows);

        const mine = session.run(feeds);
        const theirs = await runOrt(reference, feeds);
        for (const name of session.outputNames) {
          const dev = compare(mine[name].data, theirs[name]);
          const atol = name.startsWith("value") ? tol.valueAtol : tol.logitAtol;
          expect(dev.maxAbs, `${bundleName}/${name} batch-50 max-abs`).toBeLessThan(atol);
          const rowLength = LOGIT_ROW_LENGTH.get(name);
          if (rowLength !== undefined) {
            const arg = compareArgmax(mine[name].data, theirs[name], rowLength, tol.flipMargin);
            expect(arg.decisiveFlips, `${bundleName}/${name} batch-50 decisive flips`).toBe(0);
          }
        }
      }, 300_000);

      it("produces the same numbers with constant folding and buffer pooling disabled", () => {
        // Both are load-time/allocation optimisations with no arithmetic in
        // them, so they must be bit-for-bit invisible. If they are not, the
        // parity result above is measuring a lucky configuration.
        const bundle = loadBundle(bundleName);
        const optimised = SyncOnnxSession.load(bundle.bytes);
        const plain = SyncOnnxSession.load(bundle.bytes, { constantFold: false, poolBuffers: false });
        const rows = [bundle.cases[0], bundle.cases[bundle.cases.length - 1]];

        for (const row of rows) {
          const a = optimised.run(feedsForCases(bundle, [row]));
          const b = plain.run(feedsForCases(bundle, [row]));
          for (const name of optimised.outputNames) {
            expect(compare(a[name].data, b[name].data).maxAbs, `${bundleName}/${name}`).toBe(0);
          }
        }
      }, 120_000);

      it("returns stable results across repeated calls with the same feeds", () => {
        // The pool hands the same buffers back on every call, so a kernel that
        // reads its output before writing it (or forgets to overwrite a slot)
        // produces a DIFFERENT answer the second time. The bot contract asserts
        // two consecutive calls agree, so this is the property that must hold.
        const bundle = loadBundle(bundleName);
        const session = SyncOnnxSession.load(bundle.bytes);
        const feeds = feedsForCases(bundle, [bundle.cases[7]]);
        const first = session.run(feeds);
        for (let i = 0; i < 4; i++) {
          const again = session.run(feeds);
          for (const name of session.outputNames) {
            expect(Array.from(again[name].data), `${bundleName}/${name} call ${i + 2}`).toEqual(
              Array.from(first[name].data),
            );
          }
        }
      }, 120_000);
    });
  }

  it("reports batch-1 run() latency percentiles", () => {
    const bundle = loadBundle(PARITY_BUNDLES[0]);
    const session = SyncOnnxSession.load(bundle.bytes);
    const feeds = bundle.cases.slice(0, 64).map((c) => feedsForCases(bundle, [c]));

    // Warm the JIT and fill the buffer pool before measuring: the first calls
    // pay for tier-up compilation and every allocation, and reporting those as
    // the steady-state cost would understate the engine by several times.
    for (let i = 0; i < 20; i++) session.run(feeds[i % feeds.length]);

    const samples: number[] = [];
    for (let i = 0; i < 200; i++) {
      const t0 = performance.now();
      session.run(feeds[i % feeds.length]);
      samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);
    const median = percentile(samples, 50);
    // Reported rather than asserted tightly — see the tripwire below.
    console.log(
      `\n[timing] batch-1 run(): median ${median.toFixed(2)}ms  p90 ${percentile(samples, 90).toFixed(2)}ms  ` +
        `p99 ${percentile(samples, 99).toFixed(2)}ms  min ${samples[0].toFixed(2)}ms  n=${samples.length}\n` +
        `[timing] ${session.stepCount} nodes, ${session.foldedNodeCount} folded at load, ` +
        `${session.prepackedWeightCount} weights pre-transposed`,
    );
    // A loose ceiling, present only to catch a catastrophic regression (a
    // per-call weight transpose creeping back, the pool silently disabling).
    // The tight number is the logged one; this is a tripwire, not a target.
    expect(median).toBeLessThan(500);
  }, 300_000);
});

describe("parity assets", () => {
  it("are in the repo, so nothing above is conditional on a developer's environment", () => {
    // The bundles ship under `public/bundles/`. This is the visible statement of
    // that: if it ever goes red, the suite above stopped running, and a suite
    // that silently contains nothing looks exactly like one that passed.
    expect(bundlesAvailable()).toBe(true);
  });
});
