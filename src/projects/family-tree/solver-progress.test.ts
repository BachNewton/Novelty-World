import { describe, expect, it } from "vitest";
import {
  INITIAL_SOLVE_PROGRESS,
  advanceSolveProgress,
  type SolveProgress,
} from "./solver-progress";

// Excerpt of a real HiGHS 1.15.1 log from the production-tree fixture.
const LOG = [
  "Running HiGHS 1.15.1 (git hash: 04024d7): Copyright (c) 2026 under MIT licence terms",
  "Presolving model",
  "26096 rows, 2433 cols, 78288 nonzeros 0s",
  "Solving MIP model with:",
  "        Nodes      |    B&B Tree     |            Objective Bounds              |  Dynamic Constraints |       Work      ",
  "Src  Proc. InQueue |  Leaves   Expl. | BestBound       BestSol              Gap |   Cuts   InLp Confl. | LpIters     Time",
  " u       0       0         0   0.00%   -inf            1214               Large        0      0      0         0     0.3s",
  " R       0       0         0   0.00%   0.4106557377    610.5             99.93%        0      0      0      1126     0.5s",
  " C       0       0         0   0.00%   3.279644809     148.8303279       97.80%     5682      6      0      1312     3.0s",
  "         0       0         0   0.00%   5.065300546     148.8303279       96.60%     7692     20      0      1609     8.1s",
  " L       0       0         0   0.00%   5.07704918      5.07704918         0.00%     9931     30      0      1715    12.1s",
  "Solving report",
  "  Status            Optimal",
];

function replay(lines: string[]): SolveProgress[] {
  const out: SolveProgress[] = [];
  let progress = INITIAL_SOLVE_PROGRESS;
  for (const line of lines) {
    progress = advanceSolveProgress(progress, line);
    out.push(progress);
  }
  return out;
}

describe("advanceSolveProgress", () => {
  it("walks the phases in log order", () => {
    const phases = replay(LOG).map((p) => p.phase);
    expect(phases[0]).toBe("preparing");
    expect(phases[1]).toBe("presolve");
    expect(phases[3]).toBe("search");
    expect(phases.at(-1)).toBe("placing");
  });

  it("reads bounds as whole crossing counts", () => {
    const rows = replay(LOG).slice(6, 11).map(({ bound, best }) => [bound, best]);
    expect(rows).toEqual([
      [null, 1214],
      [0, 610],
      [3, 148],
      [5, 148],
      [5, 5],
    ]);
  });

  it("ignores lines that aren't bounds rows", () => {
    const before = { phase: "search", bound: 3, best: 148 } as const;
    for (const line of [
      "26096 rows, 2433 cols, 78288 nonzeros 0s",
      "Src  Proc. InQueue |  Leaves   Expl. | BestBound       BestSol              Gap",
      "  Status            Optimal",
      "",
    ]) {
      expect(advanceSolveProgress(before, line)).toBe(before);
    }
  });
});
