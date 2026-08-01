import { describe, expect, it } from "vitest";

import { SHIPPED_BUNDLES, bundlePath, readAsset, readAssetText, readFixtureText } from "./assets";
import { type Fixture, assertFixtureBundle, parseFixtureJson } from "./fixture";
import { sha256Hex } from "./bundle";
import { type Manifest, assertActionGeometry, parseManifest, parseManifestJson } from "./manifest";
import { weightDTypeOf } from "./onnx/fixtures.testlib";
import { SyncOnnxSession } from "./onnx/session";
import { type DType, Tensor, type TensorData } from "./onnx/tensor";
import { formatParityReport, measureParity, type ParityResult } from "./parity.testkit";
import { type SyncExecutor, adaptSyncSession } from "./session";

// ---------------------------------------------------------------------------
// Parity against the recorded reference distributions.
//
// This is the test the whole runner exists to pass: for every recorded decision,
// reproduce EVERY head's masked probability distribution and every value output
// that the trainer's own `distribution.py` produced for the same observation.
//
// The measurement itself lives in `parity.testkit.ts` because it is not only run
// here: the same code, over the same fixtures, has been driven inside real
// browsers, where three JavaScript engines produced the numbers digit for digit.
// That matters because the executor is hand-written float arithmetic
// (`Math.fround`, `Math.imul`, typed-array coercion) and Node is not where it
// ships. This file is the Node half: assets off disk, and the mutation checks
// that prove the measurement can go red.
// ---------------------------------------------------------------------------

const BUNDLES = SHIPPED_BUNDLES;

function executorFor(graph: Uint8Array): SyncExecutor {
  return adaptSyncSession(SyncOnnxSession.load(graph), (dims, dtype, data) =>
    // The runner speaks plain data on purpose; this is the one place that data
    // becomes the executor's own tensor type.
    new Tensor(dims, dtype as DType, data as TensorData),
  );
}

interface Loaded {
  readonly manifest: Manifest;
  readonly fixture: Fixture;
  readonly graph: Uint8Array;
}

function load(bundle: string): Loaded {
  const manifest = parseManifestJson(readAssetText(bundlePath(bundle, "manifest.json")), `${bundle}/manifest.json`);
  const graph = readAsset(bundlePath(bundle, manifest.graph));
  // Verify EVERY declared file, not just the graph: with external data the
  // weights live in a sidecar and `manifest.sha256` would cover neither.
  for (const spec of manifest.files) {
    const bytes = spec.name === manifest.graph ? graph : readAsset(bundlePath(bundle, spec.name));
    expect(bytes.length, `${bundle}/${spec.name} byte length`).toBe(spec.bytes);
    expect(sha256Hex(bytes), `${bundle}/${spec.name} sha256`).toBe(spec.sha256);
  }
  const fixture = parseFixtureJson(readFixtureText(`parity-${bundle}`), `parity-${bundle}`);
  assertFixtureBundle(fixture, manifest, bundle);
  assertActionGeometry(manifest.actionGeometry, fixture.actionGeometry, `parity-${bundle}`);
  // Read off the initializers, not off the manifest. `assertFixtureBundle` above
  // already pins this graph to the one the fixture was recorded from, so this is
  // belt-and-braces — but it is the assertion that names the thing that went
  // wrong if someone re-encodes the weights: "narrowed", not "wrong file".
  expect(weightDTypeOf(graph), `${bundle}: the shipped graph's float initializers`).toBe("float32");
  return { manifest, fixture, graph };
}

// ---------------------------------------------------------------------------
// TOLERANCE, AND WHAT ACTUALLY GUARDS BEHAVIOUR.
//
// The fixture carries its OWN tolerance and that is the only one in play. It was
// recorded from the graph that ships — same bytes, same digest — so there is no
// representation error to make room for, and the deviations left are the
// executor's fp32 reassociation noise against the trainer's.
//
// There was, briefly, a float16 bundle here with a tolerance to match. It is
// gone: the narrowed graph picked a different action once in 158 decisions in
// live play, so it was not the trained policy. Nothing in this file may re-admit
// a loose ceiling for a re-encoded graph — `load` above asserts the shipped
// initializers are fp32, so a narrowed bundle fails rather than qualifying for an
// allowance.
//
// What the tolerance is NOT is the assertion that protects behaviour. This is:
//
//     ARGMAX AGREEMENT IS EXACT.
//
// 400/400 global rows, 11200/11200 manage rows, 400/400 trade_cand rows, on both
// bundles, zero flips — the shipped bundle picks the trained policy's action on
// every recorded decision, which is the only claim a player can feel. The numeric
// tolerance merely bounds the arithmetic noise: it says the distributions are
// still the same distributions, and it is what would catch a graph that quietly
// mangled a layer while leaving the top-1 intact. The mutation checks below move
// `manage` by O(1), and every one of them has to stay far outside it.
// ---------------------------------------------------------------------------

/** The shared measurement, bound to a loaded bundle. `manifest` is passed
 *  separately so the mutation checks below can measure a MUTATED manifest against
 *  the same graph and fixture. */
