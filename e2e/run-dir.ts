/**
 * An e2e run's own folders, named by its id: its Playwright runner's pid
 * (playwright.config.ts). The build is deleted when the run ends; the test
 * output is kept while it holds a failed test's files.
 */
export const RUNS_ROOT = ".next-e2e";
export const RESULTS_ROOT = "test-results";

export function runDir(runId: string): string {
  return `${RUNS_ROOT}/run-${runId}`;
}

export function resultsDir(runId: string): string {
  return `${RESULTS_ROOT}/run-${runId}`;
}
