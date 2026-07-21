import { describe, expect, it } from "vitest";
import { probeLeakage, SCENARIO_NAMES, type LeakageReport } from "./adversary";

// The PROBE-LEAKAGE gate. These pins are the acceptance criterion: the instrument
// must SEPARATE the versions along the exact axes the human-counterparty model
// fixed. fable-v8 (no human model) leaks all three scenarios; fable-v11/v12
// (`humanAskOff`) zero the wallet-xray ask; fable-v14 (`auctionTailFrac`) zeroes
// the complete-into-illiquidity auction bid on top of that. The distress fire-sale
// is a residual all three still leak — a future F7 fix is what would zero it, and
// this test is where that regression would be measured.

function leakOf(report: LeakageReport, name: string): number {
  const s = report.scenarios.find((q) => q.name === name);
  if (!s) throw new Error(`no scenario "${name}"`);
  return s.leak;
}

const V8 = probeLeakage("fable-v8");
const V11 = probeLeakage("fable-v11");
const V12 = probeLeakage("fable-v12");
const V14 = probeLeakage("fable-v14");

describe("probeLeakage — pinned per-scenario leak scores", () => {
  it("fable-v8 (no human model) leaks all three scenarios", () => {
    expect(leakOf(V8, "wallet-xray")).toBe(400);
    expect(leakOf(V8, "auction-illiquidity")).toBe(60);
    expect(leakOf(V8, "distress-firesale")).toBe(70);
    expect(V8.total).toBe(530);
  });

  it("fable-v12 zeros the wallet-xray ask (humanAskOff) but still leaks the rest", () => {
    expect(leakOf(V12, "wallet-xray")).toBe(0);
    expect(leakOf(V12, "auction-illiquidity")).toBe(60);
    expect(leakOf(V12, "distress-firesale")).toBe(70);
    expect(V12.total).toBe(130);
  });

  it("fable-v14 additionally zeros the auction leak (auctionTailFrac)", () => {
    expect(leakOf(V14, "wallet-xray")).toBe(0);
    expect(leakOf(V14, "auction-illiquidity")).toBe(0);
    expect(leakOf(V14, "distress-firesale")).toBe(70);
    expect(V14.total).toBe(70);
  });
});

describe("probeLeakage — the gate SEPARATES the versions", () => {
  it("the wallet-xray ask fix (v8 → v11/v12) shows up as a strictly lower leak", () => {
    expect(leakOf(V11, "wallet-xray")).toBe(0);
    expect(leakOf(V11, "wallet-xray")).toBeLessThan(leakOf(V8, "wallet-xray"));
    expect(leakOf(V12, "wallet-xray")).toBeLessThan(leakOf(V8, "wallet-xray"));
  });

  it("the auction fix (v12 → v14) shows up as a strictly lower leak", () => {
    expect(leakOf(V14, "auction-illiquidity")).toBeLessThan(leakOf(V12, "auction-illiquidity"));
  });

  it("total leakage falls monotonically as each fix lands: v8 > v12 > v14", () => {
    expect(V8.total).toBeGreaterThan(V12.total);
    expect(V12.total).toBeGreaterThan(V14.total);
  });

  it("each fix is NARROW — it only moves its own column, never regresses another", () => {
    // v8 → v12: only wallet-xray drops; the other two columns are unchanged.
    expect(leakOf(V12, "auction-illiquidity")).toBe(leakOf(V8, "auction-illiquidity"));
    expect(leakOf(V12, "distress-firesale")).toBe(leakOf(V8, "distress-firesale"));
    // v12 → v14: only auction drops; the other two columns are unchanged.
    expect(leakOf(V14, "wallet-xray")).toBe(leakOf(V12, "wallet-xray"));
    expect(leakOf(V14, "distress-firesale")).toBe(leakOf(V12, "distress-firesale"));
  });

  it("fable-v11 and fable-v12 score identically here (the threat mult needs a bot field)", () => {
    // fable-v12 adds humanThreatMult over v11; these fixtures don't exercise it,
    // so the two are equal — the wallet/auction/firesale axes are v11's doing.
    expect(V12.total).toBe(V11.total);
  });
});

describe("probeLeakage — determinism & shape", () => {
  it("is a pure function — the same label yields an identical report", () => {
    expect(probeLeakage("fable-v8")).toEqual(V8);
    expect(probeLeakage("fable-v14")).toEqual(V14);
  });

  it("reports every scenario, in the published order", () => {
    expect(V8.scenarios.map((s) => s.name)).toEqual([...SCENARIO_NAMES]);
    expect(SCENARIO_NAMES).toEqual(["wallet-xray", "auction-illiquidity", "distress-firesale"]);
  });

  it("the total is the sum of the scenario leaks", () => {
    for (const report of [V8, V11, V12, V14]) {
      const sum = report.scenarios.reduce((a, s) => a + s.leak, 0);
      expect(report.total).toBe(sum);
    }
  });

  it("every leak is non-negative (higher = more exploitable, never a credit)", () => {
    for (const report of [V8, V11, V12, V14]) {
      for (const s of report.scenarios) expect(s.leak).toBeGreaterThanOrEqual(0);
    }
  });
});
