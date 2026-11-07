import { describe, expect, it } from "vitest";
import { rerunChains, summarize } from "./test-runs.mjs";

const A = "C:/checkouts/a";
const B = "C:/checkouts/b";

function run(start, { checkout = A, kind = "vitest", files, failures = [], cpuSeconds = [] }) {
  return {
    kind,
    checkout,
    start: start * 1000,
    end: (start + Math.max(1, cpuSeconds.length)) * 1000,
    files,
    failures,
    interrupted: false,
    failed: failures.length,
    cpuSeconds,
    others: null,
  };
}

const failure = (file, name, { timeout = true, verdict = "saturated", ms = 5000 } = {}) => ({
  id: `${file} > ${name}`,
  file,
  timeout,
  ms,
  cpu: verdict === "saturated" ? 0.98 : 0.4,
  verdict,
});

describe("rerunChains", () => {
  it("follows a saturated timeout through a failed rerun to the one that passed it", () => {
    const chains = rerunChains([
      run(0, { files: { "x.test.ts": 6000 }, failures: [failure("x.test.ts", "slow")] }),
      run(10, { files: { "x.test.ts": 5500 }, failures: [failure("x.test.ts", "slow")] }),
      run(20, { files: { "other.test.ts": 100 } }),
      run(30, { files: { "x.test.ts": 900 } }),
      run(40, { files: { "x.test.ts": 800 } }),
    ]);
    expect(chains).toEqual([
      expect.objectContaining({ class: "timeout-load", reruns: 2, failures: 2, outcome: "passed", failedMs: 5000, rerunMs: 6400 }),
    ]);
  });

  it("counts a rerun only in the same checkout and runner", () => {
    const chains = rerunChains([
      run(0, { files: { "x.test.ts": 6000 }, failures: [failure("x.test.ts", "slow", { verdict: "capacity" })] }),
      run(10, { checkout: B, files: { "x.test.ts": 900 } }),
      run(20, { kind: "vitest-slow", files: { "x.test.ts": 900 } }),
    ]);
    expect(chains).toEqual([expect.objectContaining({ class: "timeout-capacity", reruns: 0, outcome: "not rerun" })]);
  });

  it("charges a rerun of a file with two failed tests once", () => {
    const chains = rerunChains([
      run(0, { files: { "x.test.ts": 9000 }, failures: [failure("x.test.ts", "one"), failure("x.test.ts", "two", { timeout: false })] }),
      run(10, { files: { "x.test.ts": 1000 } }),
    ]);
    expect(chains.map((chain) => [chain.class, chain.outcome, chain.rerunMs])).toEqual([
      ["timeout-load", "passed", 1000],
      ["other", "passed", 0],
    ]);
  });
});

describe("summarize", () => {
  it("reads the load at each number of runs going at once", () => {
    const summary = summarize(
      [
        run(0, { files: {}, cpuSeconds: [50, 95, 95, 95] }),
        run(2, { checkout: B, files: {}, cpuSeconds: [99, 99] }),
      ],
      { from: 0, to: 10_000 },
    );
    expect(summary.load.peakRuns).toBe(2);
    // Seconds 0 and 1 have one run, 2 and 3 have two; the second run's own seconds are counted from its start.
    expect(Object.fromEntries(summary.load.byConcurrency)).toEqual({
      1: { seconds: 2, measured: 2, saturated: 1 },
      2: { seconds: 2, measured: 2, saturated: 2 },
    });
  });
});