function measure(loaded: Loaded, manifest: Manifest): ParityResult {
  return measureParity(manifest, executorFor(loaded.graph), loaded.fixture.cases);
}

describe("parity against the recorded reference distributions", () => {
  for (const bundle of BUNDLES) {
    it(
      `${bundle}: every head and value on every case`,
      () => {
        const loaded = load(bundle);
        const result = measure(loaded, loaded.manifest);
        const tol = loaded.fixture.tolerance;

        console.log(formatParityReport(bundle, result, tol));

        expect(Object.keys(result.heads).length, "heads compared").toBeGreaterThan(0);
        for (const name of Object.keys(result.heads)) {
          const s = result.heads[name];
          expect(s.compared, `${name}: cases compared`).toBe(result.cases);
          expect(s.worstProb, `${name}: worst probability deviation`).toBeLessThan(tol.probAtol);
          // EXACT. The tolerance above bounds arithmetic noise; this is the claim
          // that the shipped bundle plays the trained policy's game, and there is
          // no precision at which it is negotiable.
          expect(s.argmaxFlips, `${name}: argmax disagreements`).toBe(0);
        }
        expect(result.worstValue, "worst value deviation").toBeLessThan(tol.valueAtol);
      },
      120_000,
    );
  }

  // -------------------------------------------------------------------------
  // The parity test is only worth its runtime if it can FAIL. Each mutation below
  // is a plausible consumer bug that leaves every shape intact — the class of
  // error a numerical test either catches or silently blesses.
  // -------------------------------------------------------------------------
  describe("mutation check: parity must go red when the semantics change", () => {
    const bundle = BUNDLES[0];
    /** The same ceiling the parity test above holds this bundle to, so a mutation
     *  "breaking parity" means what the reader thinks it means: it must push the
     *  deviation past the number that would actually fail the suite, not past a
     *  hardcoded one the shipped tolerance has outgrown. */
    const ATOL = load(bundle).fixture.tolerance.probAtol;

    /** Re-parse the manifest with one field rewritten, then measure a slice of
     *  the fixture through it. Returns the worst probability deviation seen. */
    function withMutation(mutate: (json: Record<string, unknown>) => void, cases = 40): number {
      const loaded = load(bundle);
      const json = JSON.parse(readAssetText(bundlePath(bundle, "manifest.json"))) as Record<string, unknown>;
      mutate(json);
      const mutated = parseManifest(json, "mutated");
      const trimmed: Loaded = {
        ...loaded,
        fixture: { ...loaded.fixture, cases: loaded.fixture.cases.slice(0, cases) },
      };
      return measure(trimmed, mutated).heads.manage.worstProb;
    }

    function headsOf(json: Record<string, unknown>): Record<string, unknown>[] {
      return json.heads as Record<string, unknown>[];
    }

    function headNamed(json: Record<string, unknown>, name: string): Record<string, unknown> {
      const found = headsOf(json).find((h) => h.name === name);
      if (found === undefined) throw new Error(`no head named ${name}`);
      return found;
    }

    it("baseline: the unmutated manifest is inside tolerance", () => {
      expect(withMutation(() => undefined)).toBeLessThan(ATOL);
    });

    it("flipping select from independent to one breaks parity", () => {
      // The factorization change no tensor shape reveals: the same logits become
      // ONE distribution over the flattened grid instead of 28 over their rows,
      // so the reference's 28 rows each summing to 1 now sum to 1 in TOTAL.
      const dev = withMutation((json) => {
        headNamed(json, "manage").select = "one";
        (json.dims as Record<string, unknown>).manage_select = "one";
        (json.action_geometry as Record<string, unknown>).manage_select = "one";
      });
      expect(dev).toBeGreaterThan(ATOL);
    });

    it("moving the collapse column breaks parity", () => {
      // An all-illegal row is the NORMAL state of every head a decision did not
      // route to, so the column the collapse writes its point mass onto is read
      // on most cases — but only on those rows.
      const dev = withMutation((json) => {
        headNamed(json, "manage").null_column = 4;
      });
      expect(dev).toBeGreaterThan(ATOL);
    });

    it("reading the mask from the wrong field is refused at load", () => {
      // A field of the wrong SIZE must not be read at all: taking the first 140
      // bytes of a 270-entry field would produce a plausible, wrong legality grid
      // whose probabilities still sum to 1 on every row.
      expect(() =>
        withMutation((json) => {
          const mask = headNamed(json, "manage").mask as Record<string, unknown>;
          (mask.source as Record<string, unknown>).field = "asset_legal";
        }),
      ).toThrow(/mask field "asset_legal" holds 270 entries but the head needs 140/);
    });

    it("disabling the all-illegal collapse breaks parity", () => {
      const dev = withMutation((json) => {
        ((json.masking as Record<string, unknown>).collapse_all_illegal as Record<string, unknown>).enabled = false;
      });
      expect(dev).toBeGreaterThan(ATOL);
    });

    it("a neg_inf too small to suppress a lane breaks parity", () => {
      const dev = withMutation((json) => {
        (json.masking as Record<string, unknown>).neg_inf = -1;
      });
      expect(dev).toBeGreaterThan(ATOL);
    });
  });
});
